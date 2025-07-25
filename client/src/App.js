import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://vada-2db9.onrender.com';

function App() {
  const [flights, setFlights] = useState([]);
  const [userId, setUserId] = useState(() => {
    const saved = localStorage.getItem('userId');
    const savedAt = localStorage.getItem('userIdSavedAt');
    const now = new Date().getTime();
    if (saved && savedAt && now - parseInt(savedAt) < 14 * 24 * 60 * 60 * 1000) {
      return saved;
    }
    return '';
  });

  useEffect(() => {
    if (!userId) {
      const enteredId = prompt('Enter your ID');
      if (enteredId) {
        setUserId(enteredId);
        localStorage.setItem('userId', enteredId);
        localStorage.setItem('userIdSavedAt', Date.now().toString());
      }
    }
  }, [userId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/flights`);
        setFlights(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const handleCall = async (flight, type) => {
    const timestamp = new Date().toISOString();
    const payload = { userId, flight, type, timestamp };
    try {
      await axios.post(`${API_URL}/api/call-logs`, payload);
      const updated = flights.map(f =>
        f.flight === flight ? { ...f, [`${type.toLowerCase()}Time`]: timestamp, [`${type.toLowerCase()}User`]: userId } : f
      );
      setFlights(updated);
    } catch (err) {
      console.error('Failed to log call', err);
    }
  };

  return (
    <div className="app">
      <h1 className="title">VADA - Velana Arrivals Data Assistant</h1>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Flight</th>
              <th>From</th>
              <th>Time</th>
              <th>ESTM</th>
              <th>Status</th>
              <th>SS</th>
              <th>BUS</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((flight, i) => (
              <tr key={i}>
                <td>{flight.flight}</td>
                <td>{flight.from}</td>
                <td>{flight.time}</td>
                <td>{flight.estm}</td>
                <td>{flight.status}</td>
                <td>
                  <button className="ss-btn" onClick={() => handleCall(flight.flight, 'SS')}>
                    SS
                  </button>
                  {flight.ssTime && (
                    <div className="call-info">
                      <div>{new Date(flight.ssTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <small>{flight.ssUser}</small>
                    </div>
                  )}
                </td>
                <td>
                  <button className="bus-btn" onClick={() => handleCall(flight.flight, 'BUS')}>
                    BUS
                  </button>
                  {flight.busTime && (
                    <div className="call-info">
                      <div>{new Date(flight.busTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <small>{flight.busUser}</small>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
