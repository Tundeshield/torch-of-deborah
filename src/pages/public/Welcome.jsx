import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Field, Loading, Modal, useToast } from "../../components/ui.jsx";
import { copyText, fmtDay } from "../../lib/format.js";
import { formatInZone, formatTime12, nextMeeting } from "../../lib/shared.js";

export default function Welcome() {
  const { token } = useParams();
  if (!token) return <FindHub />;
  return <WelcomePage token={token} />;
}

function FindHub() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  let saved = null;
  try { saved = localStorage.getItem("tod_welcome"); } catch { /* ignore */ }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      setMsg((await api.resendLink(email)).message);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-head">
        <div className="narrow">
          <h1>Find my prayer hub</h1>
          <p>Enter the email you registered with. We will send you a fresh link to your welcome page.</p>
        </div>
      </div>
      <form className="form-shell" onSubmit={submit}>
        {saved && (
          <div className="form-note">
            This phone has your welcome page saved. <Link to={`/welcome/${saved}`}>Open my welcome page</Link>
          </div>
        )}
        <Field label="Email address" id="em">
          <input id="em" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {msg && <div className="notice" role="status">{msg}</div>}
        <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={busy}>{busy ? "Sending…" : "Email me my link"}</button>
        <p className="small muted" style={{ marginTop: 18 }}>Not registered yet? <Link to="/join">Join the movement</Link></p>
      </form>
    </>
  );
}

