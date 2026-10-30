import { useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveQuery } from "../../lib/hooks.js";
import { useScope, useHubs, useTeam, useSettings, StateSelect, Head } from "./common.jsx";
import { STATE_BY_CODE, stateName } from "../../data/states.js";
import { capacityOf, waLink } from "../../lib/shared.js";
import { Empty, ErrorText, Field, Loading, Panel, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

export default function Hubs() {
  const s = useScope();
  const [stateFilter, setStateFilter] = useState("");
  const [open, setOpen] = useState(null);
  const hubs = useHubs(s.admin ? stateFilter : undefined);
  const settings = useSettings().data;
  const newHub = () => setOpen({ stateCode: s.coordinator ? s.stateCode : stateFilter, capacity: settings.defaultHubCapacity, active: true });

  return (
    <>
      <Head title="Hubs" sub="Each hub is about 20 women with one leader and a WhatsApp group.">
        <button className="btn sm" onClick={newHub}>New hub</button>
      </Head>
      {s.admin && <div className="tools"><StateSelect value={stateFilter} onChange={setStateFilter} /></div>}
      <ErrorText error={hubs.error} />
      {hubs.loading ? <Loading /> : hubs.data.length === 0 ? (
        <Empty title="No hubs yet" action={<button className="btn" onClick={newHub}>Create the first hub</button>}>
          <p>New registrations are placed automatically into hubs that have a leader and space.</p>
        </Empty>
      ) : (
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Hub</th><th>Leader</th><th className="num">Members</th><th className="hide-sm">State</th></tr></thead>
            <tbody>
              {hubs.data.map((h) => (
                <tr key={h.id} className="click" onClick={() => setOpen(h)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(h)}>
                  <td>{h.name}{h.active === false && <> <span className="tag off">Off</span></>}{!h.whatsappLink && h.active !== false && <div className="sub">No WhatsApp link yet</div>}</td>
                  <td>{h.leaderName || <span className="tag">Needs a leader</span>}</td>
                  <td className="num">{h.count || 0} / {capacityOf(h, settings)}</td>
                  <td className="hide-sm">{stateName(h.stateCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <HubPanel hub={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function HubPanel({ hub, onClose }) {
  const s = useScope();
  const team = useTeam();
  const settings = useSettings().data;
  const [f, setF] = useState({ id: hub.id, name: hub.name || "", stateCode: hub.stateCode || "", lga: hub.lga || "", leaderEmail: hub.leaderEmail || "", whatsappLink: hub.whatsappLink || "", capacity: hub.capacity || settings.defaultHubCapacity, active: hub.active !== false });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const members = useLiveQuery(() => (hub.id ? query(collection(db, "participants"), where("hubId", "==", hub.id)) : null), [hub.id]);
  const leaders = team.data.filter((u) => u.stateCode === f.stateCode || u.email === hub.leaderEmail).sort((a, b) => a.name.localeCompare(b.name));
  const lgas = STATE_BY_CODE[f.stateCode]?.lgas || [];

  async function save() {
    await run(() => api.admin("saveHub", f), hub.id ? "Hub saved." : "Hub created.");
    onClose();
  }

  return (
    <Panel title={hub.id ? hub.name : "New hub"} onClose={onClose} actions={<><button className="btn plain" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.name || !f.stateCode} onClick={save}>{hub.id ? "Save" : "Create hub"}</button></>}>
      <Field label="Hub name" id="hn"><input id="hn" className="input" value={f.name} onChange={set("name")} placeholder="e.g. Ikeja Daughters of Zion" /></Field>
      {!s.coordinator && <Field label="State" id="hs"><StateSelect id="hs" required value={f.stateCode} onChange={(v) => setF((x) => ({ ...x, stateCode: v, lga: "", leaderEmail: "" }))} /></Field>}
      <Field label="Leader" id="hl" hint={f.stateCode && !leaders.length ? "Add a hub leader on the Team page first." : "Women are only placed in hubs that have a leader."}>
        <select id="hl" className="input" value={f.leaderEmail} onChange={set("leaderEmail")} disabled={!f.stateCode}>
          <option value="">No leader yet</option>
          {leaders.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="WhatsApp group link" id="hw" hint="In WhatsApp: group info → Invite via link → Copy."><input id="hw" className="input" value={f.whatsappLink} onChange={set("whatsappLink")} placeholder="https://chat.whatsapp.com/…" /></Field>

      <details className="more">
        <summary>More options</summary>
        <div style={{ marginTop: 16 }}>
          {lgas.length > 0 && (
            <Field label="Area (LGA)" optional id="ha" hint="Women from this LGA are placed here first.">
              <select id="ha" className="input" value={f.lga} onChange={set("lga")}><option value="">Whole state</option>{lgas.map((l) => <option key={l}>{l}</option>)}</select>
            </Field>
          )}
          <Field label="Number of members" id="hc"><input id="hc" className="input" type="number" min="1" max="200" value={f.capacity} onChange={set("capacity")} /></Field>
          <label className="check"><input type="checkbox" checked={!f.active} onChange={(e) => setF((x) => ({ ...x, active: !e.target.checked }))} /><span>Turn this hub off (no new members)</span></label>
        </div>
      </details>

      {hub.id && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Members ({members.data.length})</h3>
          {members.data.length === 0 ? <p className="muted small">No members yet.</p> : (
            <table className="table">
              <tbody>
                {members.data.sort((a, b) => a.fullName.localeCompare(b.fullName)).map((m) => (
                  <tr key={m.id}><td>{m.fullName}</td><td><a href={waLink(m.phone)} target="_blank" rel="noopener">{m.phone}</a></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Panel>
  );
}
