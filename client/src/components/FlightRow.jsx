import React from "react";
import { postLog, addMyFlight, delMyFlight } from "../utils/api";

const TEL_SS = "+9603337100";
const TEL_BUS = "+9603337253";

export default function FlightRow({ f, type, userId, mySet, refreshMy, nowLT }) {
  // hide the marketing/header row that sometimes sneaks in
  if (/PASSENGER ARRIVALS/i.test(f.origin_or_destination)) return null;

  // "tomorrow after 00:00" tag for scheduled time
  const tomorrow = (() => {
    // if scheduled < 03:00, treat as next day visually (tweak threshold if needed)
    const [h, m] = (f.scheduled || "00:00").split(":").map(Number);
    return h < 3 ? " (tomorrow)" : "";
  })();

  const callAndLog = async (action, tel) => {
    try {
      await postLog({
        userId,
        flightNo: f.flightNo,
        scheduled: f.scheduled,
        estimated: f.estimated || null,
        action, // 'SS'|'BUS'|'FP'|'LP'
        type
      });
    } catch {}
    window.location.href = `tel:${tel}`;
  };

  const toggleMy = async () => {
    const key = `${type}|${f.flightNo}|${f.scheduled}`;
    if (mySet.has(key)) {
      await delMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
    } else {
      await addMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
    }
    refreshMy();
  };

  const key = `${type}|${f.flightNo}|${f.scheduled}`;
  const inMy = mySet.has(key);

  return (
    <tr>
      <td style={{width:90}}>
        <div style={{fontWeight:800}}>{f.flightNo}</div>
        <div className="badge">{(f.category || "").toUpperCase().startsWith("DOM") ? "DOM" : "INT"}</div>
      </td>
      <td>
        <div style={{fontWeight:700}}>{f.origin_or_destination}</div>
        <div style={{opacity:.7, fontSize:12}}>Term: {f.terminal || "-"}</div>
      </td>
      <td>{f.scheduled}{tomorrow}</td>
      <td>{f.estimated || "-"}</td>
      <td><span className="badge">{f.status || "-"}</span></td>
      <td className="actions">
        {type === "arr" || type === "dep" ? (
          <>
            <button className="btn btn-ss" onClick={() => callAndLog("SS", TEL_SS)}>SS</button>
            <button className="btn btn-bus" onClick={() => callAndLog("BUS", TEL_BUS)}>BUS</button>
          </>
        ) : null}
        {type === "dep" ? (
          <>
            <button className="btn btn-fp" onClick={() => postLog({ userId, flightNo: f.flightNo, scheduled: f.scheduled, estimated: f.estimated || null, action:"FP", type })}>FP</button>
            <button className="btn btn-lp" onClick={() => postLog({ userId, flightNo: f.flightNo, scheduled: f.scheduled, estimated: f.estimated || null, action:"LP", type })}>LP</button>
          </>
        ) : null}
        <button className="btn" onClick={toggleMy}>{inMy ? "− My" : "+ My"}</button>
      </td>
    </tr>
  );
}
