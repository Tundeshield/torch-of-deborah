import { useState } from "react";
import { useScope, useTeam, useHubs, StateSelect, Head } from "./common.jsx";
import { stateName } from "../../data/states.js";
import { ROLES } from "../../lib/shared.js";
import { Empty, ErrorText, Field, Loading, Panel, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

export default function Team() {
  const s = useScope();
  const team = useTeam();
  const hubs = useHubs();
  const [open, setOpen] = useState(null);
  const hubName = Object.fromEntries(hubs.data.map((h) => [h.id, h.name]));
  const rows = [...team.data].sort((a, b) => Object.keys(ROLES).indexOf(a.role) - Object.keys(ROLES).indexOf(b.role) || a.name.localeCompare(b.name));
  const add = () => setOpen({ role: s.coordinator ? "leader" : "coordinator", stateCode: s.coordinator ? s.stateCode : "" });

  return (
    <>
      <Head title="Team" sub="People who can sign in. They use “Sign in with Google” with the email you add here.">
        <button className="btn sm" onClick={add}>Add person</button>
      </Head>
      <ErrorText error={team.error} />
      {team.loading ? <Loading /> : rows.length === 0 ? <Empty title="No one yet" action={<button className="btn" onClick={add}>Add person</button>} /> : (
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th className="hide-sm">State</th><th className="hide-sm">Leads</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.email} className="click" onClick={() => setOpen(u)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(u)}>
                  <td>{u.name}<div className="sub">{u.email}</div></td>
                  <td>{ROLES[u.role]}{!u.signedInBefore && <div className="sub">Hasn't signed in yet</div>}</td>
                  <td className="hide-sm">{u.stateCode ? stateName(u.stateCode) : "—"}</td>
                  <td className="hide-sm">{(u.hubIds || []).map((h) => hubName[h]).filter(Boolean).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <Person u={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Person({ u, onClose }) {
  const s = useScope();
  const isNew = !u.email;
  const [f, setF] = useState({ name: u.name || "", email: u.email || "", phone: u.phone || "", role: u.role, stateCode: u.stateCode || "" });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const roles = s.admin ? Object.keys(ROLES) : ["leader"];
  const self = u.email === s.profile.email;

  async function save() {
    await run(() => api.admin("saveMember", { ...f, isNew }), isNew ? `${f.name} added. They can sign in now.` : "Saved.");
    onClose();
  }
  async function remove() {
    await run(() => api.admin("removeMember", { email: u.email }), `${u.name} removed from the team.`);
    onClose();
  }

  return (
    <Panel title={isNew ? "Add person" : u.name} onClose={onClose} actions={<><button className="btn plain" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.name || !f.email || (f.role !== "admin" && !f.stateCode)} onClick={save}>{isNew ? "Add" : "Save"}</button></>}>
      <Field label="Name" id="tn"><input id="tn" className="input" value={f.name} onChange={set("name")} /></Field>
      <Field label="Google email" id="te" hint={isNew ? "The Gmail (or Google) account they will sign in with." : ""}><input id="te" className="input" type="email" value={f.email} onChange={set("email")} disabled={!isNew} /></Field>
      <Field label="WhatsApp number" optional id="tp" hint="Shown to the women in their hub."><input id="tp" className="input" type="tel" value={f.phone} onChange={set("phone")} /></Field>
      {roles.length > 1 && (
        <div className="field">
          <span className="label">Role</span>
          <div className="choices">
            {roles.map((r) => (
              <label className="choice" key={r}>
                <input type="radio" name="role" checked={f.role === r} onChange={() => setF((x) => ({ ...x, role: r }))} disabled={self} />
                <span>{ROLES[r]}<span className="muted small"> — {{ admin: "everything, all states", coordinator: "hubs and people in one state", leader: "their own hub" }[r]}</span></span>
              </label>
            ))}
          </div>
        </div>
      )}
      {f.role !== "admin" && s.admin && <Field label="State" id="ts"><StateSelect id="ts" required value={f.stateCode} onChange={set("stateCode")} /></Field>}
      {f.role === "leader" && <p className="small muted">Then choose them as the leader of a hub on the Hubs page.</p>}
      {!isNew && !self && (
        <details className="more" style={{ marginTop: 24 }}>
          <summary>More</summary>
          <p className="small muted">They will no longer be able to sign in, and their hubs will need a new leader.</p>
          <button className="btn danger sm" disabled={busy} onClick={remove}>Remove from team</button>
        </details>
      )}
    </Panel>
  );
}
