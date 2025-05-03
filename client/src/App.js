import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [flights, setFlights] = useState([]);
  const [highlighted, setHighlighted] = useState([]);
  const [now, setNow] = useState(new Date());

  const fetchData = async () => {
    const res = await fetch('https://vada-2db9.onrender.com/api/flights');
    const data = await res.json();
    setFlights(data);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
      setNow(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const getTimeDifference = (estm) => {
    if (!estm || !/^\d{1,2}:\d{2}$/.test(estm)) return Infinity;
    const nowTime = now.getHours() * 60 + now.getMinutes();
    const [h, m] = estm.split(':');
    const estmTime = parseInt(h) * 60 + parseInt(m);
    return estmTime - nowTime;
  };

  const toggleHighlight = (flight) => {
    setHighlighted(prev =>
      prev.includes(flight) ? prev.filter(f => f !== flight) : [...prev, flight]
    );
  };

  return (
    <div className="App">
      <h1>VADA - Velana Arrivals Data Assistant</h1>
      <table>
        <thead>
          <tr>
            <th>Flight</th>
            <th>From</th>
            <th>Time</th>
            <th>ESTM</th>
            <th>Status</th>
            <th>PSM</th>
            <th>BUS</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f, i) => {
            const timeDiff = getTimeDifference(f.estm);
            const isLanded = (f.status || '').toLowerCase().includes('landed');

            return (
              <tr
                key={i}
                className={
                  `${highlighted.includes(f.flight) ? 'highlight' : ''} ${isLanded ? 'landed' : ''} ${timeDiff <= 20 && timeDiff >= 0 ? 'soon' : ''}`
                }
              >
                <td onClick={() => toggleHighlight(f.flight)}>{f.flight}</td>
                <td>{f.from}</td>
<td>{f.time}</td>         {/* TIME column */}
<td>{f.estm}</td>         {/* ESTM column */}
<td>{f.status}</td>       {/* STATUS column */}
                  <button onClick={() => window.location.href = 'tel:+9603337144'}>Call</button>
                  <div className="timestamp">—</div>
                </td>
                <td>
                  <button onClick={() => window.location.href = 'tel:+9603337253'}>Call</button>
                  <div className="timestamp">—</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default App;
