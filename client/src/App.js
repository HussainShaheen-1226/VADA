import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [userId, setUserId] = useState('');
  const [flights, setFlights] = useState([]);
  const [logs, setLogs] = useState([]);

  // Prompt for user ID every 14 days
  useEffect(() => {
    const savedId = localStorage.getItem('userId');
    const savedAt = localStorage.getItem('userIdSavedAt');

    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;

    if (!savedId || !savedAt || now - parseInt(savedAt) > twoWeeks) {
      const input = prompt('Enter your user ID');
      if (input) {
        localStorage.setItem('userId', input);
        localStorage.setItem('userIdSavedAt', now.toString());
        setUserId(input);
      }
    } else {
      setUserId(savedId);
    }
  }, []);

  // Fetch flights and logs
  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      try {
        const res1 = await fetch('https://vada-2db9.onrender.com'); // Backend flight data
        const flightsData = await res1.json();
        setFlights(flightsData);

        const res2 = await fetch(`https://vada-2db9.onrender.com/api/call-logs?userId=${userId}`);
        const logsData = await res2.json();
        setLogs(logsData);
      } catch (error) {
        console.error('Fetch error:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  const handleCall = async (flight, type) => {
    const timestamp = new Date().toISOString();
    try {
      await fetch('https://vada-2db9.onrender.com/api/log-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight, type, timestamp, userId }),
      });

      setLogs(prev => [...prev, { flight, type, timestamp, userId }]);
    } catch (error) {
      console.error('Log call error:', error);
    }
  };

  const formatTime = iso => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
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
          {flights.map((flight, index) => {
            const ssLog = logs.find(log => log.flight === flight.flight && log.type === 'ss');
            const busLog = logs.find(log => log.flight === flight.flight && log.type === 'bus');

            return (
              <tr key={index}>
                <td>{flight.flight || '–'}</td>
                <td>{flight.origin || '–'}</td>
                <td>{flight.scheduledTime || '–'}</td>
                <td>{flight.estimatedTime || '–'}</td>
                <td>{flight.status || '–'}</td>
                <td>
                  <a href="tel:+9603337100">
                    <button onClick={() => handleCall(flight.flight, 'ss')}>Call</button>
                  </a>
                  {ssLog && (
                    <div style={{ fontSize: '10px' }}>
                      {formatTime(ssLog.timestamp)} ({ssLog.userId})
                    </div>
                  )}
                </td>
                <td>
                  <a href="tel:+9603337253">
                    <button onClick={() => handleCall(flight.flight, 'bus')}>Call</button>
                  </a>
                  {busLog && (
                    <div style={{ fontSize: '10px' }}>
                      {formatTime(busLog.timestamp)} ({busLog.userId})
                    </div>
                  )}
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
