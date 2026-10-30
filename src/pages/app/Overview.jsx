import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, limit, getCountFromServer } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useAsync, useLiveQuery } from "../../lib/hooks.js";
import { useScope, useHubs, useStates, useSettings, useStaff, PageTitle, StateSelect } from "./common.jsx";
import { STATES, stateName } from "../../data/states.js";
import { nf, fmtDateTime, fmtDay } from "../../lib/format.js";
import { addDays, todayInZone, participantCapacity } from "../../lib/shared.js";
import { ErrorBox, Loading, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { describeActivity } from "./Activity.jsx";

export default function Overview() {
  const s = useScope();
  if (!s.national && !s.coordinator) return <SimpleOverview />;
  return <Dashboard />;
}

function SimpleOverview() {
  const { profile } = useScope();
  return (
    <>
      <PageTitle title={`Welcome, ${profile.name.split(" ")[0]}`} sub="Thank you for serving The Torch of Deborah." />
      <div className="card">
        <p>Your department: <strong>{profile.department || "Not assigned yet"}</strong></p>
        <p>See the <Link to="/app/schedule">prayer schedule</Link>. The national team will share your tasks with you directly.</p>
      </div>
    </>
  );
}

function Dashboard() {
  const s = useScope();
  const [stateFilter, setStateFilter] = useState("");
  const scopeState = s.coordinator ? s.stateCode : stateFilter;
  const states = useStates();
  const hubs = useHubs();
  const staff = useStaff();
  const settings = useSettings().data;
  const [run, busy] = useAction();

  const counts = useMemo(() => {
    const rows = {};
    for (const st of STATES) rows[st.code] = { code: st.code, name: st.name, registrations: 0, assigned: 0, unassigned: 0, joined: 0, hubs: 0, activeHubs: 0, fullHubs: 0, capacity: 0, occupied: 0, leaderless: 0, coordinator: null };
    for (const d of states.data) {
      if (!rows[d.id]) continue;
      Object.assign(rows[d.id], {
        registrations: d.counts?.registrations || 0,
        assigned: d.counts?.assigned || 0,
        unassigned: d.counts?.unassigned || 0,
        joined: d.counts?.joined || 0,
        coordinator: d.coordinatorName || null,
      });
    }
    for (const h of hubs.data) {
      const r = rows[h.stateCode];
      if (!r || h.status === "archived") continue;
      r.hubs++;
      if (h.status === "active") r.activeHubs++;
      if (h.status === "full") r.fullHubs++;
      if (["active", "full"].includes(h.status)) {
        r.capacity += participantCapacity(h, settings);
        r.occupied += h.count || 0;
        if (!h.leaderUid) r.leaderless++;
      }
    }
    return rows;
  }, [states.data, hubs.data, settings]);

  const visibleRows = Object.values(counts).filter((r) => (scopeState ? r.code === scopeState : true));
  const sum = (k) => visibleRows.reduce((a, r) => a + r[k], 0);
  const target = settings.registrationTarget || 10000;
  const totalReg = sum("registrations");
  const visibleStaff = staff.data.filter((u) => u.active !== false && (!scopeState || u.stateCode === scopeState));
  const coordinators = visibleStaff.filter((u) => u.role === "coordinator").length;
  const leaders = visibleStaff.filter((u) => (u.hubIds || []).length > 0).length;

  const tz = settings.timezone || "Africa/Lagos";
  const today = todayInZone(tz);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const trend = useAsync(async () => {
    const out = [];
    for (const d of days) {
      const cons = [where("date", "==", d), where("status", "==", "participated")];
      if (scopeState) cons.push(where("stateCode", "==", scopeState));
      const c = await getCountFromServer(query(collection(db, "attendance"), ...cons));
      out.push({ d, n: c.data().count });
    }
    return out;
  }, [today, scopeState]);

  const feed = useLiveQuery(() => {
    const col = collection(db, "activityLogs");
    if (s.coordinator) return query(col, where("stateCode", "==", s.stateCode), orderBy("at", "desc"), limit(12));
    if (stateFilter) return query(col, where("stateCode", "==", stateFilter), orderBy("at", "desc"), limit(12));
    return query(col, orderBy("at", "desc"), limit(12));
  }, [s.coordinator, s.stateCode, stateFilter]);

  const queued = visibleRows.filter((r) => r.unassigned > 0);
  const maxTrend = Math.max(1, ...(trend.data || []).map((x) => x.n));

  if (states.loading || hubs.loading) return <Loading />;

  return (
    <>
      <PageTitle title={s.coordinator ? stateName(s.stateCode) : "National overview"} sub={s.coordinator ? "Your state at a glance." : "The whole movement at a glance."}>
        {s.national && (
          <div className="toolbar" style={{ margin: 0 }}>
            <StateSelect value={stateFilter} onChange={setStateFilter} />
          </div>
        )}
      </PageTitle>
      <ErrorBox error={states.error || hubs.error} />

      {!scopeState && (
        <div className="target">
          <div className="n">{nf.format(totalReg)}</div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (totalReg / target) * 100)}%` }} /></div>
          <div className="t">registered of the {nf.format(target)} target · {nf.format(Math.max(target - totalReg, 0))} to go</div>
        </div>
      )}

      <dl className="metrics">
        {scopeState && <Metric label="Registrations" value={totalReg} />}
        <Metric label="Assigned to a hub" value={sum("assigned")} />
        <Metric label="Waiting for a hub" value={sum("unassigned")} />
        <Metric label="Confirmed in their group" value={sum("joined")} sub={sum("assigned") ? `${Math.round((sum("joined") / sum("assigned")) * 100)}%` : ""} />
        <Metric label="Active hubs" value={sum("activeHubs")} />
        <Metric label="Full hubs" value={sum("fullHubs")} />
        <Metric label="Open places" value={Math.max(sum("capacity") - sum("occupied"), 0)} />
        {!s.coordinator && <Metric label="State coordinators" value={coordinators} />}
        <Metric label="Hub leaders" value={leaders} />
      </dl>

      <div className="cols-3">
        <div className="stack">
          <div className="card">
            <h2>Participation reported, last 14 days</h2>
            {trend.loading ? <Loading /> : trend.error ? <ErrorBox error={trend.error} /> : (
              <div className="bars" role="img" aria-label="Daily participation over the last 14 days">
                {trend.data.map((x) => (
                  <div className="b" key={x.d} title={`${fmtDay(x.d)}: ${x.n}`}>
                    <em>{x.n || ""}</em>
                    <i style={{ height: `${(x.n / maxTrend) * 100}%` }} />
                    <span>{x.d.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>Counts hub-reported and self-reported prayer marked as participated.</p>
          </div>

          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>State</th><th className="num">Registrations</th><th className="num">Assigned</th><th className="num">Waiting</th><th className="num">Joined</th><th className="num">Hubs</th><th className="num">Capacity</th><th>Coordinator</th></tr>
              </thead>
              <tbody>
                {(s.coordinator ? visibleRows : Object.values(counts).filter((r) => !stateFilter || r.code === stateFilter))
                  .sort((a, b) => b.registrations - a.registrations || a.name.localeCompare(b.name))
                  .map((r) => (
                    <tr key={r.code}>
                      <td>{r.name}{r.leaderless > 0 && <div className="sub">{r.leaderless} hub{r.leaderless > 1 ? "s" : ""} without a leader</div>}</td>
                      <td className="num">{nf.format(r.registrations)}</td>
                      <td className="num">{nf.format(r.assigned)}</td>
                      <td className="num">{r.unassigned ? <Link to={`/app/participants?status=unassigned&state=${r.code}`}>{nf.format(r.unassigned)}</Link> : 0}</td>
                      <td className="num">{nf.format(r.joined)}</td>
                      <td className="num">{r.hubs}</td>
                      <td className="num">{nf.format(r.occupied)} / {nf.format(r.capacity)}</td>
                      <td>{r.coordinator || <span className="sub">Not assigned</span>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Waiting for a hub</h2>
            {queued.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Everyone registered has a hub.</p> : (
              <ul className="feed">
                {queued.sort((a, b) => b.unassigned - a.unassigned).slice(0, 10).map((r) => (
                  <li key={r.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span><strong>{r.name}</strong> — {r.unassigned} waiting<br /><span className="tiny muted">{Math.max(r.capacity - r.occupied, 0)} open places in hubs with leaders</span></span>
                    <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run(() => api.admin("allocateQueue", { stateCode: r.code }), (x) => x.assigned ? `${x.assigned} placed in hubs.` : "No hub with a leader has space. Create a hub or raise capacity.")}>Allocate</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h2>Recent activity</h2>
            {feed.error ? <ErrorBox error={feed.error} /> : (
              <ul className="feed">
                {feed.data.map((a) => (
                  <li key={a.id}><div>{describeActivity(a)}</div><div className="when">{fmtDateTime(a.at)} · {a.actorName}</div></li>
                ))}
                {!feed.loading && feed.data.length === 0 && <li className="muted">Nothing yet.</li>}
              </ul>
            )}
            <Link to="/app/activity" className="small">See the full activity log</Link>
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{nf.format(value || 0)}{sub && <small>{sub}</small>}</dd>
    </div>
  );
}
