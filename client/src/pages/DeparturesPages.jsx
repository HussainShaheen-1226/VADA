import React, { useEffect, useMemo, useRef, useState } from 'react';
import SearchBar from '../components/SearchBar';

function statusClass(s=''){ s=s.toUpperCase(); if(s.includes('CANCEL'))return'cancel'; if(s.includes('DELAY'))return'delay'; if(s.includes('FINAL')||s.includes('BOARD'))return'board'; if(s.includes('DEPART'))return'ok'; return'info'; }
const toMin = t => { if(!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m; };

export default function DeparturesPage({ API_BASE, userId, actions }) {
  const [scope,setScope] = useState('all'); // all|domestic|international
  const [rows,setRows] = useState([]);
  const [query,setQuery] = useState('');
  const tableRef = useRef(null);

  async function load(){
    const res = await fetch(`${API_BASE}/api/flights?type=dep&scope=${scope}`);
    let data = await res.json();
    data = data.filter(f => f.flightNo && f.scheduled && f.terminal);
    let last = 0, day = 0;
    const withDate = data.map(f => {
      const t = toMin(f.estimated || f.scheduled);
      if (t < last) day += 1;
      last = t;
      return { ...f, _day: day };
    });
    setRows(withDate);
  }
  useEffect(()=>{ load(); const id=setInterval(load, 30000); return ()=>clearInterval(id); },[scope]);

  const filtered = useMemo(()=>{
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.flightNo.toLowerCase().includes(q) ||
      (r.origin_or_destination||'').toLowerCase().includes(q)
    );
  },[rows,query]);

  const quickJump = () => {
    if (!tableRef.current) return;
    const q = query.trim().toLowerCase();
    if (!q) return;
    const tr = [...tableRef.current.querySelectorAll('tbody tr.data')].find(el => el.textContent.toLowerCase().includes(q));
    tr?.scrollIntoView({behavior:'smooth', block:'center'});
  };

  return (
    <>
      <div style={{padding:'8px 12px'}}>
        <button className={`scope-btn ${scope==='all'?'active':''}`} onClick={()=>setScope('all')}>All</button>
        <button className={`scope-btn ${scope==='domestic'?'active':''}`} onClick={()=>setScope('domestic')}>Domestic</button>
        <button className={`scope-btn ${scope==='international'?'active':''}`} onClick={()=>setScope('international')}>International</button>
      </div>

      <SearchBar query={query} setQuery={setQuery} onJump={quickJump} />

      <div className="table-wrap" ref={tableRef}>
        <table>
          <thead>
            <tr>
              <th>Flight</th>
              <th>Destination</th>
              <th>Sched</th>
              <th>Est</th>
              <th>Term</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
          {filtered.map((f) => {
            const key = `${f.flightNo}|${f.scheduled}`;
            return (
              <tr key={key} className="data">
                <td>{f.flightNo}</td>
                <td>{f.origin_or_destination || '—'}</td>
                <td>{f.scheduled || '—'}</td>
                <td>{f.estimated || '—'}</td>
                <td><span className="pill term">{f.terminal || '—'}</span></td>
                <td><span className={`pill status ${statusClass(f.status)}`}>{f.status || '—'}</span></td>
                <td className="actions">
                  {/* SS/BUS on dep + log */}
                  <a className="action-btn ss" href="tel:+9603337100"
                     onClick={()=>actions.log({ userId, flightNo:f.flightNo, scheduled:f.scheduled, estimated:f.estimated, action:'SS', type:'dep' })}>SS</a>
                  <a className="action-btn bus" href="tel:+9603337253"
                     onClick={()=>actions.log({ userId, flightNo:f.flightNo, scheduled:f.scheduled, estimated:f.estimated, action:'BUS', type:'dep' })}>BUS</a>

                  {/* FP/LP — log only */}
                  <button className="action-btn"
                          onClick={()=>actions.log({ userId, flightNo:f.flightNo, scheduled:f.scheduled, estimated:f.estimated, action:'FP', type:'dep' })}>FP</button>
                  <button className="action-btn"
                          onClick={()=>actions.log({ userId, flightNo:f.flightNo, scheduled:f.scheduled, estimated:f.estimated, action:'LP', type:'dep' })}>LP</button>

                  <button className="action-btn" onClick={()=>actions.myAdd('dep', f.flightNo, f.scheduled)}>+ My</button>
                  <button className="action-btn" onClick={()=>actions.myRemove('dep', f.flightNo, f.scheduled)}>− My</button>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </>
  );
}
