import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseFlightsFromText } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------ Config ------------------------
const PORT = process.env.PORT || 10000;
const DATA_DIR = path.join(__dirname);
const FLIGHTS_PATH = path.join(DATA_DIR, 'flights.json');
const META_PATH = path.join(DATA_DIR, 'meta.json');
const CALL_LOGS_PATH = path.join(DATA_DIR, 'call-logs.json');

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const SCRAPE_INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 120_000);
const FILTER_DOMESTIC_ONLY = (process.env.FILTER_DOMESTIC_ONLY ?? '1') === '1';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const REFRESH_TOKEN = process.env.REFRESH_TOKEN || ADMIN_TOKEN;

// Try multiple URLs to be resilient
const FIDS_URLS = [
  'https://www.fis.com.mv/index.php?webfids_type=arrivals'
];

// ------------------------ Helpers ------------------------
function ensureFile(file, defaultContent) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, defaultContent, 'utf8');
}
function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function dedupeFlights(arr) {
  const map = new Map();
  for (const f of arr) {
    const key = `${f.flightNo}|${f.scheduled}|${f.terminal}|${f.origin_or_destination}`;
    if (!map.has(key)) map.set(key, f);
  }
  return Array.from(map.values());
}
function filterDomestic(arr) {
  return arr.filter(f => f.terminal === 'DOM' || f.isDomestic === true);
}

// Prepare storage
ensureFile(FLIGHTS_PATH, '[]');
ensureFile(META_PATH, JSON.stringify({
  hash: null,
  rowCount: 0,
  scrapedAt: null,
  updatedLT: null,
  lastError: null,
  lastOk: null,
  etag: null,
  lastModified: null
}, null, 2));
ensureFile(CALL_LOGS_PATH, '[]');

// ------------------------ Scraping (Cheerio-only) ------------------------
async function cheerioAttempt(url) {
  const res = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (VADA scraper)' },
    validateStatus: s => s >= 200 && s < 400
  });
  const $ = cheerio.load(res.data);
  const pageText = $('body').text();
  const { flights, updatedLT } = parseFlightsFromText(pageText);
  return {
    flights,
    updatedLT,
    etag: res.headers.etag || null,
    lastModified: res.headers['last-modified'] || null
  };
}

async function scrapeOnce() {
  let collected = [];
  let updatedLT = null;
  let etag = null;
  let lastModified = null;
  let lastError = null;

  for (const url of FIDS_URLS) {
    try {
      const r = await cheerioAttempt(url);
      if (r.flights.length > 0) {
        collected = collected.concat(r.flights);
        updatedLT = updatedLT || r.updatedLT;
        etag = etag || r.etag;
        lastModified = lastModified || r.lastModified;
      }
    } catch (err) {
      lastError = lastError || String(err);
    }
  }

  collected = dedupeFlights(collected);
  if (FILTER_DOMESTIC_ONLY) collected = filterDomestic(collected);

  return { flights: collected, updatedLT, etag, lastModified, lastError };
}

let isScraping = false;

async function scrapeAndMaybeSave({ manual = false } = {}) {
  if (isScraping) return { skipped: true, reason: 'scrape_in_progress' };
  isScraping = true;

  const start = Date.now();
  const prevMeta = readJsonSafe(META_PATH, {});
  try {
    const { flights, updatedLT, etag, lastModified, lastError } = await scrapeOnce();

    const nextMeta = {
      ...prevMeta,
      rowCount: flights.length,
      scrapedAt: new Date().toISOString(),
      updatedLT: updatedLT || null,
      etag: etag || prevMeta.etag || null,
      lastModified: lastModified || prevMeta.lastModified || null,
      lastError: lastError || null,
      lastOk: !lastError ? new Date().toISOString() : prevMeta.lastOk || null,
      manualTrigger: manual
    };

    const newHash = hashJson(flights);
    const changed = newHash !== prevMeta.hash;

    if (changed) {
      writeJsonAtomic(FLIGHTS_PATH, flights);
      nextMeta.hash = newHash;
    } else {
      nextMeta.hash = prevMeta.hash || newHash;
    }
    writeJsonAtomic(META_PATH, nextMeta);

    isScraping = false;
    return { ok: true, changed, tookMs: Date.now() - start, rowCount: flights.length, updatedLT: nextMeta.updatedLT };
  } catch (err) {
    const nextMeta = { ...prevMeta, scrapedAt: new Date().toISOString(), lastError: String(err), manualTrigger: manual };
    writeJsonAtomic(META_PATH, nextMeta);
    isScraping = false;
    return { ok: false, error: String(err) };
  }
}

