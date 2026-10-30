// Participant self-service, authorised by the secret token in her welcome link.
import { db, handler, json, HttpError, getSettings, hashToken, logActivity, bumpState, FieldValue } from "./_lib/core.js";
import { matchesParticipant, meetingApplies } from "./_lib/audience.js";
import { addDays, todayInZone, waLink } from "../../src/lib/shared.js";
import { stateName } from "../../src/data/states.js";

async function findByToken(token) {
  if (!token || String(token).length < 20) throw new HttpError(404, "This welcome link is not valid.");
  const snap = await db().collection("participants").where("tokenHashes", "array-contains", hashToken(token)).limit(1).get();
  if (snap.empty) throw new HttpError(404, "This welcome link is not valid or has been replaced. Request a fresh link below.");
  const doc = snap.docs[0];
  const p = { id: doc.id, ...doc.data() };
  if (p.status === "duplicate" || p.status === "deactivated") throw new HttpError(410, "This registration is no longer active. Contact the national team if you think this is a mistake.");
  return { ref: doc.ref, p };
}

async function view(token) {
  const { p } = await findByToken(token);
  const settings = await getSettings();
  const [hubSnap, stateSnap] = await Promise.all([
    p.hubId ? db().doc(`hubs/${p.hubId}`).get() : null,
    db().doc(`states/${p.stateCode}`).get(),
  ]);
  const hub = hubSnap?.exists ? hubSnap.data() : null;
  const st = stateSnap.exists ? stateSnap.data() : {};
  const today = todayInZone(settings.timezone);

  const mSnap = await db().collection("meetings").where("date", ">=", addDays(today, -1)).orderBy("date").limit(120).get();
  const meetings = mSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => meetingApplies(m, { stateCode: p.stateCode, hubId: p.hubId }))
    .map(({ id, kind, date, time, title, theme, notes, zoomLink, durationMinutes, scope }) => ({ id, kind, date, time, title, theme, notes, zoomLink, durationMinutes, scope }));

  const aSnap = await db().collection("announcements").where("status", "==", "sent").orderBy("sentAt", "desc").limit(40).get();
  const announcements = aSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => (a.channels || []).includes("portal") && matchesParticipant(a.audience, p))
    .slice(0, 12)
    .map((a) => ({ id: a.id, title: a.title, body: a.body, sentAt: a.sentAt?.toDate?.().toISOString() || null }));

  const selfSnap = await db().doc(`attendance/${today}_${p.id}_self`).get();

  return {
    participant: {
      firstName: p.fullName.split(" ")[0],
      fullName: p.fullName,
      stateCode: p.stateCode,
      stateName: stateName(p.stateCode),
      country: p.country,
      lga: p.lga,
      category: p.category,
      status: p.status,
      joinStatus: p.joinStatus,
      reassignRequested: Boolean(p.reassignRequest?.open),
      prayedToday: selfSnap.exists,
    },
    hub: hub
      ? {
          name: hub.name,
          lga: hub.lga || "",
          leaderName: hub.leaderName || "",
          leaderPhone: hub.leaderPhone || "",
          leaderWhatsApp: hub.leaderPhone ? waLink(hub.leaderPhone) : "",
          whatsappLink: hub.whatsappLink || "",
          telegramLink: hub.telegramLink || "",
          zoomLink: hub.zoomLink || "",
        }
      : null,
    coordinator: st.coordinatorName ? { name: st.coordinatorName, phone: st.coordinatorPhone || "" } : null,
    stateZoomLink: st.zoomLink || "",
    settings: {
      telegramLink: settings.telegramLink,
      zoomLink: settings.zoomLink,
      zoomMeetingId: settings.zoomMeetingId,
      zoomPasscode: settings.zoomPasscode,
      startDate: settings.startDate,
      durationMonths: settings.durationMonths,
      dailyTime: settings.dailyTime,
      durationMinutes: settings.durationMinutes,
      timezone: settings.timezone,
      prayerInstructions: settings.prayerInstructions,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
    },
    meetings,
    announcements,
  };
}

export default handler(async (req) => {
  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("t");
    return json(200, await view(token));
  }
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const body = await req.json().catch(() => ({}));
  const { ref, p } = await findByToken(body.token);
  const actor = { uid: `participant:${p.id}`, name: p.fullName, role: "participant" };
  const target = { type: "participant", id: p.id, name: p.fullName, stateCode: p.stateCode, hubId: p.hubId, participantId: p.id };

  switch (body.action) {
    case "linkClicked": {
      if (p.joinStatus === "issued") await ref.update({ joinStatus: "clicked", linkClickedAt: FieldValue.serverTimestamp() });
      return json(200, { ok: true });
    }
    case "confirmJoined": {
      if (!p.hubId) throw new HttpError(400, "You do not have a prayer hub yet.");
      if (p.joinStatus !== "confirmed") {
        const batch = db().batch();
        batch.update(ref, { joinStatus: "confirmed", joinConfirmedAt: FieldValue.serverTimestamp(), joinConfirmedBy: "participant" });
        bumpState(batch, p.stateCode, { joined: 1 });
        logActivity(batch, actor, "participant.confirmed_joined", target);
        await batch.commit();
      }
      return json(200, { ok: true });
    }
    case "prayed": {
      const settings = await getSettings();
      const date = todayInZone(settings.timezone);
      const batch = db().batch();
      batch.set(db().doc(`attendance/${date}_${p.id}_self`), {
        participantId: p.id,
        participantName: p.fullName,
        hubId: p.hubId || null,
        stateCode: p.stateCode,
        date,
        status: "participated",
        source: "self",
        recordedBy: actor.uid,
        recordedAt: FieldValue.serverTimestamp(),
      });
      batch.update(ref, { lastParticipation: date, lastSelfReport: date });
      await batch.commit();
      return json(200, { ok: true });
    }
    case "requestReassign": {
      const reason = String(body.reason || "").trim().slice(0, 600);
      if (reason.length < 5) throw new HttpError(400, "Tell us briefly why you would like to change hubs.");
      const batch = db().batch();
      batch.update(ref, { reassignRequest: { open: true, reason, at: FieldValue.serverTimestamp() } });
      logActivity(batch, actor, "participant.requested_reassignment", target, { reason });
      await batch.commit();
      return json(200, { ok: true });
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
});
