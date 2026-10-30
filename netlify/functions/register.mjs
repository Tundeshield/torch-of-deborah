import { db, handler, json, readJson, HttpError, getSettings, newToken, hashToken, siteUrl, queueMail, emailLayout, button, FieldValue } from "./_lib/core.js";
import { applyPlacement, readActiveHubs, notifyQueued } from "./_lib/allocate.js";
import { normalizeEmail, normalizePhone, isValidEmail, isValidPhone, pickHub, CATEGORIES, escapeHtml, formatTime12 } from "../../src/lib/shared.js";
import { STATE_BY_CODE, stateName } from "../../src/data/states.js";

const clip = (s, n) => String(s || "").trim().slice(0, n);

function validate(body) {
  const errors = {};
  const v = {
    fullName: clip(body.fullName, 120),
    phone: clip(body.phone, 30),
    email: clip(body.email, 160),
    stateCode: clip(body.stateCode, 8),
    country: clip(body.country, 80),
    lga: clip(body.lga, 120),
    category: clip(body.category, 40),
    onlineMeetings: body.onlineMeetings,
    inviteOthers: body.inviteOthers,
    inspiration: clip(body.inspiration, 1500),
    church: clip(body.church, 200),
    notes: clip(body.notes, 1500),
    consentPrivacy: body.consentPrivacy === true,
    consentComms: body.consentComms === true,
  };
  if (v.fullName.length < 3) errors.fullName = "Enter your full name.";
  if (!isValidPhone(v.phone)) errors.phone = "Enter a WhatsApp number we can reach, e.g. 0803 123 4567.";
  if (!isValidEmail(v.email)) errors.email = "Enter a valid email address.";
  if (!STATE_BY_CODE[v.stateCode]) errors.stateCode = "Choose your state of residence.";
  if (v.stateCode === "INTL") {
    if (!v.country) errors.country = "Tell us the country you live in.";
    if (!v.lga) errors.lga = "Tell us your city.";
  } else if (!v.lga) errors.lga = "Choose your Local Government Area.";
  if (!CATEGORIES.includes(v.category)) errors.category = "Choose how you would like to take part.";
  if (!["yes", "no", "sometimes"].includes(v.onlineMeetings)) errors.onlineMeetings = "Let us know about online prayer meetings.";
  if (!["yes", "no"].includes(v.inviteOthers)) errors.inviteOthers = "Let us know if you will invite other women.";
  if (v.inspiration.length < 3) errors.inspiration = "Share a few words about what inspired you to join.";
  if (!v.consentPrivacy) errors.consentPrivacy = "Please agree to how we handle your information.";
  if (!v.consentComms) errors.consentComms = "We need your permission to send you prayer updates.";
  return { v, errors };
}

