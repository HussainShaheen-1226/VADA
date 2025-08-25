// VADA backend — SQLite only, XML source, secure env-based
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import webpush from 'web-push';
import { fetchFromXML } from './xmlSource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- env ----------
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const SCRAPE_INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 90000);
const MALE_TZ_OFFSET_MIN = Number(process.env.MALE_TZ_OFFSET_MIN || 300); // +05:00
const ROLLOVER_HOUR = Number(process.env.ROLLOVER_HOUR || 6);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ops@example.com';

const SESSION_SECRET = process.env.SESSION_SECRET || 'vada-secret';

// ---------- time helpers ----------
const maleNow = () =>
  new Date(Date.now() + MALE_TZ_OFFSET_MIN * 60000 - new Date().getTimezoneOffset() * 60000);
const HHMM = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function isTomorrowByRollover(hhmm) {
  // Treat a flight as tomorrow if its SCHED < ROLLOVER_HOUR AND current local hour >= ROLLOVER_HOUR
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return false;
  const [h, m] = hhmm.split(':').map(Number);
  const now = maleNow();
  const nowH = now.getHours();
  const schedIsEarly = h < ROLLOVER_HOUR || (h === ROLLOVER_HOUR && m === 0);
  const afterRolloverNow = nowH >= ROLLOVER_HOUR;
  return schedIsEarly && afterRolloverNow;
}

