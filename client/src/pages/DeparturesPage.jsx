import React, { useEffect, useMemo, useRef, useState } from "react";
import { getFlights, getMyFlights } from "../utils/api";
import TopBar from "../components/TopBar";
import Tabs from "../components/Tabs";
import SearchBar from "../components/SearchBar";
import FlightRow from "../components/FlightRow";

const POLL_MS = 30000;
const toMin = (hhmm="") => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm||"").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};
function isValidFlightNo(s="") {
  if (!s) return false;
  const bad = /(PASSENGER|FLIGHT|BOTH|DOMESTIC|INTERNATIONAL|CARGO|ALL ORIGINS|AIRLINES)/i;
  if (bad.test(s)) return false;
  return /^[A-Z]{1,3}\s?\d{1,4}$/i.test(s.trim());
}

export default function DeparturesPage({ userId }) {
  const [scope, setScope] = useState("all");
  const [flights, setFlights] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [my, setMy] = useState([]);
  const mySet = useMemo(() => new Set(my.map(m => `dep|${m.flightNo}|${m.scheduled}`)), [my]);
  const timerRef = useRef(null);

  const refreshMy = async () => { if (userId) try { setMy(await getMyFlights(userId, "dep")); } catch {} };
  useEffect(() => { refreshMy(); }, [userId]);

  const load = async () => {
    setErr("");
    try {
      const data = await getFlights("dep", scope);
      let rolled = false, prev = null;
      const enriched = (Array.isArray(data) ? data : []).map(f => {
        const m = toMin(f.scheduled);
        if (prev != null && m != null && m < prev) rolled = true;
        prev = (m ?? prev);
        return { ...f, tomorrow: rolled };
      });
      setFlights(enriched); setLastUpdated(new Date());
    } catch (e) { setErr(String(e.message || e)); setFlights([]); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(load, POLL_MS);
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [scope]);

  const filtered = flights
    .filter(f => isValidFlightNo(f.flightNo))
    .filter(f =>
      (f.flightNo || "").toLowerCase().includes(q.toLowerCase()) ||
      (f.origin_or_destination || "").toLowerCase().includes(q.toLowerCase())
    );

  return (
    <div className="container">
      <TopBar userId={userId} onReload={load} />
      <div className="title">Departures</div>
      <div className="subtitle">Live {scope}</div>

      <Tabs value={scope} onChange={setScope}
        items={[{value:"all",label:"All"},{value:"domestic",label:"Domestic"},{value:"international",label:"International"}]} />

      <SearchBar value={q} onChange={setQ} />

      {err && (
        <div className="error">
          <div>Failed to load: {err}</div>
          <div>Source: Velana FIDS · VADA</div>
        </div>
      )}

      {!err && (
        <div className="tableWrap card">
          <div className="small" style={{marginBottom:6}}>
            Showing {filtered.length} of {flights.length}{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString()}` : ""}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Term</th><th>Flight</th><th>Destination</th><th>Sched</th><th>Est</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => (
                <FlightRow key={`${f.flightNo}-${f.scheduled}-${i}`}
                  f={f} type="dep" userId={userId} mySet={mySet} refreshMy={refreshMy}/>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
