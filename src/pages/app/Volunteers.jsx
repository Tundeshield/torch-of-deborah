import { useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveQuery } from "../../lib/hooks.js";
import { useScope, PageTitle, StateSelect } from "./common.jsx";
import { stateName } from "../../data/states.js";
import { DEPARTMENTS, waLink } from "../../lib/shared.js";
import { Badge, Empty, ErrorBox, Field, Loading, Modal, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

export default function Volunteers() {
  const s = useScope();
  const [dept, setDept] = useState("");
  const [edit, setEdit] = useState(null);
  const vols = useLiveQuery(() => {
    const col = collection(db, "volunteers");
    return s.national ? query(col) : query(col, where("stateCode", "==", s.stateCode));
  }, [s.national, s.stateCode]);
  const rows = vols.data.filter((v) => !dept || v.department === dept).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageTitle title="Volunteers" sub="Volunteers by department, with their supervisor and responsibilities.">
        <button className="btn btn-primary" onClick={() => setEdit({ stateCode: s.coordinator ? s.stateCode : "" })}>Add a volunteer</button>
      </PageTitle>
      <div className="toolbar">
        <div><label htmlFor="vd">Department</label><select id="vd" className="input" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></div>
        <p className="small muted" style={{ margin: "0 0 8px" }}>Women who registered as volunteers: <Link to="/app/participants">filter participants by category</Link>.</p>
      </div>
      <ErrorBox error={vols.error} />
      {vols.loading ? <Loading /> : rows.length === 0 ? <div className="card"><Empty title="No volunteers recorded yet" /></div> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Name</th><th>Department</th><th>State</th><th>Supervisor</th><th>Responsibilities</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong><div className="sub">{v.phone && <a href={waLink(v.phone)} target="_blank" rel="noopener">{v.phone}</a>} {v.email}</div></td>
                  <td>{v.department}</td>
                  <td>{v.stateCode ? stateName(v.stateCode) : "National"}</td>
                  <td>{v.supervisor || "—"}</td>
                  <td className="small">{v.responsibilities || "—"}</td>
                  <td><Badge value={v.status} label={v.status} /></td>
                  <td><button className="btn btn-quiet btn-sm" onClick={() => setEdit(v)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <VolunteerModal v={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function VolunteerModal({ v, onClose }) {
  const [f, setF] = useState({ id: v.id, name: v.name || "", phone: v.phone || "", email: v.email || "", department: v.department || "", stateCode: v.stateCode || "", supervisor: v.supervisor || "", responsibilities: v.responsibilities || "", status: v.status || "active" });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  return (
    <Modal title={v.id ? v.name : "Add a volunteer"} onClose={onClose} footer={<>
      <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !f.name || !f.department} onClick={async () => { await run(() => api.admin("saveVolunteer", f), "Volunteer saved."); onClose(); }}>Save volunteer</button>
    </>}>
      <Field label="Full name" id="vn"><input id="vn" className="input" value={f.name} onChange={set("name")} /></Field>
      <div className="grid-2">
        <Field label="Phone" optional id="vp"><input id="vp" className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email" optional id="ve"><input id="ve" className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Department" id="vdp"><select id="vdp" className="input" value={f.department} onChange={set("department")}><option value="">Choose</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="State" optional id="vs"><StateSelect id="vs" allLabel="National" value={f.stateCode} onChange={set("stateCode")} /></Field>
        <Field label="Supervisor" optional id="vsu"><input id="vsu" className="input" value={f.supervisor} onChange={set("supervisor")} /></Field>
        <Field label="Status" id="vst"><select id="vst" className="input" value={f.status} onChange={set("status")}><option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option></select></Field>
      </div>
      <Field label="Responsibilities" optional id="vr"><textarea id="vr" className="input" value={f.responsibilities} onChange={set("responsibilities")} /></Field>
    </Modal>
  );
}
