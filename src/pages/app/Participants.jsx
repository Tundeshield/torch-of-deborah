import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, query, where, orderBy, limit, startAfter, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useScope, useHubs, PageTitle, StateSelect } from "./common.jsx";
import { STATE_BY_CODE, stateName } from "../../data/states.js";
import { CATEGORIES, JOIN_STATUSES, normalizePhone, normalizeEmail } from "../../lib/shared.js";
import { Badge, Empty, ErrorBox, Loading } from "../../components/ui.jsx";
import { fmtDate } from "../../lib/format.js";
import ParticipantDrawer from "./ParticipantDrawer.jsx";

const PAGE = 50;
const STATUS_LABEL = { assigned: "Assigned", unassigned: "Waiting", deactivated: "Deactivated", duplicate: "Duplicate" };

export default function Participants() {
  const s = useScope();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({
    state: params.get("state") || "",
    status: params.get("status") || "",
    lga: "",
    category: "",
    hub: params.get("hub") || (s.leader ? s.hubIds[0] : ""),
    join: "",
    requests: params.get("requests") === "1",
    q: "",
  });
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [tick, setTick] = useState(0);
  const stateCode = s.coordinator ? s.stateCode : filters.state;
  const hubs = useHubs(s.national ? stateCode || undefined : undefined);
  const hubById = useMemo(() => Object.fromEntries(hubs.data.map((h) => [h.id, h])), [hubs.data]);

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setFilters((f) => ({ ...f, [k]: v, ...(k === "state" ? { lga: "", hub: "" } : {}) }));
  };

  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.state) p.set("state", filters.state);
    if (filters.hub) p.set("hub", filters.hub);
    if (filters.requests) p.set("requests", "1");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.state, filters.hub, filters.requests]);

  function buildQuery(after) {
    const col = collection(db, "participants");
    const cons = [];
    const q = filters.q.trim();
    const leaderOnly = !s.national && !s.coordinator;
    if (leaderOnly) {
      // Leaders see one of their hubs at a time.
      return { q: query(col, where("hubId", "==", filters.hub || s.hubIds[0] || "none")), mode: "client" };
    }
    if (stateCode) cons.push(where("stateCode", "==", stateCode));
    if (q) {
      if (q.includes("@")) return { q: query(col, ...cons, where("emailNorm", "==", normalizeEmail(q)), limit(20)), mode: "client" };
      if (/^[+\d\s()-]{7,}$/.test(q)) return { q: query(col, ...cons, where("phoneNorm", "==", normalizePhone(q)), limit(20)), mode: "client" };
      const lo = q.toLowerCase();
      return { q: query(col, ...cons, where("nameLower", ">=", lo), where("nameLower", "<=", lo + ""), orderBy("nameLower"), limit(100)), mode: "client" };
    }
    const equality = filters.lga || filters.category || filters.hub || filters.join || filters.requests;
    if (filters.status) cons.push(where("status", "==", filters.status));
    if (equality) {
      if (filters.lga) cons.push(where("lga", "==", filters.lga));
      if (filters.category) cons.push(where("category", "==", filters.category));
      if (filters.hub) cons.push(where("hubId", "==", filters.hub));
      if (filters.join) cons.push(where("joinStatus", "==", filters.join));
      if (filters.requests) cons.push(where("reassignRequest.open", "==", true));
      return { q: query(col, ...cons, limit(500)), mode: "client" };
    }
    cons.push(orderBy("createdAt", "desc"));
    if (after) cons.push(startAfter(after));
    cons.push(limit(PAGE));
    return { q: query(col, ...cons), mode: "paged" };
  }

  async function load(after = null) {
    setLoading(true);
    setError(null);
    try {
      const { q, mode } = buildQuery(after);
      const snap = await getDocs(q);
      let data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (mode === "client") data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRows((r) => (after ? [...r, ...data] : data));
      setCursor(snap.docs[snap.docs.length - 1] || null);
      setMore(mode === "paged" && snap.size === PAGE);
    } catch (e) {
      console.error(e);
      setError(e);
      if (!after) setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), filters.q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, stateCode, tick]);

  const lgas = STATE_BY_CODE[stateCode]?.lgas || [];
  const stateHubs = hubs.data.filter((h) => !stateCode || h.stateCode === stateCode).sort((a, b) => a.name.localeCompare(b.name));
  const leaderOnly = !s.national && !s.coordinator;

  return (
    <>
      <PageTitle title="Participants" sub={leaderOnly ? "Members of your prayer hub." : s.coordinator ? `Registrations in ${stateName(s.stateCode)}.` : "Every registration across the movement."} />

      <div className="toolbar">
        {!leaderOnly && (
          <div className="grow">
            <label htmlFor="pq">Search</label>
            <input id="pq" className="input" placeholder="Name, phone or email" value={filters.q} onChange={set("q")} />
          </div>
        )}
        {s.national && <div><label>State</label><StateSelect value={filters.state} onChange={set("state")} /></div>}
        {!leaderOnly && (
          <>
            <div>
              <label htmlFor="pst">Status</label>
              <select id="pst" className="input" value={filters.status} onChange={set("status")}>
                <option value="">Any status</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {stateCode && lgas.length > 0 && (
              <div>
                <label htmlFor="plga">LGA</label>
                <select id="plga" className="input" value={filters.lga} onChange={set("lga")}>
                  <option value="">Any LGA</option>
                  {lgas.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="pcat">Category</label>
              <select id="pcat" className="input" value={filters.category} onChange={set("category")}>
                <option value="">Any category</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </>
        )}
        {(stateCode || leaderOnly) && (
          <div>
            <label htmlFor="phub">Hub</label>
            <select id="phub" className="input" value={filters.hub} onChange={set("hub")}>
              {!leaderOnly && <option value="">Any hub</option>}
              {stateHubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        )}
        {!leaderOnly && (
          <>
            <div>
              <label htmlFor="pjs">Group</label>
              <select id="pjs" className="input" value={filters.join} onChange={set("join")}>
                <option value="">Any</option>
                {Object.entries(JOIN_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <label className="check" style={{ margin: "0 0 8px" }}>
              <input type="checkbox" checked={filters.requests} onChange={set("requests")} /> <span>Asked to change hub</span>
            </label>
          </>
        )}
      </div>

      <ErrorBox error={error} />
      {loading && rows.length === 0 ? <Loading /> : rows.length === 0 ? (
        <div className="card"><Empty title="No participants match">Try clearing a filter or searching by phone number.</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Location</th><th>Hub</th><th>Status</th><th>Group</th><th>Registered</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="click" onClick={() => setOpen(p.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(p.id)}>
                  <td>
                    <strong>{p.fullName}</strong>
                    <div className="sub">{p.category}</div>
                    {p.reassignRequest?.open && <Badge value="needed" label="Asked to change hub" tone="wine" />}
                  </td>
                  <td>{p.phone}</td>
                  <td>{p.lga}<div className="sub">{stateName(p.stateCode)}</div></td>
                  <td>{p.hubName || "—"}{p.hubId && hubById[p.hubId] && !hubById[p.hubId].leaderUid && <div className="sub">No leader</div>}</td>
                  <td><Badge value={p.status} label={STATUS_LABEL[p.status] || p.status} /></td>
                  <td>{p.hubId ? <Badge value={p.joinStatus} label={JOIN_STATUSES[p.joinStatus] || "—"} /> : "—"}</td>
                  <td>{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && <button className="btn btn-quiet" style={{ marginTop: 14 }} disabled={loading} onClick={() => load(cursor)}>{loading ? "Loading…" : "Load more"}</button>}
      {!more && rows.length >= 500 && <p className="small muted">Showing the first 500. Narrow the filters to see others.</p>}

      {open && <ParticipantDrawer id={open} onClose={() => setOpen(null)} onChanged={() => setTick((t) => t + 1)} />}
    </>
  );
}
