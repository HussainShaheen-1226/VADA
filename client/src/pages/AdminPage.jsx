import React, { useEffect, useState } from 'react';

export default function AdminPage({ API_BASE }) {
  const [logged,setLogged]=useState(false);
  const [logs,setLogs]=useState([]);
  const [u,setU]=useState('admin');
  const [p,setP]=useState('');

  async function login(){
    const res = await fetch(`${API_BASE}/admin/login`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:u, password:p })
    });
    if (res.ok){ setLogged(true); load(); } else alert('Login failed');
  }
  async function load(){
    const r = await fetch(`${API_BASE}/api/call-logs`);
    if (r.ok) setLogs(await r.json()); else alert('Unauthorized');
  }

  return (
    <>
      {!logged ? (
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <input type="text" placeholder="user" value={u} onChange={e=>setU(e.target.value)} />
          <input type="password" placeholder="pass" value={p} onChange={e=>setP(e.target.value)} />
          <button className="scope-btn" onClick={login}>Login</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>TS</th><th>User</th><th>Type</th><th>Action</th><th>Flight</th><th>Sched</th><th>Est</th>
            </tr></thead>
            <tbody>
              {logs.map((l,i)=>(
                <tr key={i}>
                  <td>{new Date(l.ts).toLocaleString()}</td>
                  <td>{l.userId}</td>
                  <td>{l.type?.toUpperCase()}</td>
                  <td>{l.action}</td>
                  <td>{l.flightNo}</td>
                  <td>{l.scheduled}</td>
                  <td>{l.estimated || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
