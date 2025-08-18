import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import Database from 'better-sqlite3';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeAll } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const SCRAPE_INTERVAL_MS = 120000;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ops@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const db = new Database(path.join(__dirname, 'vada.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY,
  type TEXT,
  flightNo TEXT,
  origin_dest TEXT,
  scheduled TEXT,
  estimated TEXT,
  terminal TEXT,
  status TEXT,
  category TEXT,
  updatedLT TEXT
);
CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  flightNo TEXT,
  scheduled TEXT,
  estimated TEXT,
  action TEXT,
  type TEXT,
  ts TEXT,
  UNIQUE(userId, flightNo, scheduled, action, type)
);
CREATE TABLE IF NOT EXISTS my_flights (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  type TEXT,
  flightNo TEXT,
  scheduled TEXT,
  UNIQUE(userId, type, flightNo, scheduled)
);
CREATE TABLE IF NOT EXISTS psm (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  type TEXT,
  flightNo TEXT,
  scheduled TEXT,
  text TEXT,
  ts TEXT
);
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  endpoint TEXT UNIQUE,
  p256dh TEXT,
  auth TEXT
);
CREATE TABLE IF NOT EXISTS push_dedupe (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE
);
`);

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());
app.use(morgan('dev'));

// --- scrape loop ---
async function doScrape() {
  const data = await scrapeAll();
  const insert = db.prepare(`
    INSERT INTO flights (type, flightNo, origin_dest, scheduled, estimated, terminal, status, category, updatedLT)
    VALUES (@type,@flightNo,@origin_dest,@scheduled,@estimated,@terminal,@status,@category,@updatedLT)
  `);
  const clear = db.prepare(`DELETE FROM flights WHERE type=?`);
  for (const type of ['arr', 'dep']) {
    clear.run(type);
    data[type].forEach(f => insert.run(f));
  }
}
setInterval(doScrape, SCRAPE_INTERVAL_MS);
doScrape();

// --- flights ---
app.get('/flights/:type/:scope', (req, res) => {
  const { type, scope } = req.params; // type=arr|dep, scope=all|domestic|international
  const rows = db.prepare(`
    SELECT * FROM flights
    WHERE type=? AND (?='all' OR category=?)
    ORDER BY scheduled, COALESCE(estimated, scheduled)
  `).all(type, scope, scope);
  res.json(rows);
});

// --- logs ---
app.post('/log', (req, res) => {
  const { userId, flightNo, scheduled, estimated, action, type } = req.body;
  db.prepare(`
    INSERT OR IGNORE INTO call_logs (userId, flightNo, scheduled, estimated, action, type, ts)
    VALUES (?,?,?,?,?,?,?)
  `).run(userId, flightNo, scheduled, estimated, action, type, new Date().toISOString());
  res.json({ ok: true });
});

// --- my flights ---
app.post('/myflights/add', (req, res) => {
  const { userId, type, flightNo, scheduled } = req.body;
  db.prepare(`INSERT OR IGNORE INTO my_flights (userId,type,flightNo,scheduled) VALUES (?,?,?,?)`)
    .run(userId, type, flightNo, scheduled);
  res.json({ ok: true });
});
app.post('/myflights/remove', (req, res) => {
  const { userId, type, flightNo, scheduled } = req.body;
  db.prepare(`DELETE FROM my_flights WHERE userId=? AND type=? AND flightNo=? AND scheduled=?`)
    .run(userId, type, flightNo, scheduled);
  res.json({ ok: true });
});
app.get('/myflights/:userId/:type', (req, res) => {
  const { userId, type } = req.params;
  const rows = db.prepare(`SELECT * FROM my_flights WHERE userId=? AND type=?`).all(userId, type);
  res.json(rows);
});

// --- psm ---
app.post('/psm', (req, res) => {
  const { userId, type, flightNo, scheduled, text } = req.body;
  db.prepare(`INSERT INTO psm (userId,type,flightNo,scheduled,text,ts) VALUES (?,?,?,?,?,?)`)
    .run(userId, type, flightNo, scheduled, text, new Date().toISOString());
  // fan-out to others
  const subs = db.prepare(`
    SELECT DISTINCT endpoint, p256dh, auth FROM push_subs
    WHERE userId IN (SELECT userId FROM my_flights WHERE type=? AND flightNo=? AND scheduled=?)
  `).all(type, flightNo, scheduled);
  subs.forEach(sub => {
    webpush.sendNotification({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    }, JSON.stringify({ title: `PSM Update: ${flightNo}`, body: text }))
    .catch(() => {});
  });
  res.json({ ok: true });
});

// --- push ---
app.post('/push/subscribe', (req, res) => {
  const { userId, endpoint, keys } = req.body;
  db.prepare(`INSERT OR IGNORE INTO push_subs (userId,endpoint,p256dh,auth) VALUES (?,?,?,?)`)
    .run(userId, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});
app.get('/push/key', (req, res) => res.json({ key: VAPID_PUBLIC_KEY }));

// --- admin ---
app.get('/admin/logs', (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'unauthorized' });
  const logs = db.prepare(`SELECT * FROM call_logs ORDER BY ts DESC`).all();
  res.json(logs);
});

app.listen(PORT, () => console.log(`VADA server running on ${PORT}`));
