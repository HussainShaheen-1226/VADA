import { chromium } from 'playwright';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

let cachedData = [];
let lastUpdated = 0;

async function scrapeFlights() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://www.fis.com.mv', { waitUntil: 'networkidle' });

  const data = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.table tbody tr'));
    return rows.map(row => {
      const cols = row.querySelectorAll('td');
      if (cols.length < 5) return null;

      const flightNo = cols[0].innerText.trim();
      const origin = cols[1].innerText.trim();
      const sta = cols[2].innerText.trim();
      const etd = cols[3].innerText.trim();
      const status = cols[4].innerText.trim();

      // Infer airline from flight number prefix
      let airline = 'Unknown';
      if (flightNo.startsWith('Q2')) airline = 'Maldivian';
      else if (flightNo.startsWith('VP')) airline = 'Villa Air';
      else if (flightNo.startsWith('NR')) airline = 'Manta Air';

      return {
        airline,
        flightNo,
        route: origin,
        sta,
        etd,
        status
      };
    }).filter(flight => flight !== null);
  });

  await browser.close();
  return data;
}

// Route to serve scraped data
app.get('/flights', async (req, res) => {
  const now = Date.now();
  if (now - lastUpdated > 60 * 1000) {
    try {
      cachedData = await scrapeFlights();
      lastUpdated = now;
    } catch (err) {
      console.error('Scraping failed:', err);
      return res.status(500).json({ error: 'Failed to fetch flights' });
    }
  }

  res.json(cachedData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