// ---------- DB ----------
const db = new Database(path.join(__dirname, 'vada.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,                               -- 'arr' | 'dep'
  flightNo TEXT NOT NULL,
  origin_or_destination TEXT NOT NULL,
  scheduled TEXT NOT NULL,                          -- 'HH:MM'
  estimated TEXT,                                   -- 'HH:MM' or NULL
  terminal TEXT,
  status TEXT,
  category TEXT,                                    -- 'domestic' | 'international' | 'all'
  dayTag TEXT                                       -- 'today' | 'tomorrow'
);
CREATE INDEX IF NOT EXISTS idx_flights_main ON flights(type, category, scheduled, flightNo);

CREATE TABLE IF NOT EXISTS actions (                 -- all clicks (SS/BUS/FP/LP)
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,                                -- 'arr' | 'dep'
  flightNo TEXT NOT NULL,
  scheduled TEXT NOT NULL,
  userId TEXT NOT NULL,
  action TEXT NOT NULL,                              -- 'ss' | 'bus' | 'fp' | 'lp'
  ts TEXT NOT NULL                                   -- ISO
);
CREATE INDEX IF NOT EXISTS idx_actions_main ON actions(type, flightNo, scheduled, action, ts);

CREATE TABLE IF NOT EXISTS my_flights (
  id INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  flightNo TEXT NOT NULL,
  scheduled TEXT NOT NULL,
  UNIQUE(userId, type, flightNo, scheduled)
);

CREATE TABLE IF NOT EXISTS psm (
  id INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  flightNo TEXT NOT NULL,
  scheduled TEXT NOT NULL,
  text TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  passhash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',                -- 'user' | 'admin'
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY,
  userId TEXT NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_dedupe (            -- avoid duplicate push
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL
);
`);

const tx = db.transaction.bind(db);

// prepared statements
const st = {
  // flights
  clearType: db.prepare(`DELETE FROM flights WHERE type=?`),
  insFlight: db.prepare(`
    INSERT INTO flights
      (type, flightNo, origin_or_destination, scheduled, estimated, terminal, status, category, dayTag)
    VALUES
      (@type,@flightNo,@origin_or_destination,@scheduled,@estimated,@terminal,@status,@category,@dayTag)
  `),
  listFlights: db.prepare(`
    SELECT * FROM flights
    WHERE type=@type AND (@scope='all' OR category=@scope)
    ORDER BY dayTag='tomorrow', time(scheduled), COALESCE(time(estimated), time(scheduled)), flightNo
  `),

  // actions
  addAction: db.prepare(`INSERT INTO actions(type,flightNo,scheduled,userId,action,ts) VALUES(?,?,?,?,?,?)`),
  firstByAction: db.prepare(`
    SELECT action, userId, ts
    FROM actions
    WHERE type=@type AND flightNo=@flightNo AND scheduled=@scheduled AND action=@action
    ORDER BY ts ASC
    LIMIT 1
  `),
  listActionsAll: db.prepare(`
    SELECT action,userId,ts
    FROM actions
    WHERE type=@type AND flightNo=@flightNo AND scheduled=@scheduled
    ORDER BY ts ASC
  `),

  // my flights (FIXED: no dayTag() call)
  addMy: db.prepare(`INSERT OR IGNORE INTO my_flights(userId,type,flightNo,scheduled) VALUES (?,?,?,?)`),
  delMy: db.prepare(`DELETE FROM my_flights WHERE userId=? AND type=? AND flightNo=? AND scheduled=?`),
  listMy: db.prepare(`
    SELECT userId, type, flightNo, scheduled
    FROM my_flights
    WHERE userId=? AND type=?
    ORDER BY time(scheduled), flightNo
  `),

  // psm
  addPSM: db.prepare(`INSERT INTO psm(userId,type,flightNo,scheduled,text,ts) VALUES(?,?,?,?,?,?)`),
  listPSM: db.prepare(`SELECT userId,text,ts FROM psm WHERE type=? AND flightNo=? AND scheduled=? ORDER BY ts DESC`),

  // users
  getUserByName: db.prepare(`SELECT * FROM users WHERE username=?`),
  getUserById: db.prepare(`SELECT * FROM users WHERE id=?`),
  addUser: db.prepare(`INSERT INTO users(username,passhash,role,createdAt) VALUES(?,?,?,?)`),
  listUsers: db.prepare(`SELECT id,username,role,createdAt FROM users ORDER BY username ASC`),
  delUser: db.prepare(`DELETE FROM users WHERE id=?`),
  setPass: db.prepare(`UPDATE users SET passhash=? WHERE id=?`),

  // push
  addSub: db.prepare(`INSERT OR IGNORE INTO push_subs(userId,endpoint,p256dh,auth) VALUES (?,?,?,?)`),
  subsForUsers: (ids) => {
    if (!ids.length) return [];
    const q = `SELECT * FROM push_subs WHERE userId IN (${ids.map(() => '?').join(',')})`;
    return db.prepare(q).all(...ids);
  },
  dedupe: db.prepare(`INSERT OR IGNORE INTO push_dedupe(key) VALUES (?)`),
  myUsersForFlight: db.prepare(`
    SELECT DISTINCT userId FROM my_flights WHERE type=? AND flightNo=? AND scheduled=?
  `)
};

// bootstrap admin user if missing
(function ensureAdmin() {
  const existing = st.getUserByName.get(ADMIN_USER);
  if (!existing) {
    const hash = bcrypt.hashSync(ADMIN_PASS, 10);
    st.addUser.run(ADMIN_USER, hash, 'admin', new Date().toISOString());
    console.log('Bootstrapped admin user:', ADMIN_USER);
  }
})();

// web push (guarded)
const HAVE_VAPID = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (HAVE_VAPID) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('Web Push: enabled');
} else {
  console.warn('Web Push: disabled (missing VAPID envs)');
}

// ---------- ingest from XML ----------
async function refreshFromXML() {
  const { arr, dep } = await fetchFromXML();

  const tagFlights = (items, type) =>
    items.map((f) => ({
      ...f,
      type,
      estimated: f.estimated?.trim() ? f.estimated.trim() : null,
      dayTag: isTomorrowByRollover(f.scheduled) ? 'tomorrow' : 'today'
    }));

  const arrTagged = tagFlights(arr, 'arr');
  const depTagged = tagFlights(dep, 'dep');

  const writeTx = tx(() => {
    st.clearType.run('arr');
    for (const f of arrTagged) st.insFlight.run(f);
    st.clearType.run('dep');
    for (const f of depTagged) st.insFlight.run(f);
  });
  writeTx();
}

async function refreshLoop() {
  try {
    await refreshFromXML();
  } catch (e) {
    console.error('refreshFromXML failed:', e?.message || e);
  }
}
refreshLoop();
setInterval(refreshLoop, SCRAPE_INTERVAL_MS);

// ---------- app ----------
const app = express();
app.use(
  cors({
    origin: FRONTEND_ORIGIN === '*' ? true : [FRONTEND_ORIGIN],
    credentials: true
  })
);
app.use(express.json({ limit: '512kb' }));
app.use(morgan('tiny'));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week re-login
      // set secure: true when behind HTTPS/proxy
    }
  })
);

// ---------- auth ----------
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ ok: false, error: 'auth' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'admin')
    return res.status(403).json({ ok: false, error: 'admin' });
  next();
}

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false });
  const u = st.getUserByName.get(username);
  if (!u || !bcrypt.compareSync(password, u.passhash)) return res.status(401).json({ ok: false });
  req.session.user = { id: u.id, username: u.username, role: u.role };
  res.json({ ok: true, user: req.session.user });
});
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get('/auth/me', (req, res) => {
  res.json({ ok: true, user: req.session?.user || null });
});

// Admin user management
app.get('/admin/users', requireAdmin, (req, res) => {
  res.json(st.listUsers.all());
});
app.post('/admin/users', requireAdmin, (req, res) => {
  const { username, password, role = 'user' } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false });
  const hash = bcrypt.hashSync(password, 10);
  try {
    st.addUser.run(username, hash, role, new Date().toISOString());
    res.json({ ok: true });
  } catch {
    res.status(409).json({ ok: false, error: 'exists' });
  }
});
app.post('/admin/users/:id/reset', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false });
  const hash = bcrypt.hashSync(password, 10);
  st.setPass.run(hash, id);
  res.json({ ok: true });
});
app.delete('/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  st.delUser.run(id);
  res.json({ ok: true });
});

// ---------- API ----------
app.get('/', (_, res) => res.json({ ok: true, service: 'VADA backend' }));

// flights (+ optional first-click aggregation)
app.get('/api/flights', requireAuth, (req, res) => {
  const type = (req.query.type || 'arr').toLowerCase(); // arr | dep
  const scope = (req.query.scope || 'all').toLowerCase(); // all | domestic | international
  const includeFirst = String(req.query.includeFirst || '0') === '1';

  const rows = st.listFlights.all({ type, scope });

  if (!includeFirst) return res.json(rows);

  const enrich = rows.map((r) => {
    const ss = st.firstByAction.get({ type, flightNo: r.flightNo, scheduled: r.scheduled, action: 'ss' }) || null;
    const bus = st.firstByAction.get({ type, flightNo: r.flightNo, scheduled: r.scheduled, action: 'bus' }) || null;
    const fp = st.firstByAction.get({ type, flightNo: r.flightNo, scheduled: r.scheduled, action: 'fp' }) || null;
    const lp = st.firstByAction.get({ type, flightNo: r.flightNo, scheduled: r.scheduled, action: 'lp' }) || null;
    return { ...r, first: { ss, bus, fp, lp } };
  });
  res.json(enrich);
});

// log an action (ss | bus | fp | lp)
app.post('/api/actions', requireAuth, (req, res) => {
  const { type, flightNo, scheduled, action } = req.body || {};
  if (!type || !flightNo || !scheduled || !action) return res.status(400).json({ ok: false });
  const userId = String(req.session.user.username || req.session.user.id);
  const ts = new Date().toISOString();
  st.addAction.run(type, flightNo, scheduled, userId, action, ts);
  res.json({ ok: true, ts, userId });
});

// list all actions for a flight (admin-only)
app.get('/api/actions', requireAdmin, (req, res) => {
  const { type, flightNo, scheduled } = req.query || {};
  if (!type || !flightNo || !scheduled) return res.status(400).json({ ok: false });
  res.json(st.listActionsAll.all({ type, flightNo, scheduled }));
});

// my flights
app.get('/api/my-flights', requireAuth, (req, res) => {
  const { type = 'arr' } = req.query;
  const userId = req.session.user.username;
  res.json(st.listMy.all(userId, type));
});
app.post('/api/my-flights', requireAuth, (req, res) => {
  const { type, flightNo, scheduled } = req.body || {};
  if (!type || !flightNo || !scheduled) return res.status(400).json({ ok: false });
  const userId = req.session.user.username;
  st.addMy.run(userId, type, flightNo, scheduled);
  res.json({ ok: true });
});
app.delete('/api/my-flights', requireAuth, (req, res) => {
  const { type, flightNo, scheduled } = req.body || {};
  if (!type || !flightNo || !scheduled) return res.status(400).json({ ok: false });
  const userId = req.session.user.username;
  st.delMy.run(userId, type, flightNo, scheduled);
  res.json({ ok: true });
});

// PSM
app.get('/api/psm', requireAuth, (req, res) => {
  const { type = 'arr', flightNo, scheduled } = req.query || {};
  if (!flightNo || !scheduled) return res.status(400).json({ ok: false });
  res.json(st.listPSM.all(type, flightNo, scheduled));
});
app.post('/api/psm', requireAuth, async (req, res) => {
  const { type, flightNo, scheduled, text } = req.body || {};
  if (!type || !flightNo || !scheduled || !text) return res.status(400).json({ ok: false });
  const userId = req.session.user.username;
  const ts = new Date().toISOString();
  st.addPSM.run(userId, type, flightNo, scheduled, String(text).slice(0, 500), ts);
  res.json({ ok: true });

  // fan-out to subscribers
  if (!HAVE_VAPID) return;
  const ids = st.myUsersForFlight.all(type, flightNo, scheduled).map((r) => r.userId);
  if (!ids.length) return;
  const subs = st.subsForUsers(ids);
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: `PSM: ${flightNo}`,
            body: text,
            tag: `psm-${type}-${flightNo}-${scheduled}`
          })
        )
        .catch(() => {})
    )
  );
});

// Push API
app.get('/api/push/vapidPublicKey', requireAuth, (_, res) =>
  res.json({ key: VAPID_PUBLIC_KEY || '' })
);
app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ ok: false });
  st.addSub.run(req.session.user.username, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

// Manual refresh
app.post('/refresh', (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(401).json({ ok: false });
  refreshFromXML()
    .then(() => res.json({ ok: true }))
    .catch((e) => res.status(500).json({ ok: false, error: String(e) }));
});

app.listen(PORT, () => console.log(`VADA backend listening on :${PORT}`));
