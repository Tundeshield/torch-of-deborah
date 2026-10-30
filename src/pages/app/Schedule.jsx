import { useMemo, useState } from "react";
import { collection, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveQuery } from "../../lib/hooks.js";
import { useScope, useSettings, useHubs, PageTitle, StateSelect } from "./common.jsx";
import { stateName } from "../../data/states.js";
import { addDays, formatInZone, formatTime12, nextMeeting, programmeEndDate, todayInZone } from "../../lib/shared.js";
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { fmtDay } from "../../lib/format.js";

export default function Schedule() {
  const s = useScope();
  const { data: settings, loading } = useSettings();
  const hubs = useHubs();
  const tz = settings.timezone || "Africa/Lagos";
  const today = todayInZone(tz);
  const [edit, setEdit] = useState(null);
  const items = useLiveQuery(() => query(collection(db, "meetings"), where("date", ">=", addDays(today, -7)), orderBy("date"), limit(300)), [today]);
  const hubName = useMemo(() => Object.fromEntries(hubs.data.map((h) => [h.id, h.name])), [hubs.data]);

  const visible = items.data.filter((m) => s.national || m.scope === "national" || (m.scope === "state" && m.stateCode === s.stateCode) || (m.scope === "hub" && (s.hubIds.includes(m.hubId) || m.stateCode === s.stateCode)));
  const canEdit = (m) => s.national || (m.scope === "state" && s.coordinator && m.stateCode === s.stateCode) || (m.scope === "hub" && (s.hubIds.includes(m.hubId) || (s.coordinator && m.stateCode === s.stateCode)));
  const next = nextMeeting(settings, visible.filter((m) => m.scope === "national" || !m.scope))[0];
  const canAdd = s.national || s.coordinator || s.hubIds.length > 0;

  if (loading) return <Loading />;
  return (
    <>
      <PageTitle title="Prayer schedule" sub="Daily prayer, prayer themes and special meetings.">
        {canAdd && <button className="btn btn-primary" onClick={() => setEdit({ kind: "theme", date: today, scope: s.national ? "national" : s.coordinator ? "state" : "hub" })}>Add to schedule</button>}
      </PageTitle>

      <div className="cols-2">
        <div className="card">
          <h2>Programme</h2>
          <dl className="kv" style={{ marginTop: 0 }}>
            <dt>Runs</dt><dd>{settings.startDate ? `${fmtDay(settings.startDate)} to ${fmtDay(programmeEndDate(settings))}` : "Start date not set"} ({settings.durationMonths} months)</dd>
            <dt>Daily prayer</dt><dd>{formatTime12(settings.dailyTime)} for {settings.durationMinutes} minutes ({tz})</dd>
            <dt>Central Zoom</dt><dd>{settings.zoomLink ? <a href={settings.zoomLink} target="_blank" rel="noopener">Open link</a> : "Not set"}</dd>
          </dl>
          {s.national && <ProgrammeForm settings={settings} />}
          {!s.national && <p className="small muted">The national team sets the programme dates, daily time and central Zoom link.</p>}
        </div>
        <div className="card">
          <h2>What participants see next</h2>
          {next ? (
            <>
              <p style={{ fontFamily: "var(--display)", fontSize: 26, margin: "0 0 4px", color: "var(--forest)" }}>{formatInZone(next.start, tz)}</p>
              <p className="muted" style={{ marginTop: 0 }}>{next.title}{next.theme ? ` — ${next.theme}` : ""}</p>
            </>
          ) : <p className="muted">No upcoming meeting. Set the programme start date and daily time.</p>}
          <p className="small muted">Participants see their hub's Zoom link first, then their state's, then the central link.</p>
        </div>
      </div>

      <h2 className="h3" style={{ marginTop: 32, color: "var(--forest)" }}>Prayer themes and special meetings</h2>
      <ErrorBox error={items.error} />
      {items.loading ? <Loading /> : visible.length === 0 ? <div className="card"><Empty title="Nothing scheduled yet">Add daily prayer themes or one-off meetings such as a vigil.</Empty></div> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Date</th><th>Type</th><th>Focus</th><th>For</th><th>Zoom</th><th /></tr></thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id} style={{ opacity: m.date < today ? 0.55 : 1 }}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDay(m.date)}{m.kind === "special" && <div className="sub">{formatTime12(m.time)}</div>}</td>
                  <td><Badge value={m.kind === "special" ? "scheduled" : "draft"} label={m.kind === "special" ? "Special meeting" : "Daily theme"} /></td>
                  <td><strong>{m.title}</strong>{m.theme && <div className="sub">{m.theme}</div>}</td>
                  <td>{m.scope === "state" ? stateName(m.stateCode) : m.scope === "hub" ? hubName[m.hubId] || "A hub" : "Everyone"}</td>
                  <td>{m.zoomLink ? "Own link" : "Default"}</td>
                  <td>{canEdit(m) && <button className="btn btn-quiet btn-sm" onClick={() => setEdit(m)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <MeetingModal m={edit} hubs={hubs.data} onClose={() => setEdit(null)} />}
    </>
  );
}

