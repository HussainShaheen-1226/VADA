import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [flights, setFlights] = useState([]);
  const [userId, setUserId] = useState(localStorage.getItem('userId') || '');
  const [callTimes, setCallTimes] = useState({});

  useEffect(() => {
    const storedTime = localStorage.getItem('userIdTimestamp');
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;

    if (!userId || !storedTime || Date.now() - storedTime > twoWeeks) {
      const newId = prompt('Enter your User ID:');
      if (newId) {
        setUserId(newId);
        localStorage.setItem('userId', newId);
        localStorage.setItem('userIdTimestamp', Date.now());
      }
    }
  }, [userId]);

  useEffect(() => {
    const fetchFlights = async () => {
      try {
        const response = await fetch('/api/flights');
        const data = await response.json();
        setFlights(data);
      } catch (error) {
        console.error('Error fetching flights:', error);
      }
    };

    fetchFlights();
  }, []);

  const handleCall = async (flight, type) => {
    const timestamp = new Date().toISOString();
    setCallTimes(prev => ({
      ...prev,
      [`${flight}-${type}`]: { timestamp, userId }
    }));

    const phoneNumber = type === 'ss' ? '+9603337100' : '+9603337253';
    window.location.href = `tel:${phoneNumber}`;

    try {
      await fetch('/api/call-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, flight, type, timestamp })
      });
    } catch (error) {
      console.error('Error logging call:', error);
    }
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
              <td>{flight.status || ''}</td>
              <td>
                <button onClick={() => handleCall(flight.flight, 'ss')}>
                  Call
                </button>
                {callTimes[`${flight.flight}-ss`] && (
                  <div style={{ fontSize: '0.75rem' }}>
                    {callTimes[`${flight.flight}-ss`].timestamp.split('T')[1].slice(0,5)} by {callTimes[`${flight.flight}-ss`].userId}
                  </div>
                )}
              </td>
              <td>
                <button onClick={() => handleCall(flight.flight, 'bus')}>
                  Call
                </button>
                {callTimes[`${flight.flight}-bus`] && (
                  <div style={{ fontSize: '0.75rem' }}>
                    {callTimes[`${flight.flight}-bus`].timestamp.split('T')[1].slice(0,5)} by {callTimes[`${flight.flight}-bus`].userId}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
