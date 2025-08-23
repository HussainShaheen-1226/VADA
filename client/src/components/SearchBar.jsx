import React from "react";

export default function SearchBar({ value, onChange, placeholder="Search flight or city..." }) {
  return (
    <div className="card" style={{marginTop:10}}>
      <input
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        placeholder={placeholder}
        type="text"
      />
    </div>
  );
}
