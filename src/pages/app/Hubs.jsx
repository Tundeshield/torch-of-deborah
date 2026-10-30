import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useScope, useHubs, useStaff, useSettings, PageTitle, StateSelect } from "./common.jsx";
import { STATE_BY_CODE, stateName } from "../../data/states.js";
import { HUB_STATUSES, participantCapacity } from "../../lib/shared.js";
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

export default function Hubs() {
  const s = useScope();
  const [stateFilter, setStateFilter] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const hubs = useHubs(s.national ? stateFilter || undefined : undefined);
  const settings = useSettings().data;
  const canCreate = s.national || settings.coordinatorsCanCreateHubs;

  const rows = useMemo(() => hubs.data
    .filter((h) => (!status ? h.status !== "archived" : h.status === status))
    .filter((h) => (!q ? true : `${h.name} ${h.code} ${h.lga} ${h.leaderName || ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.stateCode.localeCompare(b.stateCode) || a.name.localeCompare(b.name)), [hubs.data, status, q]);

  const totals = rows.reduce((t, h) => {
    if (["active", "full"].includes(h.status)) { t.cap += participantCapacity(h, settings); t.occ += h.count || 0; }
    return t;
  }, { cap: 0, occ: 0 });

  return (
    <>
      <PageTitle title="Prayer hubs" sub={`${rows.length} hubs · ${totals.occ} of ${totals.cap} places filled`}>
        {canCreate && <button className="btn btn-primary" onClick={() => setEdit({ stateCode: s.coordinator ? s.stateCode : stateFilter || "", capacity: settings.defaultHubCapacity, status: "active" })}>Create a hub</button>}
      </PageTitle>
      <div className="toolbar">
        <div className="grow"><label htmlFor="hq">Search</label><input id="hq" className="input" placeholder="Hub, code, LGA or leader" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {s.national && <div><label>State</label><StateSelect value={stateFilter} onChange={setStateFilter} /></div>}
        <div>
          <label htmlFor="hs">Status</label>
          <select id="hs" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All except archived</option>
            {HUB_STATUSES.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <ErrorBox error={hubs.error} />
      {hubs.loading ? <Loading /> : rows.length === 0 ? (
        <div className="card"><Empty title="No prayer hubs yet" action={canCreate && <button className="btn btn-primary" onClick={() => setEdit({ stateCode: s.coordinator ? s.stateCode : stateFilter, capacity: settings.defaultHubCapacity, status: "active" })}>Create the first hub</button>}>Create hubs so registrations can be placed automatically.</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Hub</th><th>State / LGA</th><th>Leader</th><th className="num">Members</th><th>Group link</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((h) => {
                const cap = participantCapacity(h, settings);
                return (
                  <tr key={h.id}>
                    <td><strong>{h.name}</strong><div className="sub">{h.code}</div></td>
                    <td>{stateName(h.stateCode)}<div className="sub">{h.lga || "—"}</div></td>
                    <td>{h.leaderName || <Badge value="pending" label="No leader" />}<div className="sub">{h.leaderPhone}</div></td>
                    <td className="num"><Link to={`/app/participants?state=${h.stateCode}&hub=${h.id}`}>{h.count || 0} / {cap}</Link></td>
                    <td>{h.whatsappLink ? <Badge value="ok" label="WhatsApp set" tone="ok" /> : <Badge value="warn" label="Missing" tone="warn" />}</td>
                    <td><Badge value={h.status} label={h.status} /></td>
                    <td><button className="btn btn-quiet btn-sm" onClick={() => setEdit(h)}>Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <HubModal hub={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export function HubModal({ hub, onClose }) {
  const s = useScope();
  const settings = useSettings().data;
  const staff = useStaff();
  const [f, setF] = useState({
    id: hub.id, name: hub.name || "", stateCode: hub.stateCode || "", lga: hub.lga || "", capacity: hub.capacity || settings.defaultHubCapacity || 20,
    whatsappLink: hub.whatsappLink || "", telegramLink: hub.telegramLink || "", zoomLink: hub.zoomLink || "", status: hub.status || "active",
    notes: hub.notes || "", leaderUid: hub.leaderUid || "", allocateQueue: true,
  });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const canLeader = s.national || settings.coordinatorsCanAssignLeaders;
  const leaders = staff.data
    .filter((u) => u.active !== false && ["leader", "coordinator", "volunteer"].includes(u.role) && (u.stateCode === f.stateCode || u.uid === hub.leaderUid || u.id === hub.leaderUid))
    .sort((a, b) => a.name.localeCompare(b.name));
  const lgas = STATE_BY_CODE[f.stateCode]?.lgas || [];

  async function save() {
    const body = { ...f };
    if (!canLeader || (hub.id && (f.leaderUid || "") === (hub.leaderUid || ""))) delete body.leaderUid;
    else body.leaderUid = f.leaderUid || null;
    await run(() => api.admin("saveHub", body), (r) => (hub.id ? "Hub saved." : "Hub created.") + (r.allocated ? ` ${r.allocated} waiting participants placed.` : ""));
    onClose();
  }

  return (
    <Modal title={hub.id ? `Edit ${hub.name}` : "Create a prayer hub"} onClose={onClose} wide footer={<>
      <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !f.name || !f.stateCode} onClick={save}>{busy ? "Saving…" : hub.id ? "Save hub" : "Create hub"}</button>
    </>}>
      <div className="grid-2">
        <Field label="Hub name" id="hn" hint="For example: Ikeja Daughters of Zion"><input id="hn" className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="State" id="hst"><StateSelect id="hst" allowAll={false} value={f.stateCode} onChange={(v) => setF((x) => ({ ...x, stateCode: v, lga: "", leaderUid: "" }))} /></Field>
        <Field label={f.stateCode === "INTL" ? "Region or city" : "LGA or area"} optional id="hl">
          {lgas.length ? (
            <select id="hl" className="input" value={f.lga} onChange={set("lga")}><option value="">Whole state</option>{lgas.map((l) => <option key={l}>{l}</option>)}</select>
          ) : <input id="hl" className="input" value={f.lga} onChange={set("lga")} />}
        </Field>
        <Field label="Participant capacity" id="hc" hint={settings.leaderCountsTowardCapacity ? "The leader takes one of these places." : "The leader is in addition to this number."}>
          <input id="hc" className="input" type="number" min="1" max="200" value={f.capacity} onChange={set("capacity")} />
        </Field>
        <Field label="Hub leader" id="hld" hint={canLeader ? (leaders.length ? "Invite new leaders from the leadership page." : "No leaders in this state yet. Invite one from the leadership page.") : "Only national administrators assign leaders."}>
          <select id="hld" className="input" value={f.leaderUid} onChange={set("leaderUid")} disabled={!canLeader}>
            <option value="">No leader yet</option>
            {leaders.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </Field>
        <Field label="Status" id="hstat">
          <select id="hstat" className="input" value={f.status} onChange={set("status")}>
            {HUB_STATUSES.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="WhatsApp group invitation link" id="hw" hint="https://chat.whatsapp.com/…"><input id="hw" className="input" value={f.whatsappLink} onChange={set("whatsappLink")} /></Field>
      <div className="grid-2">
        <Field label="Telegram link" optional id="ht" hint="Leave empty to use the central community."><input id="ht" className="input" value={f.telegramLink} onChange={set("telegramLink")} /></Field>
        <Field label="Hub Zoom link" optional id="hz" hint="Leave empty to use the state or central meeting."><input id="hz" className="input" value={f.zoomLink} onChange={set("zoomLink")} /></Field>
      </div>
      <Field label="Notes" optional id="hno"><textarea id="hno" className="input" value={f.notes} onChange={set("notes")} /></Field>
      <label className="check"><input type="checkbox" checked={f.allocateQueue} onChange={set("allocateQueue")} /> <span>After saving, place women waiting in this state into hubs with space</span></label>
      {f.status === "active" && !f.leaderUid && !settings.allowLeaderlessAssignment && <div className="notice warn">New registrations are not placed in hubs without a leader.</div>}
    </Modal>
  );
}
