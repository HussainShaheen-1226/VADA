import React, { useMemo, useState } from "react";
import { getLogs, loginAdmin } from "../utils/api";
import TopBar from "../components/TopBar";
import Tabs from "../components/Tabs";

export default function AdminPage({ userId }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("arr"); // arr | dep
  const [q, setQ] = useState("");

  const login = async () => {
    setErr("");
    try {
      const r = await loginAdmin(u, p);
      if (!r?.ok) { setErr("Login failed"); return; }
      const L = await getLogs(2000, 0);
      setLogs(L || []);
    } catch(e){ setErr(String(e.message || e)); }
  };

  const filtered = useMemo(() => {
    const rows = logs.filter(r => r.type === tab);
    if (!q.trim()) return rows;
    const qq = q.toLowerCase();
    return rows.filter(r =>
      (r.flightNo||"").toLowerCase().includes(qq) ||
      (r.userId||"").toLowerCase().includes(qq) ||
      (r.action||"").toLowerCase().includes(qq)
    );
  }, [logs, tab, q]);

  return (
    <div className="container">
      <TopBar userId={userId} onReload={()=>{}} />
      <div className="title">Admin</div>
      <div className="subtitle">First-click logs (Arrivals / Departures)</div>

      {!logs.length && (
        <div className="card" style={{marginTop:10, display:'grid', gap:8}}>
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="username" />
          <input value={p} onChange={e=>setP(e.target.value)} placeholder="password" type="password" />
          <button className="pill yellow" onClick={login}>Login</button>
          {err && <div className="error">{err}</div>}
        </div>
      )}

      {!!logs.length && (
        <>
          <Tabs value={tab} onChange={setTab}
            items={[{value:"arr",label:"Arrivals"},{value:"dep",label:"Departures"}]} />
          <div className="card" style={{marginTop:10, display:'grid', gap:8}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filter by flight/user/action…" />
            <div className="small">Showing {filtered.length} of {logs.filter(r=>r.type===tab).length}</div>
          </div>
          <div className="tableWrap card" style={{marginTop:10}}>
            <table className="table">
              <thead><tr>
                <th>When</th><th>User</th><th>Type</th><th>Action</th><th>Flight</th><th>Sched</th><th>Est</th>
              </tr></thead>
              <tbody>
                {filtered.map((r,i)=>(
                  <tr key={i}>
                    <td>{new Date(r.ts).toLocaleString()}</td>
                    <td>{r.userId}</td>
                    <td>{r.type}</td>
                    <td>{r.action}</td>
                    <td>{r.flightNo}</td>
                    <td>{r.scheduled}</td>
                    <td>{r.estimated||"-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
