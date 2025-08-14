import { useEffect, useState, useMemo } from 'react';

const API = 'https://vada-2db9.onrender.com';

export default function App() {
  const [flights, setFlights] = useState([]);
  const [connected, setConnected] = useState(false);
  const [callTimes, setCallTimes] = useState({}); // { "<flightNo>": { ss: "...", bus: "..." } }

  // Normalize once (guards against undefined keys)
  const rows = useMemo(() => (Array.isArray(flights) ? flights : []), [flights]);

  async function loadFlights() {
    try {
      const res = await fetch(`${API}/flights`, { cache: 'no-store' });
      setFlights(await res.json());
    } catch {/* ignore */}
  }

  useEffect(() => {
    loadFlights(); // initial
    const ev = new EventSource(`${API}/events`);
    ev.onopen = () => setConnected(true);
    ev.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'changed') await loadFlights();
      } catch {/* ignore */}
    };
    ev.onerror = () => setConnected(false);
    const fallback = setInterval(loadFlights, 60000); // safety
    return () => { ev.close(); clearInterval(fallback); };
  }, []);

  function stampCall(flightNo, type) {
    const stamp = new Date().toLocaleTimeString();
    setCallTimes(prev => ({
      ...prev,
      [flightNo]: { ...(prev[flightNo] || {}), [type]: stamp }
    }));
  }

  const ssTel  = 'tel:+9603337100';
  const busTel = 'tel:+9603337253';

  return (
    <div className="container">
      <header className="topbar">
        <h1>VADA — Velana Arrivals & Departure Assistant</h1>
        <div className={`live-dot ${connected ? 'on' : 'off'}`}>
          {connected ? 'live' : 'offline'}
        </div>
      </header>

      <div className="table-wrap">
        <table className="vada-table">
          <thead>
            <tr>
              <th>Airline</th>
              <th>Flight</th>
              <th>Route</th>
              <th>STA</th>
              <th>ETD</th>
              <th>Status</th>
              <th>SS</th>
              <th>BUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="muted">No flights</td></tr>
            ) : rows.map((f) => (
              <tr key={`${f.flightNo}-${f.sta}`}>
                <td>{f.airline}</td>
                <td>{f.flightNo}</td>
                <td>{f.route}</td>
                <td>{f.sta}</td>
                <td>{f.etd}</td>
                <td><span className={`status ${f.status?.toLowerCase() || ''}`}>{f.status}</span></td>
                <td>
                  <a className="btn ss" href={ssTel} onClick={() => stampCall(f.flightNo, 'ss')}>SS</a>
                  <div className="stamp">{callTimes[f.flightNo]?.ss || ''}</div>
                </td>
                <td>
                  <a className="btn bus" href={busTel} onClick={() => stampCall(f.flightNo, 'bus')}>BUS</a>
                  <div className="stamp">{callTimes[f.flightNo]?.bus || ''}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
