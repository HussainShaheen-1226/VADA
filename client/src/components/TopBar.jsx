import React from "react";
import { Link } from "react-router-dom";

export default function TopBar({ userId, onReload }) {
  return (
    <div className="topbar">
      <div className="brand">VADA</div>
      <div className="spacer" />
      <Link to="/" className="pill ghost" style={{textDecoration:'none'}}>Arrivals</Link>
      <Link to="/departures" className="pill ghost" style={{textDecoration:'none'}}>Departures</Link>
      <Link to="/my" className="pill ghost" style={{textDecoration:'none'}}>My Flights</Link>
      <Link to="/admin" className="pill ghost" style={{textDecoration:'none'}}>Admin</Link>
      <button className="pill" onClick={onReload}>↻</button>
      <div className="small">You: {userId || "—"}</div>
    </div>
  );
}
