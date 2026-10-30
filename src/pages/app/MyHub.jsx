import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveQuery } from "../../lib/hooks.js";
import { useScope, useHubs, useSettings, PageTitle } from "./common.jsx";
import { stateName } from "../../data/states.js";
import { JOIN_STATUSES, participantCapacity, todayInZone, waLink, nextMeeting, formatInZone } from "../../lib/shared.js";
import { Badge, Empty, ErrorBox, Field, Loading, useAction, useToast } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { copyText, daysSince, fmtDay } from "../../lib/format.js";
import ParticipantDrawer from "./ParticipantDrawer.jsx";

export default function MyHub({ overview = false }) {
  const s = useScope();
  const hubs = useHubs();
  const settings = useSettings().data;
  const [hubId, setHubId] = useState("");
  const [open, setOpen] = useState(null);
  const toast = useToast();
  useEffect(() => { if (!hubId && hubs.data.length) setHubId(hubs.data[0].id); }, [hubs.data, hubId]);
  const hub = hubs.data.find((h) => h.id === hubId);
  const members = useLiveQuery(() => (hubId ? query(collection(db, "participants"), where("hubId", "==", hubId)) : null), [hubId]);
  const today = todayInZone(settings.timezone || "Africa/Lagos");

  useEffect(() => {
    if (!overview && window.location.hash === "#group") setTimeout(() => document.getElementById("group")?.scrollIntoView(), 300);
  }, [overview, hub]);

  if (hubs.loading) return <Loading />;
  if (!hub) return <><PageTitle title="My prayer hub" /><div className="card"><Empty title="You are not assigned to a hub yet">Your state coordinator will assign you.</Empty></div></>;

  const list = members.data.filter((p) => p.status === "assigned").sort((a, b) => a.fullName.localeCompare(b.fullName));
  const joined = list.filter((p) => p.joinStatus === "confirmed").length;
  const quiet = list.filter((p) => daysSince(p.lastParticipation, today) > (settings.inactiveAfterDays || 7)).length;
  const next = nextMeeting(settings, [])[0];
  const cap = participantCapacity(hub, settings);
  const welcomeMsg = `Welcome to ${hub.name}, our Torch of Deborah prayer hub! We pray daily for Nigeria. Join our WhatsApp group here: ${hub.whatsappLink || "(link coming soon)"}`;

  return (
    <>
      <PageTitle title={overview ? `Welcome, ${s.profile.name.split(" ")[0]}` : hub.name} sub={overview ? `You lead ${hub.name} in ${stateName(hub.stateCode)}.` : `${stateName(hub.stateCode)}${hub.lga ? ` · ${hub.lga}` : ""} · ${hub.code}`}>
        {hubs.data.length > 1 && (
          <select className="input" value={hubId} onChange={(e) => setHubId(e.target.value)} aria-label="Choose hub" style={{ minHeight: 40 }}>
            {hubs.data.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
      </PageTitle>

      <dl className="metrics">
        <div className="metric"><dt>Members</dt><dd>{list.length}<small>of {cap}</small></dd></div>
        <div className="metric"><dt>Confirmed in group</dt><dd>{joined}</dd></div>
        <div className="metric"><dt>Not in the group yet</dt><dd>{list.length - joined}</dd></div>
        <div className="metric"><dt>Quiet for {settings.inactiveAfterDays || 7}+ days</dt><dd>{quiet}</dd></div>
      </dl>

      {overview && (
        <div className="cols-2" style={{ marginBottom: 18 }}>
          <div className="card">
            <h2>Next prayer meeting</h2>
            {next ? <p style={{ fontFamily: "var(--display)", fontSize: 24, margin: 0, color: "var(--forest)" }}>{formatInZone(next.start, settings.timezone)}</p> : <p className="muted">Not scheduled yet.</p>}
            <p className="small"><Link to="/app/schedule">Prayer schedule</Link> · <Link to="/app/attendance">Record attendance</Link> · <Link to="/app/follow-ups">Follow-ups</Link></p>
          </div>
          <div className="card">
            <h2>Group links</h2>
            {hub.whatsappLink ? <p className="small" style={{ margin: 0 }}>WhatsApp group link is set. <Link to="/app/hub#group">Manage</Link></p> : <div className="notice warn" style={{ marginTop: 0 }}>Add your WhatsApp group invitation link so new members can join. <Link to="/app/hub#group">Add it now</Link></div>}
          </div>
        </div>
      )}

      <div className="cols-3">
        <div>
          <ErrorBox error={members.error} />
          {members.loading ? <Loading /> : list.length === 0 ? <div className="card"><Empty title="No members yet">New registrations in your state are placed here automatically.</Empty></div> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Member</th><th>Phone</th><th>Group</th><th>Last prayed</th></tr></thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="click" onClick={() => setOpen(p.id)}>
                      <td><strong>{p.fullName}</strong><div className="sub">{p.lga}</div></td>
                      <td onClick={(e) => e.stopPropagation()}><a href={waLink(p.phone)} target="_blank" rel="noopener">{p.phone}</a></td>
                      <td><Badge value={p.joinStatus} label={JOIN_STATUSES[p.joinStatus]} /></td>
                      <td>{p.lastParticipation ? fmtDay(p.lastParticipation) : <span className="sub">Not yet</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!overview && (
          <div className="stack" id="group">
            <GroupLinks hub={hub} />
            <div className="card">
              <h2>Welcome message</h2>
              <p className="small" style={{ whiteSpace: "pre-line" }}>{welcomeMsg}</p>
              <button className="btn btn-quiet btn-sm" onClick={async () => (await copyText(welcomeMsg)) && toast("Message copied")}>Copy message</button>
            </div>
          </div>
        )}
      </div>
      {open && <ParticipantDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function GroupLinks({ hub }) {
  const [wa, setWa] = useState(hub.whatsappLink || "");
  const [tg, setTg] = useState(hub.telegramLink || "");
  const [run, busy] = useAction();
  useEffect(() => { setWa(hub.whatsappLink || ""); setTg(hub.telegramLink || ""); }, [hub.id, hub.whatsappLink, hub.telegramLink]);
  return (
    <div className="card">
      <h2>Group information</h2>
      <Field label="WhatsApp group invitation link" id="gw" hint="In WhatsApp: group info → Invite via link → Copy link."><input id="gw" className="input" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="https://chat.whatsapp.com/…" /></Field>
      <Field label="Hub Telegram link" optional id="gt" hint="Leave empty to use the central community."><input id="gt" className="input" value={tg} onChange={(e) => setTg(e.target.value)} /></Field>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => api.admin("updateHubLinks", { hubId: hub.id, whatsappLink: wa, telegramLink: tg }), "Links saved. Members see them on their welcome pages.")}>Save links</button>
      {hub.zoomLink && <p className="small" style={{ marginTop: 14 }}>Hub Zoom: <a href={hub.zoomLink} target="_blank" rel="noopener">open</a></p>}
    </div>
  );
}
