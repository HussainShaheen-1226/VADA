import React, { useEffect, useMemo, useState } from "react";
import { getMyFlights } from "../utils/api";
import TopBar from "../components/TopBar";
import FlightRow from "../components/FlightRow";

export default function MyFlightsPage({ userId }) {
  const [arr, setArr] = useState([]);
  const [dep, setDep] = useState([]);

  const mySet = useMemo(() => new Set([
    ...arr.map(m => `arr|${m.flightNo}|${m.scheduled}`),
    ...dep.map(m => `dep|${m.flightNo}|${m.scheduled}`)
  ]), [arr, dep]);

  const refresh = async () => {
    if (!userId) return;
    try {
      const [a, d] = await Promise.all([
        getMyFlights(userId, "arr"),
        getMyFlights(userId, "dep")
      ]);
      setArr(a || []); setDep(d || []);
    } catch {}
  };
  useEffect(() => { refresh(); }, [userId]);

  return (
    <div className="container">
      <TopBar userId={userId} onReload={refresh} />
      <div className="title">My Flights</div>
      <div className="subtitle">Arrivals & Departures you added</div>

      <div className="tableWrap card">
        <div className="small">Arrivals ({arr.length})</div>
        <table className="table"><thead>
          <tr><th>Term</th><th>Flight</th><th>Origin</th><th>Sched</th><th>Est</th><th>Status</th><th>Actions</th></tr>
        </thead><tbody>
          {(arr||[]).map((f,i)=>(
            <FlightRow key={`A-${f.flightNo}-${f.scheduled}-${i}`} f={f} type="arr" userId={userId} mySet={mySet} refreshMy={refresh}/>
          ))}
        </tbody></table>
      </div>

      <div className="tableWrap card" style={{marginTop:12}}>
        <div className="small">Departures ({dep.length})</div>
        <table className="table"><thead>
          <tr><th>Term</th><th>Flight</th><th>Destination</th><th>Sched</th><th>Est</th><th>Status</th><th>Actions</th></tr>
        </thead><tbody>
          {(dep||[]).map((f,i)=>(
            <FlightRow key={`D-${f.flightNo}-${f.scheduled}-${i}`} f={f} type="dep" userId={userId} mySet={mySet} refreshMy={refresh}/>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
