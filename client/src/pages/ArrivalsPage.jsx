import React, { useEffect, useMemo, useRef, useState } from "react";
import { getFlights, getMyFlights } from "../utils/api";
import Tabs from "../components/Tabs";
import SearchBar from "../components/SearchBar";
import FlightRow from "../components/FlightRow";

const POLL_MS = 30000; // auto-refresh cadence (30s). Tune as needed.

export default function ArrivalsPage({ userId }) {
  const [scope, setScope] = useState("all"); // all | domestic | international
  const [flights, setFlights] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [my, setMy] = useState([]);
  const mySet = useMemo(
    () => new Set(my.map((m) => `arr|${m.flightNo}|${m.scheduled}`)),
    [my]
  );

  const timerRef = useRef(null);

  const refreshMy = async () => {
    if (!userId) return;
    try {
      const r = await getMyFlights(userId, "arr");
      setMy(Array.isArray(r) ? r : []);
    } catch {
      // ignore MyFlights errors in UI
    }
  };

  useEffect(() => {
    refreshMy();
  }, [userId]);

  const load = async (signal) => {
    setErr("");
    setLoading(true);
    try {
      const data = await getFlights("arr", scope);
      if (signal?.aborted) return;
      setFlights(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (e) {
      if (signal?.aborted) return;
      setFlights([]);
      setErr(String(e?.message || e) || "Failed to load flights");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  // Initial + scope changes
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Polling
  useEffect(() => {
    // clear old timer
    if (timerRef.current) clearInterval(timerRef.current);
    // start new timer
    timerRef.current = setInterval(() => load(), POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const filtered = flights.filter(
    (f) =>
      (f.flightNo || "").toLowerCase().includes(q.toLowerCase()) ||
      (f.origin_or_destination || "")
        .toLowerCase()
        .includes(q.toLowerCase())
  );

  const subtitle =
    scope === "all"
      ? "All arrivals"
      : scope === "domestic"
      ? "Domestic arrivals"
      : "International arrivals";

  return (
    <div className="container">
      <div className="header">
        <div className="brand">VADA</div>
        <button className="pill" onClick={() => load()}>↻</button>
      </div>

      <div style={{ opacity: 0.8, marginBottom: 8 }}>{subtitle}</div>

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

      {loading && (
        <div className="glass" style={{ marginTop: 12 }}>
          Loading latest arrivals…
        </div>
      )}

      {err ? (
        <div className="error" style={{ marginTop: 12 }}>
          <div>Failed to load: {err}</div>
          <div>No flights at the moment.</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Source: Velana FIDS · VADA
          </div>
        </div>
      ) : null}

      {!loading && !err && filtered.length === 0 ? (
        <div className="glass" style={{ marginTop: 12 }}>
          No flights match your filters right now.
        </div>
      ) : null}

      {!err && filtered.length > 0 && (
        <div className="glass" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            Showing {filtered.length} of {flights.length}
            {lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString()}` : ""}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Flight</th>
                <th>Origin</th>
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
                  type="arr"
                  userId={userId}
                  mySet={mySet}
                  refreshMy={refreshMy}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
