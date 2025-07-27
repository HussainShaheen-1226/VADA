// client/src/App.js
import React, { useEffect, useState } from 'react';
import './index.css';

function App() {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [callTimes, setCallTimes] = useState({});

  useEffect(() => {
    const storedId = localStorage.getItem('userId');
    const storedTime = localStorage.getItem('userIdTime');
    const now = new Date().getTime();

    if (!storedId || !storedTime || now - parseInt(storedTime) > 14 * 24 * 60 * 60 * 1000) {
      const newId = prompt('Enter your ID:');
      if (newId) {
        localStorage.setItem('userId', newId);
        localStorage.setItem('userIdTime', now.toString());
        setUserId(newId);
      }
    } else {
      setUserId(storedId);
    }
  }, []);

  useEffect(() => {
    fetch('https://vada-2db9.onrender.com/flights')
      .then(res => res.json())
      .then(data => {
        setFlights(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching flights:', err);
        setLoading(false);
      });
  }, []);

  const handleCall = (id, type) => {
    const time = new Date().toLocaleTimeString();
    const updated = {
      ...callTimes,
      [id]: { ...(callTimes[id] || {}), [type]: `${time} (${userId})` }
    };
    setCallTimes(updated);

    // Send to backend (optional)
    fetch('https://vada-2db9.onrender.com/api/call-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        flight: flights[id]?.flightNo || '',
        type,
        timestamp: new Date().toISOString(),
      }),
    });
  };

  return (
    <div
      className="app-wrapper"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL + '/background.png'})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '100vh',
        padding: '20px',
      }}
    >
      <div className="container">
        <h1 className="title">Velana Arrivals Departure Assistant (VADA)</h1>
        {loading ? (
          <div className="loader">Loading flights...</div>
        ) : flights.length === 0 ? (
          <div className="no-flights">No flights available</div>
        ) : (
          <table className="flight-table">
            <thead>
              <tr>
                <th>Airline</th>
                <th>Flight</th>
                <th>Origin</th>
                <th>STA</th>
                <th>ETD</th>
                <th>Gate</th>
                <th>Bay</th>
                <th>Status</th>
                <th>SS</th>
                <th>BUS</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((flight, index) => (
                <tr key={index}>
                  <td>{flight.airline}</td>
                  <td>{flight.flightNo}</td>
                  <td>{flight.origin}</td>
                  <td>{flight.sta}</td>
                  <td>{flight.etd}</td>
                  <td>{flight.gate}</td>
                  <td>{flight.bay}</td>
                  <td>{flight.status}</td>
                  <td>
                    <button className="call-btn ss" onClick={() => handleCall(index, 'ss')}>
                      SS
                    </button>
                    <div className="call-time">{callTimes[index]?.ss}</div>
                  </td>
                  <td>
                    <button className="call-btn bus" onClick={() => handleCall(index, 'bus')}>
                      BUS
                    </button>
                    <div className="call-time">{callTimes[index]?.bus}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default App;