function WelcomePage({ token }) {
  const { data, loading, error, reload } = useAsync(() => api.welcome(token), [token]);
  const location = useLocation();
  const fresh = location.state?.fresh;
  const toast = useToast();
  const [reassign, setReassign] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("tod_welcome", token); } catch { /* ignore */ }
  }, [token]);

  const meetings = useMemo(() => {
    if (!data) return [];
    const zoomFallback = data.hub?.zoomLink || data.stateZoomLink || data.settings.zoomLink;
    return nextMeeting(data.settings, data.meetings).map((m) => ({ ...m, zoomLink: m.zoomLink || zoomFallback }));
  }, [data]);

  if (loading) return <Loading label="Opening your welcome page…" />;
  if (error) {
    return (
      <div className="page-head" style={{ minHeight: "60vh" }}>
        <div className="narrow">
          <h1>We could not open this page</h1>
          <p>{error.message}</p>
          <div className="hero-actions"><Link className="btn btn-gold" to="/welcome">Get a fresh link</Link></div>
        </div>
      </div>
    );
  }

  const { participant: p, hub, settings, coordinator, announcements } = data;
  const tz = settings.timezone || "Africa/Lagos";
  const next = meetings[0];
  const telegram = hub?.telegramLink || settings.telegramLink;

  const act = async (action, extra, message) => {
    try {
      await api.participant(token, action, extra);
      if (message) toast(message);
      reload();
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  const openWhatsApp = () => {
    api.participant(token, "linkClicked").catch(() => {});
  };

  const inviteMsg = `I just joined The Torch of Deborah, 10,000 women praying daily for Nigeria for six months. Will you join me? Register here: ${window.location.origin}/join`;

  return (
    <>
      <div className="welcome-head">
        <div className="wrap">
          <h1>{fresh ? "Welcome to the Torch of Deborah!" : `Welcome back, ${p.firstName}`}</h1>
          <p>
            {fresh ? `Your registration has been received, ${p.firstName}. ` : ""}
            {hub ? "Here is your prayer hub and everything you need to pray with us." : "Your place in the movement is secured. We are preparing a prayer hub for you."}
          </p>
          <p className="small" style={{ opacity: .75 }}>Bookmark this page. It is your personal link, so please do not share it.</p>
        </div>
      </div>

      <div className="wrap welcome-grid">
        <div>
          <section className="panel hub-panel" aria-labelledby="hub-h">
            <h2 id="hub-h">{hub ? hub.name : "Your prayer hub is being prepared"}</h2>
            {hub ? (
              <>
                <dl className="kv">
                  <dt>Name</dt><dd>{p.fullName}</dd>
                  <dt>State</dt><dd>{p.stateName}{p.stateCode === "INTL" && p.country ? ` · ${p.country}` : ""}</dd>
                  <dt>{p.stateCode === "INTL" ? "City" : "LGA"}</dt><dd>{p.lga}</dd>
                  <dt>Hub leader</dt><dd>{hub.leaderName || "To be announced"}</dd>
                  {hub.leaderPhone && <><dt>Leader's phone</dt><dd><a href={`tel:${hub.leaderPhone}`}>{hub.leaderPhone}</a>{hub.leaderWhatsApp && <> · <a href={hub.leaderWhatsApp} target="_blank" rel="noopener">WhatsApp</a></>}</dd></>}
                </dl>
                <div className="actions-row">
                  {hub.whatsappLink ? (
                    <>
                      <a className="btn btn-whatsapp" href={hub.whatsappLink} target="_blank" rel="noopener" onClick={openWhatsApp}>Join my prayer hub</a>
                      <button className="btn btn-quiet" onClick={async () => (await copyText(hub.whatsappLink)) && toast("Group link copied")}>Copy group link</button>
                    </>
                  ) : (
                    <div className="notice warn" style={{ marginTop: 0 }}>Your hub leader is setting up the WhatsApp group. Check back soon, or message your leader.</div>
                  )}
                </div>
                {p.joinStatus === "confirmed" ? (
                  <div className="notice">You have confirmed you are in your hub's WhatsApp group.</div>
                ) : hub.whatsappLink ? (
                  <p className="small muted" style={{ marginTop: 16 }}>
                    Once you are inside the WhatsApp group, <button className="linkish" onClick={() => act("confirmJoined", {}, "Thank you. Your leader can see you have joined.")}>let us know you have joined</button>.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p>
                  Every hub in {p.stateName} is full or still waiting for a leader. Your state coordinator has been told{coordinator ? ` (${coordinator.name})` : ""}, and we will email you as soon as you are placed. This page will update too.
                </p>
                <dl className="kv">
                  <dt>Name</dt><dd>{p.fullName}</dd>
                  <dt>State</dt><dd>{p.stateName}</dd>
                  <dt>{p.stateCode === "INTL" ? "City" : "LGA"}</dt><dd>{p.lga}</dd>
                </dl>
              </>
            )}
          </section>

          <section className="panel" aria-labelledby="comm-h">
            <h2 id="comm-h">Our central community</h2>
            <p className="muted">Announcements for the whole movement are shared in our Telegram community.</p>
            {telegram ? (
              <div className="actions-row">
                <a className="btn btn-primary" href={telegram} target="_blank" rel="noopener">Join the Telegram community</a>
                <button className="btn btn-quiet" onClick={async () => (await copyText(telegram)) && toast("Telegram link copied")}>Copy link</button>
              </div>
            ) : <p className="small muted">The Telegram link will appear here soon.</p>}
          </section>

          <section className="panel" aria-labelledby="ann-h">
            <h2 id="ann-h">Announcements</h2>
            {announcements.length ? (
              <ul className="list-plain">
                {announcements.map((a) => (
                  <li key={a.id} className="ann">
                    <h3>{a.title}</h3>
                    <div className="tiny muted">{a.sentAt ? new Date(a.sentAt).toLocaleDateString("en-NG", { day: "numeric", month: "long" }) : ""}</div>
                    <p>{a.body}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No announcements yet.</p>}
          </section>
        </div>

        <div>
          <section className="panel next-meeting" aria-labelledby="sched-h">
            <h2 id="sched-h">Daily prayer</h2>
            {next ? (
              <>
                <div className="muted small">{next.kind === "special" ? next.title : "Next prayer meeting"}</div>
                <div className="when">{formatInZone(next.start, tz)}</div>
                <div className="small muted">
                  Nigeria time ({tz}).{Intl.DateTimeFormat().resolvedOptions().timeZone !== tz && ` Your time: ${next.start.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.`}
                </div>
                {next.theme && <p style={{ marginTop: 14 }}><strong>Prayer focus:</strong> {next.theme}</p>}
                {next.notes && <p className="small">{next.notes}</p>}
                {next.zoomLink ? (
                  <div className="actions-row">
                    <a className="btn btn-primary" href={next.zoomLink} target="_blank" rel="noopener">Join on Zoom</a>
                  </div>
                ) : <p className="small muted">The Zoom link will appear here before the meeting.</p>}
                {(settings.zoomMeetingId || settings.zoomPasscode) && (
                  <p className="small muted" style={{ marginTop: 10 }}>
                    {settings.zoomMeetingId && <>Meeting ID: <strong>{settings.zoomMeetingId}</strong> </>}
                    {settings.zoomPasscode && <>Passcode: <strong>{settings.zoomPasscode}</strong></>}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                {settings.startDate ? `The six-month programme runs from ${fmtDay(settings.startDate)}.` : "The prayer start date will be announced soon."}
                {settings.dailyTime && ` We pray daily at ${formatTime12(settings.dailyTime)}.`}
              </p>
            )}
            <p className="small" style={{ marginTop: 16 }}>
              Every day, one hour{settings.dailyTime ? `, from ${formatTime12(settings.dailyTime)}` : ""}{settings.startDate ? `, starting ${fmtDay(settings.startDate)}` : ""}.
            </p>
            {settings.prayerInstructions && <p className="small muted">{settings.prayerInstructions}</p>}
            {meetings.slice(1, 4).length > 0 && (
              <>
                <h3 style={{ marginTop: 18 }}>Coming up</h3>
                <ul className="list-plain small">
                  {meetings.slice(1, 4).map((m, i) => <li key={i}>{formatInZone(m.start, tz)} — {m.title}{m.theme ? `: ${m.theme}` : ""}</li>)}
                </ul>
              </>
            )}
            <div style={{ marginTop: 18 }}>
              {p.prayedToday ? (
                <div className="notice">You marked today's prayer as done. Thank you for standing in the gap.</div>
              ) : (
                <button className="btn btn-quiet btn-block" onClick={() => act("prayed", {}, "Recorded. Thank you for praying today.")}>I prayed today</button>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="inv-h">
            <h2 id="inv-h">Invite a woman</h2>
            <p className="small muted">Share the call with friends and family.</p>
            <div className="actions-row">
              <a className="btn btn-whatsapp btn-sm" href={`https://wa.me/?text=${encodeURIComponent(inviteMsg)}`} target="_blank" rel="noopener">Share on WhatsApp</a>
              <button className="btn btn-quiet btn-sm" onClick={async () => (await copyText(inviteMsg)) && toast("Invitation copied")}>Copy invitation</button>
            </div>
          </section>

          <section className="panel" aria-labelledby="help-h">
            <h2 id="help-h">Need help?</h2>
            {coordinator && <p className="small">Your state coordinator: <strong>{coordinator.name}</strong>{coordinator.phone && <> · <a href={`tel:${coordinator.phone}`}>{coordinator.phone}</a></>}</p>}
            {settings.contactEmail && <p className="small">National team: <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></p>}
            {hub && (
              p.reassignRequested
                ? <div className="notice">Your request to change hubs has been sent. Your coordinator will be in touch.</div>
                : <button className="linkish small" onClick={() => setReassign(true)}>Ask to change my prayer hub</button>
            )}
          </section>
        </div>
      </div>

      {reassign && <ReassignModal onClose={() => setReassign(false)} onSubmit={async (reason) => { await act("requestReassign", { reason }, "Request sent to your coordinator."); setReassign(false); }} />}
    </>
  );
}

function ReassignModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Change my prayer hub" onClose={onClose} footer={<>
      <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={() => onSubmit(reason)} disabled={reason.trim().length < 5}>Send request</button>
    </>}>
      <Field label="Why would you like to change hubs?" id="rr" hint="For example: I moved to another state, or the meeting language does not suit me.">
        <textarea id="rr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={600} />
      </Field>
    </Modal>
  );
}
