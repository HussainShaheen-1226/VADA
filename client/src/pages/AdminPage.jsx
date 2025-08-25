import React, { useState } from "react";
import { listActionsAdmin } from "../utils/api";

export default function AdminPage() {
  const [type, setType] = useState("arr");
  const [flightNo, setFlightNo] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr(""); setRows([]);
    try {
      const r = await listActionsAdmin(type, flightNo.trim(), scheduled.trim());
      setRows(r);
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  return (
    <div className="container">
      <div className="header"><div className="brand">VADA · Admin</div></div>

      <div className="glass" style={{padding:12}}>
        <div className="nav">
          <button className={`pill ${type==='arr'?'active':''}`} onClick={()=>setType('arr')}>Arrivals</button>
          <button className={`pill ${type==='dep'?'active':''}`} onClick={()=>setType('dep')}>Departures</button>
        </div>
        <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
          <input placeholder="Flight No (e.g. Q2 261)" value={flightNo} onChange={e=>setFlightNo(e.target.value)}
            style={{padding:8, borderRadius:8, border:'1px solid var(--glass-border)', background:'rgba(255,255,255,.05)', color:'var(--fg)'}}/>
          <input placeholder="Scheduled HH:MM" value={scheduled} onChange={e=>setScheduled(e.target.value)}
            style={{padding:8, borderRadius:8, border:'1px solid var(--glass-border)', background:'rgba(255,255,255,.05)', color:'var(--fg)'}}/>
          <button className="pill" onClick={load}>Load Logs</button>
        </div>

        {err ? <div className="error" style={{marginTop:8}}>{err}</div> : null}
        {rows.length ? (
          <div className="glass" style={{marginTop:12}}>
            <table className="table">
              <thead><tr><th>Action</th><th>User</th><th>Time</th></tr></thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i}>
                    <td>{r.action}</td>
                    <td>{r.userId}</td>
                    <td>{new Date(r.ts).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
