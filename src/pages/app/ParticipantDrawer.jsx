import { useState } from "react";
import { doc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveDoc, useOnce } from "../../lib/hooks.js";
import { useScope, useHubs, useSettings, StateSelect } from "./common.jsx";
import { STATE_BY_CODE, stateName } from "../../data/states.js";
import { CATEGORIES, FOLLOW_UP_STATUSES, JOIN_STATUSES, participantCapacity, waLink, normalizePhone, normalizeEmail } from "../../lib/shared.js";
import { Badge, Drawer, ErrorBox, Field, Loading, useAction } from "../../components/ui.jsx";
import { fmtDate, fmtDateTime, fmtDay } from "../../lib/format.js";
import { api } from "../../lib/api.js";
import { describeActivity } from "./Activity.jsx";

export default function ParticipantDrawer({ id, onClose, onChanged }) {
  const s = useScope();
  const { data: p, loading, error } = useLiveDoc(() => doc(db, "participants", id), [id]);
  const [run, busy] = useAction();
  const act = async (action, body, msg) => {
    const r = await run(() => api.admin(action, body), msg);
    onChanged?.();
    return r;
  };

  if (loading) return <Drawer title="Participant" onClose={onClose}><Loading /></Drawer>;
  if (error || !p) return <Drawer title="Participant" onClose={onClose}><ErrorBox error={error || { message: "Participant not found." }} /></Drawer>;

  const manage = s.canManageState(p.stateCode);
  const inactive = ["deactivated", "duplicate"].includes(p.status);

  return (
    <Drawer title={p.fullName} onClose={onClose}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Badge value={p.status} label={{ assigned: "Assigned", unassigned: "Waiting for a hub", deactivated: "Deactivated", duplicate: "Duplicate" }[p.status]} />
        {p.hubId && <Badge value={p.joinStatus} label={JOIN_STATUSES[p.joinStatus]} />}
        {p.followUp?.status && p.followUp.status !== "none" && <Badge value={p.followUp.status} label={FOLLOW_UP_STATUSES[p.followUp.status]} />}
      </div>

      <section>
        <h3>Contact and registration</h3>
        <dl className="kv" style={{ marginTop: 0 }}>
          <dt>WhatsApp</dt><dd><a href={`tel:${p.phone}`}>{p.phone}</a> · <a href={waLink(p.phone)} target="_blank" rel="noopener">Chat</a></dd>
          <dt>Email</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd>
          <dt>Location</dt><dd>{p.lga}, {stateName(p.stateCode)}{p.stateCode === "INTL" ? ` (${p.country})` : ""}</dd>
          <dt>Joining as</dt><dd>{p.category}</dd>
          <dt>Online meetings</dt><dd>{{ yes: "Yes", sometimes: "When she can", no: "No" }[p.onlineMeetings] || "—"}</dd>
          <dt>Will invite others</dt><dd>{p.inviteOthers ? "Yes" : "Not yet"}</dd>
          {p.church && <><dt>Church</dt><dd>{p.church}</dd></>}
          <dt>Registered</dt><dd>{fmtDateTime(p.createdAt)}</dd>
          <dt>Last prayed</dt><dd>{p.lastParticipation ? fmtDay(p.lastParticipation) : "Not reported yet"}</dd>
        </dl>
        {p.inspiration && <p className="small" style={{ marginBottom: 0 }}><strong>Inspired by:</strong> {p.inspiration}</p>}
        {p.notes && <p className="small" style={{ marginBottom: 0 }}><strong>Notes:</strong> {p.notes}</p>}
      </section>

      {p.reassignRequest?.open && (
        <section>
          <h3>Asked to change hub</h3>
          <p className="small" style={{ marginTop: 0 }}>“{p.reassignRequest.reason}” <span className="muted">— {fmtDate(p.reassignRequest.at)}</span></p>
          {manage && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => act("closeReassignRequest", { id: p.id }, "Request closed.")}>Close request without moving</button>}
        </section>
      )}

      {!inactive && <HubSection p={p} manage={manage} act={act} busy={busy} />}

      {p.hubId && !inactive && (
        <section>
          <h3>WhatsApp group</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Opening the invitation is not the same as joining. Mark her as joined once you see her in the group.</p>
          <div className="actions-row" style={{ marginTop: 0 }}>
            {["issued", "confirmed"].map((st) => (
              <button key={st} className={`btn btn-sm ${p.joinStatus === st ? "btn-primary" : "btn-quiet"}`} disabled={busy || p.joinStatus === st} onClick={() => act("setJoinStatus", { id: p.id, status: st }, "Group status updated.")}>
                {st === "confirmed" ? "Joined the group" : "Not in the group yet"}
              </button>
            ))}
          </div>
        </section>
      )}

      {!inactive && <FollowUpSection p={p} act={act} busy={busy} />}
      {manage && <EditSection p={p} act={act} busy={busy} />}
      {manage && <HistorySection p={p} scope={s} />}
      {manage && <DangerSection p={p} act={act} busy={busy} />}
    </Drawer>
  );
}

