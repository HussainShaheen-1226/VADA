// server/scraper.js
// Robust, selector-agnostic text parser for Velana FIDS pages.
// No Playwright. No DOM selectors. It parses the page BODY text.

/**
 * Extracts the "Updated: ... LT" timestamp line (if present) from the page text.
 * Example: "Updated: Friday 15 Aug, 2025 14:32 LT"
 */
export function extractUpdatedLT(text) {
  const m = text.match(/Updated:\s*([^\n]+?)\s*LT/i);
  return m ? m[1].trim() : null;
}

/**
 * Parse flights from raw page text.
 *
 * We expect lines like:
 *   Q2 225 Dharavandhoo 13:20 13:29 DOM
 * Sometimes the status appears on the same line tail or the next line:
 *   LANDED | DELAYED | FINAL CALL | GATE CLOSED | BOARDING | DEPARTED | CANCELLED | ON TIME | SCHEDULED | ESTIMATED
 *
 * Captured fields:
 * - airline (e.g., Q2)
 * - number  (e.g., 225)
 * - origin_or_destination (e.g., Dharavandhoo)
 * - scheduled (HH:MM)
 * - estimated (HH:MM or null)
 * - terminal (DOM or T1/T2)
 * - status (nullable)
 */
export function parseFlightsFromText(txt) {
  const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Flight line regex:
  //  airline   number          place                sched      est?            terminal   tail (may carry status)
  const flightLine = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}:\d{2}))?\s+(DOM|T\d)\s*(.*)$/i;

  // Known status words (case-insensitive)
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
