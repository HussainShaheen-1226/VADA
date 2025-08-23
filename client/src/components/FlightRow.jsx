import React, { useEffect, useState } from "react";
import { addMyFlight, delMyFlight, getFlightLog, postLog, postPSM, listPSM } from "../utils/api";

const TEL_SS  = "+9603337100";
const TEL_BUS = "+9603337253";
const hhmm = ts => ts ? new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "";

export default function FlightRow({ f, type, userId, mySet, refreshMy }) {
  const [firsts, setFirsts] = useState({}); // {SS:{ts,userId}, BUS:{...}, FP:{...}, LP:{...}}
  const [psm, setPsm] = useState("");
  const [loadingPSM, setLoadingPSM] = useState(false);
  const [notes, setNotes] = useState([]);   // recent notes (optional view)
  const inMy = mySet.has(`${type}|${f.flightNo}|${f.scheduled}`);

  useEffect(() => {
    let alive = true;
    (async ()=>{
      try {
        const r = await getFlightLog(type, f.flightNo, f.scheduled);
        if (alive && r?.ok) setFirsts(r.actions || {});
      } catch {}
      try {
        const ns = await listPSM(type, f.flightNo, f.scheduled);
        if (alive) setNotes(ns || []);
      } catch {}
    })();
    return () => { alive = false; };
  }, [type, f.flightNo, f.scheduled]);

  const logAndMaybeCall = async (action, shouldDial) => {
    try {
      await postLog({
        userId: userId || "anon",
        flightNo: f.flightNo,
        scheduled: f.scheduled,
        estimated: f.estimated,
        action, type
      });
      if (!firsts[action]) {
        setFirsts(prev => ({ ...prev, [action]: { ts: new Date().toISOString(), userId } }));
      }
      if (shouldDial) {
        window.location.href = `tel:${action === "SS" ? TEL_SS : TEL_BUS}`;
      }
    } catch {}
  };

  const toggleMy = async () => {
    try {
      if (inMy) await delMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
      else await addMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
      refreshMy && refreshMy();
    } catch {}
  };

  const sendPSM = async () => {
    if (!psm.trim()) return;
    setLoadingPSM(true);
    try {
      await postPSM({ userId: userId || "anon", type, flightNo: f.flightNo, scheduled: f.scheduled, text: psm.trim() });
      setPsm("");
      // refresh local notes list
      const ns = await listPSM(type, f.flightNo, f.scheduled);
      setNotes(ns || []);
    } catch {}
    setLoadingPSM(false);
  };

  return (
    <tr className={f.tomorrow ? "is-tomorrow" : ""}>
      <td>
        <span className={`badge ${f.category==='domestic'?'dom':'int'}`}>
          {(f.terminal || "").toUpperCase() || (f.category==='domestic' ? 'DOM':'INT')}
        </span>
      </td>
      <td>
        <div className="flightNo">{f.flightNo || "-"}</div>
        {f.tomorrow && <div className="subtle">(<b>tomorrow</b>)</div>}
      </td>
      <td>
        <div>{f.origin_or_destination || "-"}</div>
        <div className="subtle">Status: {f.status || "-"}</div>
      </td>
      <td>{f.scheduled || "-"}</td>
      <td>{f.estimated || "-"}</td>
      <td>{(f.status || "-").replace(/\s+/g,' ')}</td>

      <td className="actions">
        <div className="row">
          <button className="pill yellow" onClick={()=>logAndMaybeCall("SS", true)}>SS</button>
          <span className="mini">{firsts.SS ? `${hhmm(firsts.SS.ts)} · ${firsts.SS.userId||''}` : ""}</span>
        </div>
        <div className="row">
          <button className="pill yellow" onClick={()=>logAndMaybeCall("BUS", true)}>BUS</button>
          <span className="mini">{firsts.BUS ? `${hhmm(firsts.BUS.ts)} · ${firsts.BUS.userId||''}` : ""}</span>
        </div>
        {type === "dep" && (
          <>
            <div className="row">
              <button className="pill" onClick={()=>logAndMaybeCall("FP", false)}>FP</button>
              <span className="mini">{firsts.FP ? `${hhmm(firsts.FP.ts)} · ${firsts.FP.userId||''}` : ""}</span>
            </div>
            <div className="row">
              <button className="pill" onClick={()=>logAndMaybeCall("LP", false)}>LP</button>
              <span className="mini">{firsts.LP ? `${hhmm(firsts.LP.ts)} · ${firsts.LP.userId||''}` : ""}</span>
            </div>
          </>
        )}
        <div className="row">
          <button className="pill" onClick={toggleMy}>{inMy ? "✓ My":"＋ My"}</button>
        </div>

        {/* PSM inline */}
        <div className="row" style={{flexDirection:'column', alignItems:'stretch', gap:6}}>
          <input value={psm} onChange={(e)=>setPsm(e.target.value)} placeholder="PSM…" />
          <button className="pill" onClick={sendPSM} disabled={loadingPSM}>{loadingPSM ? "Sending…" : "Send PSM"}</button>
          {/* (Optional) show most recent note quickly */}
          {notes?.[0]?.text && <div className="mini">Last PSM: {notes[0].text}</div>}
        </div>
      </td>
    </tr>
  );
}
