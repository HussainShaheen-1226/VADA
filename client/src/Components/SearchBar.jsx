import React from 'react';

export default function SearchBar({ query, setQuery, onJump }) {
  return (
    <div className="searchbar">
      <input
        type="text"
        placeholder="Search flight # or origin/destination..."
        value={query}
        onChange={(e)=>setQuery(e.target.value)}
      />
      <button className="scope-btn" onClick={onJump}>Quick Jump</button>
    </div>
  );
}
