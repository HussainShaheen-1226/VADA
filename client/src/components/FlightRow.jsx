// client/src/components/FlightRow.jsx
import React, { useMemo, useState } from "react";
import { postLog, addMyFlight, delMyFlight, listPSM, postPSM } from "../utils/api";

export default function FlightRow({ f, type, userId, mySet, refreshMy }) {
  const [note, setNote] = useState("");
  const [psmOpen, setPsmOpen] = useState(false);
  const key = `${type}|${f.flightNo}|${f.scheduled}`;
  const isMine = mySet?.has(key);

  const title = useMemo(() => {
    const head = f.flightNo || "-";
    const tail = [f.origin_or_destination, f.terminal ? `(${f.terminal})` : ""]
      .filter(Boolean)
      .join(" ");
    return { head, tail };
  }, [f]);

  async function logAndDial(action, tel) {
    // log first-click only is enforced server-side (UNIQUE)
    await postLog({
      userId,
      flightNo: f.flightNo,
      scheduled: f.scheduled,
      estimated: f.estimated || null,
      action,
      type,
    });
    if (tel) {
      // try to start a call (mobile)
      window.location.href = `tel:${tel}`;
    }
  }

  const toggleMine = async () => {
    if (isMine) {
      await delMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
    } else {
      await addMyFlight({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled });
    }
    refreshMy?.();
  };

  const submitPSM = async () => {
    if (!note.trim()) return;
    await postPSM({ userId, type, flightNo: f.flightNo, scheduled: f.scheduled, text: note.trim() });
    setNote("");
    setPsmOpen(false);
  };

  return (
    <>
      <tr>
        {/* MERGED COLUMN */}
        <td style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 700 }}>{title.head}</div>
          <div style={{ fontSize: ".9em", opacity: .85 }}>{title.tail || "-"}</div>
        </td>

        <td>{f.scheduled || "-"}</td>
        <td>{f.estimated || "-"}</td>
        <td>{f.status || "-"}</td>

        <td className="actions">
          <button className="pill yellow" onClick={() => logAndDial("SS", "+9603337100")}>SS</button>
          <button className="pill yellow" onClick={() => logAndDial("BUS", "+9603337253")}>BUS</button>

          {type === "dep" && (
            <>
              <button className="pill" onClick={() => logAndDial("FP")}>FP</button>
              <button className="pill" onClick={() => logAndDial("LP")}>LP</button>
            </>
          )}

          <button className={`pill ${isMine ? "blue" : ""}`} onClick={toggleMine}>
            {isMine ? "✓ My" : "+ My"}
          </button>

          <button className="pill" onClick={() => setPsmOpen(v => !v)}>PSM</button>
        </td>
      </tr>

      {/* Inline PSM row */}
      {psmOpen && (
        <tr className="psmRow">
          <td colSpan={5}>
            <div className="psmPane">
              <input
                maxLength={280}
                placeholder="PSM note to notify everyone who has this flight…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button className="pill" onClick={submitPSM}>Send</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
