import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/* ---------------------- Config ---------------------- */
const DOMESTIC_ARRIVALS_URL =
  'https://www.fis.com.mv/index.php?Submit=+UPDATE+&webfids_airline=ALL&webfids_domesticinternational=D&webfids_lang=1&webfids_passengercargo=passenger&webfids_type=arrivals&webfids_waypoint=ALL';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36';

/* ---------------------- In-memory store ---------------------- */
let flightsCache = [];
let lastScrapeAt = null;
let lastError = null;

/* ---------------------- Helpers ---------------------- */
function airlineFromFlight(flightNo = '') {
  const up = (flightNo || '').toUpperCase();
  if (up.startsWith('Q2')) return 'Maldivian';
  if (up.startsWith('NR')) return 'Manta Air';
  if (up.startsWith('VP')) return 'Villa Air';
  return 'Unknown';
}

function mapRawRow({ flight, from, time, estm, status }) {
  return {
    airline: airlineFromFlight(flight),
    flightNo: flight || '',
    route: from || '',
    sta: time || '',
    etd: estm || '',
    status: status || '',
  };
}

/* ---------------------- Primary: Axios + Cheerio ---------------------- */
async function scrapeWithCheerio() {
  const res = await axios.get(DOMESTIC_ARRIVALS_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    timeout: 30000,
  });
  const $ = cheerio.load(res.data);

  const rows = $('tr.schedulerow, tr.schedulerowtwo');
  const out = [];
  rows.each((i, row) => {
    const tds = $(row).find('td');
    if (tds.length >= 5) {
      const flight = $(tds[0]).text().trim();
      const from = $(tds[1]).text().trim();
      const time = $(tds[2]).text().trim();
      const estm = $(tds[3]).text().trim();
      const status = $(tds[4]).text().trim();

      const up = (flight || '').toUpperCase();
      if (up.startsWith('Q2') || up.startsWith('NR') || up.startsWith('VP')) {
        out.push(mapRawRow({ flight, from, time, estm, status }));
      }
    }
  });
  return out;
}

/* ---------------------- Fallback: Playwright ---------------------- */
async function scrapeWithPlaywright() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(DOMESTIC_ARRIVALS_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForSelector('tr.schedulerow, tr.schedulerowtwo', {
      timeout: 30000,
    });

    const rows = await page.$$eval(
      'tr.schedulerow, tr.schedulerowtwo',
      (trs) => {
        const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
        const result = [];
        trs.forEach((tr) => {
          const tds = Array.from(tr.querySelectorAll('td')).map((td) =>
            clean(td.textContent)
          );
          if (tds.length >= 5) {
            result.push({
              flight: tds[0] || '',
              from: tds[1] || '',
              time: tds[2] || '',
              estm: tds[3] || '',
              status: tds[4] || '',
            });
          }
        });
        return result;
      }
    );

    const filtered = rows.filter((r) => {
      const f = (r.flight || '').toUpperCase();
      return f.startsWith('Q2') || f.startsWith('NR') || f.startsWith('VP');
    });

    return filtered.map(mapRawRow);
  } finally {
    try {
      await browser?.close();
    } catch {}
  }
}

/* ---------------------- Unified scrape orchestrator ---------------------- */
async function scrapeFlights() {
  const start = Date.now();
  console.log(`[SCRAPE] start ${new Date(start).toISOString()}`);
  lastError = null;

  try {
    // 1) Try Cheerio first (fast & reliable)
    const cheerioData = await scrapeWithCheerio();
    console.log(`[SCRAPE] cheerio rows=${cheerioData.length}`);
    if (cheerioData.length > 0) {
      flightsCache = cheerioData;
      lastScrapeAt = new Date();
      return;
    }

    // 2) If cheerio failed or 0, try Playwright fallback
    const pwData = await scrapeWithPlaywright();
    console.log(`[SCRAPE] playwright rows=${pwData.length}`);
    flightsCache = pwData;
    lastScrapeAt = new Date();
  } catch (err) {
    lastError = String(err?.message || err);
    console.error('[SCRAPE] ERROR:', lastError);
  } finally {
    console.log(
      `[SCRAPE] done in ${Math.round(Date.now() - start)}ms, cached=${flightsCache.length}`
    );
  }
}

/* ---------------------- Kick off + schedule ---------------------- */
await scrapeFlights();
setInterval(scrapeFlights, 60 * 1000); // every minute

/* ---------------------- API ---------------------- */
app.get('/', (req, res) => {
  res.send('VADA backend is running');
});

app.get('/flights', (req, res) => {
  res.json(flightsCache);
});

app.get('/refresh', async (req, res) => {
  await scrapeFlights();
  res.json({
    ok: true,
    count: flightsCache.length,
    lastScrapeAt,
    lastError,
  });
});

app.get('/debug', (req, res) => {
  res.json({
    count: flightsCache.length,
    lastScrapeAt,
    lastError,
    sample: flightsCache.slice(0, 5),
  });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
