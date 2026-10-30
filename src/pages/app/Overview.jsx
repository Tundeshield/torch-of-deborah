import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useScope, useHubs, useStates, useTeam, useSettings, Head } from "./common.jsx";
import { STATES, stateName } from "../../data/states.js";
import { capacityOf } from "../../lib/shared.js";
import { ErrorText, Loading, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

const nf = new Intl.NumberFormat("en-NG");

export default function Overview() {
  const s = useScope();
  const states = useStates();
  const hubs = useHubs();
  const team = useTeam();
  const settings = useSettings().data;
  const [run, busy] = useAction();

  const rows = useMemo(() => {
    const byState = Object.fromEntries(states.data.map((d) => [d.id, d.counts || {}]));
    const coordinators = Object.fromEntries(team.data.filter((u) => u.role === "coordinator").map((u) => [u.stateCode, u.name]));
    return STATES.filter((x) => !s.coordinator || x.code === s.stateCode).map((x) => {
      const hs = hubs.data.filter((h) => h.stateCode === x.code && h.active !== false);
      const ready = hs.filter((h) => h.leaderEmail);
      return {
        ...x,
        registered: byState[x.code]?.registrations || 0,
        waiting: byState[x.code]?.waiting || 0,
        hubs: hs.length,
        space: ready.reduce((a, h) => a + Math.max(capacityOf(h, settings) - (h.count || 0), 0), 0),
        coordinator: coordinators[x.code] || "",
      };
    });
  }, [states.data, hubs.data, team.data, settings, s.coordinator, s.stateCode]);

  if (states.loading || hubs.loading) return <Loading />;
  const total = (k) => rows.reduce((a, r) => a + r[k], 0);
  const waitingStates = rows.filter((r) => r.waiting > 0);
  const active = rows.filter((r) => r.registered > 0 || r.hubs > 0 || r.coordinator);

  return (
    <>
      <Head title={s.coordinator ? stateName(s.stateCode) : "Overview"} />
      <ErrorText error={states.error || hubs.error} />
      <div className="stats">
        <div className="stat"><b>{nf.format(total("registered"))}</b><span>women registered</span></div>
        <div className="stat"><b>{nf.format(total("registered") - total("waiting"))}</b><span>in a prayer hub</span></div>
        <div className="stat"><b>{nf.format(hubs.data.filter((h) => h.active !== false).length)}</b><span>prayer hubs</span></div>
      </div>

      {waitingStates.map((r) => (
        <div className="callout" key={r.code}>
          <span><strong>{r.waiting} {r.waiting === 1 ? "woman is" : "women are"} waiting for a hub</strong> in {r.name}. {r.space > 0 ? `There ${r.space === 1 ? "is 1 place" : `are ${r.space} places`} free.` : "No hub has space. Create a hub or give one a leader."}</span>
          {r.space > 0
            ? <button className="btn sm" disabled={busy} onClick={() => run(() => api.admin("placeWaiting", { stateCode: r.code }), (x) => `${x.placed} placed in hubs.`)}>Place them now</button>
            : <Link className="btn sm" to="/app/hubs">Go to hubs</Link>}
        </div>
      ))}

      {!s.coordinator && (
        active.length === 0 ? (
          <p className="muted">No registrations yet. Start by adding coordinators on the <Link to="/app/team">Team</Link> page and creating <Link to="/app/hubs">hubs</Link>.</p>
        ) : (
          <div className="scroll">
            <table className="table">
              <thead><tr><th>State</th><th className="num">Registered</th><th className="num">Waiting</th><th className="num">Hubs</th><th className="hide-sm">Coordinator</th></tr></thead>
              <tbody>
                {active.sort((a, b) => b.registered - a.registered).map((r) => (
                  <tr key={r.code}>
                    <td>{r.name}</td>
                    <td className="num">{nf.format(r.registered)}</td>
                    <td className="num">{r.waiting || "—"}</td>
                    <td className="num">{r.hubs}</td>
                    <td className="hide-sm">{r.coordinator || <span className="sub">None yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  );
}
