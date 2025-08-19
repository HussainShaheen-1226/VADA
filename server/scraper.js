// server/scraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// ---- Canonical FIDS endpoints (from user)
const FIDS = {
  arr: {
    both: 'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1',
    domestic:
      'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
    // user pasted D for international too; that’s clearly a typo—use I:
    international:
      'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
    // fallback if "both" ever breaks:
    bothFallback:
      'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=ALL&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+'
  },
  dep: {
    both:
      'https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=both&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
    domestic:
      'https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
    international:
      'https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
    // fallback if “both” param stops working:
    bothFallback:
      'https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=ALL&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+'
  }
};

async function fetchHTML(url) {
  const { data, status } = await axios.get(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    timeout: 20000,
    validateStatus: (s) => s >= 200 && s < 400
  });
  return { html: data, status };
}

function parseTable(html, type, category) {
  const $ = cheerio.load(html);

  // Very general parser: any TR with >=6 TDs; adjust if FIDS layout changes.
  const rows = $('table tr')
    .toArray()
    .map((tr) => $(tr).find('td').toArray().map((td) => $(td).text().trim()))
    .filter((cells) => cells.length >= 6);

  const flights = [];

  for (const cells of rows) {
    // Skip headings/marketing blocks that sometimes appear as TRs
    const joined = cells.join(' ');
    if (/PASSENGER ARRIVALS|DEPARTURES BOTH|AIRLINES\s|Updated:\s/i.test(joined)) continue;

    // Expected order (Velana pages): [Flight, Origin/Dest, Sched, Est, Term, Status, ...]
    const [flightNo, place, scheduled, estimated, terminal, status] = cells;

    const normTime = (s) => (s && /^\d{2}:\d{2}$/.test(s) ? s : null);

    flights.push({
      type, // 'arr' | 'dep'
      category, // 'domestic' | 'international'
      flightNo: (flightNo || '').replace(/\s+/g, ' ').trim(),
      origin_or_destination: (place || '').replace(/\s+/g, ' ').trim(),
      scheduled: normTime(scheduled),
      estimated: normTime(estimated),
      terminal: (terminal || '').toUpperCase().trim(),
      status: (status || '').toUpperCase().trim()
    });
  }

  return flights;
}

async function collect(kind) {
  const urls = FIDS[kind];

  // Try “both” first (gives full list), fall back to “ALL” if it fails
  let bothHTML = '';
  try {
    const { html } = await fetchHTML(urls.both);
    bothHTML = html;
  } catch {
    try {
      const { html } = await fetchHTML(urls.bothFallback);
      bothHTML = html;
    } catch {
      // ignore; we’ll use D/I separately
    }
  }

  // If both worked, parse once and split by heuristic (DOM vs INT tag is not explicit here)
  // Safer approach: always fetch D and I explicitly and concatenate.
  let domestic = [];
  let international = [];

  // Domestic
  try {
    const { html } = await fetchHTML(urls.domestic);
    domestic = parseTable(html, kind, 'domestic');
  } catch {
    // ignore
  }

  // International
  try {
    const { html } = await fetchHTML(urls.international);
    international = parseTable(html, kind, 'international');
  } catch {
    // ignore
  }

  // If D+I are empty but BOTH succeeded, at least return ALL parsed (marked as unknown category).
  if (domestic.length === 0 && international.length === 0 && bothHTML) {
    const all = parseTable(bothHTML, kind, 'domestic'); // mark as domestic by default
    return all;
  }

  return [...domestic, ...international];
}

export async function scrapeAll() {
  const [arr, dep] = await Promise.all([collect('arr'), collect('dep')]);
  return { arr, dep };
}
