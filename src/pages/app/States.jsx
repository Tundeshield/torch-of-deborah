import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useScope, useStates, useHubs, useSettings, PageTitle } from "./common.jsx";
import { STATES } from "../../data/states.js";
import { participantCapacity } from "../../lib/shared.js";
import { ErrorBox, Field, Loading, Modal, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { nf } from "../../lib/format.js";

export default function States() {
  const s = useScope();
  const states = useStates();
  const hubs = useHubs();
  const settings = useSettings().data;
  const [edit, setEdit] = useState(null);

  const rows = useMemo(() => {
    const byId = Object.fromEntries(states.data.map((d) => [d.id, d]));
    return STATES.filter((st) => s.national || st.code === s.stateCode).map((st) => {
      const d = byId[st.code] || {};
      const hs = hubs.data.filter((h) => h.stateCode === st.code && ["active", "full"].includes(h.status));
      return {
        ...st, doc: d,
        reg: d.counts?.registrations || 0, waiting: d.counts?.unassigned || 0,
        hubs: hs.length, leaderless: hs.filter((h) => !h.leaderUid).length,
        cap: hs.reduce((a, h) => a + participantCapacity(h, settings), 0), occ: hs.reduce((a, h) => a + (h.count || 0), 0),
      };
    });
  }, [states.data, hubs.data, settings, s.national, s.stateCode]);

  if (states.loading) return <Loading />;
  return (
    <>
      <PageTitle title={s.national ? "States" : "My state"} sub="Coordinators, hub coverage and state-level settings." />
      <ErrorBox error={states.error} />
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>State</th><th>Coordinator</th><th className="num">Registered</th><th className="num">Waiting</th><th className="num">Hubs</th><th className="num">Places filled</th><th>State Zoom</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td><strong>{r.name}</strong>{r.leaderless > 0 && <div className="sub">{r.leaderless} without a leader</div>}</td>
                <td>{r.doc.coordinatorName || <span className="sub">Not assigned</span>}<div className="sub">{r.doc.coordinatorPhone}</div></td>
                <td className="num">{nf.format(r.reg)}</td>
                <td className="num">{r.waiting ? <Link to={`/app/participants?status=unassigned&state=${r.code}`}>{r.waiting}</Link> : 0}</td>
                <td className="num"><Link to="/app/hubs">{r.hubs}</Link></td>
                <td className="num">{r.occ} / {r.cap}</td>
                <td>{r.doc.zoomLink ? "Set" : <span className="sub">Uses central</span>}</td>
                <td><button className="btn btn-quiet btn-sm" onClick={() => setEdit(r)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.national && <p className="small muted" style={{ marginTop: 12 }}>To appoint a coordinator, invite them (or change their role) on the leadership page and choose this state.</p>}
      {edit && <StateModal row={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function StateModal({ row, onClose }) {
  const [zoomLink, setZoom] = useState(row.doc.zoomLink || "");
  const [notes, setNotes] = useState(row.doc.notes || "");
  const [extra, setExtra] = useState((row.doc.extraLgas || []).join("\n"));
  const [run, busy] = useAction();
  return (
    <Modal title={row.name} onClose={onClose} footer={<>
      <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy} onClick={async () => { await run(() => api.admin("saveState", { code: row.code, zoomLink, notes, extraLgas: extra.split("\n").map((x) => x.trim()).filter(Boolean) }), "State saved."); onClose(); }}>Save state</button>
    </>}>
      <Field label="State Zoom link" optional id="sz" hint="Women in this state see this instead of the central link, unless their hub has its own."><input id="sz" className="input" value={zoomLink} onChange={(e) => setZoom(e.target.value)} /></Field>
      {row.code !== "INTL" && (
        <Field label="Additional LGAs or areas" optional id="sl" hint={`One per line. Added to the ${row.lgas.length} standard LGAs in the registration form.`}>
          <textarea id="sl" className="input" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
      )}
      <Field label="Notes" optional id="sn"><textarea id="sn" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}
