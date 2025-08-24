import React, { useEffect, useMemo, useState } from "react";
import { getFlights, getMyFlights } from "../utils/api";
import Tabs from "../components/Tabs";
import SearchBar from "../components/SearchBar";
import FlightRow from "../components/FlightRow";

export default function DeparturesPage({ userId }) {
  const [scope, setScope] = useState("all");
  const [flights, setFlights] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [my, setMy] = useState([]);

  const mySet = useMemo(
    () => new Set(my.map((m) => `dep|${m.flightNo}|${m.scheduled}`)),
    [my]
  );

  const refreshMy = async () => {
    const r = await getMyFlights(userId, "dep");
    setMy(r || []);
  };

  useEffect(() => {
    refreshMy();
    // eslint-disable-next-line
  }, [userId]);

  const load = async () => {
    setErr("");
    try {
      const data = await getFlights("dep", scope);
      setFlights(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(String(e.message || e));
      setFlights([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [scope]);

  const filtered = flights.filter((f) => {
    const hay =
      `${f.flightNo} ${f.origin_or_destination} ${f.terminal} ${f.status}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="container">
      <div className="header">
        <div className="brand">VADA</div>
        <button className="pill" onClick={load}>↻</button>
      </div>

      <h2>Departures</h2>

      <Tabs
        value={scope}
        onChange={setScope}
        items={[
          { value: "all", label: "All" },
          { value: "domestic", label: "Domestic" },
          { value: "international", label: "International" },
        ]}
      />

      <SearchBar value={q} onChange={setQ} />

      {err ? (
        <div className="error" style={{ marginTop: 12 }}>
          <div>Failed to load: {err}</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>Source: Velana FIDS · VADA</div>
        </div>
      ) : null}

      <div className="glass" style={{ marginTop: 12 }}>
        <div className="tableMeta">
          Showing {filtered.length} of {flights.length} · Updated {new Date().toLocaleTimeString()}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Flight info</th>
              <th>Sched</th>
              <th>Est</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f, i) => (
              <FlightRow
                key={`${f.flightNo}-${f.scheduled}-${i}`}
                f={f}
                type="dep"
                userId={userId}
                mySet={mySet}
                refreshMy={refreshMy}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
