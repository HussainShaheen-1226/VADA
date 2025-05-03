import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [flights, setFlights] = useState([]);
  const [highlighted, setHighlighted] = useState([]);

  const fetchData = async () => {
    const res = await fetch('https://vada-2db9.onrender.com/api/flights');
    const data = await res.json();
    setFlights(data);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

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
            <th>Time</th>
            <th>Flight</th>
            <th>From</th>
            <th>ESTM</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f, i) => (
            <tr key={i} className={highlighted.includes(f.flight) ? 'highlight' : ''}>
              <td>{f.time}</td>
              <td onClick={() => toggleHighlight(f.flight)}>{f.flight}</td>
              <td>{f.from}</td>
              <td>{f.estm}</td>
              <td>{f.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
