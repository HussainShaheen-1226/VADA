import React, { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [flights, setFlights] = useState([]);

  useEffect(() => {
    fetch("https://your-backend-url.com/flights") // replace with your actual backend URL
      .then((res) => res.json())
      .then((data) => setFlights(data))
      .catch((err) => console.error("Fetch error:", err));
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
              <td>{flight.flight}</td>
              <td>{flight.origin}</td>
              <td>{flight.scheduledTime}</td>
              <td>{flight.estimatedTime}</td>
              <td>{flight.status}</td>
              <td>
                <a href="tel:+9603337100">
                  <button>Call</button>
                </a>
              </td>
              <td>
                <button>Call</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
