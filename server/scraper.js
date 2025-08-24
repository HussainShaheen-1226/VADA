// server/scraper.js
import axios from "axios";
import * as cheerio from "cheerio";

// --- FIDS endpoints you confirmed
const URLS = {
  arr_all: "https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1",
  arr_dom: "https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
  arr_int: "https://www.fis.com.mv/index.php?webfids_type=arrivals&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
  dep_all: "https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=both&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
  dep_dom: "https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=D&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
  dep_int: "https://www.fis.com.mv/index.php?webfids_type=departures&webfids_lang=1&webfids_domesticinternational=I&webfids_passengercargo=passenger&webfids_airline=ALL&webfids_waypoint=ALL&Submit=+UPDATE+",
};

// helpers
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
  if (t.includes("EST")) return "ESTIMATED";
  if (t.includes("FINAL")) return "FINAL CALL";
  return t;
};

// FIDS tables are inconsistent, so we read visible texts and map defensively.
function parseFidsTable(html, kind /* 'arr' | 'dep' */, category /* 'domestic' | 'international' | 'all' */) {
  const $ = cheerio.load(html);
  const rows = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const raw = tds
      .map((__i, el) => clean($(el).text()))
      .get()
      .filter(Boolean);

    const text = raw.join(" ").toUpperCase();

    // Heuristics to find flight number (e.g., "EY 378", "Q2 343", "NR 419")
    const flightMatch = text.match(/\b([A-Z]{1,3}\s?\d{2,4})\b/);
    const flightNo = flightMatch ? clean(flightMatch[1]).replace(/\s+/, " ") : "";

    // Sched and Est: look for HH:MM patterns
    const times = text.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g) || [];
    const scheduled = times[0] || "";
    // Est might be second time, but FIDS sometimes omits; be safe
    const estimated = times[1] && times[1] !== scheduled ? times[1] : "";

    // Terminal guess: look for T1/T2/DOM/INT in row
    let terminal = "-";
    if (text.includes(" T1 ")) terminal = "T1";
    else if (text.includes(" T2 ")) terminal = "T2";
    else if (text.includes(" DOM ")) terminal = "DOM";
    else if (text.includes(" INT ")) terminal = "INT";

    // Status guess: pick any known keyword
    let status = "-";
    const statusHints = ["LANDED", "DELAY", "BOARD", "CANCEL", "FINAL", "EST"];
    for (const h of statusHints) {
      if (text.includes(h)) {
        status = normalizeStatus(h);
        break;
      }
    }

    // Origin/Destination: second “word block” after flight often works;
    // fall back to removing obvious tokens and grabbing remaining chunk.
    let origin_or_destination = "";
    if (flightNo) {
      const afterFlight = text.split(flightNo.toUpperCase())[1] || "";
      // strip times, terminals, category words
      origin_or_destination = clean(
        afterFlight
          .replace(/\b([01]\d|2[0-3]):[0-5]\d\b/g, "")
          .replace(/\b(T1|T2|DOM|INT|DOMESTIC|INTERNATIONAL|PASSENGER|CARGO)\b/g, "")
          .replace(/\b(LANDED|DELAY|BOARD|CANCEL|FINAL|EST)\b/g, "")
      );
    }

    // Ignore rows that are pure legend blocks (huge word salad without a flight number)
    if (!flightNo) return;

    rows.push({
      type: kind,
      flightNo,
      origin_or_destination,
      scheduled,
      estimated,
      terminal: terminal === "-" ? "" : terminal,
      status,
      category: category === "all" ? (terminal === "DOM" ? "domestic" : terminal === "INT" ? "international" : "all") : category,
    });
  });

  // de-dup by (type, flightNo, scheduled)
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
  // We primarily trust DOM/INT pages; “all” is just a sanity merge.
  const [arrDom, arrInt, depDom, depInt] = await Promise.all([
    fetchAndParse(URLS.arr_dom, "arr", "domestic").catch(() => []),
    fetchAndParse(URLS.arr_int, "arr", "international").catch(() => []),
    fetchAndParse(URLS.dep_dom, "dep", "domestic").catch(() => []),
    fetchAndParse(URLS.dep_int, "dep", "international").catch(() => []),
  ]);

  const arr = [...arrDom, ...arrInt];
  const dep = [...depDom, ...depInt];

  return { arr, dep };
}
