// VADA v3 backend — Arr/Dep scraping, SQLite, Logs, My Flights, PSM fan-out, Web Push, Admin session.
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import session from 'express-session';
import webpush from 'web-push';
import { scrapeAll } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- env ----
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''; // optional for /refresh
const SCRAPE_INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 120000);
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ops@example.com';
const SESSION_SECRET = process.env.SESSION_SECRET || 'vada-secret';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ---- helpers ----
// Maldives time (UTC+5): we only need HH:mm for T-15 compare
function maleNow() { return new Date(Date.now() + 5*60*60*1000); }
function fmtHHMM(d) { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

// ---- db ----
const db = new Database(path.join(__dirname, 'vada.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY,
  type TEXT,  -- 'arr' | 'dep'
  flightNo TEXT,
  origin_or_destination TEXT,
  scheduled TEXT,   -- HH:mm
  estimated TEXT,   -- HH:mm or NULL
  terminal TEXT,
  status TEXT,
  category TEXT,    -- 'domestic' | 'international'
  updatedLT TEXT
);
CREATE INDEX IF NOT EXISTS idx_flights_type ON flights(type);

CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  flightNo TEXT,
  scheduled TEXT,
  estimated TEXT,
  action TEXT,   -- SS | BUS | FP | LP
  type TEXT,     -- arr | dep
  ts TEXT,
  UNIQUE(userId, flightNo, scheduled, action, type)
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON call_logs(ts);

CREATE TABLE IF NOT EXISTS my_flights (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  type TEXT,       -- arr | dep
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

const q = {
  clearType: db.prepare(`DELETE FROM flights WHERE type=?`),
  insFlight: db.prepare(`INSERT INTO flights (type,flightNo,origin_or_destination,scheduled,estimated,terminal,status,category,updatedLT)
                         VALUES (@type,@flightNo,@origin_or_destination,@scheduled,@estimated,@terminal,@status,@category,@updatedLT)`),
  listFlights: db.prepare(`SELECT * FROM flights WHERE type=@type AND (@scope='all' OR category=@scope)
                           ORDER BY scheduled, COALESCE(estimated, scheduled)`),
  insLog: db.prepare(`INSERT OR IGNORE INTO call_logs (userId,flightNo,scheduled,estimated,action,type,ts) VALUES (?,?,?,?,?,?,?)`),
  listLogs: db.prepare(`SELECT * FROM call_logs ORDER BY ts DESC LIMIT @lim OFFSET @off`),
  insMy: db.prepare(`INSERT OR IGNORE INTO my_flights(userId,type,flightNo,scheduled) VALUES (?,?,?,?)`),
  delMy: db.prepare(`DELETE FROM my_flights WHERE userId=? AND type=? AND flightNo=? AND scheduled=?`),
  listMy: db.prepare(`SELECT * FROM my_flights WHERE userId=? AND type=? ORDER BY scheduled`),
  insPSM: db.prepare(`INSERT INTO psm (userId,type,flightNo,scheduled,text,ts) VALUES (?,?,?,?,?,?)`),
  listPSM: db.prepare(`SELECT * FROM psm WHERE type=? AND flightNo=? AND scheduled=? ORDER BY ts DESC`),
  insSub: db.prepare(`INSERT OR IGNORE INTO push_subs (userId,endpoint,p256dh,auth) VALUES (?,?,?,?)`),
  listSubsByUsers: (users) => {
    const placeholders = users.map(()=>'?').join(',');
    return db.prepare(`SELECT * FROM push_subs WHERE userId IN (${placeholders})`).all(...users);
  },
  pushSeen: db.prepare(`INSERT OR IGNORE INTO push_dedupe (key) VALUES (?)`)
};

// ---- app ----
const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : [FRONTEND_ORIGIN], credentials: true }));
app.use(express.json({ limit: '512kb' }));
app.use(morgan('tiny'));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false } // set secure: true if behind https
}));

// ---- scrape loop ----
async function doScrape(){
  const { arr, dep } = await scrapeAll();
  const tx = db.transaction(() => {
    q.clearType.run('arr'); arr.forEach(f => q.insFlight.run({ ...f, type:'arr' }));
    q.clearType.run('dep'); dep.forEach(f => q.insFlight.run({ ...f, type:'dep' }));
  });
  tx();

  // T-15 push for arrivals to users who saved them
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const now = maleNow();
  const target = new Date(now.getTime() + 15*60000);
  const targetHHMM = fmtHHMM(target);

  const rows = db.prepare(`SELECT flightNo, scheduled, estimated FROM flights WHERE type='arr'`).all();
  const due = rows.filter(f => (f.estimated || f.scheduled) === targetHHMM);
  if (!due.length) return;

  for (const f of due){
    const users = db.prepare(`SELECT DISTINCT userId FROM my_flights WHERE type='arr' AND flightNo=? AND scheduled=?`)
                    .all(f.flightNo, f.scheduled).map(r=>r.userId);
    if (!users.length) continue;

    const dedupeKey = `arr|${f.flightNo}|${f.scheduled}|T-15`;
    try { q.pushSeen.run(dedupeKey); } catch { continue; } // already sent

    const subs = q.listSubsByUsers(users);
    await Promise.all(subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({
          title: `Arrival soon: ${f.flightNo}`,
          body: `ETA ${f.estimated || f.scheduled} (T-15)`,
          tag: `arr-${f.flightNo}-${f.scheduled}`
        })
      ).catch(()=>{})
    ));
  }
}
doScrape().catch(()=>{});
setInterval(() => doScrape().catch(()=>{}), SCRAPE_INTERVAL_MS);

