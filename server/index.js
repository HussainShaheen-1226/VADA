// VADA backend – SQLite + XML-only source (secure env-based)
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
import { fetchXMLAll } from './xmlSource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// env
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SCRAPE_INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 120000);
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ops@example.com';
const SESSION_SECRET = process.env.SESSION_SECRET || 'vada-secret';

// web push
const HAVE_VAPID = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (HAVE_VAPID) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('Web Push: enabled');
} else {
  console.warn('Web Push: disabled (missing VAPID keys)');
}

// db
const db = new Database(path.join(__dirname, 'vada.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY,
  type TEXT, flightNo TEXT, origin_or_destination TEXT,
  scheduled TEXT, estimated TEXT, terminal TEXT, status TEXT, category TEXT
);
CREATE INDEX IF NOT EXISTS idx_flights_type ON flights(type);

CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY,
  userId TEXT, flightNo TEXT, scheduled TEXT, estimated TEXT,
  action TEXT, type TEXT, ts TEXT
);

CREATE TABLE IF NOT EXISTS my_flights (
  id INTEGER PRIMARY KEY,
  userId TEXT, type TEXT, flightNo TEXT, scheduled TEXT
);

CREATE TABLE IF NOT EXISTS psm (
  id INTEGER PRIMARY KEY,
  userId TEXT, type TEXT, flightNo TEXT, scheduled TEXT, text TEXT, ts TEXT
);

CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY,
  userId TEXT, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT
);

CREATE TABLE IF NOT EXISTS push_dedupe (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE, password_hash TEXT, role TEXT, created_at TEXT
);
`);

const q = {
  // flights
  clearType: db.prepare(`DELETE FROM flights WHERE type=?`),
  insFlight: db.prepare(`INSERT INTO flights (type,flightNo,origin_or_destination,scheduled,estimated,terminal,status,category)
                         VALUES (@type,@flightNo,@origin_or_destination,@scheduled,@estimated,@terminal,@status,@category)`),
  listFlights: db.prepare(`SELECT * FROM flights WHERE type=@type AND (@scope='all' OR category=@scope)
                           ORDER BY scheduled, id`),

  // logs
  insLog: db.prepare(`INSERT INTO call_logs (userId,flightNo,scheduled,estimated,action,type,ts) VALUES (?,?,?,?,?,?,?)`),
  listLogs: db.prepare(`SELECT * FROM call_logs WHERE type=@type ORDER BY ts DESC LIMIT @lim OFFSET @off`),
  firstClicks: db.prepare(`
    SELECT flightNo, scheduled, type, action,
           MIN(ts) AS ts,
           (SELECT userId FROM call_logs c2
              WHERE c2.flightNo=c1.flightNo AND c2.scheduled=c1.scheduled AND c2.type=c1.type AND c2.action=c1.action
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
  listSubsByUsers: (users)=>{
    if (!users.length) return [];
    const ph = users.map(()=>'?').join(',');
    return db.prepare(`SELECT * FROM push_subs WHERE userId IN (${ph})`).all(...users);
  },
  pushSeen: db.prepare(`INSERT OR IGNORE INTO push_dedupe (key) VALUES (?)`),

  // users
  getUser: db.prepare(`SELECT * FROM users WHERE username=?`),
  createUser: db.prepare(`INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)`),
  listUsers: db.prepare(`SELECT id, username, role, created_at FROM users ORDER BY username`),
  delUser: db.prepare(`DELETE FROM users WHERE id=?`),
  resetPwd: db.prepare(`UPDATE users SET password_hash=? WHERE id=?`)
};

// seed admin (first run)
import crypto from 'crypto';
if (!db.prepare(`SELECT COUNT(*) c FROM users`).get().c) {
  const hash = bcrypt.hashSync('change-me', 10);
  q.createUser.run('admin', hash, 'admin', new Date().toISOString());
  console.log('Seeded admin: admin / change-me');
}

// helpers
const maleNow = () => new Date(Date.now() + 5*60*60*1000);
const HHMM = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const requireAuth = (req,res,next) => (!req.session?.user) ? res.status(401).json({ok:false, error:'auth'}) : next();
const requireAdmin = (req,res,next) => (!req.session?.user || req.session.user.role!=='admin') ? res.status(403).json({ok:false, error:'admin'}) : next();

