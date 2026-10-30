import { useState } from "react";
import { useSettings, PageTitle } from "./common.jsx";
import { Field, Loading, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

const TOGGLES = [
  ["registrationOpen", "Registration is open", "Turn off to pause new registrations on the website."],
  ["leaderCountsTowardCapacity", "Hub leader counts toward capacity", "Off: a hub holds its capacity in participants plus the leader."],
  ["allowLeaderlessAssignment", "Place women in hubs without a leader", "Off: automatic allocation skips hubs with no active leader."],
  ["coordinatorsCanCreateHubs", "State coordinators can create hubs", ""],
  ["coordinatorsCanAssignLeaders", "State coordinators can assign hub leaders", ""],
];

export default function Settings() {
  const { data: s, loading } = useSettings();
  const [f, setF] = useState({});
  const [run, busy] = useAction();
  if (loading) return <Loading />;
  const val = (k) => (f[k] !== undefined ? f[k] : s[k] ?? "");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const dirty = Object.keys(f).length > 0;

  return (
    <>
      <PageTitle title="Settings" sub="Programme rules and links. Changes apply immediately, with no developer needed.">
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={async () => { await run(() => api.admin("saveSettings", { fields: f }), "Settings saved."); setF({}); }}>Save settings</button>
      </PageTitle>
      <div className="cols-2">
        <div className="card">
          <h2>Registration and hubs</h2>
          {TOGGLES.map(([k, label, hint]) => (
            <label className="check" key={k}>
              <input type="checkbox" checked={Boolean(val(k))} onChange={set(k)} />
              <span><strong>{label}</strong>{hint && <><br /><span className="small muted">{hint}</span></>}</span>
            </label>
          ))}
          <div className="grid-2" style={{ marginTop: 10 }}>
            <Field label="Registration target" id="st"><input id="st" type="number" className="input" value={val("registrationTarget")} onChange={set("registrationTarget")} /></Field>
            <Field label="Default hub capacity" id="sc"><input id="sc" type="number" className="input" value={val("defaultHubCapacity")} onChange={set("defaultHubCapacity")} /></Field>
            <Field label="Flag as inactive after (days)" id="si" hint="Used on the follow-ups page."><input id="si" type="number" className="input" value={val("inactiveAfterDays")} onChange={set("inactiveAfterDays")} /></Field>
          </div>
        </div>
        <div className="card">
          <h2>Community links and contact</h2>
          <Field label="Central Telegram community link" id="tg" hint="Shown to every participant unless her hub has its own."><input id="tg" className="input" value={val("telegramLink")} onChange={set("telegramLink")} /></Field>
          <div className="grid-2">
            <Field label="Contact email" id="ce"><input id="ce" className="input" value={val("contactEmail")} onChange={set("contactEmail")} /></Field>
            <Field label="Contact phone" id="cp"><input id="cp" className="input" value={val("contactPhone")} onChange={set("contactPhone")} /></Field>
            <Field label="Instagram" optional id="ig"><input id="ig" className="input" value={val("instagram")} onChange={set("instagram")} /></Field>
            <Field label="Facebook" optional id="fb"><input id="fb" className="input" value={val("facebook")} onChange={set("facebook")} /></Field>
            <Field label="X" optional id="xx"><input id="xx" className="input" value={val("x")} onChange={set("x")} /></Field>
            <Field label="YouTube" optional id="yt"><input id="yt" className="input" value={val("youtube")} onChange={set("youtube")} /></Field>
          </div>
          <p className="small muted">Programme dates, the daily prayer time and Zoom details are on the prayer schedule page.</p>
        </div>
      </div>
    </>
  );
}
