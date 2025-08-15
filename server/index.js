// VADA backend — Cheerio-only scraper; scrapes Domestic, International, and All

process.on('unhandledRejection', (err) => console.error('[VADA] Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('[VADA] Uncaught Exception:', err));

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseFlightsFromHtml, parseFlightsFromText } from './scraper.js';

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

// Back-compat: when 1, the stored flights file will contain only domestic.
const FILTER_DOMESTIC_ONLY = (process.env.FILTER_DOMESTIC_ONLY ?? '0') === '1';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const REFRESH_TOKEN = process.env.REFRESH_TOKEN || ADMIN_TOKEN;

// ---- Targets: scrape all three views (Domestic, International, All) ----
const FIDS_TARGETS = [
  {
    label: 'domestic',
    url: 'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+'
  },
  {
    label: 'international',
    url: 'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+'
  },
  {
    label: 'all',
    url: 'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=ALL&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+'
  }
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
function keyOfFlight(f) {
  return `${f.flightNo}|${f.scheduled}|${f.origin_or_destination}|${f.terminal}`;
}
function dedupeFlights(arr) {
  const map = new Map();
  for (const f of arr) {
    const k = keyOfFlight(f);
    if (!map.has(k)) map.set(k, f);
  }
  return [...map.values()];
}
function categorizeByTerminal(f) {
  return f.terminal === 'DOM' ? 'domestic' : 'international';
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
  tried: [],
  debug: null
}, null, 2));
ensureFile(CALL_LOGS_PATH, '[]');

// ------------------------ Scraping ------------------------
async function fetchAndParse(url, label) {
  const res = await axios.get(url, {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (VADA scraper)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.fis.com.mv/index.php'
    },
    validateStatus: () => true
  });

  const html = typeof res.data === 'string' ? res.data : '';
  const $ = cheerio.load(html);

  // 1) Try strict HTML-table parsing
  let { flights, updatedLT } = parseFlightsFromHtml($);

  // 2) Fallback: text-mode parse (in case table markup is unusual)
  if (flights.length === 0) {
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const r = parseFlightsFromText(bodyText);
    flights = r.flights;
    updatedLT = updatedLT || r.updatedLT;
  }

  const tagged = flights.map(f => ({
    ...f,
    category: categorizeByTerminal(f),
    sourceLabel: label,
    sourceUrl: url
  }));

  return {
    label,
    url,
    status: res.status,
    updatedLT,
    // keep snippet ONLY when no rows (debug aid)
    textSample: tagged.length ? null : $('body').text().slice(0, 800),
    flights: tagged
  };
}

async function scrapeOnce() {
  const tried = [];
  let collected = [];
  let updatedLT = null;
  let firstZeroSample = null;

  for (const t of FIDS_TARGETS) {
    try {
      const r = await fetchAndParse(t.url, t.label);
      tried.push({ url: r.url, label: r.label, status: r.status });
      if (!updatedLT && r.updatedLT) updatedLT = r.updatedLT;
      if (r.flights.length === 0 && !firstZeroSample) {
        firstZeroSample = { httpStatus: r.status, textSample: r.textSample, url: r.url };
      } else {
        collected.push(...r.flights);
      }
    } catch (e) {
      tried.push({ url: t.url, label: t.label, status: 'error', error: String(e) });
      if (!firstZeroSample) firstZeroSample = { httpStatus: null, textSample: String(e), url: t.url };
    }
  }

  collected = dedupeFlights(collected);

  return {
    flights: collected,
    updatedLT: updatedLT || null,
    tried,
    debug: collected.length === 0 ? firstZeroSample : null
  };
}

let isScraping = false;

async function scrapeAndMaybeSave({ manual = false } = {}) {
  if (isScraping) return { skipped: true, reason: 'scrape_in_progress' };
  isScraping = true;

  const prevMeta = readJsonSafe(META_PATH, {});
  try {
    const { flights, updatedLT, tried, debug } = await scrapeOnce();

    const finalFlights = FILTER_DOMESTIC_ONLY ? flights.filter(f => f.category === 'domestic') : flights;

    const nextMeta = {
      ...prevMeta,
      rowCount: finalFlights.length,
      scrapedAt: new Date().toISOString(),
      updatedLT,
      lastError: null,
      lastOk: new Date().toISOString(),
      tried
    };
    if (finalFlights.length === 0 && debug) nextMeta.debug = debug; else delete nextMeta.debug;

    const newHash = hashJson(finalFlights);
    const changed = newHash !== prevMeta.hash;

    if (changed) {
      writeJsonAtomic(FLIGHTS_PATH, finalFlights);
      nextMeta.hash = newHash;
    } else {
      nextMeta.hash = prevMeta.hash || newHash;
    }
    writeJsonAtomic(META_PATH, nextMeta);

    isScraping = false;
    return { ok: true, changed, rowCount: finalFlights.length, updatedLT: nextMeta.updatedLT };
  } catch (err) {
    const nextMeta = {
      ...prevMeta,
      scrapedAt: new Date().toISOString(),
      lastError: String(err),
      tried: prevMeta.tried || []
    };
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

// Optional runtime filter: /flights?scope=domestic|international|all
app.get('/flights', (req, res) => {
  const scope = String(req.query.scope || '').toLowerCase();
  let flights = readJsonSafe(FLIGHTS_PATH, []);
  if (scope === 'domestic') flights = flights.filter(f => f.category === 'domestic');
  else if (scope === 'international') flights = flights.filter(f => f.category === 'international');
  res.json(flights);
});

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

app.listen(PORT, () => {
  console.log(`[VADA] listening on ${PORT}`);
  scrapeAndMaybeSave()
    .then((r) => console.log('[VADA] first scrape:', r))
    .catch((e) => console.error('[VADA] first scrape error:', e));
  setInterval(() => {
    scrapeAndMaybeSave()
      .then((r) => { if (!r.ok) console.error('[VADA] scrape error', r.error); })
      .catch((e) => console.error('[VADA] interval scrape error', e));
  }, SCRAPE_INTERVAL_MS);
});