// ingest (XML) loop
async function doIngest(){
  const { arr, dep } = await fetchXMLAll();
  const tx = db.transaction(() => {
    q.clearType.run('arr'); arr.forEach(f => q.insFlight.run({ ...f, type:'arr' }));
    q.clearType.run('dep'); dep.forEach(f => q.insFlight.run({ ...f, type:'dep' }));
  });
  tx();

  // Landing soon (T-15) push for arrivals
  const VAPID_OK = HAVE_VAPID && VAPID_SUBJECT;
  if (!VAPID_OK) return;
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
doIngest().catch(()=>{});
setInterval(()=>doIngest().catch(()=>{}), SCRAPE_INTERVAL_MS);

// app
const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : [FRONTEND_ORIGIN], credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 7*24*60*60*1000 }
}));

app.get('/', (_,res)=>res.json({ok:true, service:'VADA backend (XML)'}));

// auth
app.post('/auth/login', (req,res)=>{
  const { username, password } = req.body || {};
  const u = q.getUser.get(username);
  if (!u) return res.status(401).json({ ok:false });
  if (!bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ ok:false });
  req.session.user = { id:u.id, username:u.username, role:u.role };
  res.json({ ok:true, user:req.session.user });
});
app.post('/auth/logout', (req,res)=>{ req.session.destroy(()=>res.json({ok:true})); });
app.get('/auth/me', (req,res)=> res.json({ ok:!!req.session?.user, user:req.session?.user || null }));

// flights
app.get('/api/flights', requireAuth, (req,res)=>{
  const type = (req.query.type || 'arr').toLowerCase();
  const scope = (req.query.scope || 'all').toLowerCase();
  res.json(q.listFlights.all({ type, scope }));
});
app.get('/api/first-clicks', requireAuth, (req,res)=>{
  const map = {};
  q.firstClicks.all().forEach(r=>{
    const k = `${r.type}|${r.action}|${r.flightNo}|${r.scheduled}`;
    map[k] = { userId: r.userId, ts: r.ts };
  });
  res.json(map);
});

// logs (record ALL clicks)
app.post('/api/call-logs', requireAuth, (req,res)=>{
  const { userId, flightNo, scheduled, estimated, action, type } = req.body || {};
  if (!userId || !flightNo || !scheduled || !action || !type) return res.status(400).json({ok:false, error:'missing'});
  q.insLog.run(userId, flightNo, scheduled, estimated || null, action, type, new Date().toISOString());
  res.json({ok:true});
});
app.get('/api/call-logs', requireAdmin, (req,res)=>{
  const type = (req.query.type || 'arr').toLowerCase();
  const lim = Math.min(2000, Number(req.query.limit || 500));
  const off = Math.max(0, Number(req.query.offset || 0));
  res.json(q.listLogs.all({ type, lim, off }));
});

// my flights
app.get('/api/my-flights', requireAuth, (req,res)=>{
  const { userId, type='arr' } = req.query;
  if (!userId) return res.status(400).json({ok:false});
  res.json(q.listMy.all(userId, type));
});
app.post('/api/my-flights', requireAuth, (req,res)=>{
  const { userId, type, flightNo, scheduled } = req.body || {};
  if (!userId || !type || !flightNo || !scheduled) return res.status(400).json({ok:false});
  q.insMy.run(userId, type, flightNo, scheduled);
  res.json({ok:true});
});
app.delete('/api/my-flights', requireAuth, (req,res)=>{
  const { userId, type, flightNo, scheduled } = req.body || {};
  if (!userId || !type || !flightNo || !scheduled) return res.status(400).json({ok:false});
  q.delMy.run(userId, type, flightNo, scheduled);
  res.json({ok:true});
});

