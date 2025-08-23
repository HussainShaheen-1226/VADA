import React from "react";

export default function Tabs({ value, onChange, items }) {
  return (
    <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
      {items.map(it => (
        <button key={it.value}
          className={"pill " + (value === it.value ? "yellow" : "ghost")}
          onClick={()=>onChange(it.value)}
        >{it.label}</button>
      ))}
    </div>
  );
}
