const PROD = typeof window !== "undefined" && window.location.hostname.includes("onrender.com");

// ⬇️ Set your backend URL here
export const API_BASE = PROD
  ? "https://vada-2db9.onrender.com"
  : "http://localhost:10000";

async function j(r) {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// auth
export const me = () => fetch(`${API_BASE}/auth/me`, { credentials: "include" }).then(j);
export const login = (username, password) =>
  fetch(`${API_BASE}/auth/login`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  }).then(j);
export const logout = () => fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).then(j);

// flights
export const getFlights = (type="arr", scope="all", includeFirst=false) =>
  fetch(`${API_BASE}/api/flights?type=${type}&scope=${scope}&includeFirst=${includeFirst?1:0}`, { credentials: "include" }).then(j);

// actions (ss/bus/fp/lp)
export const postAction = (payload) =>
  fetch(`${API_BASE}/api/actions`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(j);

// my flights
export const listMy = (type="arr") =>
  fetch(`${API_BASE}/api/my-flights?type=${type}`, { credentials: "include" }).then(j);
export const addMy = (payload) =>
  fetch(`${API_BASE}/api/my-flights`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(j);
export const delMy = (payload) =>
  fetch(`${API_BASE}/api/my-flights`, {
    method: "DELETE", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(j);

// psm
export const listPSM = (type, flightNo, scheduled) =>
  fetch(`${API_BASE}/api/psm?type=${type}&flightNo=${encodeURIComponent(flightNo)}&scheduled=${scheduled}`, { credentials: "include" }).then(j);
export const postPSM = (payload) =>
  fetch(`${API_BASE}/api/psm`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(j);

// admin (optional use later)
export const listActionsAdmin = (type, flightNo, scheduled) =>
  fetch(`${API_BASE}/api/actions?type=${type}&flightNo=${encodeURIComponent(flightNo)}&scheduled=${scheduled}`, { credentials: "include" }).then(j);
