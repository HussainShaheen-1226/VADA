import React, { useEffect, useMemo, useRef, useState } from 'react';
import SearchBar from '../components/SearchBar';

function statusClass(s=''){ s=s.toUpperCase(); if(s.includes('CANCEL'))return'cancel'; if(s.includes('DELAY'))return'delay'; if(s.includes('BOARD'))return'board'; if(s.includes('LAND'))return'ok'; return'info'; }
const toMin = t => { if(!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m; };

export default function ArrivalsPage({ API_BASE, userId, actions }) {
  const [scope,setScope] = useState('all'); // all|domestic|international
  const [rows,setRows] = useState([]);
  const [psmMap,setPsmMap] = useState({});
  const [query,setQuery] = useState('');
  const tableRef = useRef(null);

  async function load(){
    const res = await fetch(`${API_BASE}/api/flights?type=arr&scope=${scope}`);
    let data = await res.json();
    // defensive: valid rows only
    data = data.filter(f => f.flightNo && f.scheduled && f.terminal);
    // day rollover: when time goes backwards, mark next day
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

  const [psmInputs, setPsmInputs] = useState({});
  const setPSMInput = (key,val)=>setPsmInputs(p=>({...p,[key]:val}));

  async function postPSM(f) {
    const key = `${f.flightNo}|${f.scheduled}`;
    const text = (psmInputs[key]||'').trim();
    if (!text) return;
    await actions.psmPost('arr', f.flightNo, f.scheduled, text);
    setPSMInput(key,'');
    const thread = await fetch(`${API_BASE}/api/psm?type=arr&flightNo=${encodeURIComponent(f.flightNo)}&scheduled=${encodeURIComponent(f.scheduled)}`).then(r=>r.json());
    setPsmMap(m=>({...m,[key]:thread}));
  }

  async function loadThread(f){
    const key = `${f.flightNo}|${f.scheduled}`;
    const thread = await fetch(`${API_BASE}/api/psm?type=arr&flightNo=${encodeURIComponent(f.flightNo)}&scheduled=${encodeURIComponent(f.scheduled)}`).then(r=>r.json());
    setPsmMap(m=>({...m,[key]:thread}));
  }

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
              <th>Origin</th>
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
              <React.Fragment key={key}>
                <tr className="data">
                  <td>{f.flightNo}</td>
                  <td>{f.origin_or_destination || '—'}</td>
                  <td>{f.scheduled || '—'}</td>
                  <td>{f.estimated || '—'}</td>
                  <td><span className="pill term">{f.terminal || '—'}</span></td>
                  <td><span className={`pill status ${statusClass(f.status)}`}>{f.status || '—'}</span></td>
                  <td className="actions">
                    {/* SS/BUS: dials + logs first click */}
                    <a className="action-btn ss" href="tel:+9603337100"
                       onClick={()=>actions.log({ userId, flightNo:f.flightNo, scheduled:f.scheduled, estimated:f.estimated, action:'SS', type:'arr' })}>
                      SS
                    </a>
                    <a className="action-btn bus" href="tel:+9603337253"
                       onClick={()=>actions.log({ userId, flightNo:f.flightNo, scheduled:f.scheduled, estimated:f.estimated, action:'BUS', type:'arr' })}>
                      BUS
                    </a>
                    <button className="action-btn" onClick={()=>actions.myAdd('arr', f.flightNo, f.scheduled)}>+ My</button>
                    <button className="action-btn" onClick={()=>actions.myRemove('arr', f.flightNo, f.scheduled)}>− My</button>
                  </td>
                </tr>

                {/* PSM row */}
                <tr>
                  <td colSpan={7}>
                    <div style={{display:'flex', gap:8, alignItems:'center'}}>
                      <input type="text" placeholder="Add PSM…" value={psmInputs[key]||''}
                             onChange={(e)=>setPSMInput(key,e.target.value)} />
                      <button className="scope-btn" onClick={()=>postPSM(f)}>Post</button>
                      <button className="scope-btn" onClick={()=>loadThread(f)}>Show thread</button>
                    </div>
                    {(psmMap[key]||[]).slice(0,5).map((p,idx)=>(
                      <div key={idx} style={{opacity:.9, padding:'4px 2px'}}>
                        <small>{new Date(p.ts).toLocaleString()} · <b>{p.userId}</b>: {p.text}</small>
                      </div>
                    ))}
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
          </tbody>
        </table>
      </div>
    </>
  );
}
