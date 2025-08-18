// Scrapes Velana FIDS (arrivals & departures; all/domestic/international)
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (VADA/3.0)';
const BASE = 'https://www.fis.com.mv/index.php';

const URLS = {
  arr: [
    {label:'domestic',      url:`${BASE}?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+`},
    {label:'international', url:`${BASE}?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+`},
    {label:'all',           url:`${BASE}?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=ALL&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+`}
  ],
  dep: [
    {label:'domestic',      url:`${BASE}?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+`},
    {label:'international', url:`${BASE}?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+`},
    {label:'all',           url:`${BASE}?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=ALL&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+`}
  ]
};

const TERM_RX   = /^(DOM|T\d)$/i;
const FLIGHT_RX = /^([A-Z0-9]{1,3})\s*([0-9]{2,4}[A-Z]?)$/i;
const TIME_RX   = /\b(\d{1,2}:\d{2})\b/g;
const STATUS_RX = /(LANDED|DELAYED|FINAL CALL|GATE CLOSED|BOARDING|DEPARTED|CANCELLED|ON TIME|SCHEDULED|ESTIMATED)/i;
const clean = s => String(s||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();

function parseFlightsFromHtml($){
  const flights = [];
  $('table').each((_, tbl) => {
    $(tbl).find('tr').each((__, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 4) return;
      const cells = tds.map((i, td) => clean($(td).text())).get();
      const rowText = clean(cells.join(' '));

      let terminal = null;
      const termIdx = cells.findIndex(c => TERM_RX.test(c));
      if (termIdx !== -1) terminal = cells[termIdx].toUpperCase();

      const times = rowText.match(TIME_RX) || [];
      const scheduled = times[0] || null;
      const estimated = times[1] || null;

      const sMatch = rowText.match(STATUS_RX);
      const status = sMatch ? sMatch[1].toUpperCase() : null;

      let flightNo=null, airline=null, number=null;
      let flightIdx = cells.findIndex(c => FLIGHT_RX.test(c));
      if (flightIdx === -1) {
        for (let i=0;i<cells.length-1;i++){
          const combo = clean(`${cells[i]} ${cells[i+1]}`);
          if (FLIGHT_RX.test(combo)){ flightIdx=i; cells[i]=combo; break; }
        }
      }
      if (flightIdx !== -1) {
        const m = cells[flightIdx].match(FLIGHT_RX);
        airline = m[1].toUpperCase();
        number  = m[2].toUpperCase();
        flightNo = `${airline} ${number}`;
      }

      let place=null;
      if (flightIdx !== -1) {
        let end=cells.length;
        const firstTimeIdx = cells.findIndex(c => TIME_RX.test(c));
        if (firstTimeIdx !== -1) end = Math.min(end, firstTimeIdx);
        if (termIdx !== -1)     end = Math.min(end, termIdx);
        if (end > flightIdx+1) place = clean(cells.slice(flightIdx+1, end).join(' '));
      }
      if (!place){
        const candidates = cells.filter(c =>
          !TIME_RX.test(c) && !TERM_RX.test(c) && !FLIGHT_RX.test(c) && c.length>1);
        if (candidates.length) place = candidates.sort((a,b)=>b.length-a.length)[0];
      }

      // skip banner row
      const up = (place||'').toUpperCase();
      if (up.includes('PASSENGER ARRIVALS') || up.includes('ALL AIRLINES') || up.includes('ALL ORIGINS')) return;

      if (flightNo && terminal && scheduled) {
        flights.push({
          flightNo,
          origin_or_destination: place || null,
          scheduled,
          estimated,
          terminal,
          status,
          category: terminal === 'DOM' ? 'domestic' : 'international'
        });
      }
    });
  });
  return flights;
}

async function fetchOne(url){
  const res = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 30000, validateStatus: () => true });
  const html = typeof res.data === 'string' ? res.data : '';
  const $ = cheerio.load(html);
  return parseFlightsFromHtml($);
}

export async function scrapeType(type){ // 'arr' | 'dep'
  const targets = URLS[type];
  let all = [];
  for (const t of targets){
    try{ all = all.concat(await fetchOne(t.url)); }catch{}
  }
  const key = f => `${f.flightNo}|${f.scheduled}|${f.terminal}`;
  const map = new Map();
  for (const f of all){ if (!map.has(key(f))) map.set(key(f), f); }
  return [...map.values()];
}

export async function scrapeAll(){
  const [arr, dep] = await Promise.all([scrapeType('arr'), scrapeType('dep')]);
  return { arr, dep };
}