export default handler(async (req) => {
  const body = await readJson(req);
  if (body.website) return json(200, { ok: true }); // honeypot for bots

  if (body.action === "resend") return resend(req, body);

  const { v, errors } = validate(body);
  if (Object.keys(errors).length) throw new HttpError(400, "Please check the highlighted fields.", { fields: errors });

  const phoneNorm = normalizePhone(v.phone);
  const emailNorm = normalizeEmail(v.email);
  const token = newToken();
  const pRef = db().collection("participants").doc();

  const outcome = await db().runTransaction(async (tx) => {
    const settings = await getSettings(tx);
    if (settings.registrationOpen === false) throw new HttpError(403, "Registration is closed at the moment.");
    const phoneKey = db().doc(`dedupe/p${phoneNorm.replace(/\D/g, "")}`);
    const emailKey = db().doc(`dedupe/e${hashToken(emailNorm).slice(0, 40)}`);
    const [ps, es] = await Promise.all([tx.get(phoneKey), tx.get(emailKey)]);
    if (ps.exists || es.exists) {
      throw new HttpError(409, ps.exists ? "This WhatsApp number is already registered." : "This email address is already registered.", { duplicate: true });
    }
    const hubs = await readActiveHubs(tx, v.stateCode);
    const hub = pickHub(hubs, { stateCode: v.stateCode, lga: v.lga, settings });

    const participant = {
      fullName: v.fullName,
      nameLower: v.fullName.toLowerCase(),
      phone: v.phone,
      phoneNorm,
      email: v.email,
      emailNorm,
      stateCode: v.stateCode,
      country: v.stateCode === "INTL" ? v.country : "Nigeria",
      lga: v.lga,
      category: v.category,
      onlineMeetings: v.onlineMeetings,
      inviteOthers: v.inviteOthers === "yes",
      inspiration: v.inspiration,
      church: v.church || null,
      notes: v.notes || null,
      consent: { privacy: true, communications: true, at: new Date().toISOString(), version: "2026-10" },
      tokenHashes: [hashToken(token)],
      followUp: { status: "none", note: "", at: null },
      lastParticipation: null,
      source: "web",
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(phoneKey, { participantId: pRef.id, kind: "phone" });
    tx.set(emailKey, { participantId: pRef.id, kind: "email" });
    const placed = applyPlacement(tx, { pRef, participant, oldHub: null, newHub: hub, settings, actor: null, isNew: true });
    return { settings, hub, participant: { ...participant, ...placed } };
  });

  const welcomeUrl = `${siteUrl(req)}/welcome/${token}`;
  const { hub, settings, participant } = outcome;

  // Welcome email
  const batch = db().batch();
  const name = escapeHtml(v.fullName.split(" ")[0]);
  const hubHtml = hub
    ? `<p>You have been placed in <strong>${escapeHtml(hub.name)}</strong> (${escapeHtml(stateName(hub.stateCode))})${hub.leaderName ? `, led by <strong>${escapeHtml(hub.leaderName)}</strong>` : ""}.</p><p>Tap the button below to open your welcome page and join your hub's WhatsApp group and our Telegram community.</p>`
    : `<p>Your registration is in. We are preparing a prayer hub with space for you in ${escapeHtml(stateName(v.stateCode))}, and your state coordinator has been told. We will email you as soon as you are placed. Your welcome page will update too.</p>`;
  const sched = settings.dailyTime ? `<p>We pray together every day at <strong>${formatTime12(settings.dailyTime)}</strong> (${escapeHtml(settings.timezone)}).</p>` : "";
  queueMail(batch, {
    to: v.email,
    subject: "Welcome to The Torch of Deborah",
    html: emailLayout(`Welcome, ${v.fullName.split(" ")[0]}`, `<p>Dear ${name},</p><p>Thank you for answering the call. You are now part of a movement of women standing in the gap for Nigeria.</p>${hubHtml}${sched}${button(welcomeUrl, hub ? "Join my prayer hub" : "Open my welcome page")}<p style="font-size:13px;color:#6b5f52">Keep this email. The button above is your personal link; please do not share it.</p>`),
    meta: { kind: "welcome", participantId: pRef.id },
  });
  if (hub?.leaderEmail) {
    queueMail(batch, {
      to: hub.leaderEmail,
      subject: `New member for ${hub.name}: ${v.fullName}`,
      html: emailLayout("A new member has joined your hub", `<p><strong>${escapeHtml(v.fullName)}</strong> (${escapeHtml(v.phone)}, ${escapeHtml(v.lga)}) has been placed in <strong>${escapeHtml(hub.name)}</strong>.</p><p>She has your WhatsApp group link. Please welcome her and mark her as joined once she is in the group.</p>${button(`${siteUrl(req)}/app/hub`, "Open my prayer hub")}`),
      meta: { kind: "leader_new_member", participantId: pRef.id },
    });
  }
  await batch.commit();
  if (!hub) await notifyQueued({ participant: { ...participant, id: pRef.id }, siteUrl: siteUrl(req) }).catch((e) => console.error(e));

  return json(200, { ok: true, token, assigned: Boolean(hub) });
});

// Re-sends the welcome link to the registered email. Never reveals whether the address exists.
async function resend(req, body) {
  const emailNorm = normalizeEmail(body.email);
  if (!isValidEmail(emailNorm)) throw new HttpError(400, "Enter the email address you registered with.");
  const snap = await db().collection("participants").where("emailNorm", "==", emailNorm).limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    const p = doc.data();
    const last = p.lastLinkResentAt?.toMillis?.() || 0;
    if (Date.now() - last > 5 * 60 * 1000 && !["deactivated", "duplicate"].includes(p.status)) {
      const token = newToken();
      const batch = db().batch();
      batch.update(doc.ref, { tokenHashes: [hashToken(token)], lastLinkResentAt: FieldValue.serverTimestamp() });
      queueMail(batch, {
        to: p.email,
        subject: "Your Torch of Deborah welcome link",
        html: emailLayout("Here is your welcome page", `<p>Dear ${escapeHtml(p.fullName.split(" ")[0])},</p><p>Use the button below to see your prayer hub, leader and group links. Earlier links no longer work.</p>${button(`${siteUrl(req)}/welcome/${token}`, "Open my welcome page")}`),
        meta: { kind: "resend_link", participantId: doc.id },
      });
      await batch.commit();
    }
  }
  return json(200, { ok: true, message: "If that email is registered, a fresh welcome link is on its way." });
}
