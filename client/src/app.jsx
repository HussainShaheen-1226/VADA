import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import ArrivalsPage from './pages/ArrivalsPage';
import DeparturesPage from './pages/DeparturesPage';
import MyFlightsPage from './pages/MyFlightsPage';
import AdminPage from './pages/AdminPage';

// 🔧 Set your backend URL here
const API_BASE = 'https://YOUR_BACKEND_URL';

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function enablePush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const { key } = await fetch(`${API_BASE}/api/push/vapidPublicKey`).then(r=>r.json());
  if (!key) return false;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  });
  await fetch(`${API_BASE}/api/push/subscribe`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ userId, endpoint: sub.endpoint, keys: sub.toJSON().keys })
  });
  return true;
}

function useUserId(){
  const [userId,setUserId] = useState(null);
  useEffect(()=>{
    const saved = JSON.parse(localStorage.getItem('vada_uid')||'{}');
    const now=Date.now();
    if (saved?.id && (now - (saved.ts||0) < 14*24*3600*1000)){
      setUserId(saved.id);
    } else {
      let id = prompt('Enter your User ID (for logs & My Flights):') || 'anonymous';
      id = id.trim();
      setUserId(id);
      localStorage.setItem('vada_uid', JSON.stringify({id, ts: now}));
    }
  },[]);
  return userId || 'anonymous';
}

export default function App(){
  const userId = useUserId();
  const [pushOn,setPushOn] = useState(false);

  const actions = useMemo(()=>({
    log: async (payload) => {
      await fetch(`${API_BASE}/api/call-logs`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    },
    myAdd: async (type, flightNo, scheduled) => {
      await fetch(`${API_BASE}/api/my-flights`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, type, flightNo, scheduled }) });
    },
    myRemove: async (type, flightNo, scheduled) => {
      await fetch(`${API_BASE}/api/my-flights`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, type, flightNo, scheduled }) });
    },
    psmPost: async (type, flightNo, scheduled, text) => {
      await fetch(`${API_BASE}/api/psm`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, type, flightNo, scheduled, text }) });
    }
  }),[userId]);

  return (
    <div className="wrap">
      <div className="top">
        <div className="nav">
          <NavLink to="/arrivals">Arrivals</NavLink>
          <NavLink to="/departures">Departures</NavLink>
          <NavLink to="/my">My Flights</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </div>
        <div>
          <button className="scope-btn" onClick={async ()=>{
            const ok = await enablePush(userId);
            setPushOn(ok);
            if (!ok) alert('Could not enable notifications');
          }}>{pushOn ? 'Notifications On' : 'Enable Notifications'}</button>
        </div>
      </div>

      <div className="panel">
        <Routes>
          <Route path="/" element={<ArrivalsPage API_BASE={API_BASE} userId={userId} actions={actions} />} />
          <Route path="/arrivals" element={<ArrivalsPage API_BASE={API_BASE} userId={userId} actions={actions} />} />
          <Route path="/departures" element={<DeparturesPage API_BASE={API_BASE} userId={userId} actions={actions} />} />
          <Route path="/my" element={<MyFlightsPage API_BASE={API_BASE} userId={userId} actions={actions} />} />
          <Route path="/admin" element={<AdminPage API_BASE={API_BASE} />} />
        </Routes>
      </div>
    </div>
  );
}
