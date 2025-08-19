import React from "react";

export default function SearchBar({ value, onChange, placeholder = "Search flight / origin…" }) {
  return (
    <input
      style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "rgba(0,0,0,.3)", color: "#fff" }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}
