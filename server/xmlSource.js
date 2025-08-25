import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

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
  const out = [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  for (const it of items) {
    const flightNo = normFlightNo(it.FlightNo || it.Flight || it.FltNo || it.Number || it.FNo);
    if (!flightNo) continue;

    const from = it.From || it.Origin || it.CityFrom || it.Orig || '';
    const to   = it.To   || it.Destination || it.CityTo || it.Dest || '';

    const origin_or_destination = CLEAN(kind === 'arr' ? (from || to) : (to || from));
    const scheduled = HHMM(it.STA || it.STD || it.Sched || it.Time || it.Scheduled);
    const estimated = HHMM(it.ETA || it.ETD || it.Est || it.Estimated);
    const terminal  = CLEAN(it.Terminal || it.Term || it.Gate || it.TerminalCode || '');

    const ctRaw = String(it.CarrierType || it.DomInt || it.Sector || it.Category || '').toUpperCase();
    const category = ctRaw.startsWith('D') ? 'domestic'
                   : ctRaw.startsWith('I') ? 'international'
                   : (ctRaw.includes('DOM') ? 'domestic' : ctRaw.includes('INT') ? 'international' : 'all');

    const status = normStatus(it.Status || it.Remark || it.Remarks);

    out.push({ type: kind, flightNo, origin_or_destination, scheduled, estimated, terminal, status, category });
  }
  const uniq = new Map();
  for (const r of out) { const k = `${r.type}|${r.flightNo}|${r.scheduled}`; if (!uniq.has(k)) uniq.set(k, r); }
  return [...uniq.values()];
}

function normalizeRoot(root, kind) {
  if (!root) return [];
  if (kind === 'arr') {
    if (root.Arrivals?.Flight) return normalizeArray(root.Arrivals.Flight, 'arr');
    if (root.flights?.flight) {
      const arr = (Array.isArray(root.flights.flight) ? root.flights.flight : [root.flights.flight])
        .filter(x => String(x.Type||x.FlightType||'').toLowerCase().startsWith('arr'));
      return normalizeArray(arr, 'arr');
    }
  } else {
    if (root.Departures?.Flight) return normalizeArray(root.Departures.Flight, 'dep');
    if (root.flights?.flight) {
      const dep = (Array.isArray(root.flights.flight) ? root.flights.flight : [root.flights.flight])
        .filter(x => String(x.Type||x.FlightType||'').toLowerCase().startsWith('dep'));
      return normalizeArray(dep, 'dep');
    }
  }
  if (Array.isArray(root)) return normalizeArray(root, kind);
  return [];
}

async function fetchXML(url, timeout, headers = {}) {
  const { data } = await axios.get(url, { timeout, headers });
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  return parser.parse(data);
}

export async function fetchXMLAll() {
  const ARR_URL = process.env.FIS_XML_ARR_URL;
  const DEP_URL = process.env.FIS_XML_DEP_URL;
  const TIMEOUT = Number(process.env.FIS_XML_TIMEOUT_MS || 12000);
  const HDRS = (() => { try { return JSON.parse(process.env.FIS_XML_HEADERS || '{}'); } catch { return {}; } })();

  const [arrRoot, depRoot] = await Promise.all([
    ARR_URL ? fetchXML(ARR_URL, TIMEOUT, HDRS).catch(()=>null) : null,
    DEP_URL ? fetchXML(DEP_URL, TIMEOUT, HDRS).catch(()=>null) : null
  ]);

  const arr = normalizeRoot(arrRoot, 'arr');
  const dep = normalizeRoot(depRoot, 'dep');
  return { arr, dep };
}
