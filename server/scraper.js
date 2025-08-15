import { chromium } from 'playwright';

// Parse "Updated: Friday 15 Aug, 2025 14:32 LT" (or similar)
export function extractUpdatedLT(text) {
  const m = text.match(/Updated:\s*([^\n]+?)\s*LT/i);
  return m ? m[1].trim() : null;
}

/**
 * Robust, selector-agnostic text parser
 * Matches lines like:
 *   Q2 225 Dharavandhoo 13:20 13:29 DOM
 *   (next line) LANDED
 *
 * Captures: airline, number, origin/dest, sched, est?, terminal, status?
 */
export function parseFlightsFromText(txt) {
  const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  const flightLine = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}:\d{2}))?\s+(DOM|T\d)\s*(.*)$/i;
  const statusLine = /^(LANDED|DELAYED|FINAL CALL|GATE CLOSED|BOARDING|DEPARTED|CANCELLED|ON TIME|SCHEDULED|ESTIMATED)$/i;

  const flights = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(flightLine);
    if (!m) continue;

    let [, airline, number, place, sched, est, terminal, tail] = m;
    airline = airline.toUpperCase();
    number = number.toUpperCase();
    terminal = terminal.toUpperCase();

    // Status may be on same line tail or next line
    let status = null;
    if (tail && statusLine.test(tail.trim())) {
      status = tail.trim().toUpperCase();
    } else if (lines[i + 1] && statusLine.test(lines[i + 1])) {
      status = lines[i + 1].trim().toUpperCase();
    }

    flights.push({
      airline,
      flightNo: `${airline} ${number}`,
      origin_or_destination: place.trim(),
      scheduled: sched,
      estimated: est || null,
      terminal,
      isDomestic: terminal === 'DOM',
      status
    });
  }

  return {
    updatedLT: extractUpdatedLT(txt),
    flights
  };
}

export async function scrapeWithPlaywright(url) {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Wait a moment in case content is injected
  await page.waitForTimeout(1500);
  const text = await page.locator('body').innerText();
  await browser.close();

  return parseFlightsFromText(text);
}
