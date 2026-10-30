import { useEffect, useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useOnce } from "../../lib/hooks.js";
import { useScope, useHubs, useSettings, PageTitle } from "./common.jsx";
import { FOLLOW_UP_STATUSES, JOIN_STATUSES, todayInZone, waLink } from "../../lib/shared.js";
import { Badge, Empty, ErrorBox, Loading } from "../../components/ui.jsx";
import { daysSince, fmtDay } from "../../lib/format.js";
import ParticipantDrawer from "./ParticipantDrawer.jsx";

export default function FollowUps() {
  const s = useScope();
  const settings = useSettings().data;
  const hubs = useHubs();
  const [hubId, setHubId] = useState("");
  const [open, setOpen] = useState(null);
  const sorted = useMemo(() => [...hubs.data].sort((a, b) => a.name.localeCompare(b.name)), [hubs.data]);
  useEffect(() => { if (!hubId && sorted.length) setHubId(sorted[0].id); }, [sorted, hubId]);
  const members = useOnce(() => (hubId ? query(collection(db, "participants"), where("hubId", "==", hubId)) : null), [hubId, open]);
  const today = todayInZone(settings.timezone || "Africa/Lagos");
  const limitDays = settings.inactiveAfterDays || 7;

  const rows = members.data
    .filter((p) => p.status === "assigned")
    .map((p) => {
      const reasons = [];
      if (p.joinStatus !== "confirmed") reasons.push("Not confirmed in the WhatsApp group");
      const d = daysSince(p.lastParticipation, today);
      if (d > limitDays) reasons.push(p.lastParticipation ? `No prayer reported for ${d} days` : "No prayer reported yet");
      if (p.followUp?.status === "needed") reasons.push("Marked for follow-up");
      return { ...p, reasons };
    })
    .filter((p) => p.reasons.length && p.followUp?.status !== "resolved")
    .sort((a, b) => b.reasons.length - a.reasons.length);

  return (
    <>
      <PageTitle title="Follow-ups" sub="Women who may need a call or message. Reach out with care.">
        {sorted.length > 1 && <select className="input" style={{ minHeight: 40 }} value={hubId} onChange={(e) => setHubId(e.target.value)} aria-label="Hub">{sorted.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>}
      </PageTitle>
      <ErrorBox error={members.error} />
      {members.loading ? <Loading /> : rows.length === 0 ? <div className="card"><Empty title="No one needs follow-up right now">Everyone is in the group and has prayed recently.</Empty></div> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Member</th><th>Why</th><th>Group</th><th>Last prayed</th><th>Follow-up</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.fullName}</strong><div className="sub">{p.phone}</div></td>
                  <td className="small">{p.reasons.join("; ")}</td>
                  <td><Badge value={p.joinStatus} label={JOIN_STATUSES[p.joinStatus]} /></td>
                  <td>{p.lastParticipation ? fmtDay(p.lastParticipation) : "—"}</td>
                  <td><Badge value={p.followUp?.status || "none"} label={FOLLOW_UP_STATUSES[p.followUp?.status || "none"]} />{p.followUp?.note && <div className="sub">{p.followUp.note}</div>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a className="btn btn-whatsapp btn-sm" href={`${waLink(p.phone)}?text=${encodeURIComponent(`Hello ${p.fullName.split(" ")[0]}, this is your Torch of Deborah hub leader. Just checking in on you.`)}`} target="_blank" rel="noopener">Message</a>{" "}
                    <button className="btn btn-quiet btn-sm" onClick={() => setOpen(p.id)}>Update</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <ParticipantDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
