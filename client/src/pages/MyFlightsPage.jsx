import React, { useEffect, useState } from "react";
import { getMyFlights } from "../utils/api";

export default function MyFlightsPage({ userId }) {
  const [arr, setArr] = useState([]);
  const [dep, setDep] = useState([]);

  useEffect(() => {
    (async () => {
      setArr(await getMyFlights(userId, "arr"));
      setDep(await getMyFlights(userId, "dep"));
    })();
  }, [userId]);

  return (
    <div className="container">
      <div className="brand">My Flights</div>

      <div className="glass" style={{marginTop:12}}>
        <h3>Arrivals</h3>
        {arr.length === 0 ? <div style={{opacity:.7}}>None</div> : (
          <ul>{arr.map(a => <li key={`${a.flightNo}-${a.scheduled}`}>{a.flightNo} · {a.scheduled}</li>)}</ul>
        )}
      </div>

      <div className="glass" style={{marginTop:12}}>
        <h3>Departures</h3>
        {dep.length === 0 ? <div style={{opacity:.7}}>None</div> : (
          <ul>{dep.map(a => <li key={`${a.flightNo}-${a.scheduled}`}>{a.flightNo} · {a.scheduled}</li>)}</ul>
        )}
      </div>
    </div>
  );
}
