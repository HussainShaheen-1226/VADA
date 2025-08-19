import React, { useEffect, useState } from "react";
import { addMyFlight, delMyFlight, getFlightLog, postLog } from "../utils/api";

const telSS  = "+9603337100";
const telBUS = "+9603337253";
const hhmm = ts => ts ? new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "";

export default function FlightRow({ f, type, userId, mySet, refreshMy }) {
  const [firsts, setFirsts] = useState({}); // {SS:{ts,userId}, BUS:{...}, FP:{...}, LP:{...}}
  const inMy = mySet.has(`${type}|${f.flightNo}|${f.scheduled}`);

  useEffect(() => {
    let alive = true;
    (async ()=>{
      try {
        const r = await getFlightLog(type, f.flightNo, f.scheduled);
        if (alive && r?.ok) setFirsts(r.actions || {});
      } catch {}
    })();
    return () => { alive = false; };
  }, [type, f.flightNo, f.scheduled]);

  const doLog = async (action, dial) => {
    try {
      await postLog({
        userId: userId || "anon",
        flightNo: f.flightNo,
        scheduled: f.scheduled,
        estimated: f.estimated,
        action,
        type
      });
      if (!firsts[action]) {
        setFirsts(prev => ({ ...prev, [action]: { ts: new Date().toISOString(), userId } }));
      }
      if (dial) {
        window.location.href = `tel:${action === "SS" ? telSS : telBUS}`;
      }
    } catch (e) {
      console.warn("log failed", e);
    }
  };

  const toggleMy = async () => {
    try {
      if (inMy) {
        await delMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
      } else {
        await addMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
      }
      refreshMy && refreshMy();
    } catch (e) {
      console.warn("my-flight toggle failed", e);
    }
  };

  return (
    <tr className={f.tomorrow ? "is-tomorrow" : ""}>
      <td>
        <span className={`badge ${f.category === 'domestic' ? 'dom' : 'int'}`}>
          {(f.terminal || "").toUpperCase() || (f.category === 'domestic' ? "DOM" : "INT")}
        </span>
      </td>

      <td>
        <div className="flightNo">{f.flightNo || "-"}</div>
        {f.tomorrow && <div className="subtle">(<b>tomorrow</b>)</div>}
      </td>

      <td>
        <div>{f.origin_or_destination || "-"}</div>
        <div className="subtle">Term: {(f.terminal || "-")}</div>
      </td>

      <td>{f.scheduled || "-"}</td>
      <td>{f.estimated || "-"}</td>
      <td>{f.status || "-"}</td>

      <td className="actions">
        <div className="actionRow">
          <button className="pill yellow" onClick={() => doLog("SS", true)}>SS</button>
          <span className="mini">
            {firsts.SS ? `${hhmm(firsts.SS.ts)} · ${firsts.SS.userId || ''}` : ""}
          </span>
        </div>
        <div className="actionRow">
          <button className="pill yellow" onClick={() => doLog("BUS", true)}>BUS</button>
          <span className="mini">
            {firsts.BUS ? `${hhmm(firsts.BUS.ts)} · ${firsts.BUS.userId || ''}` : ""}
          </span>
        </div>

        {type === "dep" && (
          <>
            <div className="actionRow">
              <button className="pill" onClick={() => doLog("FP", false)}>FP</button>
              <span className="mini">
                {firsts.FP ? `${hhmm(firsts.FP.ts)} · ${firsts.FP.userId || ''}` : ""}
              </span>
            </div>
            <div className="actionRow">
              <button className="pill" onClick={() => doLog("LP", false)}>LP</button>
              <span className="mini">
                {firsts.LP ? `${hhmm(firsts.LP.ts)} · ${firsts.LP.userId || ''}` : ""}
              </span>
            </div>
          </>
        )}

        <div className="actionRow">
          <button className="pill outline" onClick={toggleMy}>{inMy ? "✓ My" : "+ My"}</button>
        </div>
      </td>
    </tr>
  );
}
