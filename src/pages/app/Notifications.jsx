import { useState } from "react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveQuery, useAsync } from "../../lib/hooks.js";
import { useScope, useHubs, PageTitle } from "./common.jsx";
import { STATES, stateName } from "../../data/states.js";
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { fmtDateTime, tsToDate } from "../../lib/format.js";

const STATUS = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sending_requested: "Sending", sent: "Sent", failed: "Failed", cancelled: "Cancelled" };

export default function Notifications() {
  const s = useScope();
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);
  const list = useLiveQuery(() => {
    const col = collection(db, "announcements");
    return s.national ? query(col, orderBy("createdAt", "desc"), limit(60)) : query(col, where("stateCode", "==", s.stateCode), orderBy("createdAt", "desc"), limit(60));
  }, [s.national, s.stateCode]);

  return (
    <>
      <PageTitle title="Notifications" sub="Announcements on participants' welcome pages and by email.">
        <button className="btn btn-primary" onClick={() => setEdit({})}>New announcement</button>
      </PageTitle>
      <ErrorBox error={list.error} />
      {list.loading ? <Loading /> : list.data.length === 0 ? <div className="card"><Empty title="No announcements yet" action={<button className="btn btn-primary" onClick={() => setEdit({})}>Write the first one</button>} /></div> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Announcement</th><th>Audience</th><th>Channels</th><th>Status</th><th>When</th><th /></tr></thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.title}</strong><div className="sub">{a.createdByName}</div></td>
                  <td className="small">{audienceLabel(a.audience)}</td>
                  <td className="small">{(a.channels || []).map((c) => (c === "portal" ? "Welcome page" : "Email")).join(", ")}</td>
                  <td><Badge value={a.status === "sending_requested" ? "sending" : a.status} label={STATUS[a.status]} />{a.status === "sent" && a.recipientCount ? <div className="sub">{a.recipientCount} emails</div> : null}{a.error && <div className="sub">{a.error}</div>}</td>
                  <td className="small">{a.sentAt ? fmtDateTime(a.sentAt) : a.scheduledAt ? `For ${fmtDateTime(a.scheduledAt)}` : fmtDateTime(a.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {["draft", "scheduled", "failed"].includes(a.status) && <button className="btn btn-quiet btn-sm" onClick={() => setEdit(a)}>Edit</button>}{" "}
                    {s.national && a.status === "sent" && (a.channels || []).includes("email") && <button className="btn btn-quiet btn-sm" onClick={() => setOpen(a)}>Delivery</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <Compose a={edit} onClose={() => setEdit(null)} />}
      {open && <Delivery a={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function audienceLabel(a = {}) {
  if (a.type === "all") return "Everyone";
  if (a.type === "states") return a.stateCodes.map(stateName).join(", ");
  if (a.type === "hubs") return `${a.hubIds.length} hub${a.hubIds.length === 1 ? "" : "s"}`;
  if (a.type === "roles") return a.roles.map((r) => ({ participant: "Participants", leader: "Hub leaders", coordinator: "Coordinators", volunteer: "Volunteers", admin: "National team" })[r]).join(", ");
  return "—";
}

function Compose({ a, onClose }) {
  const s = useScope();
  const hubs = useHubs();
  const aud = a.audience || { type: s.coordinator ? "states" : "all", stateCodes: s.coordinator ? [s.stateCode] : [], hubIds: [], roles: [] };
  const [f, setF] = useState({ id: a.id, title: a.title || "", body: a.body || "", linkUrl: a.linkUrl || "", linkLabel: a.linkLabel || "", channels: a.channels || ["portal", "email"], audience: aud, mode: "now", scheduledAt: a.scheduledAt ? toLocalInput(tsToDate(a.scheduledAt)) : "" });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setAud = (patch) => setF((x) => ({ ...x, audience: { ...x.audience, ...patch } }));
  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const types = s.national ? [["all", "Everyone"], ["states", "States"], ["hubs", "Hubs"], ["roles", "Groups"]] : [["states", "My whole state"], ["hubs", "Particular hubs"]];

  async function submit(mode) {
    const body = { ...f, mode, scheduledAt: mode === "schedule" ? new Date(f.scheduledAt).toISOString() : null };
    await run(() => api.admin("saveAnnouncement", body), (r) => (r.status === "sent" ? `Sent${r.recipients ? ` to ${r.recipients} email addresses` : ""}.` : r.status === "scheduled" ? "Scheduled." : r.status === "failed" ? "Sending failed. Check email settings." : "Saved as draft."));
    onClose();
  }

  return (
    <Modal title={a.id ? "Edit announcement" : "New announcement"} onClose={onClose} wide footer={<>
      <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className="btn btn-quiet" disabled={busy} onClick={() => submit("draft")}>Save draft</button>
      {f.mode === "schedule"
        ? <button className="btn btn-primary" disabled={busy || !f.scheduledAt} onClick={() => submit("schedule")}>Schedule</button>
        : <button className="btn btn-primary" disabled={busy || !f.title || !f.body} onClick={() => submit("now")}>{busy ? "Sending…" : "Send now"}</button>}
    </>}>
      <Field label="Title" id="at"><input id="at" className="input" value={f.title} onChange={set("title")} /></Field>
      <Field label="Message" id="ab"><textarea id="ab" className="input" style={{ minHeight: 160 }} value={f.body} onChange={set("body")} /></Field>
      <div className="grid-2">
        <Field label="Button link" optional id="al"><input id="al" className="input" value={f.linkUrl} onChange={set("linkUrl")} placeholder="https://" /></Field>
        <Field label="Button label" optional id="all"><input id="all" className="input" value={f.linkLabel} onChange={set("linkLabel")} placeholder="Join on Zoom" /></Field>
      </div>
      <div className="field">
        <span className="label">Send to</span>
        <div className="choices">{types.map(([k, l]) => <label className="choice" key={k}><input type="radio" checked={f.audience.type === k} onChange={() => setAud({ type: k, ...(s.coordinator && k === "states" ? { stateCodes: [s.stateCode] } : {}) })} /><span>{l}</span></label>)}</div>
      </div>
      {f.audience.type === "states" && s.national && (
        <div className="field" style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--line)", padding: 10, columns: 3 }}>
          {STATES.map((st) => <label key={st.code} className="check" style={{ marginBottom: 6 }}><input type="checkbox" checked={f.audience.stateCodes.includes(st.code)} onChange={() => setAud({ stateCodes: toggle(f.audience.stateCodes, st.code) })} /><span>{st.name}</span></label>)}
        </div>
      )}
      {f.audience.type === "hubs" && (
        <div className="field" style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--line)", padding: 10 }}>
          {hubs.data.sort((x, y) => x.name.localeCompare(y.name)).map((h) => <label key={h.id} className="check" style={{ marginBottom: 6 }}><input type="checkbox" checked={f.audience.hubIds.includes(h.id)} onChange={() => setAud({ hubIds: toggle(f.audience.hubIds, h.id) })} /><span>{h.name} <span className="muted">({stateName(h.stateCode)})</span></span></label>)}
          {hubs.data.length === 0 && <span className="muted small">No hubs yet.</span>}
        </div>
      )}
      {f.audience.type === "roles" && (
        <div className="choices field">
          {[["participant", "All participants"], ["leader", "Hub leaders"], ["coordinator", "State coordinators"], ["volunteer", "Volunteers"], ["admin", "National team"]].map(([k, l]) => (
            <label className="choice" key={k}><input type="checkbox" checked={f.audience.roles.includes(k)} onChange={() => setAud({ roles: toggle(f.audience.roles, k) })} /><span>{l}</span></label>
          ))}
        </div>
      )}
      <div className="field">
        <span className="label">Publish on</span>
        <div className="choices">
          {[["portal", "Participants' welcome pages"], ["email", "Email"]].map(([k, l]) => <label className="choice" key={k}><input type="checkbox" checked={f.channels.includes(k)} onChange={() => setF((x) => ({ ...x, channels: toggle(x.channels, k) }))} /><span>{l}</span></label>)}
        </div>
        <div className="hint">Welcome pages show announcements to participants only. Emails reach participants and any matching leaders.</div>
      </div>
      <div className="field">
        <span className="label">When</span>
        <div className="choices">
          {[["now", "Send now"], ["schedule", "Schedule for later"]].map(([k, l]) => <label className="choice" key={k}><input type="radio" checked={f.mode === k} onChange={() => setF((x) => ({ ...x, mode: k }))} /><span>{l}</span></label>)}
        </div>
      </div>
      {f.mode === "schedule" && <Field label="Send at (your local time)" id="as"><input id="as" type="datetime-local" className="input" value={f.scheduledAt} onChange={set("scheduledAt")} /></Field>}
      {a.id && a.status === "scheduled" && <button className="linkish small" onClick={async () => { await run(() => api.admin("cancelAnnouncement", { id: a.id }), "Cancelled."); onClose(); }}>Cancel this scheduled announcement</button>}
    </Modal>
  );
}

function toLocalInput(d) {
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Delivery({ a, onClose }) {
  const res = useAsync(async () => {
    const snap = await getDocs(query(collection(db, "mail"), where("meta.announcementId", "==", a.id), limit(500)));
    const c = { pending: 0, sent: 0, delivered: 0, failed: 0, batches: snap.size };
    snap.forEach((d) => {
      const st = d.data().delivery?.state;
      const n = (d.data().bcc?.length || 0) + (d.data().to?.length || 0);
      if (!st || st === "PENDING" || st === "PROCESSING" || st === "RETRY") c.pending += n;
      else if (st === "SUCCESS") c.sent += n;
      else if (st === "ERROR") c.failed += n;
    });
    return c;
  }, [a.id]);
  return (
    <Modal title="Email delivery" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      {res.loading ? <Loading /> : res.error ? <ErrorBox error={res.error} /> : (
        <>
          <dl className="kv" style={{ marginTop: 0 }}>
            <dt>Pending</dt><dd>{res.data.pending}</dd>
            <dt>Sent</dt><dd>{res.data.sent}</dd>
            <dt>Failed</dt><dd>{res.data.failed}</dd>
          </dl>
          <p className="small muted">Counts come from the email extension. “Sent” means the mail server accepted the message; inbox delivery is not reported. If everything stays pending, the Trigger Email extension is not installed or configured.</p>
        </>
      )}
    </Modal>
  );
}
