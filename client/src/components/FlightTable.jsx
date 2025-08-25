import React from "react";
import FlightRow from "./FlightRow";

export default function FlightTable({ flights, type, userId, refresh }) {
  return (
    <div className="glass" style={{marginTop:12}}>
      <table className="table">
        <thead>
          <tr>
            <th>Info</th>
            <th>Sched</th>
            <th>Est</th>
            <th className="small">Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f, i) => (
            <FlightRow key={`${f.flightNo}-${f.scheduled}-${i}`}
                       f={f} type={type} userId={userId} refresh={refresh}/>
          ))}
        </tbody>
      </table>
    </div>
  );
}
