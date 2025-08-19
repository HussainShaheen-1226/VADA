const PROD = typeof window !== "undefined" && window.location.hostname.includes("onrender.com");
export const API_BASE = PROD
  ? "https://vada-2db9.onrender.com"
  : "http://localhost:10000";

export async function getFlights(type = "arr", scope = "all") {
  const r = await fetch(`${API_BASE}/api/flights?type=${type}&scope=${scope}`);
  if (!r.ok) throw new Error(`Flights HTTP ${r.status}`);
  return r.json();
}

export async function postLog(payload) {
  const r = await fetch(`${API_BASE}/api/call-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("log failed");
  return r.json();
}

export async function getFlightLog(type, flightNo, scheduled) {
  const r = await fetch(`${API_BASE}/api/call-logs/by-flight?type=${type}&flightNo=${encodeURIComponent(flightNo)}&scheduled=${encodeURIComponent(scheduled)}`);
  if (!r.ok) throw new Error(`log HTTP ${r.status}`);
  return r.json(); // { ok:true, actions:{SS:{ts,userId}, ...} }
}

export async function loginAdmin(username, password) {
  const r = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "include"
  });
  return r.json();
}

export async function getLogs(limit = 500, offset = 0) {
  const r = await fetch(`${API_BASE}/api/call-logs?limit=${limit}&offset=${offset}`, { credentials: "include" });
  if (!r.ok) throw new Error("unauthorized");
  return r.json();
}

export async function getMyFlights(userId, type) {
  const r = await fetch(`${API_BASE}/api/my-flights?userId=${encodeURIComponent(userId)}&type=${type}`);
  return r.json();
}
export async function addMyFlight(payload) {
  const r = await fetch(`${API_BASE}/api/my-flights`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return r.json();
}
export async function delMyFlight(payload) {
  const r = await fetch(`${API_BASE}/api/my-flights`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return r.json();
}

export async function listPSM(type, flightNo, scheduled) {
  const r = await fetch(`${API_BASE}/api/psm?type=${type}&flightNo=${encodeURIComponent(flightNo)}&scheduled=${encodeURIComponent(scheduled)}`);
  return r.json();
}
export async function postPSM(payload) {
  const r = await fetch(`${API_BASE}/api/psm`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return r.json();
}
