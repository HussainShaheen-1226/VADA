// server/scraper.js
// HTML-table parser first (preferred), with text-mode fallback helpers.

import * as cheerio from 'cheerio';

// ---------- utils ----------
function clean(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}
const STATUS_RX = /(LANDED|DELAYED|FINAL CALL|GATE CLOSED|BOARDING|DEPARTED|CANCELLED|ON TIME|SCHEDULED|ESTIMATED)/i;
const TIME_RX = /\b(\d{1,2}:\d{2})\b/g;
const FLIGHT_RX = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)$/i;
const TERM_RX = /^(DOM|T\d)$/i;

export function extractUpdatedLT(text) {
  const m = text.match(/Updated:\s*([^\n]+?)\s*LT/i);
  return m ? m[1].trim() : null;
}

// ---------- PRIMARY: parse directly from HTML tables ----------
export function parseFlightsFromHtml($) {
  const flights = [];
  const bodyText = clean($('body').text());
  const updatedLT = extractUpdatedLT(bodyText);

  $('table').each((_, tbl) => {
    const $tbl = $(tbl);

    // Skip tiny/legend tables (not data grids)
    const sampleRow = $tbl.find('tr').first();
    const sampleCols = sampleRow.find('td,th').length;
    if (sampleCols < 4) return;

    $tbl.find('tr').each((__, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 4) return; // likely not a flight row

      const cells = tds.map((i, td) => clean($(td).text())).get();
      const rowText = clean(cells.join(' '));

      let flightNo = null, airline = null, number = null, terminal = null;
      let scheduled = null, estimated = null, status = null, place = null;

      // Terminal (DOM/T1/T2)
      const termIdx = cells.findIndex(c => TERM_RX.test(c));
      if (termIdx !== -1) terminal = cells[termIdx].toUpperCase();

      // Times
      const times = rowText.match(TIME_RX) || [];
      if (times.length >= 1) scheduled = times[0];
      if (times.length >= 2) estimated = times[1];

      // Status word
      const sMatch = rowText.match(STATUS_RX);
      if (sMatch) status = sMatch[1].toUpperCase();

      // Flight code (may be in one cell or split across two)
      let flightIdx = cells.findIndex(c => FLIGHT_RX.test(c));
      if (flightIdx === -1) {
        for (let i = 0; i < cells.length - 1; i++) {
          const combo = clean(`${cells[i]} ${cells[i + 1]}`);
          if (FLIGHT_RX.test(combo)) { flightIdx = i; cells[i] = combo; break; }
        }
      }
      if (flightIdx !== -1) {
        const m = cells[flightIdx].match(FLIGHT_RX);
        airline = m[1].toUpperCase();
        number  = m[2].toUpperCase();
        flightNo = `${airline} ${number}`;
      }

      // Origin/destination guess: content after the flight and before first time/terminal
      if (flightIdx !== -1) {
        let end = cells.length;
        const firstTimeIdx = cells.findIndex(c => TIME_RX.test(c));
        if (firstTimeIdx !== -1) end = Math.min(end, firstTimeIdx);
        if (termIdx !== -1)     end = Math.min(end, termIdx);
        if (end > flightIdx + 1) {
          place = clean(cells.slice(flightIdx + 1, end).join(' '));
        }
      }
      if (!place) {
        // Fallback: pick the longest non-time, non-terminal cell that's not the flight cell
        const candidates = cells
          .map((c, i) => ({ c, i }))
          .filter(({ c, i }) =>
            i !== flightIdx && !TIME_RX.test(c) && !TERM_RX.test(c) && !FLIGHT_RX.test(c) && c.length > 1);
        if (candidates.length) {
          place = candidates.reduce((a, b) => (a.c.length > b.c.length ? a : b)).c;
        }
      }

      if (flightNo && terminal && scheduled) {
        flights.push({
          airline,
          flightNo,
          origin_or_destination: place || null,
          scheduled,
          estimated: estimated || null,
          terminal,
          isDomestic: terminal === 'DOM',
          status: status || null
        });
      }
    });
  });

  return { updatedLT, flights };
}

// ---------- FALLBACK: tolerant line-by-line text parser ----------
export function parseFlightsFromText(txt) {
  const norm = clean(txt);
  const lines = norm.split(/\n+/).map(s => s.trim()).filter(Boolean);

  const lineA = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}:\d{2}))?\s+(DOM|T\d)\s*(.*)$/i;
  const lineB = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*(.*)$/i;

  const flights = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let airline, number, place, sched, est, terminal, tail = '';

    let m = l.match(lineA);
    if (m) {
      [, airline, number, place, sched, est, terminal, tail] = m;
    } else {
      m = l.match(lineB);
      if (!m) continue;
      [, airline, number, place, sched, est, tail] = m;

      const tailTerm = tail && tail.match(/(DOMESTIC|DOM|T1|T2)/i);
      if (tailTerm) terminal = tailTerm[1].toUpperCase().replace('DOMESTIC', 'DOM');
      else if (lines[i + 1]) {
        const nextTerm = lines[i + 1].match(/(DOMESTIC|DOM|T1|T2)/i);
        terminal = nextTerm ? nextTerm[1].toUpperCase().replace('DOMESTIC', 'DOM') : null;
      }
    }

    airline = airline?.toUpperCase();
    number  = number?.toUpperCase();
    terminal = terminal ? terminal.toUpperCase() : null;

    let status = null;
    if (tail && STATUS_RX.test(tail)) status = tail.match(STATUS_RX)[1].toUpperCase();
    else if (lines[i + 1] && STATUS_RX.test(lines[i + 1])) status = lines[i + 1].match(STATUS_RX)[1].toUpperCase();

    if (!terminal || !airline || !number) continue;

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

  return { updatedLT: extractUpdatedLT(norm), flights };
}
