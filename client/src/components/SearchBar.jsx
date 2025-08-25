import React from "react";

export default function SearchBar({ value, onChange }) {
  return (
    <div className="glass" style={{marginTop:12, padding:8}}>
      <input
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        placeholder="Search by flight or city..."
        style={{
          width:'100%', background:'transparent', color:'var(--fg)',
          border:'none', outline:'none', fontSize:16
        }}
      />
    </div>
  );
}