function HubSection({ p, manage, act, busy }) {
  const s = useScope();
  const settings = useSettings().data;
  const [newState, setNewState] = useState(p.stateCode);
  const hubs = useHubs(s.national ? newState : undefined);
  const [target, setTarget] = useState("auto");
  const [lga, setLga] = useState(p.lga);
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [needsOverride, setNeedsOverride] = useState(false);

  const options = hubs.data
    .filter((h) => h.stateCode === newState && h.id !== p.hubId && ["active", "full", "pending"].includes(h.status))
    .sort((a, b) => a.name.localeCompare(b.name));
  const changingState = newState !== p.stateCode;

  async function save() {
    try {
      await act("moveParticipant", {
        participantId: p.id,
        target: target === "queue" ? null : target,
        newStateCode: changingState ? newState : undefined,
        newLga: changingState || lga !== p.lga ? lga : undefined,
        reason,
        override,
      }, (r) => (r.assigned ? `Moved to ${r.hubName}. She has been emailed her new link.` : target === "queue" ? "Moved to the waiting queue." : "No hub with space and a leader. She is in the waiting queue."));
      setReason("");
      setNeedsOverride(false);
    } catch (e) {
      if (e.data?.needsOverride) setNeedsOverride(true);
    }
  }

  return (
    <section>
      <h3>Prayer hub</h3>
      {p.hubId ? (
        <p style={{ marginTop: 0 }}><strong>{p.hubName}</strong>{p.hubCode ? <span className="muted"> ({p.hubCode})</span> : ""}<br /><span className="small muted">Leader: {p.leaderName || "No leader assigned"} · since {fmtDate(p.assignedAt)}</span></p>
      ) : <p style={{ marginTop: 0 }} className="muted">Not in a hub yet. Waiting since {fmtDate(p.queuedAt || p.createdAt)}.</p>}

      {manage && (
        <div className="card" style={{ background: "#faf6ec" }}>
          {s.national && (
            <div className="grid-2">
              <Field label="State" id="mvst"><StateSelect id="mvst" allowAll={false} value={newState} onChange={(v) => { setNewState(v); setTarget("auto"); setLga(""); }} /></Field>
              <Field label={newState === "INTL" ? "City" : "LGA"} id="mvlga">
                {STATE_BY_CODE[newState]?.lgas.length ? (
                  <select id="mvlga" className="input" value={lga} onChange={(e) => setLga(e.target.value)}>
                    <option value="">Choose LGA</option>
                    {STATE_BY_CODE[newState].lgas.map((l) => <option key={l}>{l}</option>)}
                  </select>
                ) : <input id="mvlga" className="input" value={lga} onChange={(e) => setLga(e.target.value)} />}
              </Field>
            </div>
          )}
          <Field label={p.hubId ? "Move to" : "Assign to"} id="mvh">
            <select id="mvh" className="input" value={target} onChange={(e) => { setTarget(e.target.value); setNeedsOverride(false); }}>
              <option value="auto">Automatic — hub with the most space</option>
              {options.map((h) => {
                const cap = participantCapacity(h, settings);
                const full = (h.count || 0) >= cap;
                return <option key={h.id} value={h.id} disabled={full}>{h.name} — {h.count || 0}/{cap}{h.leaderUid ? "" : " · no leader"}{full ? " · full" : ""}</option>;
              })}
              {p.hubId && <option value="queue">Waiting queue (remove from hub)</option>}
            </select>
          </Field>
          <Field label="Reason" optional id="mvr"><input id="mvr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown to her in the email" /></Field>
          {needsOverride && (
            <label className="check"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> <span>Approve assignment to a hub without an active leader</span></label>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy || (s.national && changingState && !lga)} onClick={save}>{p.hubId ? "Move participant" : "Assign hub"}</button>
        </div>
      )}
    </section>
  );
}

function FollowUpSection({ p, act, busy }) {
  const [status, setStatus] = useState(p.followUp?.status || "none");
  const [note, setNote] = useState(p.followUp?.note || "");
  return (
    <section>
      <h3>Follow-up</h3>
      <div className="grid-2">
        <Field label="Status" id="fus">
          <select id="fus" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(FOLLOW_UP_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Note" optional id="fun"><input id="fun" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {p.followUp?.at && <p className="tiny muted" style={{ marginTop: -8 }}>Last updated {fmtDateTime(p.followUp.at)} by {p.followUp.by}</p>}
      <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => act("setFollowUp", { id: p.id, status, note }, "Follow-up saved.")}>Save follow-up</button>
    </section>
  );
}

function EditSection({ p, act, busy }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: p.fullName, phone: p.phone, email: p.email, lga: p.lga, category: p.category, church: p.church || "", notes: p.notes || "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  if (!open) return <section><button className="linkish" onClick={() => setOpen(true)}>Edit her details</button></section>;
  const lgas = STATE_BY_CODE[p.stateCode]?.lgas || [];
  return (
    <section>
      <h3>Edit details</h3>
      <Field label="Full name" id="ef"><input id="ef" className="input" value={f.fullName} onChange={set("fullName")} /></Field>
      <div className="grid-2">
        <Field label="WhatsApp number" id="ep"><input id="ep" className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email" id="ee"><input id="ee" className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label={p.stateCode === "INTL" ? "City" : "LGA"} id="el">
          {lgas.length ? <select id="el" className="input" value={f.lga} onChange={set("lga")}>{[...new Set([f.lga, ...lgas])].map((l) => <option key={l}>{l}</option>)}</select> : <input id="el" className="input" value={f.lga} onChange={set("lga")} />}
        </Field>
        <Field label="Category" id="ec"><select id="ec" className="input" value={f.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Church" optional id="ech"><input id="ech" className="input" value={f.church} onChange={set("church")} /></Field>
      <Field label="Notes" optional id="en"><textarea id="en" className="input" value={f.notes} onChange={set("notes")} /></Field>
      <div className="actions-row" style={{ marginTop: 0 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { await act("updateParticipant", { id: p.id, fields: f }, "Details saved."); setOpen(false); }}>Save details</button>
        <button className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="tiny muted">To move her to another state, use the prayer hub section above.</p>
    </section>
  );
}

function HistorySection({ p, scope }) {
  const extra = scope.coordinator ? [where("stateCode", "==", scope.stateCode)] : [];
  const mem = useOnce(() => query(collection(db, "hubMemberships"), where("participantId", "==", p.id), ...extra, limit(50)), [p.id, p.membershipId]);
  const logs = useOnce(() => query(collection(db, "activityLogs"), where("participantId", "==", p.id), ...extra, limit(60)), [p.id, p.updatedAt?.seconds]);
  const memberships = [...mem.data].sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));
  const acts = [...logs.data].sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
  return (
    <section>
      <h3>Hub history</h3>
      <ErrorBox error={mem.error} />
      {memberships.length === 0 ? <p className="small muted" style={{ marginTop: 0 }}>No hub assignments yet.</p> : (
        <ul className="feed">
          {memberships.map((m) => (
            <li key={m.id}>
              <strong>{m.hubName}</strong> · {fmtDate(m.startedAt)} – {m.endedAt ? fmtDate(m.endedAt) : "now"}
              <div className="when">{m.method === "automatic" ? "Automatic allocation" : `By ${m.assignedByName}`}{m.reason ? ` · ${m.reason}` : ""}{m.endReason ? ` · ended: ${m.endReason}` : ""}</div>
            </li>
          ))}
        </ul>
      )}
      <h3 style={{ marginTop: 18 }}>Activity</h3>
      <ul className="feed">
        {acts.map((a) => <li key={a.id}>{describeActivity(a)}<div className="when">{fmtDateTime(a.at)} · {a.actorName}</div></li>)}
      </ul>
    </section>
  );
}

function DangerSection({ p, act, busy }) {
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState("");
  const [lookup, setLookup] = useState("");
  const [keep, setKeep] = useState(null);
  const [lookErr, setLookErr] = useState("");
  const s = useScope();

  async function find() {
    setLookErr("");
    setKeep(null);
    const v = lookup.trim();
    const field = v.includes("@") ? ["emailNorm", normalizeEmail(v)] : ["phoneNorm", normalizePhone(v)];
    const cons = [where(field[0], "==", field[1])];
    if (s.coordinator) cons.push(where("stateCode", "==", s.stateCode));
    const snap = await getDocs(query(collection(db, "participants"), ...cons, limit(1)));
    const hit = snap.docs.find((d) => d.id !== p.id);
    if (!hit) return setLookErr("No other registration has that phone or email.");
    setKeep({ id: hit.id, ...hit.data() });
  }

  if (["deactivated", "duplicate"].includes(p.status)) {
    return (
      <section>
        <h3>Registration</h3>
        <p className="small" style={{ marginTop: 0 }}>{p.status === "duplicate" ? "Marked as a duplicate" : "Deactivated"} {fmtDate(p.deactivatedAt)} by {p.deactivatedBy}{p.deactivationReason ? `: ${p.deactivationReason}` : ""}.</p>
        <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => act("reactivateParticipant", { id: p.id }, "Reactivated. She is in the waiting queue.")}>Reactivate registration</button>
      </section>
    );
  }

  return (
    <section>
      <h3>Registration</h3>
      {!mode && (
        <div className="actions-row" style={{ marginTop: 0 }}>
          <button className="btn btn-quiet btn-sm" onClick={() => setMode("duplicate")}>Mark as duplicate</button>
          <button className="btn btn-quiet btn-sm" onClick={() => setMode("deactivate")}>Deactivate</button>
        </div>
      )}
      {mode === "deactivate" && (
        <>
          <Field label="Reason" id="dr" hint="Her history is kept. She can be reactivated later."><input id="dr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="actions-row" style={{ marginTop: 0 }}>
            <button className="btn btn-primary btn-sm" disabled={busy || reason.trim().length < 3} onClick={() => act("deactivateParticipant", { id: p.id, reason }, "Registration deactivated.")}>Deactivate registration</button>
            <button className="btn btn-quiet btn-sm" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </>
      )}
      {mode === "duplicate" && (
        <>
          <p className="small" style={{ marginTop: 0 }}>Find the registration to keep. This one will be closed and its hub place released. Nothing is deleted.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" placeholder="Phone or email of the record to keep" value={lookup} onChange={(e) => setLookup(e.target.value)} />
            <button className="btn btn-quiet btn-sm" onClick={find} style={{ minHeight: 48 }}>Find</button>
          </div>
          {lookErr && <div className="err small">{lookErr}</div>}
          {keep && (
            <div className="notice">
              Keep <strong>{keep.fullName}</strong> ({keep.phone}, {keep.hubName || "no hub"}), close this one.
              <div className="actions-row">
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act("markDuplicate", { id: p.id, ofId: keep.id, reason: `Duplicate of ${keep.fullName}` }, "Marked as duplicate.")}>Confirm duplicate</button>
              </div>
            </div>
          )}
          <button className="linkish small" style={{ marginTop: 10 }} onClick={() => setMode(null)}>Cancel</button>
        </>
      )}
    </section>
  );
}
