import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import ArrivalsPage from "./pages/ArrivalsPage";
import DeparturesPage from "./pages/DeparturesPage";
import MyFlightsPage from "./pages/MyFlightsPage";
import AdminPage from "./pages/AdminPage";

const uidKey = "VADA_USER_ID";
const days14 = 14 * 24 * 60 * 60 * 1000;

export default function App() {
  const [userId, setUserId] = useState(localStorage.getItem(uidKey) || "");
  useEffect(() => {
    const stamp = Number(localStorage.getItem(uidKey + ":ts") || 0);
    if (!userId || Date.now() - stamp > days14) {
      const v = prompt("Enter your ID (for logs & My Flights):", userId || "");
      if (v) {
        setUserId(v);
        localStorage.setItem(uidKey, v);
        localStorage.setItem(uidKey + ":ts", String(Date.now()));
      }
    }
  // eslint-disable-next-line
  }, []);

  const loc = useLocation();
  useEffect(() => { window.scrollTo(0,0); }, [loc.pathname]);

  return (
    <Routes>
      <Route path="/" element={<ArrivalsPage userId={userId} />} />
      <Route path="/departures" element={<DeparturesPage userId={userId} />} />
      <Route path="/my" element={<MyFlightsPage userId={userId} />} />
      <Route path="/admin" element={<AdminPage userId={userId} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
