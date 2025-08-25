import React, { useEffect, useMemo, useState } from "react";
import { addMy, delMy, listPSM, postAction, postPSM } from "../utils/api";

const telSS = "+9603337100";
const telBUS = "+9603337253";

export default function FlightRow({ f, type, userId, refresh }) {
  const [psm, setPsm] = useState("");
  const [psmList, setPsmList] = useState([]);
  const [first, setFirst] = useState(f.first || null);
  const [inMine, setInMine] = useState(false);

  useEffect(() => {
    // preload PSM messages for this flight
    listPSM(type, f.flightNo, f.scheduled).then(setPsmList).catch(()=>{});
  }, [type, f.flightNo, f.scheduled]);

  // UI helpers
  const info = useMemo(() => {
    return (
      <>
        <div className="termFlight">
          {(f.terminal ? `[${f.terminal}] ` : '')}{f.flightNo}
        </div>
        <div className="origin">{f.origin_or_destination}</div>
        {f.dayTag === "tomorrow" ? <div className="badge gray" style={{marginTop:6}}>Tomorrow</div> : null}
        <div className="badge gray" style={{marginTop:6}}>{f.category}</div>
      </>
    );
  }, [f]);

  const doMyToggle = async () => {
    if (!inMine) {
      await addMy({ type, flightNo: f.flightNo, scheduled: f.scheduled });
      setInMine(true);
    } else {
      await delMy({ type, flightNo: f.flightNo, scheduled: f.scheduled });
      setInMine(false);
    }
    refresh && refresh();
  };

  const logAction = async (action, tel) => {
    // call phone for SS/BUS
    if (tel) window.location.href = `tel:${tel}`;
    const { ok } = await postAction({ type, flightNo: f.flightNo, scheduled: f.scheduled, action });
    if (ok) {
      // show first-click immediately if this is the first one
      if (!first || !first[action]) {
        const ts = new Date().toISOString();
        const who = userId;
        setFirst({
          ...(first||{}),
          [action]: { userId: who, ts }
        });
      }
    }
  };

  const sendPSM = async () => {
    if (!psm.trim()) return;
    await postPSM({ type, flightNo: f.flightNo, scheduled: f.scheduled, text: psm.trim() });
    setPsm("");
    const list = await listPSM(type, f.flightNo, f.scheduled);
    setPsmList(list);
  };

  const firstLine = (k, label) => {
    const rec = first && first[k];
    return (
      <div className="small">
        {label}: {rec ? `${new Date(rec.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} by ${rec.userId}` : '—'}
      </div>
    );
  };

  return (
    <tr>
      <td>{info}</td>
      <td>{f.scheduled}</td>
      <td>{f.estimated || "—"}</td>
      <td className="small">{f.status || "—"}</td>
      <td>
        <div className="actions">
          {type === "arr" ? (
            <>
              <button className="pill yellow" onClick={()=>logAction('ss', telSS)}>SS</button>
              <button className="pill yellow" onClick={()=>logAction('bus', telBUS)}>BUS</button>
            </>
          ) : (
            <>
              <button className="pill yellow" onClick={()=>logAction('ss', telSS)}>SS</button>
              <button className="pill yellow" onClick={()=>logAction('bus', telBUS)}>BUS</button>
              <button className="pill blue" onClick={()=>logAction('fp')}>FP</button>
              <button className="pill blue" onClick={()=>logAction('lp')}>LP</button>
            </>
          )}
          <button className="pill" onClick={doMyToggle}>{inMine ? '− My' : '+ My'}</button>
        </div>

        {/* First-clicks (always visible) */}
        <div style={{marginTop:6}}>
          {type === "arr" ? (
            <>
              {firstLine('ss','First SS')}
              {firstLine('bus','First BUS')}
            </>
          ) : (
            <>
              {firstLine('ss','First SS')}
              {firstLine('bus','First BUS')}
              {firstLine('fp','First FP')}
              {firstLine('lp','First LP')}
            </>
          )}
        </div>

        {/* PSM input + list */}
        <div className="psmPane">
          <input
            value={psm}
            onChange={e=>setPsm(e.target.value)}
            placeholder="PSM note for this flight…"
          />
          <button onClick={sendPSM}>Send</button>
        </div>
        {psmList.length ? (
          <div className="small" style={{marginTop:8}}>
            {psmList.map((p,idx)=>(
              <div key={idx} style={{marginBottom:4}}>
                <span className="badge gray" style={{marginRight:6}}>{p.userId}</span>
                {p.text} <span style={{opacity:.6}}>· {new Date(p.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
              </div>
            ))}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
