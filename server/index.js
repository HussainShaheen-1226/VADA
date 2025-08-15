import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";

dotenv.config();

// ---------- Config ----------
const app = express();
const PORT = process.env.PORT || 10000;

const DATA_DIR = path.resolve(".");
const FLIGHTS_FILE = path.join(DATA_DIR, "flights.json");
const META_FILE = path.join(DATA_DIR, "meta.json");
const LOG_FILE = path.join(DATA_DIR, "call-logs.json");

const SOURCE_URL =
  process.env.SOURCE_URL ||
  "https://www.fis.com.mv/WebFids.php"; // adjust if your real URL differs

const SCRAPE_INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 120000); // 2 min by default
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const REFRESH_TOKEN = process.env.REFRESH_TOKEN || "";

// ---------- Helpers ----------
const readJSON = (file, fallback) => {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    console.error(`[IO] Failed reading ${file}:`, e);
  }
  return fallback;
};

const writeJSON = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`[IO] Failed writing ${file}:`, e);
  }
};

const hashString = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Ensure files exist
if (!fs.existsSync(FLIGHTS_FILE)) writeJSON(FLIGHTS_FILE, []);
if (!fs.existsSync(META_FILE))
  writeJSON(META_FILE, {
    hash: null,
    count: 0,
    updatedAt: null,
    lastError: null,
    etag: null,
    lastModified: null,
    intervalMs: SCRAPE_INTERVAL_MS,
  });
if (!fs.existsSync(LOG_FILE)) writeJSON(LOG_FILE, []);

// In-memory logs
let callLogs = readJSON(LOG_FILE, []);

// ---------- Scraping (Cheerio first, Playwright fallback) ----------
async function scrapeWithCheerio() {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
  };
  const r = await axios.get(SOURCE_URL, { headers, timeout: 30000, validateStatus: () => true });
  const etag = r.headers.etag || null;
  const lastModified = r.headers["last-modified"] || null;

  const html = r.data || "";
  const $ = cheerio.load(html);

  // Try to find a table with arrivals; adjust selectors to match the live DOM
  // Example: rows within <table id="arrivals"> or any rows that look like flights.
  let rows = $("table tr");
  if (rows.length === 0) {
    // Try common fallback selectors
    rows = $("#arrivals tr, .arrivals tr, .table tr");
  }

  const flights = [];
  rows.each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 4) return; // skip headers/short rows

    // You will likely need to tweak indexes based on the real DOM order:
    // Example mapping (adjust as needed):
    const flightNo = $(tds[0]).text().trim() || $(tds[1]).text().trim();
    const route = $(tds[2]).text().trim();
    const sta = $(tds[3]).text().trim();
    const etd = $(tds[4]) ? $(tds[4]).text().trim() : "";
    const status = $(tds[5]) ? $(tds[5]).text().trim() : "";

    if (!flightNo) return;
    // Airline from first two letters
    const prefix = flightNo.replace(/\s+/g, "").slice(0, 2).toUpperCase();
    const airline =
      prefix === "Q2" ? "Maldivian" : prefix === "NR" ? "Manta Air" : prefix === "VP" ? "Villa Air" : "";

    flights.push({
      airline,
      flightNo,
      route,
      sta,
      etd,
      status,
    });
  });

  return { flights, raw: html, etag, lastModified, engine: "cheerio" };
}

async function scrapeWithPlaywright() {
  // Lazy import to avoid pulling it if not needed
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let html = "";
  try {
    const page = await browser.newPage();
    await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 45000 });
    // If the page builds table via JS, give it a moment:
    await page.waitForTimeout(1500);
    html = await page.content();
  } finally {
    await browser.close();
  }

  const $ = cheerio.load(html);
  let rows = $("table tr");
  if (rows.length === 0) rows = $("#arrivals tr, .arrivals tr, .table tr");

  const flights = [];
  rows.each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 4) return;

    const flightNo = $(tds[0]).text().trim() || $(tds[1]).text().trim();
    const route = $(tds[2]).text().trim();
    const sta = $(tds[3]).text().trim();
    const etd = $(tds[4]) ? $(tds[4]).text().trim() : "";
    const status = $(tds[5]) ? $(tds[5]).text().trim() : "";

    if (!flightNo) return;
    const prefix = flightNo.replace(/\s+/g, "").slice(0, 2).toUpperCase();
    const airline =
      prefix === "Q2" ? "Maldivian" : prefix === "NR" ? "Manta Air" : prefix === "VP" ? "Villa Air" : "";

    flights.push({
      airline,
      flightNo,
      route,
      sta,
      etd,
      status,
    });
  });

  return { flights, raw: html, etag: null, lastModified: null, engine: "playwright" };
}

