import { useEffect, useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useOnce } from "../../lib/hooks.js";
import { useScope, useHubs, useSettings, PageTitle, StateSelect } from "./common.jsx";
import { ATTENDANCE_STATUSES, addDays, todayInZone } from "../../lib/shared.js";
import { Empty, ErrorBox, Loading, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { fmtDay } from "../../lib/format.js";

export default function Attendance() {
  const s = useScope();
  const settings = useSettings().data;
  const tz = settings.timezone || "Africa/Lagos";
  const today = todayInZone(tz);
  const [stateFilter, setStateFilter] = useState("");
  const hubs = useHubs(s.national ? stateFilter || undefined : undefined);
  const myHubs = useMemo(() => hubs.data.filter((h) => h.status !== "archived").sort((a, b) => a.name.localeCompare(b.name)), [hubs.data]);
  const [hubId, setHubId] = useState("");
  const [date, setDate] = useState(today);
  useEffect(() => {
    if (!hubId && myHubs.length) setHubId(myHubs[0].id);
    if (hubId && myHubs.length && !myHubs.find((h) => h.id === hubId)) setHubId(myHubs[0].id);
  }, [myHubs, hubId]);

  const hub = myHubs.find((h) => h.id === hubId);
  const members = useOnce(() => (hubId ? query(collection(db, "participants"), where("hubId", "==", hubId)) : null), [hubId]);
  const existing = useOnce(() => (hubId ? query(collection(db, "attendance"), where("hubId", "==", hubId), where("date", "==", date)) : null), [hubId, date]);
  const history = useOnce(() => (hubId ? query(collection(db, "attendance"), where("hubId", "==", hubId), where("date", ">=", addDays(today, -13))) : null), [hubId, today]);

  const [marks, setMarks] = useState({});
  useEffect(() => {
    const m = {};
    for (const a of existing.data) if (a.source === "hub") m[a.participantId] = a.status;
    setMarks(m);
  }, [existing.data]);
  const selfReported = new Set(existing.data.filter((a) => a.source === "self").map((a) => a.participantId));
  const [run, busy] = useAction();

  const list = members.data.filter((p) => p.status === "assigned").sort((a, b) => a.fullName.localeCompare(b.fullName));
  const markAll = (st) => setMarks(Object.fromEntries(list.map((p) => [p.id, st])));

  async function save() {
    const entries = Object.entries(marks).map(([participantId, status]) => ({ participantId, status }));
    await run(() => api.admin("recordAttendance", { hubId, date, entries }), (r) => `Saved attendance for ${r.recorded} women.`);
    existing.reload();
    history.reload();
  }

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const perDay = Object.fromEntries(days.map((d) => [d, new Set()]));
  for (const a of history.data) if (a.status === "participated" && perDay[a.date]) perDay[a.date].add(a.participantId);

  return (
    <>
      <PageTitle title="Attendance" sub="Record who took part. This is for care and follow-up, not to penalise anyone who misses a meeting." />
      <div className="toolbar">
        {s.national && <div><label>State</label><StateSelect value={stateFilter} onChange={setStateFilter} /></div>}
        <div className="grow">
          <label htmlFor="ah">Prayer hub</label>
          <select id="ah" className="input" value={hubId} onChange={(e) => setHubId(e.target.value)}>
            {myHubs.length === 0 && <option value="">No hubs</option>}
            {myHubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div><label htmlFor="ad">Date</label><input id="ad" type="date" className="input" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <ErrorBox error={hubs.error || members.error || existing.error} />
      {!hub ? <div className="card"><Empty title="Choose a prayer hub" /></div> : (
        <div className="cols-3">
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{hub.name} · {fmtDay(date)}</h2>
              <div className="actions-row" style={{ marginTop: 0 }}>
                <button className="btn btn-quiet btn-sm" onClick={() => markAll("participated")}>Mark everyone participated</button>
                <button className="btn btn-quiet btn-sm" onClick={() => setMarks({})}>Clear</button>
              </div>
            </div>
            {members.loading ? <Loading /> : list.length === 0 ? <Empty title="No members in this hub yet" /> : (
              <table className="t">
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.fullName}</strong>{selfReported.has(p.id) && <div className="sub">Marked herself as prayed</div>}</td>
                      <td>
                        <div className="att-row" role="radiogroup" aria-label={`Attendance for ${p.fullName}`}>
                          {Object.entries(ATTENDANCE_STATUSES).map(([k, l]) => (
                            <button key={k} type="button" role="radio" aria-checked={marks[p.id] === k} className={`${marks[p.id] === k ? "on" : ""} ${k}`} onClick={() => setMarks((m) => ({ ...m, [p.id]: k }))}>{l}</button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {list.length > 0 && (
              <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
                <button className="btn btn-primary" disabled={busy || !Object.keys(marks).length} onClick={save}>{busy ? "Saving…" : "Save attendance"}</button>
                <span className="small muted">{Object.keys(marks).length} of {list.length} marked</span>
              </div>
            )}
          </div>
          <div className="card">
            <h2>Last 14 days</h2>
            {history.loading ? <Loading /> : (
              <table className="t">
                <tbody>
                  {days.slice().reverse().map((d) => (
                    <tr key={d}><td>{fmtDay(d)}</td><td className="num">{perDay[d].size} / {list.length}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="tiny muted">Includes women who marked their own prayer on their welcome page.</p>
          </div>
        </div>
      )}
    </>
  );
}
