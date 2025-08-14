import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/* ---------------------- Config ---------------------- */
const DOMESTIC_ARRIVALS_URL =
  'https://www.fis.com.mv/index.php?Submit=+UPDATE+&webfids_airline=ALL&webfids_domesticinternational=D&webfids_lang=1&webfids_passengercargo=passenger&webfids_type=arrivals&webfids_waypoint=ALL';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

/* ---------------------- In-memory state ---------------------- */
let flightsCache = [];
let lastUpdatedAt = null;
let lastError = null;
let lastHash = '';
let etag = null;
let lastModified = null;

/* Adaptive schedule (in ms) */
const FAST = 30_000;     // 30s while changing
const MED  = 60_000;     // 1m
const SLOW = 300_000;    // 5m when stable
let currentInterval = FAST;
let timer = null;

/* SSE clients */
const sseClients = new Set();

/* ---------------------- Helpers ---------------------- */
const airlineFromFlight = (flightNo = '') => {
  const up = (flightNo || '').toUpperCase();
  if (up.startsWith('Q2')) return 'Maldivian';
  if (up.startsWith('NR')) return 'Manta Air';
  if (up.startsWith('VP')) return 'Villa Air';
  return 'Unknown';
};

const mapRowToSchema = ({ flight, from, time, estm, status }) => ({
  airline: airlineFromFlight(flight),
  flightNo: flight || '',
  route: from || '',
  sta: time || '',
  etd: estm || '',
  status: status || '',
});

const hashOf = (str) => crypto.createHash('sha256').update(str).digest('hex');

function schedule(nextMs) {
  if (timer) clearTimeout(timer);
  currentInterval = nextMs;
  timer = setTimeout(tick, currentInterval);
}

function notifyClients(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch { /* ignore broken pipe */ }
  }
}

/* ---------------------- Scrape once with conditional request ---------------------- */
async function scrapeOnce() {
  const started = Date.now();
  lastError = null;

  try {
    const headers = {
      'User-Agent': UA,
      'Accept': 'text/html',
    };
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;

    const resp = await axios.get(DOMESTIC_ARRIVALS_URL, {
      headers,
      validateStatus: (s) => [200, 304].includes(s),
      timeout: 30000,
    });

    // 304 → no change
    if (resp.status === 304) {
      console.log(`[SCRAPE] 304 Not Modified in ${Date.now() - started}ms`);
      schedule(Math.min(SLOW, currentInterval * 2));
      return false;
    }

    // 200 → may have changed
    etag = resp.headers.etag || etag;
    lastModified = resp.headers['last-modified'] || lastModified;

    const html = resp.data || '';
    const $ = cheerio.load(html);

    // Hash either the specific rows' parent HTML or whole HTML (fallback)
    const maybeParent = $('tr.schedulerow, tr.schedulerowtwo').first().parent();
    const tableHtml = (maybeParent && maybeParent.length ? maybeParent.html() : '') || html;
    const newHash = hashOf(tableHtml);

    if (newHash === lastHash) {
      console.log(`[SCRAPE] 200 but content hash unchanged in ${Date.now() - started}ms`);
      schedule(Math.min(SLOW, currentInterval * 2));
      return false;
    }

    // Parse rows
    const rows = $('tr.schedulerow, tr.schedulerowtwo');
    const parsed = [];
    rows.each((_, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 5) {
        const flight = $(tds[0]).text().trim();
        const from   = $(tds[1]).text().trim();
        const time   = $(tds[2]).text().trim(); // STA
        const estm   = $(tds[3]).text().trim(); // ESTM
        const status = $(tds[4]).text().trim();

        const fUp = (flight || '').toUpperCase();
        // Keep only domestic carriers you track (Q2/NR/VP)
        if (fUp.startsWith('Q2') || fUp.startsWith('NR') || fUp.startsWith('VP')) {
          parsed.push(mapRowToSchema({ flight, from, time, estm, status }));
        }
      }
    });

    // Sort for stable hashing/diffs
    parsed.sort((a, b) => (a.flightNo + a.sta).localeCompare(b.flightNo + b.sta));

    flightsCache = parsed;
    lastHash = newHash;
    lastUpdatedAt = new Date();

    console.log(
      `[SCRAPE] CHANGED rows=${parsed.length} in ${Date.now() - started}ms @ ${lastUpdatedAt.toISOString()}`
    );

    // on change, go fast again and notify clients
    schedule(FAST);
    notifyClients({ type: 'changed', updatedAt: lastUpdatedAt, count: flightsCache.length });
    return true;
  } catch (err) {
    lastError = String(err?.message || err);
    console.error('[SCRAPE] ERROR:', lastError);
    schedule(MED);
    return false;
  }
}

/* ---------------------- Scheduler ---------------------- */
async function tick() {
  await scrapeOnce();
}

/* Boot: run once, then schedule */
await scrapeOnce();
schedule(FAST);

/* ---------------------- API ---------------------- */
app.get('/', (_req, res) => {
  res.send('VADA backend running (conditional scraping + SSE)');
});

app.get('/meta', (_req, res) => {
  res.json({
    hash: lastHash,
    count: flightsCache.length,
    updatedAt: lastUpdatedAt,
    lastError,
    etag,
    lastModified,
    intervalMs: currentInterval,
  });
});

app.get('/flights', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(flightsCache);
});

app.post('/refresh', async (_req, res) => {
  const changed = await scrapeOnce();
  res.json({
    ok: true,
    changed,
    hash: lastHash,
    count: flightsCache.length,
    updatedAt: lastUpdatedAt,
    lastError,
  });
});

/* ---------- Server-Sent Events: push change notifications ---------- */
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({
    type: 'hello',
    updatedAt: lastUpdatedAt,
    count: flightsCache.length
  })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.listen(PORT, () => {
  console.log(`✅ Backend listening on :${PORT}`);
});
