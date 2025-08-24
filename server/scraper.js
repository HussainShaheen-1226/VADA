// server/scraper.js
import axios from "axios";
import * as cheerio from "cheerio";

// Confirmed FIDS endpoints (DOM/INT pages are most reliable)
const URLS = {
  arr_dom: "https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
  arr_int: "https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
  dep_dom: "https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
  dep_int: "https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+"
};

const clean = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .replace(/[•|·]/g, " ")
    .trim();

const normalizeStatus = (s) => {
  const t = clean(s).toUpperCase();
  if (!t) return "-";
  if (t.includes("LANDED")) return "LANDED";
  if (t.includes("DELAY")) return "DELAYED";
  if (t.includes("BOARD")) return "BOARDING";
  if (t.includes("CANCEL")) return "CANCELLED";
  if (t.includes("FINAL")) return "FINAL CALL";
  if (t.includes("EST")) return "ESTIMATED";
  return t;
};

function parseFidsTable(html, kind, category) {
  const $ = cheerio.load(html);
  const rows = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const raw = tds.map((__i, el) => clean($(el).text())).get().filter(Boolean);
    const text = raw.join(" ").toUpperCase();

    // Extract flight number like "Q2 343", "EY 378", "NR419"
    const flightMatch = text.match(/\b([A-Z]{1,3}\s?\d{2,4})\b/);
    const flightNo = flightMatch ? clean(flightMatch[1]).replace(/\s+/, " ") : "";

    // Times: HH:MM patterns
    const times = text.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g) || [];
    const scheduled = times[0] || "";
    const estimated = times[1] && times[1] !== scheduled ? times[1] : "";

    // Terminal hint
    let terminal = "";
    if (text.includes(" T1 ")) terminal = "T1";
    else if (text.includes(" T2 ")) terminal = "T2";
    else if (text.includes(" DOM ")) terminal = "DOM";
    else if (text.includes(" INT ")) terminal = "INT";

    // Status hint
    let status = "-";
    for (const h of ["LANDED", "DELAY", "BOARD", "CANCEL", "FINAL", "EST"]) {
      if (text.includes(h)) { status = normalizeStatus(h); break; }
    }

    // Origin/Destination text after flight number
    let origin_or_destination = "";
    if (flightNo) {
      const after = text.split(flightNo.toUpperCase())[1] || "";
      origin_or_destination = clean(
        after
          .replace(/\b([01]\d|2[0-3]):[0-5]\d\b/g, "")
          .replace(/\b(T1|T2|DOM|INT|DOMESTIC|INTERNATIONAL|PASSENGER|CARGO)\b/g, "")
          .replace(/\b(LANDED|DELAY|BOARD|CANCEL|FINAL|EST)\b/g, "")
      );
    }

    if (!flightNo) return; // ignore legend rows

    rows.push({
      type: kind, // arr | dep
      flightNo,
      origin_or_destination,
      scheduled,
      estimated,
      terminal,
      status,
      category // domestic | international
    });
  });

  // Deduplicate by (type, flightNo, scheduled)
  const uniq = new Map();
  for (const r of rows) {
    const k = `${r.type}|${r.flightNo}|${r.scheduled}`;
    if (!uniq.has(k)) uniq.set(k, r);
  }
  return [...uniq.values()];
}

async function fetchAndParse(url, kind, category) {
  const { data } = await axios.get(url, { timeout: 15000 });
  return parseFidsTable(data, kind, category);
}

export async function scrapeAll() {
  const [arrDom, arrInt, depDom, depInt] = await Promise.all([
    fetchAndParse(URLS.arr_dom, "arr", "domestic").catch(() => []),
    fetchAndParse(URLS.arr_int, "arr", "international").catch(() => []),
    fetchAndParse(URLS.dep_dom, "dep", "domestic").catch(() => []),
    fetchAndParse(URLS.dep_int, "dep", "international").catch(() => []),
  ]);
  return { arr: [...arrDom, ...arrInt], dep: [...depDom, ...depInt] };
}
