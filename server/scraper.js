// Scrapes FIS and returns { arr:[], dep:[] } preserving FIDS order.
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const FIDS = {
  arr_both: 'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1',
  arr_dom : 'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
  arr_int : 'https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',

  dep_both: 'https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=both&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
  dep_dom : 'https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+',
  dep_int : 'https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+'
};

async function get(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    timeout: 20000,
    validateStatus: s => s >= 200 && s < 400
  });
  return data;
}

function parseRows(html) {
  const $ = cheerio.load(html);
  // Find first reasonably-sized table
  const table = $('table').first();
  const rows = [];
  table.find('tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 4) return;

    const cells = tds.map((i, td) => $(td).text().replace(/\s+/g, ' ').trim()).get();
    // Heuristics to skip banners/headers
    const flightNo = cells[0] || '';
    if (!flightNo || /^(FLIGHT|PASSENGER|DOMESTIC|INTERNATIONAL)$/i.test(flightNo)) return;

    rows.push({
      flightNo,
      origin_or_destination: cells[1] || '',
      scheduled: cells[2] || '',
      estimated: cells[3] || '',
      terminal: cells[4] || '',
      status: (cells[5] || cells[4] || '').toUpperCase()
    });
  });
  return rows;
}

function keyOf(r) {
  // key to match between lists; use flight+scheduled time
  return `${r.flightNo}|${r.scheduled}`;
}

export async function scrapeAll() {
  // scrape the "both" pages to preserve exact FIDS order
  const [arrBothHtml, arrDomHtml, arrIntHtml,
         depBothHtml, depDomHtml, depIntHtml] = await Promise.all([
    get(FIDS.arr_both), get(FIDS.arr_dom), get(FIDS.arr_int),
    get(FIDS.dep_both), get(FIDS.dep_dom), get(FIDS.dep_int)
  ]);

  const arrBoth = parseRows(arrBothHtml);
  const arrDom  = parseRows(arrDomHtml);
  const arrInt  = parseRows(arrIntHtml);

  const depBoth = parseRows(depBothHtml);
  const depDom  = parseRows(depDomHtml);
  const depInt  = parseRows(depIntHtml);

  const domSetArr = new Set(arrDom.map(keyOf));
  const domSetDep = new Set(depDom.map(keyOf));

  const arr = arrBoth.map(r => ({
    ...r,
    category: domSetArr.has(keyOf(r)) ? 'domestic' : 'international'
  }));

  const dep = depBoth.map(r => ({
    ...r,
    category: domSetDep.has(keyOf(r)) ? 'domestic' : 'international'
  }));

  return { arr, dep };
}
