import React, { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import ArrivalsPage from "./pages/ArrivalsPage";
import DeparturesPage from "./pages/DeparturesPage";
import MyFlightsPage from "./pages/MyFlightsPage";
import AdminPage from "./pages/AdminPage";

function useUserId() {
  const k = "vada_user_id";
  const [id, setId] = useState(localStorage.getItem(k) || "");
  useEffect(() => {
    if (!id) {
      const x = prompt("Enter your user ID for logging (e.g. initials):") || "";
      localStorage.setItem(k, x);
      setId(x);
    }
  }, [id]);
  return id;
}

export default function App() {
  const userId = useUserId();
  const loc = useLocation();

  return (
    <div>
      <nav className="container" style={{display:"flex", gap:12, alignItems:"center"}}>
        <Link className="pill" to="/arr">Arrivals</Link>
        <Link className="pill" to="/dep">Departures</Link>
        <Link className="pill" to="/my">My Flights</Link>
        <Link className="pill" to="/admin">Admin</Link>
        <div style={{marginLeft:"auto", opacity:.7}}>You: {userId || "—"}</div>
      </nav>

      <Routes location={loc}>
        <Route path="/" element={<Navigate to="/arr" replace />} />
        <Route path="/arr" element={<ArrivalsPage userId={userId} />} />
        <Route path="/dep" element={<DeparturesPage userId={userId} />} />
        <Route path="/my" element={<MyFlightsPage userId={userId} />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}