async function scrapeAndMaybeUpdate({ force = false } = {}) {
  const meta = readJSON(META_FILE, {
    hash: null,
    count: 0,
    updatedAt: null,
    lastError: null,
    etag: null,
    lastModified: null,
    intervalMs: SCRAPE_INTERVAL_MS,
  });

  try {
    console.log("[SCRAPE] start", new Date().toISOString());

    // 1) Try Cheerio
    let attempt = await scrapeWithCheerio();
    console.log(`[SCRAPE] ${attempt.engine} rows=${attempt.flights.length}`);

    // 2) Fallback to Playwright if no rows
    if (attempt.flights.length === 0) {
      console.log("[SCRAPE] No rows via cheerio, trying Playwright…");
      attempt = await scrapeWithPlaywright();
      console.log(`[SCRAPE] ${attempt.engine} rows=${attempt.flights.length}`);
    }

    const newHash = hashString(attempt.raw || "");
    const changed =
      force ||
      newHash !== meta.hash ||
      attempt.flights.length !== readJSON(FLIGHTS_FILE, []).length;

    // Update files
    if (changed) {
      writeJSON(FLIGHTS_FILE, attempt.flights);
      writeJSON(META_FILE, {
        hash: newHash,
        count: attempt.flights.length,
        updatedAt: new Date().toISOString(),
        lastError: null,
        etag: attempt.etag,
        lastModified: attempt.lastModified,
        intervalMs: SCRAPE_INTERVAL_MS,
      });
      console.log(
        `[SCRAPE] updated flights (${attempt.flights.length}), engine=${attempt.engine}`
      );
    } else {
      // still refresh metadata timestamp so /meta shows recent activity
      writeJSON(META_FILE, {
        ...meta,
        updatedAt: new Date().toISOString(),
        lastError: null,
        etag: attempt.etag,
        lastModified: attempt.lastModified,
        intervalMs: SCRAPE_INTERVAL_MS,
      });
      console.log("[SCRAPE] no change");
    }
  } catch (err) {
    console.error("[SCRAPE] ERROR:", err?.message || err);
    writeJSON(META_FILE, {
      ...readJSON(META_FILE, {}),
      lastError: String(err?.message || err),
      updatedAt: new Date().toISOString(),
      intervalMs: SCRAPE_INTERVAL_MS,
    });
  }
}

// ---------- Server ----------
app.use(cors());
app.use(express.json());

// Flights (array only)
app.get("/flights", (req, res) => {
  const data = readJSON(FLIGHTS_FILE, []);
  res.json(data);
});

// Metadata
app.get("/meta", (req, res) => {
  const meta = readJSON(META_FILE, {
    hash: null,
    count: 0,
    updatedAt: null,
    lastError: null,
    etag: null,
    lastModified: null,
    intervalMs: SCRAPE_INTERVAL_MS,
  });
  res.json(meta);
});

// Force refresh (optional)
app.post("/refresh", async (req, res) => {
  if (REFRESH_TOKEN && req.headers.authorization !== `Bearer ${REFRESH_TOKEN}`) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  await scrapeAndMaybeUpdate({ force: true });
  res.json({ ok: true });
});

// Call logs (unchanged from yours)
app.post("/api/call-logs", (req, res) => {
  const { userId, flight, type, timestamp } = req.body;
  if (!userId || !flight || !type || !timestamp) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const entry = { userId, flight, type, timestamp };
  callLogs.push(entry);
  writeJSON(LOG_FILE, callLogs);
  res.json({ message: "Call logged successfully" });
});

app.get("/api/call-logs", (req, res) => {
  const auth = req.headers["authorization"];
  const token = auth?.split(" ")[1];
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  res.json(callLogs);
});

// ---------- Startup ----------
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  // First scrape immediately, then on interval
  scrapeAndMaybeUpdate({ force: true });
  setInterval(scrapeAndMaybeUpdate, SCRAPE_INTERVAL_MS);
});
