import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = path.resolve('./flights.json');

async function scrapeFlights() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.fis.com.mv', { timeout: 60000 });

    await page.waitForSelector('.arrivals tbody tr');

    const flights = await page.$$eval('.arrivals tbody tr', rows => {
      return rows.map(row => {
        const cols = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());

        const [flightNo, origin, sta, etd, statusRaw] = cols;

        // Infer airline from flight number
        let airline = '';
        if (flightNo.startsWith('Q2')) airline = 'Maldivian';
        else if (flightNo.startsWith('NR')) airline = 'Manta Air';
        else if (flightNo.startsWith('VP')) airline = 'Villa Air';

        return {
          airline,
          flightNo,
          route: origin,
          sta,
          etd,
          status: statusRaw || 'N/A'
        };
      });
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(flights, null, 2));
    console.log(`✅ Flights scraped and saved (${flights.length})`);

  } catch (err) {
    console.error('❌ Error scraping:', err);
  } finally {
    await browser.close();
  }
}

scrapeFlights();

// Schedule every 60 seconds
setInterval(scrapeFlights, 60 * 1000);
