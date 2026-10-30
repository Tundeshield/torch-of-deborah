import { useState } from "react";
import { collection, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveQuery } from "../../lib/hooks.js";
import { useScope, PageTitle, StateSelect } from "./common.jsx";
import { ErrorBox, Loading, Empty } from "../../components/ui.jsx";
import { fmtDateTime } from "../../lib/format.js";
import { stateName } from "../../data/states.js";

const LABELS = {
  "participant.registered_assigned": (a) => `${a.targetName} registered and joined ${a.details?.toHubName || "a hub"}`,
  "participant.registered_queued": (a) => `${a.targetName} registered and is waiting for a hub`,
  "participant.assigned": (a) => `${a.targetName} moved ${a.details?.fromHubName ? `from ${a.details.fromHubName} ` : ""}to ${a.details?.toHubName}`,
  "participant.unassigned": (a) => `${a.targetName} moved to the waiting queue`,
  "participant.updated": (a) => `${a.targetName}'s details updated`,
  "participant.join_status": (a) => `${a.targetName}: group status set to ${a.details?.status}`,
  "participant.confirmed_joined": (a) => `${a.targetName} confirmed she joined her group`,
  "participant.follow_up": (a) => `Follow-up for ${a.targetName}: ${a.details?.status}`,
  "participant.deactivated": (a) => `${a.targetName}'s registration deactivated`,
  "participant.marked_duplicate": (a) => `${a.targetName} marked as a duplicate`,
  "participant.reactivated": (a) => `${a.targetName}'s registration reactivated`,
  "participant.requested_reassignment": (a) => `${a.targetName} asked to change hubs`,
  "participant.reassign_request_closed": (a) => `Hub change request from ${a.targetName} closed`,
  "hub.created": (a) => `Hub ${a.targetName} created`,
  "hub.updated": (a) => `Hub ${a.targetName} updated${a.details?.leader ? ` — leader: ${a.details.leader}` : ""}`,
  "hub.links_updated": (a) => `Group links updated for ${a.targetName}`,
  "leader.invited": (a) => `${a.targetName} invited as ${a.details?.role}`,
  "leader.updated": (a) => `${a.targetName}'s account updated`,
  "leader.deactivated": (a) => `${a.targetName}'s account deactivated`,
  "leader.access_reset": (a) => `Password reset issued for ${a.targetName}`,
  "state.updated": (a) => `${a.targetName} settings updated`,
  "settings.updated": () => "Programme settings updated",
  "schedule.added": (a) => `Schedule item added: ${a.targetName}`,
  "schedule.updated": (a) => `Schedule item updated: ${a.targetName}`,
  "schedule.removed": (a) => `Schedule item removed: ${a.targetName}`,
  "attendance.recorded": (a) => `Attendance recorded for ${a.targetName} (${a.details?.date}, ${a.details?.count})`,
  "report.exported": (a) => `Report exported: ${a.targetId} (${a.details?.rows} rows)`,
  "volunteer.added": (a) => `Volunteer added: ${a.targetName}`,
  "volunteer.updated": (a) => `Volunteer updated: ${a.targetName}`,
};

export function describeActivity(a) {
  const f = LABELS[a.action];
  if (f) return f(a);
  if (a.action?.startsWith("announcement.")) return `Announcement “${a.targetName}” ${a.action.split(".")[1].replace("_", " ")}`;
  return `${a.action} ${a.targetName || ""}`;
}

export default function Activity() {
  const s = useScope();
  const [stateFilter, setStateFilter] = useState("");
  const [n, setN] = useState(100);
  const logs = useLiveQuery(() => {
    const col = collection(db, "activityLogs");
    const st = s.coordinator ? s.stateCode : stateFilter;
    return st ? query(col, where("stateCode", "==", st), orderBy("at", "desc"), limit(n)) : query(col, orderBy("at", "desc"), limit(n));
  }, [s.coordinator, s.stateCode, stateFilter, n]);

  return (
    <>
      <PageTitle title="Activity log" sub="Every administrative change, who made it and when." />
      {s.national && <div className="toolbar"><div><label>State</label><StateSelect value={stateFilter} onChange={setStateFilter} /></div></div>}
      <ErrorBox error={logs.error} />
      {logs.loading ? <Loading /> : logs.data.length === 0 ? <Empty title="No activity yet" /> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>When</th><th>What happened</th><th>By</th><th>State</th></tr></thead>
            <tbody>
              {logs.data.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(a.at)}</td>
                  <td>{describeActivity(a)}{a.details?.reason && <div className="sub">Reason: {a.details.reason}</div>}</td>
                  <td>{a.actorName}<div className="sub">{a.actorRole}</div></td>
                  <td>{a.stateCode ? stateName(a.stateCode) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {logs.data.length >= n && <button className="btn btn-quiet" style={{ marginTop: 14 }} onClick={() => setN(n + 100)}>Show more</button>}
    </>
  );
}
