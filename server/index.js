import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ========== In-memory store ==========
let flightsCache = [];
let lastScrapeAt = null;
let lastError = null;

// Helper: airline name by prefix
function airlineFromFlight(flightNo = '') {
  const up = flightNo.trim().toUpperCase();
  if (up.startsWith('Q2')) return 'Maldivian';
  if (up.startsWith('NR')) return 'Manta Air';
  if (up.startsWith('VP')) return 'Villa Air';
  return 'Unknown';
}

// Core scraper (DOMESTIC ARRIVALS)
async function scrapeFlights() {
  const startTs = new Date();
  console.log(`[SCRAPER] Start ${startTs.toISOString()}`);
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Some sites block default UA; set a desktop UA
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36'
    );

    // Direct DOMESTIC arrivals URL (no UI clicks required)
    const DOMESTIC_ARRIVALS =
      'https://www.fis.com.mv/index.php?Submit=+UPDATE+&webfids_airline=ALL&webfids_domesticinternational=D&webfids_lang=1&webfids_passengercargo=passenger&webfids_type=arrivals&webfids_waypoint=ALL';

    await page.goto(DOMESTIC_ARRIVALS, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for the legacy rows (two alternating classes)
    await page.waitForSelector('tr.schedulerow, tr.schedulerowtwo', { timeout: 30000 });

    // Extract rows safely
    const rows = await page.$$eval('tr.schedulerow, tr.schedulerowtwo', (trs) => {
      const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
      const flights = [];

      trs.forEach((tr) => {
        const tds = Array.from(tr.querySelectorAll('td')).map((td) => clean(td.textContent));
        // Expected order on FIS domestic arrivals typically:
        // 0=Flight, 1=From, 2=Time (STA), 3=ESTM (ETD), 4=Status
        if (tds.length >= 5) {
          const flight = tds[0] || '';
          const from = tds[1] || '';
          const time = tds[2] || '';
          const estm = tds[3] || '';
          const status = tds[4] || '';

          flights.push({ flight, from, time, estm, status });
        }
      });

      return flights;
    });

    // Filter to Q2 / NR / VP only
    const filtered = rows.filter((r) => {
      const f = (r.flight || '').toUpperCase();
      return f.startsWith('Q2') || f.startsWith('NR') || f.startsWith('VP');
    });

    // Map to your UI schema
    const mapped = filtered.map((r) => ({
      airline: airlineFromFlight(r.flight),
      flightNo: r.flight,
      route: r.from,      // "Origin" -> "Route"
      sta: r.time,        // Time
      etd: r.estm,        // ESTM
      status: r.status,   // Status text ("Landed", "Delayed", etc.)
    }));

    flightsCache = mapped;
    lastScrapeAt = new Date();
    lastError = null;

    console.log(
      `[SCRAPER] OK rows=${rows.length} filtered=${mapped.length} at ${lastScrapeAt.toISOString()}`
    );
  } catch (err) {
    console.error('[SCRAPER] ERROR:', err?.message || err);
    lastError = String(err?.message || err);
  } finally {
    try { await browser?.close(); } catch {}
  }
}

// Kick one scrape at boot, then every minute
scrapeFlights();
setInterval(scrapeFlights, 60 * 1000);

// ========== API ==========
app.get('/', (req, res) => {
  res.send('VADA backend is running');
});

// frontend uses this
app.get('/flights', (req, res) => {
  res.json(flightsCache);
});

// Manual trigger + health info
app.get('/refresh', async (req, res) => {
  await scrapeFlights();
  res.json({ ok: true, count: flightsCache.length, lastScrapeAt, lastError });
});

// Debug info to see what’s going on
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
