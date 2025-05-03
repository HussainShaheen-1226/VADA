const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.get('/api/flights', async (req, res) => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://www.fis.com.mv/index.php?Submit=+UPDATE+&webfids_airline=ALL&webfids_domesticinternational=D&webfids_lang=1&webfids_passengercargo=passenger&webfids_type=arrivals&webfids_waypoint=ALL', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const flights = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr.schedulerow, tr.schedulerowtwo'));
      const data = [];

      rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length >= 5) {
          const flight = cols[0].innerText.trim();
          const from = cols[1].innerText.trim();
          const time = cols[2].innerText.trim();
          const estm = cols[3].innerText.trim();
          const status = cols[4].innerText.trim();

          if (flight.startsWith('Q2') || flight.startsWith('NR') || flight.startsWith('VP')) {
            data.push({ flight, from, time, estm, status });
          }
        }
      });

      return data;
    });

    await browser.close();
    res.json(flights);
  } catch (error) {
    console.error('Error fetching flight data:', error);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
