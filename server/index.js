// VADA backend – finished endpoints
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import webpush from 'web-push';
import PDFDocument from 'pdfkit';
import { scrapeAll } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- env
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SCRAPE_INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 120000);
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ops@example.com';
const SESSION_SECRET = process.env.SESSION_SECRET || 'vada-secret';

// ---- web push (guarded)
const HAVE_VAPID = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (HAVE_VAPID) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('Web Push: enabled');
} else {
  console.warn('Web Push: disabled (missing VAPID keys)');
}

// ---- db
const db = new Database(path.join(__dirname, 'vada.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY,
  type TEXT,
  flightNo TEXT,
  origin_or_destination TEXT,
  scheduled TEXT,
  estimated TEXT,
  terminal TEXT,
  status TEXT,
  category TEXT
);
CREATE INDEX IF NOT EXISTS idx_flights_type ON flights(type);

-- ALL clicks get stored
CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  flightNo TEXT,
  scheduled TEXT,
  estimated TEXT,
  action TEXT,  -- SS | BUS | FP | LP
  type TEXT,    -- arr | dep
  ts TEXT
);

CREATE TABLE IF NOT EXISTS my_flights (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  type TEXT,    -- arr | dep
  flightNo TEXT,
  scheduled TEXT
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

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT,
  created_at TEXT
);
`);

const q = {
  // flights
  clearType: db.prepare(`DELETE FROM flights WHERE type=?`),
  insFlight: db.prepare(`INSERT INTO flights (type,flightNo,origin_or_destination,scheduled,estimated,terminal,status,category)
                         VALUES (@type,@flightNo,@origin_or_destination,@scheduled,@estimated,@terminal,@status,@category)`),
  listFlights: db.prepare(`SELECT * FROM flights WHERE type=@type AND (@scope='all' OR category=@scope)
                           ORDER BY scheduled, id`),

  // logs (all clicks)
  insLog: db.prepare(`INSERT INTO call_logs (userId,flightNo,scheduled,estimated,action,type,ts) VALUES (?,?,?,?,?,?,?)`),
  listLogs: db.prepare(`SELECT * FROM call_logs WHERE type=@type ORDER BY ts DESC LIMIT @lim OFFSET @off`),
  firstClicks: db.prepare(`
    SELECT flightNo, scheduled, type, action,
           MIN(ts) AS ts,
           (SELECT userId FROM call_logs c2
              WHERE c2.flightNo = c1.flightNo AND c2.scheduled=c1.scheduled AND c2.type=c1.type AND c2.action=c1.action
              ORDER BY c2.ts ASC LIMIT 1) AS userId
      FROM call_logs c1
     GROUP BY flightNo, scheduled, type, action
  `),

  // my flights
  insMy: db.prepare(`INSERT OR IGNORE INTO my_flights(userId,type,flightNo,scheduled) VALUES (?,?,?,?)`),
  delMy: db.prepare(`DELETE FROM my_flights WHERE userId=? AND type=? AND flightNo=? AND scheduled=?`),
  listMy: db.prepare(`SELECT * FROM my_flights WHERE userId=? AND type=? ORDER BY scheduled`),

  // psm
  insPSM: db.prepare(`INSERT INTO psm (userId,type,flightNo,scheduled,text,ts) VALUES (?,?,?,?,?,?)`),
  listPSM: db.prepare(`SELECT * FROM psm WHERE type=? AND flightNo=? AND scheduled=? ORDER BY ts DESC LIMIT 20`),

  // push
  insSub: db.prepare(`INSERT OR IGNORE INTO push_subs (userId,endpoint,p256dh,auth) VALUES (?,?,?,?)`),
  listSubsByUsers: users => {
    if (!users.length) return [];
    const placeholders = users.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM push_subs WHERE userId IN (${placeholders})`).all(...users);
  },
  pushSeen: db.prepare(`INSERT OR IGNORE INTO push_dedupe (key) VALUES (?)`),

  // users
  getUser: db.prepare(`SELECT * FROM users WHERE username=?`),
  createUser: db.prepare(`INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)`),
  listUsers: db.prepare(`SELECT id, username, role, created_at FROM users ORDER BY username`),
  delUser: db.prepare(`DELETE FROM users WHERE id=?`),
  resetPwd: db.prepare(`UPDATE users SET password_hash=? WHERE id=?`)
};

// seed admin if empty
if (!db.prepare(`SELECT COUNT(*) c FROM users`).get().c) {
  const hash = bcrypt.hashSync('change-me', 10);
  q.createUser.run('admin', hash, 'admin', new Date().toISOString());
  console.log('Seeded admin: admin / change-me');
}

// ---- app
const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : [FRONTEND_ORIGIN], credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, sameSite: 'lax', secure: false, // set true when forced HTTPS at proxy
    maxAge: 7 * 24 * 60 * 60 * 1000 // weekly re-login
  }
}));

// helpers
const maleNow = () => new Date(Date.now() + 5*60*60*1000);
const HHMM = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const requireAuth = (req,res,next) => (!req.session?.user) ? res.status(401).json({ok:false, error:'auth'}) : next();
const requireAdmin = (req,res,next) => (!req.session?.user || req.session.user.role!=='admin') ? res.status(403).json({ok:false, error:'admin'}) : next();

// scrape loop
async function doScrape(){
  const { arr, dep } = await scrapeAll();
  const tx = db.transaction(() => {
    q.clearType.run('arr'); arr.forEach(f => q.insFlight.run({ ...f, type:'arr' }));
    q.clearType.run('dep'); dep.forEach(f => q.insFlight.run({ ...f, type:'dep' }));
  });
  tx();

  // T-15 landing soon push
  if (!HAVE_VAPID) return;
  const now = maleNow();
  const target = new Date(now.getTime() + 15*60000);
  const t = HHMM(target);
  const rows = db.prepare(`SELECT flightNo, scheduled, COALESCE(estimated, scheduled) AS when FROM flights WHERE type='arr'`).all();
  const due = rows.filter(f => f.when === t);
  for (const f of due){
    const users = db.prepare(`SELECT DISTINCT userId FROM my_flights WHERE type='arr' AND flightNo=? AND scheduled=?`)
                    .all(f.flightNo, f.scheduled).map(r=>r.userId);
    if (!users.length) continue;
    const dedupeKey = `arr|${f.flightNo}|${f.scheduled}|T-15`;
    try { q.pushSeen.run(dedupeKey); } catch { continue; }
    const subs = q.listSubsByUsers(users);
    await Promise.all(subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title:`Landing soon: ${f.flightNo}`, body:`ETA ${t}`, tag:`arr-${f.flightNo}-${f.scheduled}` })
      ).catch(()=>{})
    ));
  }
}
doScrape().catch(()=>{});
setInterval(()=>doScr