// ------------------------ Server ------------------------
const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : [FRONTEND_ORIGIN] }));
app.use(express.json({ limit: '256kb' }));
app.use(morgan('tiny'));

app.get('/', (_req, res) => {
  res.json({ service: 'VADA backend', ok: true, intervalMs: SCRAPE_INTERVAL_MS, filterDomesticOnly: FILTER_DOMESTIC_ONLY });
});

app.get('/flights', (_req, res) => res.json(readJsonSafe(FLIGHTS_PATH, [])));
app.get('/meta', (_req, res) => res.json(readJsonSafe(META_PATH, {})));

function authRefresh(req) {
  const q = req.query?.token;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const header = req.headers['x-refresh-token'];
  return (q && q === REFRESH_TOKEN) || (bearer && bearer === REFRESH_TOKEN) || (header && header === REFRESH_TOKEN);
}
app.post('/refresh', async (req, res) => {
  if (!REFRESH_TOKEN || !authRefresh(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  res.json(await scrapeAndMaybeSave({ manual: true }));
});

app.post('/api/call-logs', (req, res) => {
  const { userId, flightNo, action, note } = req.body || {};
  if (!userId || !flightNo || !action) return res.status(400).json({ ok: false, error: 'userId, flightNo, action required' });
  const normalizedAction = String(action).toUpperCase();
  if (!['SS', 'BUS'].includes(normalizedAction)) return res.status(400).json({ ok: false, error: 'action must be SS or BUS' });

  const logs = readJsonSafe(CALL_LOGS_PATH, []);
  logs.push({
    ts: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
    userId: String(userId),
    flightNo: String(flightNo),
    action: normalizedAction,
    note: note ? String(note) : null
  });
  writeJsonAtomic(CALL_LOGS_PATH, logs);
  res.json({ ok: true });
});

function authAdmin(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const header = req.headers['x-admin-token'];
  const query = req.query?.token;
  return (ADMIN_TOKEN && (bearer === ADMIN_TOKEN || header === ADMIN_TOKEN || query === ADMIN_TOKEN));
}
app.get('/api/call-logs', (req, res) => {
  if (!authAdmin(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const { since, limit, action, flightNo } = req.query;
  let logs = readJsonSafe(CALL_LOGS_PATH, []);

  if (since) {
    const s = new Date(since).getTime() || 0;
    logs = logs.filter(l => new Date(l.ts).getTime() >= s);
  }
  if (action) {
    const a = String(action).toUpperCase();
    logs = logs.filter(l => l.action === a);
  }
  if (flightNo) {
    const f = String(flightNo).toUpperCase();
    logs = logs.filter(l => String(l.flightNo).toUpperCase() === f);
  }
  const n = Math.max(0, Math.min(1000, Number(limit || 500)));
  res.json({ ok: true, count: Math.min(logs.length, n), logs: logs.slice(-n) });
});

app.listen(PORT, async () => {
  console.log(`[VADA] listening on ${PORT}`);
  const first = await scrapeAndMaybeSave();
  console.log('[VADA] first scrape:', first);
  setInterval(() => scrapeAndMaybeSave().then(r => { if (!r.ok) console.error('[VADA] scrape error', r.error); }), SCRAPE_INTERVAL_MS);
});
