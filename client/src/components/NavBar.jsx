import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="header">
      <div className="brand">VADA</div>
      <div className="nav">
        <Link className="pill" to="/">Arrivals</Link>
        <Link className="pill" to="/departures">Departures</Link>
        <Link className="pill" to="/my">My Flights</Link>
        <Link className="pill" to="/admin">Admin</Link>
      </div>
      <div className="right">
        {user ? (
          <button className="pill" onClick={logout}>
            {user.username} · Logout
          </button>
        ) : loc.pathname !== "/login" ? (
          <Link className="pill" to="/login">Login</Link>
        ) : null}
      </div>
    </div>
  );
}
