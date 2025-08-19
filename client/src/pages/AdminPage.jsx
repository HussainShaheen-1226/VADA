import React, { useState } from "react";
import { getLogs, loginAdmin } from "../utils/api";

export default function AdminPage() {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState("");

  const login = async () => {
    setErr("");
    const r = await loginAdmin(username, password);
    if (!r.ok) { setErr("Login failed"); return; }
    const L = await getLogs(500, 0);
    setLogs(L);
  };

  return (
    <div className="container">
      <div className="brand">Admin</div>

      <div className="glass" style={{marginTop:12}}>
        <div style={{display:'flex', gap:8}}>
          <input placeholder="username" value={username} onChange={e=>setU(e.target.value)} />
          <input placeholder="password" type="password" value={password} onChange={e=>setP(e.target.value)} />
          <button className="pill" onClick={login}>Login</button>
        </div>
        {err && <div className="error" style={{marginTop:8}}>{err}</div>}
      </div>

      <div className="glass" style={{marginTop:12}}>
        <table className="table">
          <thead>
            <tr><th>TS</th><th>User</th><th>Type</th><th>Flight</th><th>Sched</th><th>Est</th><th>Action</th></tr>
          </thead>
          <tbody>
            {logs.map((l,i)=>(
              <tr key={i}>
                <td>{l.ts}</td>
                <td>{l.userId}</td>
                <td>{l.type}</td>
                <td>{l.flightNo}</td>
                <td>{l.scheduled}</td>
                <td>{l.estimated || "-"}</td>
                <td>{l.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
