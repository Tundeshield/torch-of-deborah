// Every change made from the dashboard goes through here, is checked against the person's role, and is logged.
import { db, auth, handler, json, readJson, HttpError, requireStaff, isAdmin, canState, canHub, assert, getSettings, logActivity, bumpState, FieldValue } from "./_lib/core.js";
import { moveParticipant } from "./_lib/allocate.js";
import { DEFAULT_SETTINGS, ROLES, normalizeEmail, isValidEmail, isValidPhone, capacityOf } from "../../src/lib/shared.js";
import { STATE_BY_CODE } from "../../src/data/states.js";

const str = (v, n = 300) => String(v ?? "").trim().slice(0, n);
const link = (v, what) => {
  const s = str(v, 500);
  if (s && !/^https:\/\//i.test(s)) throw new HttpError(400, `The ${what} must start with https://`);
  return s;
};

async function refreshClaims(email) {
  const s = await db().doc(`users/${email}`).get();
  const uid = s.exists ? s.data().uid : null;
  if (!uid) return;
  const u = s.data();
  await auth().setCustomUserClaims(uid, u.removed ? null : { role: u.role, stateCode: u.stateCode || null, hubIds: (u.hubIds || []).slice(0, 30) }).catch(() => {});
}

// ---------- Hubs ----------

async function saveHub(actor, b) {
  const stateCode = str(b.stateCode, 8);
  assert(STATE_BY_CODE[stateCode], 400, "Choose a state.");
  assert(canState(actor, stateCode), 403, "You can only manage hubs in your state.");
  const name = str(b.name, 100);
  assert(name.length >= 2, 400, "Give the hub a name.");
  const settings = await getSettings();
  const fields = {
    name,
    stateCode,
    lga: str(b.lga, 120),
    capacity: Math.max(1, Math.min(200, parseInt(b.capacity, 10) || settings.defaultHubCapacity)),
    whatsappLink: link(b.whatsappLink, "WhatsApp link"),
    active: b.active !== false,
  };
  const leaderEmail = b.leaderEmail ? normalizeEmail(b.leaderEmail) : null;

  const changed = await db().runTransaction(async (tx) => {
    const ref = b.id ? db().doc(`hubs/${str(b.id, 60)}`) : db().collection("hubs").doc();
    const old = b.id ? await tx.get(ref) : null;
    if (b.id) {
      assert(old.exists, 404, "Hub not found.");
      assert(canState(actor, old.data().stateCode), 403, "You can only manage hubs in your state.");
      assert(old.data().stateCode === stateCode || !(old.data().count > 0), 400, "Move this hub's members out before changing its state.");
    }
    const prevLeader = old?.exists ? old.data().leaderEmail || null : null;
    let leader = null;
    if (leaderEmail) {
      const ls = await tx.get(db().doc(`users/${leaderEmail}`));
      assert(ls.exists, 400, "Add the leader to the team first.");
      leader = ls.data();
      assert(isAdmin(actor) || leader.stateCode === stateCode, 400, "Choose a leader from this state.");
    }
    const members = old?.exists && (prevLeader !== leaderEmail || old.data().name !== name) ? await tx.get(db().collection("participants").where("hubId", "==", ref.id)) : null;

    Object.assign(fields, leader ? { leaderEmail, leaderName: leader.name, leaderPhone: leader.phone || "" } : { leaderEmail: null, leaderName: null, leaderPhone: null });
    if (!old) Object.assign(fields, { count: 0, createdAt: FieldValue.serverTimestamp() });
    tx.set(ref, fields, { merge: true });
    if (prevLeader !== leaderEmail) {
      if (prevLeader) tx.set(db().doc(`users/${prevLeader}`), { hubIds: FieldValue.arrayRemove(ref.id) }, { merge: true });
      if (leaderEmail) tx.set(db().doc(`users/${leaderEmail}`), { hubIds: FieldValue.arrayUnion(ref.id) }, { merge: true });
    }
    members?.forEach((d) => tx.update(d.ref, { hubName: name, leaderName: fields.leaderName }));
    logActivity(tx, actor, b.id ? "hub.updated" : "hub.created", { id: ref.id, name, stateCode });
    return { id: ref.id, emails: prevLeader !== leaderEmail ? [prevLeader, leaderEmail].filter(Boolean) : [] };
  });
  for (const e of changed.emails) await refreshClaims(e);
  return { id: changed.id };
}

async function updateHubLink(actor, b) {
  const ref = db().doc(`hubs/${str(b.hubId, 60)}`);
  const s = await ref.get();
  assert(s.exists, 404, "Hub not found.");
  assert(canHub(actor, { id: s.id, ...s.data() }), 403, "This is not your hub.");
  await ref.update({ whatsappLink: link(b.whatsappLink, "WhatsApp link") });
  return { ok: true };
}

// ---------- People ----------

async function move(actor, b) {
  const s = await db().doc(`participants/${str(b.participantId, 60)}`).get();
  assert(s.exists, 404, "This person was not found.");
  assert(canState(actor, s.data().stateCode), 403, "You can only manage people in your state.");
  const target = b.target === "auto" ? "auto" : b.target ? str(b.target, 60) : null;
  const r = await moveParticipant({ participantId: s.id, target, actor, canUseState: (code) => canState(actor, code) });
  return { hubName: r.hub?.name || null };
}

async function placeWaiting(actor, b) {
  const stateCode = str(b.stateCode, 8);
  assert(canState(actor, stateCode), 403, "You can only manage your state.");
  const waiting = await db().collection("participants").where("stateCode", "==", stateCode).where("status", "==", "waiting").limit(100).get();
  let placed = 0;
  for (const d of waiting.docs) {
    try {
      await moveParticipant({ participantId: d.id, target: "auto", actor });
      placed++;
    } catch {
      break; // no more space
    }
  }
  return { placed, left: waiting.size - placed };
}

async function setRemoved(actor, b, removed) {
  await db().runTransaction(async (tx) => {
    const ref = db().doc(`participants/${str(b.id, 60)}`);
    const s = await tx.get(ref);
    assert(s.exists, 404, "This person was not found.");
    const p = s.data();
    assert(canState(actor, p.stateCode), 403, "You can only manage people in your state.");
    if (removed === (p.status === "removed")) return;
    const hub = p.hubId ? await tx.get(db().doc(`hubs/${p.hubId}`)) : null;
    if (removed) {
      if (hub?.exists) tx.update(hub.ref, { count: Math.max((hub.data().count || 0) - 1, 0) });
      tx.update(ref, { status: "removed", hubId: null, hubName: null, leaderName: null, removedAt: FieldValue.serverTimestamp() });
      bumpState(tx, p.stateCode, { registrations: -1, assigned: p.status === "assigned" ? -1 : 0, waiting: p.status === "waiting" ? -1 : 0 });
    } else {
      tx.update(ref, { status: "waiting", removedAt: null });
      bumpState(tx, p.stateCode, { registrations: 1, waiting: 1 });
    }
    logActivity(tx, actor, removed ? "removed" : "restored", { id: ref.id, name: p.fullName, stateCode: p.stateCode });
  });
  return { ok: true };
}

// ---------- Team ----------

function canManage(actor, role, stateCode) {
  if (isAdmin(actor)) return true;
  return actor.role === "coordinator" && role === "leader" && stateCode === actor.stateCode;
}

async function saveMember(actor, b) {
  const email = normalizeEmail(b.email);
  assert(isValidEmail(email), 400, "Enter their Gmail or Google account email.");
  const role = ROLES[b.role] ? b.role : null;
  assert(role, 400, "Choose a role.");
  const stateCode = role === "admin" ? null : str(b.stateCode, 8);
  if (role !== "admin") assert(STATE_BY_CODE[stateCode], 400, "Choose their state.");
  assert(canManage(actor, role, stateCode), 403, "You cannot give someone that role.");
  const name = str(b.name, 120);
  assert(name.length >= 2, 400, "Enter their name.");
  const phone = str(b.phone, 30);
  if (phone) assert(isValidPhone(phone), 400, "Check the phone number.");
  assert(email !== actor.email || role === actor.role, 400, "You cannot change your own role.");

  const ref = db().doc(`users/${email}`);
  const old = await ref.get();
  if (b.isNew) assert(!old.exists, 409, "This person is already on the team.");
  if (old.exists) assert(canManage(actor, old.data().role, old.data().stateCode), 403, "You cannot edit this person.");

  const batch = db().batch();
  batch.set(ref, { email, name, phone, role, stateCode, ...(old.exists ? {} : { hubIds: [], createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  // Keep the leader's name and phone current on the hubs they lead.
  if (old.exists) {
    const hubs = await db().collection("hubs").where("leaderEmail", "==", email).get();
    hubs.forEach((h) => batch.update(h.ref, { leaderName: name, leaderPhone: phone }));
  }
  logActivity(batch, actor, old.exists ? "team.updated" : "team.added", { id: email, name, stateCode }, { role });
  await batch.commit();
  await refreshClaims(email);
  return { ok: true };
}

async function removeMember(actor, b) {
  const email = normalizeEmail(b.email);
  assert(email !== actor.email, 400, "You cannot remove yourself.");
  const ref = db().doc(`users/${email}`);
  const s = await ref.get();
  assert(s.exists, 404, "Not on the team.");
  assert(canManage(actor, s.data().role, s.data().stateCode), 403, "You cannot remove this person.");
  const uid = s.data().uid;
  const hubs = await db().collection("hubs").where("leaderEmail", "==", email).get();
  const batch = db().batch();
  hubs.forEach((h) => batch.update(h.ref, { leaderEmail: null, leaderName: null, leaderPhone: null }));
  batch.delete(ref);
  logActivity(batch, actor, "team.removed", { id: email, name: s.data().name, stateCode: s.data().stateCode });
  await batch.commit();
  if (uid) {
    await auth().setCustomUserClaims(uid, null).catch(() => {});
    await auth().revokeRefreshTokens(uid).catch(() => {});
  }
  return { ok: true };
}

// ---------- Settings ----------

async function saveSettings(actor, b) {
  assert(isAdmin(actor), 403, "Only admins can change settings.");
  const f = b.fields || {};
  const out = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (f[k] === undefined) continue;
    if (typeof def === "boolean") out[k] = Boolean(f[k]);
    else if (typeof def === "number") out[k] = Math.max(1, Math.min(200, parseInt(f[k], 10) || def));
    else if (k.endsWith("Link")) out[k] = link(f[k], k === "zoomLink" ? "Zoom link" : "Telegram link");
    else out[k] = str(f[k], 200);
  }
  if (out.dailyTime) assert(/^\d{2}:\d{2}$/.test(out.dailyTime), 400, "Choose a prayer time.");
  const batch = db().batch();
  batch.set(db().doc("settings/programme"), out, { merge: true });
  logActivity(batch, actor, "settings.updated", { id: "settings" }, { fields: Object.keys(out) });
  await batch.commit();
  return { ok: true };
}

const ACTIONS = {
  saveHub,
  updateHubLink,
  moveParticipant: move,
  placeWaiting,
  removeParticipant: (a, b) => setRemoved(a, b, true),
  restoreParticipant: (a, b) => setRemoved(a, b, false),
  saveMember,
  removeMember,
  saveSettings,
};

export default handler(async (req) => {
  const body = await readJson(req);
  const actor = await requireStaff(req);
  const fn = ACTIONS[body.action];
  if (!fn) throw new HttpError(400, "Unknown action.");
  return json(200, { ok: true, ...(await fn(actor, body)) });
});
