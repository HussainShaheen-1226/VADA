import React, { useEffect, useMemo, useState } from "react";
import { getFlights } from "../utils/api";
import Tabs from "../components/Tabs";
import SearchBar from "../components/SearchBar";
import FlightTable from "../components/FlightTable";

export default function DeparturesPage({ userId }) {
  const [scope, setScope] = useState("all");
  const [flights, setFlights] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    try {
      const data = await getFlights("dep", scope, true);
      setFlights(data);
    } catch (e) {
      setErr(String(e.message || e));
      setFlights([]);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return flights.filter(f =>
      (f.flightNo || "").toLowerCase().includes(qq) ||
      (f.origin_or_destination || "").toLowerCase().includes(qq)
    );
  }, [flights, q]);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">VADA · Departures</div>
        <button className="pill" onClick={load}>↻ Refresh</button>
      </div>

      <Tabs value={scope} onChange={setScope}
        items={[{value:"all",label:"All"},{value:"domestic",label:"Domestic"},{value:"international",label:"International"}]}
      />
      <SearchBar value={q} onChange={setQ} />

      {err ? <div className="error" style={{marginTop:12}}>Failed to load · {err}</div> : null}

      <FlightTable flights={filtered} type="dep" userId={userId} refresh={load}/>
    </div>
  );
}
