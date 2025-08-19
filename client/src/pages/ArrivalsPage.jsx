import React, { useEffect, useMemo, useState } from "react";
import { getFlights, getMyFlights, listPSM, postPSM } from "../utils/api";
import Tabs from "../components/Tabs";
import SearchBar from "../components/SearchBar";
import FlightRow from "../components/FlightRow";

export default function ArrivalsPage({ userId }) {
  const [scope, setScope] = useState("all"); // all | domestic | international
  const [flights, setFlights] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [my, setMy] = useState([]);
  const mySet = useMemo(() => new Set(my.map(m => `arr|${m.flightNo}|${m.scheduled}`)), [my]);

  const refreshMy = async () => {
    const r = await getMyFlights(userId, "arr");
    setMy(r);
  };

  useEffect(() => { refreshMy(); }, [userId]);

  const load = async () => {
    setErr("");
    try {
      const data = await getFlights("arr", scope);
      setFlights(data);
    } catch (e) {
      setErr(String(e.message || e));
      setFlights([]);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);

  const filtered = flights.filter(f =>
    (f.flightNo || "").toLowerCase().includes(q.toLowerCase()) ||
    (f.origin_or_destination || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="container">
      <div className="header">
        <div className="brand">VADA</div>
        <button className="pill" onClick={load}>↻</button>
      </div>

      <Tabs value={scope} onChange={setScope}
        items={[
          { value: "all", label: "All" },
          { value: "domestic", label: "Domestic" },
          { value: "international", label: "International" }
        ]}
      />

      <SearchBar value={q} onChange={setQ} />

      {err ? (
        <div className="error" style={{marginTop:12}}>
          <div>Failed to load: {err}</div>
          <div>No flights at the moment.</div>
          <div style={{opacity:.7, marginTop:6}}>Source: Velana FIDS · VADA</div>
        </div>
      ) : null}

      <div className="glass" style={{marginTop:12}}>
        <table className="table">
          <thead>
            <tr>
              <th>Flight</th><th>Origin</th><th>Sched</th><th>Est</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f, i) => (
              <FlightRow key={`${f.flightNo}-${f.scheduled}-${i}`}
                         f={f} type="arr" userId={userId} mySet={mySet} refreshMy={refreshMy}/>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
