import { useState } from "react";
import { useSettings, Head } from "./common.jsx";
import { Field, Loading, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

export default function Settings() {
  const { data, loading } = useSettings();
  const [f, setF] = useState({});
  const [run, busy] = useAction();
  if (loading) return <Loading />;
  const v = (k) => (f[k] !== undefined ? f[k] : data[k] ?? "");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <div style={{ maxWidth: 640 }}>
      <Head title="Settings" sub="Women see these on their hub page straight after registering." />
      <Field label="Daily prayer time (Nigeria time)" id="st"><input id="st" className="input" type="time" value={v("dailyTime")} onChange={set("dailyTime")} /></Field>
      <Field label="Start date" optional id="sd"><input id="sd" className="input" type="date" value={v("startDate")} onChange={set("startDate")} /></Field>
      <Field label="Zoom link" optional id="sz"><input id="sz" className="input" value={v("zoomLink")} onChange={set("zoomLink")} placeholder="https://zoom.us/j/…" /></Field>
      <Field label="Telegram community link" optional id="sg"><input id="sg" className="input" value={v("telegramLink")} onChange={set("telegramLink")} placeholder="https://t.me/…" /></Field>

      <details className="more" style={{ margin: "8px 0 28px" }}>
        <summary>More settings</summary>
        <div style={{ marginTop: 16 }}>
          <Field label="Members per new hub" id="sc"><input id="sc" className="input" type="number" min="1" max="200" value={v("defaultHubCapacity")} onChange={set("defaultHubCapacity")} /></Field>
          <div className="row2">
            <Field label="Contact email" optional id="ce"><input id="ce" className="input" value={v("contactEmail")} onChange={set("contactEmail")} /></Field>
            <Field label="Contact phone" optional id="cp"><input id="cp" className="input" value={v("contactPhone")} onChange={set("contactPhone")} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={v("registrationOpen") === false} onChange={(e) => setF((x) => ({ ...x, registrationOpen: !e.target.checked }))} /><span>Pause new registrations</span></label>
        </div>
      </details>

      <button className="btn" disabled={busy || !Object.keys(f).length} onClick={async () => { await run(() => api.admin("saveSettings", { fields: f }), "Settings saved."); setF({}); }}>Save settings</button>
    </div>
  );
}