// psm
app.get('/api/psm', requireAuth, (req,res)=>{
  const { type='arr', flightNo, scheduled } = req.query;
  if (!flightNo || !scheduled) return res.status(400).json({ok:false});
  res.json(q.listPSM.all(type, flightNo, scheduled));
});
app.post('/api/psm', requireAuth, async (req,res)=>{
  const { userId, type, flightNo, scheduled, text } = req.body || {};
  if (!userId || !type || !flightNo || !scheduled || !text) return res.status(400).json({ok:false});
  q.insPSM.run(userId, type, flightNo, scheduled, String(text).slice(0,500), new Date().toISOString());
  res.json({ok:true});

  const VAPID_OK = HAVE_VAPID && VAPID_SUBJECT;
  if (!VAPID_OK) return;
  const users = db.prepare(`SELECT DISTINCT userId FROM my_flights WHERE type=? AND flightNo=? AND scheduled=?`)
                  .all(type, flightNo, scheduled).map(r=>r.userId);
  if (!users.length) return;
  const subs = q.listSubsByUsers(users);
  await Promise.all(subs.map(s =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ title:`PSM: ${flightNo}`, body:text, tag:`psm-${type}-${flightNo}-${scheduled}` })
    ).catch(()=>{})
  ));
});

// push
app.get('/api/push/vapidPublicKey', requireAuth, (_,res)=>res.json({ key: VAPID_PUBLIC_KEY || '' }));
app.post('/api/push/subscribe', requireAuth, (req,res)=>{
  const { userId, endpoint, keys } = req.body || {};
  if (!userId || !endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ok:false});
  q.insSub.run(userId, endpoint, keys.p256dh, keys.auth);
  res.json({ok:true});
});

// admin users
app.get('/admin/users', requireAdmin, (req,res)=> res.json(q.listUsers.all()));
app.post('/admin/users', requireAdmin, (req,res)=>{
  const { username, password, role='user' } = req.body || {};
  if (!username || !password) return res.status(400).json({ok:false});
  const hash = bcrypt.hashSync(password, 10);
  try { q.createUser.run(username, hash, role, new Date().toISOString()); res.json({ok:true}); }
  catch { res.status(409).json({ok:false, error:'exists'}); }
});
app.delete('/admin/users/:id', requireAdmin, (req,res)=>{ q.delUser.run(Number(req.params.id)); res.json({ok:true}); });
app.post('/admin/users/:id/reset', requireAdmin, (req,res)=>{
  const { newPassword } = req.body || {}; if (!newPassword) return res.status(400).json({ok:false});
  const hash = bcrypt.hashSync(newPassword, 10); q.resetPwd.run(hash, Number(req.params.id)); res.json({ok:true});
});

// export
app.get('/admin/export', requireAdmin, (req,res)=>{
  const type = (req.query.type || 'arr').toLowerCase();
  const fmt = (req.query.fmt || 'csv').toLowerCase();
  const rows = db.prepare(`SELECT * FROM flights WHERE type=? ORDER BY scheduled, id`).all(type);

  if (fmt === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="vada-${type}.pdf"`);
    const doc = new PDFDocument({ margin: 36 });
    doc.pipe(res);
    doc.fontSize(18).text(`VADA ${type.toUpperCase()} export`, {underline:true});
    doc.moveDown();
    rows.forEach(r=> doc.fontSize(11).text(`${r.scheduled} ${r.flightNo}  ${r.origin_or_destination}  ${r.status}  [${r.category}/${r.terminal||'-'}]`));
    doc.end();
    return;
  }
  if (fmt === 'txt') {
    res.setHeader('Content-Type','text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="vada-${type}.txt"`);
    const out = rows.map(r=>`${r.scheduled}\t${r.flightNo}\t${r.origin_or_destination}\t${r.status}\t${r.category}\t${r.terminal||'-'}`).join('\n');
    return res.send(out);
  }
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="vada-${type}.csv"`);
  const head = 'scheduled,flightNo,origin_or_destination,status,category,terminal,estimated\n';
  const body = rows.map(r=>[
    r.scheduled, r.flightNo, `"${(r.origin_or_destination||'').replace(/"/g,'""')}"`,
    r.status, r.category, r.terminal||'', r.estimated||''
  ].join(',')).join('\n');
  res.send(head+body);
});

// manual ingest
app.post('/refresh', (req,res)=>{
  const token = req.query.token || req.headers['x-admin-token'];
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
    doIngest().then(()=>res.json({ok:true})).catch(e=>res.status(500).json({ok:false, error:String(e)}));
  } else res.status(401).json({ok:false});
});

app.listen(PORT, ()=>console.log(`VADA backend (XML) listening on :${PORT}`));
