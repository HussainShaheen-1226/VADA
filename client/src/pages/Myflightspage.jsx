import React, { useEffect, useState } from 'react';

export default function MyFlightsPage({ API_BASE, userId, actions }) {
  const [arr,setArr] = useState([]);
  const [dep,setDep] = useState([]);

  async function load(){
    const a = await fetch(`${API_BASE}/api/my-flights?userId=${encodeURIComponent(userId)}&type=arr`).then(r=>r.json());
    const d = await fetch(`${API_BASE}/api/my-flights?userId=${encodeURIComponent(userId)}&type=dep`).then(r=>r.json());
    setArr(a); setDep(d);
  }
  useEffect(()=>{ load(); },[userId]);

  const Row = ({f,type}) => (
    <tr>
      <td>{f.flightNo}</td>
      <td>{f.scheduled}</td>
      <td>{type.toUpperCase()}</td>
      <td><button className="action-btn" onClick={()=>actions.myRemove(type, f.flightNo, f.scheduled).then(load)}>Remove</button></td>
    </tr>
  );

  return (
    <>
      <h3>My Arrivals</h3>
      <div className="table-wrap">
        <table><thead><tr><th>Flight</th><th>Scheduled</th><th>Type</th><th></th></tr></thead>
          <tbody>{arr.map(f => <Row key={`arr|${f.flightNo}|${f.scheduled}`} f={f} type="arr" />)}</tbody>
        </table>
      </div>
      <h3>My Departures</h3>
      <div className="table-wrap">
        <table><thead><tr><th>Flight</th><th>Scheduled</th><th>Type</th><th></th></tr></thead>
          <tbody>{dep.map(f => <Row key={`dep|${f.flightNo}|${f.scheduled}`} f={f} type="dep" />)}</tbody>
        </table>
      </div>
    </>
  );
}
