import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [flights, setFlights] = useState([]);

  useEffect(() => {
    const fetchFlights = async () => {
      try {
        const response = await fetch('https://vada-2db9.onrender.com'); // Make sure this matches your backend URL
        const data = await response.json();
        setFlights(data);
      } catch (error) {
        console.error('Error fetching flights:', error);
      }
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 60000); // Auto-refresh every 60s
    return () => clearInterval(interval);
  }, []);

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
          {flights.map((flight, index) => (
            <tr key={index}>
              <td>{flight.flight || '–'}</td>
              <td>{flight.origin || '–'}</td>
              <td>{flight.scheduledTime || '–'}</td>
              <td>{flight.estimatedTime || '–'}</td>
              <td>{flight.status || '–'}</td>
              <td>
                <button onClick={() => window.open('tel:+9603337100')}>Call</button>
              </td>
              <td>
                {flight.bus ? (
                  <button onClick={() => window.open(`tel:${flight.bus}`)}>Call</button>
                ) : (
                  '–'
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
