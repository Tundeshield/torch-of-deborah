import crypto from "node:crypto";
import { db, handler, json, readJson, HttpError, getSettings, FieldValue } from "./_lib/core.js";
import { applyMove, hubsInState, hubInfo } from "./_lib/allocate.js";
import { normalizeEmail, normalizePhone, isValidEmail, isValidPhone, pickHub, CATEGORIES } from "../../src/lib/shared.js";
import { STATE_BY_CODE } from "../../src/data/states.js";

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

export default handler(async (req) => {
  const b = await readJson(req);
  if (b.website) return json(200, { ok: true }); // bot trap

  const v = {
    fullName: clip(b.fullName, 120),
    phone: clip(b.phone, 30),
    email: clip(b.email, 160),
    stateCode: clip(b.stateCode, 8),
    lga: clip(b.lga, 120),
    country: clip(b.country, 80),
    category: CATEGORIES[b.category] ? b.category : "Prayer Participant",
    church: clip(b.church, 200),
  };
  const errors = {};
  if (v.fullName.length < 3) errors.fullName = "Enter your full name.";
  if (!isValidPhone(v.phone)) errors.phone = "Enter your WhatsApp number, e.g. 0803 123 4567.";
  if (v.email && !isValidEmail(v.email)) errors.email = "Check your email address, or leave it empty.";
  if (!STATE_BY_CODE[v.stateCode]) errors.stateCode = "Choose your state.";
  if (!v.lga) errors.lga = v.stateCode === "INTL" ? "Enter your city and country." : "Choose your LGA.";
  if (b.consent !== true) errors.consent = "Please tick to agree.";
  if (Object.keys(errors).length) throw new HttpError(400, "Please check the highlighted fields.", { fields: errors });

  const phoneNorm = normalizePhone(v.phone);
  const deviceKey = crypto.randomBytes(24).toString("base64url");
  const ref = db().collection("participants").doc();

  const { hub } = await db().runTransaction(async (tx) => {
    const settings = await getSettings(tx);
    if (settings.registrationOpen === false) throw new HttpError(403, "Registration is closed at the moment.");
    const dupRef = db().doc(`dedupe/p${phoneNorm.replace(/\D/g, "")}`);
    const dup = await tx.get(dupRef);
    if (dup.exists) throw new HttpError(409, "This WhatsApp number is already registered. Your hub leader will message you on WhatsApp with your group link.", { duplicate: true });
    const hub = pickHub(await hubsInState(tx, v.stateCode), { stateCode: v.stateCode, lga: v.lga, settings });
    tx.set(dupRef, { participantId: ref.id });
    const participant = {
      ...v,
      email: v.email || null,
      emailNorm: v.email ? normalizeEmail(v.email) : null,
      church: v.church || null,
      country: v.stateCode === "INTL" ? v.country || null : "Nigeria",
      phoneNorm,
      nameLower: v.fullName.toLowerCase(),
      consentAt: new Date().toISOString(),
      deviceKeyHash: crypto.createHash("sha256").update(deviceKey).digest("hex"),
      createdAt: FieldValue.serverTimestamp(),
    };
    applyMove(tx, { ref, participant, prev: "new", from: null, to: hub, stateFrom: v.stateCode, stateTo: v.stateCode, actor: null });
    return { hub };
  });

  return json(200, { ok: true, deviceKey, ...(await hubInfo(v, hub)) });
});
