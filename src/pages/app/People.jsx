import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, startAfter, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useScope, useHubs, useSettings, StateSelect, Head } from "./common.jsx";
import { stateName } from "../../data/states.js";
import { CATEGORIES, capacityOf, normalizePhone, toCsv, waLink } from "../../lib/shared.js";
import { Empty, ErrorText, Loading, Panel, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

const PAGE = 100;

export default function People() {
  const s = useScope();
  const [stateFilter, setStateFilter] = useState("");
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [tick, setTick] = useState(0);
  const stateCode = s.coordinator ? s.stateCode : stateFilter;

  // Queries are kept to forms Firestore serves without custom indexes:
  // equality filters only, or a single ordered field.
  const term = q.trim();
  const phoneSearch = /^[+\d\s()-]{7,}$/.test(term);
  const localNameSearch = Boolean(term) && !phoneSearch && Boolean(stateCode);

  function build(after) {
    const col = collection(db, "participants");
    const cons = stateCode ? [where("stateCode", "==", stateCode)] : [];
    if (phoneSearch) return { q: query(col, ...cons, where("phoneNorm", "==", normalizePhone(term))) };
    if (term && !stateCode) {
      const lo = term.toLowerCase();
      return { q: query(col, where("nameLower", ">=", lo), where("nameLower", "<=", lo + "\uf8ff"), orderBy("nameLower"), limit(50)) };
    }
    if (!stateCode && tab === "all") return { q: query(col, orderBy("createdAt", "desc"), ...(after ? [startAfter(after)] : []), limit(PAGE)), paged: true };
    if (tab !== "all") cons.push(where("status", "==", tab));
    return { q: query(col, ...cons, limit(1000)) };
  }

  async function load(after) {
    setLoading(true);
    setError(null);
    try {
      const { q: qry, paged } = build(after);
      const snap = await getDocs(qry);
      let data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (tab === "all" && !term) data = data.filter((p) => p.status !== "removed");
      if (!paged) data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRows((r) => (after ? [...r, ...data] : data));
      setCursor(snap.docs[snap.docs.length - 1]);
      setMore(Boolean(paged) && snap.size === PAGE);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), term && !localNameSearch ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode, tab, localNameSearch ? "" : q, tick]);

  const shown = localNameSearch ? rows.filter((p) => (p.nameLower || "").includes(term.toLowerCase())) : rows;

  async function download() {
    const col = collection(db, "participants");
    const snap = await getDocs(stateCode ? query(col, where("stateCode", "==", stateCode)) : query(col));
    const data = snap.docs.map((d) => d.data()).filter((p) => p.status !== "removed");
    const csv = toCsv(data, [
      { label: "Name", value: "fullName" }, { label: "WhatsApp", value: "phone" }, { label: "Email", value: "email" },
      { label: "State", value: (p) => stateName(p.stateCode) }, { label: "LGA / city", value: "lga" },
      { label: "Taking part as", value: (p) => CATEGORIES[p.category] || p.category }, { label: "Hub", value: "hubName" }, { label: "Hub leader", value: "leaderName" },
      { label: "Registered", value: (p) => (p.createdAt?.toDate ? p.createdAt.toDate().toISOString().slice(0, 10) : "") },
    ]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `torch-of-deborah-${stateCode ? stateName(stateCode).replace(/\W+/g, "-").toLowerCase() : "all"}.csv`;
    a.click();
  }

  return (
    <>
      <Head title="People" sub="Everyone who has registered.">
        <button className="btn plain sm" onClick={download}>Download CSV</button>
      </Head>
      <div className="tools">
        <input className="input search" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        {s.admin && <StateSelect value={stateFilter} onChange={setStateFilter} />}
        {!term && (
          <div className="tabs" role="tablist">
            {[["all", "All"], ["waiting", "Waiting for a hub"], ["removed", "Removed"]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        )}
      </div>
      <ErrorText error={error} />
      {loading && !rows.length ? <Loading /> : shown.length === 0 ? (
        <Empty title={q ? "No one matches that search" : tab === "waiting" ? "No one is waiting for a hub" : "No one here yet"} />
      ) : (
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Name</th><th>WhatsApp</th><th className="hide-sm">Location</th><th>Hub</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="click" onClick={() => setOpen(p)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(p)}>
                  <td>{p.fullName}</td>
                  <td>{p.phone}</td>
                  <td className="hide-sm">{p.lga}<div className="sub">{stateName(p.stateCode)}</div></td>
                  <td>{p.status === "removed" ? <span className="tag off">Removed</span> : p.hubName || <span className="tag">Waiting</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && <button className="btn plain" style={{ marginTop: 16 }} disabled={loading} onClick={() => load(cursor)}>Show more</button>}
      {open && <Person p={open} onClose={() => setOpen(null)} onChange={() => { setOpen(null); setTick((t) => t + 1); }} />}
    </>
  );
}

function Person({ p, onClose, onChange }) {
  const hubs = useHubs(p.stateCode);
  const settings = useSettings().data;
  const [target, setTarget] = useState("");
  const [run, busy] = useAction();
  const options = hubs.data.filter((h) => h.stateCode === p.stateCode && h.id !== p.hubId && h.active !== false);
  const act = (action, body, msg) => run(() => api.admin(action, body), msg).then(onChange).catch(() => {});

  return (
    <Panel title={p.fullName} onClose={onClose}>
      <dl className="dl">
        <dt>WhatsApp</dt><dd><a href={waLink(p.phone)} target="_blank" rel="noopener">{p.phone}</a></dd>
        {p.email && <><dt>Email</dt><dd>{p.email}</dd></>}
        <dt>Location</dt><dd>{p.lga}, {stateName(p.stateCode)}</dd>
        <dt>Taking part as</dt><dd>{CATEGORIES[p.category] || p.category}</dd>
        {p.church && <><dt>Church</dt><dd>{p.church}</dd></>}
        <dt>Hub</dt><dd>{p.hubName || "Waiting for a hub"}</dd>
      </dl>

      {p.status === "removed" ? (
        <button className="btn plain" disabled={busy} onClick={() => act("restoreParticipant", { id: p.id }, "Registration restored.")}>Restore registration</button>
      ) : (
        <>
          <div className="field">
            <label htmlFor="mv">{p.hubId ? "Move to another hub" : "Put her in a hub"}</label>
            <select id="mv" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a hub</option>
              {!p.hubId && <option value="auto">Any hub with space</option>}
              {options.map((h) => {
                const full = (h.count || 0) >= capacityOf(h, settings);
                return <option key={h.id} value={h.id} disabled={full}>{h.name} ({h.count || 0}/{capacityOf(h, settings)}){full ? ", full" : ""}</option>;
              })}
            </select>
          </div>
          <button className="btn" disabled={busy || !target} onClick={() => act("moveParticipant", { participantId: p.id, target }, (r) => `Moved to ${r.hubName}.`)}>{p.hubId ? "Move" : "Add to hub"}</button>
          <details className="more" style={{ marginTop: 32 }}>
            <summary>More</summary>
            <p className="small muted">Removing takes her off her hub and out of the totals. You can restore her later.</p>
            <button className="btn danger sm" disabled={busy} onClick={() => act("removeParticipant", { id: p.id }, "Registration removed.")}>Remove registration</button>
          </details>
        </>
      )}
    </Panel>
  );
}