function ProgrammeForm({ settings }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({});
  const [run, busy] = useAction();
  const keys = ["startDate", "durationMonths", "dailyTime", "durationMinutes", "timezone", "zoomLink", "zoomMeetingId", "zoomPasscode", "prayerInstructions"];
  const val = (k) => (f[k] !== undefined ? f[k] : settings[k] ?? "");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  if (!open) return <button className="btn btn-quiet btn-sm" onClick={() => setOpen(true)}>Change programme and Zoom</button>;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="grid-2">
        <Field label="Start date" id="ps"><input id="ps" type="date" className="input" value={val("startDate")} onChange={set("startDate")} /></Field>
        <Field label="Duration (months)" id="pd"><input id="pd" type="number" min="1" max="24" className="input" value={val("durationMonths")} onChange={set("durationMonths")} /></Field>
        <Field label="Daily prayer time" id="pt"><input id="pt" type="time" className="input" value={val("dailyTime")} onChange={set("dailyTime")} /></Field>
        <Field label="Length (minutes)" id="pl"><input id="pl" type="number" min="10" max="600" className="input" value={val("durationMinutes")} onChange={set("durationMinutes")} /></Field>
        <Field label="Time zone" id="ptz" hint="Africa/Lagos is Nigeria time (WAT)."><input id="ptz" className="input" value={val("timezone")} onChange={set("timezone")} /></Field>
        <Field label="Central Zoom link" id="pz"><input id="pz" className="input" value={val("zoomLink")} onChange={set("zoomLink")} /></Field>
        <Field label="Zoom meeting ID" optional id="pzi"><input id="pzi" className="input" value={val("zoomMeetingId")} onChange={set("zoomMeetingId")} /></Field>
        <Field label="Zoom passcode" optional id="pzp"><input id="pzp" className="input" value={val("zoomPasscode")} onChange={set("zoomPasscode")} /></Field>
      </div>
      <Field label="Instructions for participants" id="pi"><textarea id="pi" className="input" value={val("prayerInstructions")} onChange={set("prayerInstructions")} /></Field>
      <div className="actions-row" style={{ marginTop: 0 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { const fields = Object.fromEntries(keys.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])); await run(() => api.admin("saveSettings", { fields }), "Programme saved. Participants see the change straight away."); setOpen(false); setF({}); }}>Save programme</button>
        <button className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function MeetingModal({ m, hubs, onClose }) {
  const s = useScope();
  const [f, setF] = useState({ id: m.id, kind: m.kind || "theme", date: m.date || "", time: m.time || "", title: m.title || "", theme: m.theme || "", notes: m.notes || "", zoomLink: m.zoomLink || "", durationMinutes: m.durationMinutes || 60, scope: m.scope || "national", stateCode: m.stateCode || (s.coordinator ? s.stateCode : ""), hubId: m.hubId || (s.hubIds[0] || "") });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const scopes = s.national ? ["national", "state", "hub"] : s.coordinator ? ["state", "hub"] : ["hub"];
  const hubOptions = hubs.filter((h) => s.national ? (!f.stateCode || h.stateCode === f.stateCode) : true);
  return (
    <Modal title={m.id ? "Edit schedule item" : "Add to schedule"} onClose={onClose} footer={<>
      {m.id && <button className="btn btn-quiet" style={{ marginRight: "auto" }} disabled={busy} onClick={async () => { await run(() => api.admin("deleteMeeting", { id: m.id }), "Removed."); onClose(); }}>Remove</button>}
      <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy} onClick={async () => { await run(() => api.admin("saveMeeting", f), "Schedule saved."); onClose(); }}>Save</button>
    </>}>
      <div className="field">
        <div className="choices">
          {[["theme", "Daily prayer theme"], ["special", "Special meeting"]].map(([k, l]) => (
            <label className="choice" key={k}><input type="radio" name="kind" checked={f.kind === k} onChange={() => setF((x) => ({ ...x, kind: k }))} /><span>{l}</span></label>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <Field label="Date" id="md"><input id="md" type="date" className="input" value={f.date} onChange={set("date")} /></Field>
        {f.kind === "special" ? (
          <Field label="Start time" id="mt"><input id="mt" type="time" className="input" value={f.time} onChange={set("time")} /></Field>
        ) : <div />}
      </div>
      <Field label={f.kind === "special" ? "Meeting title" : "Title"} id="mti" hint={f.kind === "special" ? "For example: Independence Day vigil" : "For example: Week 3 — Families"}><input id="mti" className="input" value={f.title} onChange={set("title")} /></Field>
      <Field label="Prayer focus" optional id="mth"><input id="mth" className="input" value={f.theme} onChange={set("theme")} /></Field>
      <Field label="Notes or scripture" optional id="mn"><textarea id="mn" className="input" value={f.notes} onChange={set("notes")} /></Field>
      <div className="grid-2">
        <Field label="Zoom link" optional id="mz" hint="Leave empty to use the usual link."><input id="mz" className="input" value={f.zoomLink} onChange={set("zoomLink")} /></Field>
        {f.kind === "special" && <Field label="Length (minutes)" id="mdu"><input id="mdu" type="number" className="input" value={f.durationMinutes} onChange={set("durationMinutes")} /></Field>}
        <Field label="Who is it for" id="msc">
          <select id="msc" className="input" value={f.scope} onChange={set("scope")}>
            {scopes.map((x) => <option key={x} value={x}>{{ national: "Everyone", state: "One state", hub: "One hub" }[x]}</option>)}
          </select>
        </Field>
        {f.scope === "state" && <Field label="State" id="mst"><StateSelect id="mst" allowAll={false} value={f.stateCode} onChange={set("stateCode")} /></Field>}
        {f.scope === "hub" && (
          <Field label="Hub" id="mh">
            <select id="mh" className="input" value={f.hubId} onChange={set("hubId")}><option value="">Choose a hub</option>{hubOptions.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
