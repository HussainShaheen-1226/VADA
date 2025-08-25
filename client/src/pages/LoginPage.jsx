import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const ok = await login(u.trim(), p);
      if (!ok) setErr("Invalid username/password");
      else window.location.hash = "#/";
    } catch {
      setErr("Login failed");
    }
  };

  return (
    <div className="container">
      <div className="header"><div className="brand">VADA</div></div>
      <div className="glass" style={{maxWidth:420, margin:'40px auto', padding:16}}>
        <h2 style={{marginTop:0}}>Login</h2>
        <form onSubmit={submit}>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <input placeholder="Username" value={u} onChange={e=>setU(e.target.value)}
              style={{padding:10, borderRadius:8, border:'1px solid var(--glass-border)', background:'rgba(255,255,255,.05)', color:'var(--fg)'}}/>
            <input type="password" placeholder="Password" value={p} onChange={e=>setP(e.target.value)}
              style={{padding:10, borderRadius:8, border:'1px solid var(--glass-border)', background:'rgba(255,255,255,.05)', color:'var(--fg)'}}/>
            <button className="pill" type="submit">Sign in</button>
            {err ? <div className="error">{err}</div> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