// ---- auth helpers ----
function requireAdmin(req,res,next){
  if (req.session?.admin) return next();
  res.status(401).json({ok:false, error:'unauthorized'});
}

// ---- routes ----
app.get('/', (req,res)=>res.json({ok:true, service:'VADA v3'}));

// Flights (query style)
app.get('/api/flights', (req,res) => {
  const type = (req.query.type || 'arr').toLowerCase();   // 'arr' | 'dep'
  const scope = (req.query.scope || 'all').toLowerCase(); // 'all' | 'domestic' | 'international'
  const rows = q.listFlights.all({ type, scope });
  res.json(rows);
});

// Flights (path style, optional alias)
app.get('/flights/:type/:scope', (req,res) => {
  const type = (req.params.type || 'arr').toLowerCase();
  const scope = (req.params.scope || 'all').toLowerCase();
  const rows = q.listFlights.all({ type, scope });
  res.json(rows);
});

// Call logs (first click kept; later clicks ignored by UNIQUE)
app.post('/api/call-logs', (req,res) => {
  const { userId, flightNo, scheduled, estimated, action, type } = req.body || {};
  if (!userId || !flightNo || !scheduled || !action || !type)
    return res.status(400).json({ok:false, error:'missing fields'});
  try{
    q.insLog.run(userId, flightNo, scheduled, estimated || null, action, type, new Date().toISOString());
    res.json({ok:true});
  }catch(e){
    res.json({ok:true, note:'ignored duplicate'});
  }
});

// Admin session
app.post('/admin/login', (req,res)=>{
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.admin = true;
    return res.json({ok:true});
  }
  res.status(401).json({ok:false});
});
app.post('/admin/logout', (req,res)=>{ req.session.destroy(()=>res.json({ok:true})); });
app.get('/api/call-logs', requireAdmin, (req,res) => {
  const lim = Math.min(2000, Number(req.query.limit || 500));
  const off = Math.max(0, Number(req.query.offset || 0));
  res.json(q.listLogs.all({ lim, off }));
});

// My Flights (backend-synced)
app.get('/api/my-flights', (req,res)=>{
  const { userId, type='arr' } = req.query;
  if (!userId) return res.status(400).json({ok:false, error:'userId required'});
  res.json(q.listMy.all(userId, type));
});
app.post('/api/my-flights', (req,res)=>{
  const { userId, type, flightNo, scheduled } = req.body || {};
  if (!userId || !type || !flightNo || !scheduled) return res.status(400).json({ok:false, error:'missing fields'});
  q.insMy.run(userId, type, flightNo, scheduled);
  res.json({ok:true});
});
app.delete('/api/my-flights', (req,res)=>{
  const { userId, type, flightNo, scheduled } = req.body || {};
  if (!userId || !type || !flightNo || !scheduled) return res.status(400).json({ok:false, error:'missing fields'});
  q.delMy.run(userId, type, flightNo, scheduled);
  res.json({ok:true});
});

// PSM + fan-out to subscribers who saved this flight
app.get('/api/psm', (req,res)=>{
  const { type='arr', flightNo, scheduled } = req.query;
  if (!flightNo || !scheduled) return res.status(400).json({ok:false, error:'missing fields'});
  res.json(q.listPSM.all(type, flightNo, scheduled));
});
app.post('/api/psm', async (req,res)=>{
  const { userId, type, flightNo, scheduled, text } = req.body || {};
  if (!userId || !type || !flightNo || !scheduled || !text) return res.status(400).json({ok:false, error:'missing fields'});
  q.insPSM.run(userId, type, flightNo, scheduled, String(text).slice(0,280), new Date().toISOString());
  res.json({ok:true});

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const users = db.prepare(`SELECT DISTINCT userId FROM my_flights WHERE type=? AND flightNo=? AND scheduled=?`)
                  .all(type, flightNo, scheduled).map(r=>r.userId);
  if (!users.length) return;
  const subs = q.listSubsByUsers(users);
  await Promise.all(subs.map(s =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ title: `PSM: ${flightNo}`, body: text, tag: `psm-${type}-${flightNo}-${scheduled}` })
    ).catch(()=>{})
  ));
});

// Web Push subscription
app.get('/api/push/vapidPublicKey', (req,res)=>res.json({key: VAPID_PUBLIC_KEY}));
app.post('/api/push/subscribe', (req,res)=>{
  const { userId, endpoint, keys } = req.body || {};
  if (!userId || !endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ok:false, error:'invalid subscription'});
  q.insSub.run(userId, endpoint, keys.p256dh, keys.auth);
  res.json({ok:true});
});

// Manual refresh, guarded by token (optional)
app.post('/refresh', (req,res)=>{
  const token = req.query.token || req.headers['x-admin-token'];
  if (ADMIN_TOKEN && token === ADMIN_TOKEN){
    doScrape().then(() => res.json({ok:true})).catch(e => res.status(500).json({ok:false, error:String(e)}));
  } else {
    res.status(401).json({ok:false, error:'unauthorized'});
  }
});

app.listen(PORT, ()=>console.log(`VADA v3 backend listening on :${PORT}`));
