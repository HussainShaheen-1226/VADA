import React, { useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = 'https://vada-2db9.onrender.com'; // ← change if your backend URL differs
const POLL_MS = 30_000;

function statusClass(s = '') {
  const t = (s || '').toUpperCase();
  if (t.includes('CANCEL')) return 'cancel';
  if (t.includes('DELAY')) return 'delay';
  if (t.includes('BOARD'))  return 'board';
  if (t.includes('LAND'))   return 'ok';
  return 'info';
}

function useUserId() {
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    const id = localStorage.getItem('vada_user_id');
    const ts = parseInt(localStorage.getItem('vada_user_id_set_at') || '0', 10);
    const maxAge = 14 * 24 * 3600 * 1000;
    if (id && Date.now() - ts < maxAge) {
      setUserId(id);
    } else {
      let input = window.prompt('Enter your User ID (for SS/BUS logs):') || 'anonymous';
      input = input.trim();
      setUserId(input);
      localStorage.setItem('vada_user_id', input);
      localStorage.setItem('vada_user_id_set_at', Date.now().toString());
    }
  }, []);
  return userId || 'anonymous';
}

export default function App() {
  const [scope, setScope] = useState('all'); // 'all' | 'domestic' | 'international'
  const [flights, setFlights] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const pollRef = useRef(null);
  const userId = useUserId();

  const lastUpdatedText = useMemo(() => {
    if (meta.updatedLT) return `Updated: ${meta.updatedLT} LT`;
    if (meta.scrapedAt) return `Scraped: ${new Date(meta.scrapedAt).toLocaleString()}`;
    return '—';
  }, [meta]);

  async function load() {
    try {
      setErr('');
      setLoading(true);
      const [fRes, mRes] = await Promise.all([
        fetch(`${API_BASE}/flights?scope=${scope}`, { headers: { 'Cache-Control': 'no-cache' }}),
        fetch(`${API_BASE}/meta`)
      ]);
      if (!fRes.ok) throw new Error(`Flights HTTP ${fRes.status}`);
      const data = await fRes.json();
      const m = mRes.ok ? await mRes.json() : {};
      setFlights(Array.isArray(data) ? data : []);
      setMeta(m || {});
    } catch (e) {
      setErr(e.message);
      setFlights([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [scope]);
  useEffect(() => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [scope]);

  async function logAction(flightNo, action) {
    try {
      await fetch(`${API_BASE}/api/call-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, flightNo, action })
      });
    } catch {
      // Optional: toast error
    }
  }

  return (
    <div className="wrap">
      <header className="topbar">
        <h1>VADA</h1>
        <div className="right">
          <span className="muted">{lastUpdatedText}</span>
          <button className="ghost" onClick={load} title="Refresh now">↻</button>
        </div>
      </header>

      <nav className="scopes">
        {['all','domestic','international'].map(s => (
          <button
            key={s}
            className={`scope-btn ${scope === s ? 'active' : ''}`}
            onClick={() => setScope(s)}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </nav>

      <main className="panel">
        {err && <div className="error">Failed to load: {err}</div>}

        {loading ? (
          <div className="loading"><div className="spinner" /> Loading flights…</div>
        ) : flights.length === 0 ? (
          <div className="empty">No flights at the moment.</div>
        ) : (
          <div className="table-wrap">
            <table className="flights">
              <thead>
                <tr>
                  <th>Flight</th>
                  <th>Origin</th>
                  <th>Sched</th>
                  <th>Est</th>
                  <th>Term</th>
                  <th>Status</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flights.map((f, i) => (
                  <tr key={`${f.flightNo}-${f.scheduled}-${i}`}>
                    <td>{f.flightNo || '—'}</td>
                    <td>{f.origin_or_destination || '—'}</td>
                    <td>{f.scheduled || '—'}</td>
                    <td>{f.estimated || '—'}</td>
                    <td><span className="pill term">{f.terminal || '—'}</span></td>
                    <td><span className={`pill status ${statusClass(f.status)}`}>{f.status || '—'}</span></td>
                    <td className="actions">
                      <button className="action-btn ss" onClick={() => logAction(f.flightNo, 'SS')}>SS</button>
                      <button className="action-btn bus" onClick={() => logAction(f.flightNo, 'BUS')}>BUS</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="foot">
        <small>Source: Velana FIDS · VADA</small>
      </footer>
    </div>
  );
}
