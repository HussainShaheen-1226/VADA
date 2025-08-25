import React from "react";

export default function Tabs({ value, onChange, items }) {
  return (
    <div className="nav" role="tablist" aria-label="Scopes">
      {items.map(it => (
        <button
          key={it.value}
          className={`pill ${value===it.value ? 'active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
