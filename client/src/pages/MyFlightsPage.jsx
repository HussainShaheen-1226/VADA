import React, { useEffect, useMemo, useState } from "react";
import { getFlights, listMy } from "../utils/api";
import SearchBar from "../components/SearchBar";
import FlightTable from "../components/FlightTable";

export default function MyFlightsPage({ userId }) {
  const [type, setType] = useState("arr"); // arr | dep
  const [scope, setScope] = useState("all");
  const [flights, setFlights] = useState([]);
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState("");

  async function load() {
    const [fl, my] = await Promise.all([getFlights(type, scope, true), listMy(type)]);
    setFlights(fl);
    setMine(my);
  }

  useEffect(()=>{ load(); /* eslint-disable-next-line */ }, [type, scope]);

  const setFilteredToMine = useMemo(() => {
    const setKey = new Set(mine.map(m => `${m.flightNo}|${m.scheduled}`));
    return flights.filter(f => setKey.has(`${f.flightNo}|${f.scheduled}`));
  }, [mine, flights]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return setFilteredToMine.filter(f =>
      (f.flightNo || "").toLowerCase().includes(qq) ||
      (f.origin_or_destination || "").toLowerCase().includes(qq)
    );
  }, [setFilteredToMine, q]);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">VADA · My Flights</div>
        <div className="nav">
          <button className={`pill ${type==='arr'?'active':''}`} onClick={()=>setType('arr')}>Arrivals</button>
          <button className={`pill ${type==='dep'?'active':''}`} onClick={()=>setType('dep')}>Departures</button>
          <button className={`pill ${scope==='all'?'active':''}`} onClick={()=>setScope('all')}>All</button>
          <button className={`pill ${scope==='domestic'?'active':''}`} onClick={()=>setScope('domestic')}>Domestic</button>
          <button className={`pill ${scope==='international'?'active':''}`} onClick={()=>setScope('international')}>International</button>
        </div>
        <button className="pill" onClick={load}>↻</button>
      </div>

      <SearchBar value={q} onChange={setQ} />
      <FlightTable flights={filtered} type={type} userId={userId} refresh={load}/>
    </div>
  );
}
