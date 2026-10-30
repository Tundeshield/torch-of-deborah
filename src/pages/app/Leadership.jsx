import { useMemo, useState } from "react";
import { useScope, useStaff, useHubs, PageTitle, StateSelect } from "./common.jsx";
import { stateName } from "../../data/states.js";
import { DEPARTMENTS, ROLES, waLink } from "../../lib/shared.js";
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useAction, useToast } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { copyText } from "../../lib/format.js";

function rolesFor(s) {
  if (s.profile.role === "superadmin") return ["superadmin", "admin", "coordinator", "leader", "volunteer"];
  if (s.national) return ["admin", "coordinator", "leader", "volunteer"];
  return ["leader", "volunteer"];
}

export default function Leadership() {
  const s = useScope();
  const staff = useStaff();
  const hubs = useHubs();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [link, setLink] = useState(null);
  const hubName = useMemo(() => Object.fromEntries(hubs.data.map((h) => [h.id, h.name])), [hubs.data]);

  const rows = staff.data
    .filter((u) => !role || u.role === role)
    .filter((u) => !stateFilter || u.stateCode === stateFilter)
    .filter((u) => !q || `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name));

  return (
    <>
      <PageTitle title={s.national ? "Leadership" : "Hub leaders"} sub="Everyone with a dashboard account, their role and responsibilities.">
        <button className="btn btn-primary" onClick={() => setModal({})}>Invite a leader</button>
      </PageTitle>
      <div className="toolbar">
        <div className="grow"><label htmlFor="lq">Search</label><input id="lq" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" /></div>
        <div><label htmlFor="lr">Role</label><select id="lr" className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="">Any role</option>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {s.national && <div><label>State</label><StateSelect value={stateFilter} onChange={setStateFilter} /></div>}
      </div>
      <ErrorBox error={staff.error} />
      {staff.loading ? <Loading /> : rows.length === 0 ? <div className="card"><Empty title="No leaders yet" action={<button className="btn btn-primary" onClick={() => setModal({})}>Invite a leader</button>} /></div> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Name</th><th>Role</th><th>State</th><th>Hubs led</th><th>Contact</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong>{u.department && <div className="sub">{u.department}</div>}</td>
                  <td>{ROLES[u.role]}</td>
                  <td>{u.stateCode ? stateName(u.stateCode) : "National"}</td>
                  <td>{(u.hubIds || []).map((h) => hubName[h] || "…").join(", ") || "—"}</td>
                  <td>{u.email}<div className="sub">{u.phone && <a href={waLink(u.phone)} target="_blank" rel="noopener">{u.phone}</a>}</div></td>
                  <td><Badge value={u.active === false ? "inactive" : "active"} label={u.active === false ? "Inactive" : "Active"} /></td>
                  <td><button className="btn btn-quiet btn-sm" onClick={() => setModal(u)}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <UserModal user={modal} onClose={() => setModal(null)} onLink={setLink} />}
      {link && <LinkModal {...link} onClose={() => setLink(null)} />}
    </>
  );
}

function UserModal({ user, onClose, onLink }) {
  const s = useScope();
  const isNew = !user.id;
  const [f, setF] = useState({
    name: user.name || "", email: user.email || "", phone: user.phone || "", role: user.role || (s.coordinator ? "leader" : "leader"),
    stateCode: user.stateCode || (s.coordinator ? s.stateCode : ""), department: user.department || "", active: user.active !== false,
  });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const roles = rolesFor(s);
  const self = user.id === s.profile.uid;
  const needsState = ["coordinator", "leader"].includes(f.role);

  async function save() {
    if (isNew) {
      const r = await run(() => api.admin("inviteUser", f), "Invitation created.");
      onLink({ title: `Invitation for ${f.name}`, link: r.link, phone: f.phone, text: `You have been invited to serve with The Torch of Deborah. Set your password here to open your dashboard: ${r.link}` });
    } else {
      const body = { uid: user.id, name: f.name, phone: f.phone, department: f.department || null };
      if (!self) Object.assign(body, { role: f.role, stateCode: f.stateCode || null, active: f.active });
      await run(() => api.admin("updateUser", body), "Account saved.");
    }
    onClose();
  }

  async function reset() {
    const r = await run(() => api.admin("resetAccess", { uid: user.id }), "Reset link created.");
    onLink({ title: `Password reset for ${user.name}`, link: r.link, phone: user.phone, text: `Use this link to set a new password for your Torch of Deborah dashboard: ${r.link}` });
    onClose();
  }

  return (
    <Modal title={isNew ? "Invite a leader" : user.name} onClose={onClose} footer={<>
      {!isNew && <button className="btn btn-quiet" style={{ marginRight: "auto" }} disabled={busy || user.active === false} onClick={reset}>Reset access</button>}
      <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !f.name || !f.email || (needsState && !f.stateCode)} onClick={save}>{isNew ? "Send invitation" : "Save account"}</button>
    </>}>
      <Field label="Full name" id="un"><input id="un" className="input" value={f.name} onChange={set("name")} /></Field>
      <div className="grid-2">
        <Field label="Email" id="ue" hint={isNew ? "They sign in with this email." : ""}><input id="ue" className="input" type="email" value={f.email} onChange={set("email")} disabled={!isNew} /></Field>
        <Field label="Phone / WhatsApp" id="up" hint="Shown to the women in their hub."><input id="up" className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Role" id="ur">
          <select id="ur" className="input" value={f.role} onChange={set("role")} disabled={self}>
            {roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
          </select>
        </Field>
        <Field label="State" optional={!needsState} id="us">
          <StateSelect id="us" allowAll={!needsState} allLabel="National (no state)" value={f.stateCode} onChange={set("stateCode")} />
        </Field>
        {f.role === "volunteer" && (
          <Field label="Department" id="ud">
            <select id="ud" className="input" value={f.department} onChange={set("department")}><option value="">Choose</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>
          </Field>
        )}
      </div>
      {f.role === "leader" && <p className="small muted">After inviting, assign them to a hub from the prayer hubs page.</p>}
      {f.role === "coordinator" && <p className="small muted">A state has one coordinator. Appointing this person replaces the current coordinator for that state.</p>}
      {!isNew && !self && (
        <label className="check"><input type="checkbox" checked={f.active} onChange={set("active")} /> <span>Account active. Deactivating signs them out and removes them as leader of their hubs.</span></label>
      )}
    </Modal>
  );
}

function LinkModal({ title, link, phone, text, onClose }) {
  const toast = useToast();
  return (
    <Modal title={title} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <p>We have emailed this link. You can also send it directly. It expires after a while; use “Reset access” to create a new one.</p>
      <div className="actions-row">
        <button className="btn btn-quiet btn-sm" onClick={async () => (await copyText(link)) && toast("Link copied")}>Copy link</button>
        {phone && <a className="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href={`${waLink(phone)}?text=${encodeURIComponent(text)}`}>Send on WhatsApp</a>}
      </div>
    </Modal>
  );
}
