// server/xmlSource.js
// XML → normalized flights for VADA (arrivals + departures)
// Env (set in Render): FIS_XML_ARR_URL, FIS_XML_DEP_URL, FIS_XML_TIMEOUT_MS, FIS_XML_HEADERS (JSON)

import { XMLParser } from 'fast-xml-parser';

// read env
const ARR_URL = process.env.FIS_XML_ARR_URL || 'https://www.fis.com.mv/xml/arrive.xml';
const DEP_URL = process.env.FIS_XML_DEP_URL || 'https://www.fis.com.mv/xml/depart.xml';
const TIMEOUT_MS = Number(process.env.FIS_XML_TIMEOUT_MS || 12000);
const HDRS = (() => { try { return JSON.parse(process.env.FIS_XML_HEADERS || '{}'); } catch { return {}; } })();

// tiny fetch with timeout helper (uses Node 18+ global fetch)
async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: HDRS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const CLEAN = (s) => String(s ?? '').trim();
const HHMM = (s) => {
  if (!s) return '';
  const m = String(s).match(/([01]\d|2[0-3])[:\.]([0-5]\d)/);
  return m ? `${m[1]}:${m[2]}` : '';
};
const normStatus = (s) => {
  const t = CLEAN(s).toUpperCase();
  if (t.includes('LANDED')) return 'LANDED';
  if (t.includes('DELAY'))  return 'DELAYED';
  if (t.includes('BOARD'))  return 'BOARDING';
  if (t.includes('CANCEL')) return 'CANCELLED';
  if (t.includes('FINAL'))  return 'FINAL CALL';
  if (t.includes('EST'))    return 'ESTIMATED';
  if (t.includes('DEPART')) return 'DEPARTED';
  return t || '-';
};
const normFlightNo = (s) => {
  const t = CLEAN(s).toUpperCase().replace(/\s+/g,'');
  const m = t.match(/^([A-Z0-9]{1,3})\s?(\d{2,4})$/);
  return m ? `${m[1]} ${m[2]}` : CLEAN(s);
};

function normalizeArray(items, kind) {
  // ensure array
  if (!Array.isArray(items)) items = items ? [items] : [];
  const out = [];

  for (const it of items) {
    // common XML field variants (seen across airport feeds)
    const flightNo = normFlightNo(
      it.FlightNo ?? it.Flight ?? it.FltNo ?? it.Number ?? it.FNo
    );
    if (!flightNo) continue;

    const from = it.From ?? it.Origin ?? it.CityFrom ?? it.Orig ?? '';
    const to   = it.To   ?? it.Destination ?? it.CityTo ?? it.Dest ?? '';

    // arrivals show origin; departures show destination
    const origin_or_destination = CLEAN(kind === 'arr' ? (from || to) : (to || from));

    // times
    const scheduled = HHMM(it.STA ?? it.STD ?? it.Sched ?? it.Time ?? it.Scheduled);
    const estimated = HHMM(it.ETA ?? it.ETD ?? it.Est ?? it.Estimated);

    // terminal / gate
    const terminal = CLEAN(it.Terminal ?? it.Term ?? it.Gate ?? it.TerminalCode ?? '');

    // domestic/international
    const ctRaw = String(it.CarrierType ?? it.DomInt ?? it.Sector ?? it.Category ?? '').toUpperCase();
    const category = ctRaw.startsWith('D') ? 'domestic'
                   : ctRaw.startsWith('I') ? 'international'
                   : (ctRaw.includes('DOM') ? 'domestic'
                      : ctRaw.includes('INT') ? 'international'
                      : 'all');

    // status/remarks
    const status = normStatus(it.Status ?? it.Remark ?? it.Remarks);

    out.push({
      type: kind,
      flightNo,
      origin_or_destination,
      scheduled,
      estimated,
      terminal,
      status,
      category
    });
  }

  // de-dup by (type, flightNo, scheduled)
  const uniq = new Map();
  for (const r of out) {
    const k = `${r.type}|${r.flightNo}|${r.scheduled}`;
    if (!uniq.has(k)) uniq.set(k, r);
  }
  return [...uniq.values()];
}

function normalizeRoot(root, kind) {
  if (!root) return [];

  // Common shapes:
  // 1) <Arrivals><Flight>...</Flight></Arrivals> / <Departures><Flight>...</Flight>
  // 2) <flights><flight Type="ARR">...</flight></flights>
  // 3) The root itself is an array of flights

  if (kind === 'arr') {
    if (root.Arrivals?.Flight) return normalizeArray(root.Arrivals.Flight, 'arr');
    if (root.flights?.flight) {
      const arr = (Array.isArray(root.flights.flight) ? root.flights.flight : [root.flights.flight])
        .filter(x => String(x.Type ?? x.FlightType ?? '').toLowerCase().startsWith('arr'));
      return normalizeArray(arr, 'arr');
    }
  } else {
    if (root.Departures?.Flight) return normalizeArray(root.Departures.Flight, 'dep');
    if (root.flights?.flight) {
      const dep = (Array.isArray(root.flights.flight) ? root.flights.flight : [root.flights.flight])
        .filter(x => String(x.Type ?? x.FlightType ?? '').toLowerCase().startsWith('dep'));
      return normalizeArray(dep, 'dep');
    }
  }

  if (Array.isArray(root)) return normalizeArray(root, kind);

  // Some feeds use <Flights><Flight>...</Flight></Flights>
  if (root.Flights?.Flight) return normalizeArray(root.Flights.Flight, kind);

  return [];
}

export async function fetchFromXML() {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

  const [arrText, depText] = await Promise.all([
    getText(ARR_URL).catch(() => null),
    getText(DEP_URL).catch(() => null)
  ]);

  const arrRoot = arrText ? parser.parse(arrText) : null;
  const depRoot = depText ? parser.parse(depText) : null;

  const arr = normalizeRoot(arrRoot, 'arr');
  const dep = normalizeRoot(depRoot, 'dep');

  return { arr, dep };
}
