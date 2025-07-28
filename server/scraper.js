import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve('./flight-data.json');

export async function scrapeFlights() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.fis.com.mv', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('.arrivals-table tbody tr');

    const flights = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.arrivals-table tbody tr'));
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        const flightNo = cells[1]?.innerText.trim() || '';
        const sta = cells[2]?.innerText.trim() || '';
        const etd = cells[3]?.innerText.trim() || '';
        const statusText = cells[4]?.innerText.trim() || '';

        let airline = '';
        if (flightNo.startsWith('Q2')) airline = 'Maldivian';
        else if (flightNo.startsWith('NR')) airline = 'Manta Air';
        else if (flightNo.startsWith('VP')) airline = 'Villa Air';

        return {
          airline,
          flightNo,
          route: cells[0]?.innerText.trim() || '',
          sta,
          etd,
          status: statusText,
        };
      });
    });

    fs.writeFileSync(DATA_FILE, JSON.stringify(flights, null, 2));
    console.log(`[✅] Flight data scraped: ${flights.length} entries`);
  } catch (err) {
    console.error('[❌] Scraping failed:', err.message);
  } finally {
    await browser.close();
  }
}
