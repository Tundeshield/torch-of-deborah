// Authenticated operations for staff. Every write is authorised here, server-side, and logged.
import {
  db, auth, handler, json, readJson, HttpError, requireStaff, isNational, canState, canHub, assert,
  getSettings, logActivity, queueMail, emailLayout, button, bumpState, siteUrl, newToken, hashToken, FieldValue, Timestamp,
} from "./_lib/core.js";
import { moveParticipant, notifyMove, getHub } from "./_lib/allocate.js";
import { dispatchAnnouncement } from "./_lib/dispatch.js";
import {
  DEFAULT_SETTINGS, CATEGORIES, DEPARTMENTS, HUB_STATUSES, ATTENDANCE_STATUSES, JOIN_STATUSES, FOLLOW_UP_STATUSES,
  normalizeEmail, normalizePhone, isValidEmail, isValidPhone, participantCapacity, escapeHtml, ROLES,
} from "../../src/lib/shared.js";
import { STATE_BY_CODE, stateName } from "../../src/data/states.js";

const str = (v, n = 300) => String(v ?? "").trim().slice(0, n);
const url = (v) => {
  const s = str(v, 500);
  if (!s) return "";
  if (!/^https:\/\//i.test(s)) throw new HttpError(400, `Links must start with https:// (${s.slice(0, 40)})`);
  return s;
};

async function loadParticipant(id) {
  const s = await db().doc(`participants/${id}`).get();
  if (!s.exists) throw new HttpError(404, "Participant not found.");
  return { id: s.id, ref: s.ref, ...s.data() };
}

function targetOf(p) {
  return { type: "participant", id: p.id, name: p.fullName, stateCode: p.stateCode, hubId: p.hubId || null, participantId: p.id };
}

async function setClaims(uid, u) {
  await auth().setCustomUserClaims(uid, {
    role: u.role,
    stateCode: u.stateCode || null,
    hubIds: (u.hubIds || []).slice(0, 30),
    active: u.active !== false,
  });
}

// ---------------- Hubs ----------------

async function saveHub(actor, b, settings) {
  const stateCode = str(b.stateCode, 8);
  assert(STATE_BY_CODE[stateCode], 400, "Choose a state for this hub.");
  assert(canState(actor, stateCode), 403, "You can only manage hubs in your own state.");
  const name = str(b.name, 100);
  assert(name.length >= 2, 400, "Give the hub a name.");
  const capacity = Math.max(1, Math.min(200, parseInt(b.capacity, 10) || settings.defaultHubCapacity || 20));
  const status = HUB_STATUSES.includes(b.status) ? b.status : "active";
  const fields = {
    name,
    stateCode,
    lga: str(b.lga, 120),
    capacity,
    whatsappLink: url(b.whatsappLink),
    telegramLink: url(b.telegramLink),
    zoomLink: url(b.zoomLink),
    notes: str(b.notes, 1000),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (b.leaderUid !== undefined) {
    assert(isNational(actor) || settings.coordinatorsCanAssignLeaders, 403, "Only national administrators can assign hub leaders.");
  }

  return db().runTransaction(async (tx) => {
    let hubRef, existing = null;
    if (b.id) {
      hubRef = db().doc(`hubs/${b.id}`);
      const s = await tx.get(hubRef);
      assert(s.exists, 404, "Hub not found.");
      existing = { id: s.id, ...s.data() };
      assert(canState(actor, existing.stateCode), 403, "You can only manage hubs in your own state.");
      assert(existing.stateCode === stateCode || (existing.count || 0) === 0, 400, "Move this hub's participants out before changing its state.");
    } else {
      assert(isNational(actor) || settings.coordinatorsCanCreateHubs, 403, "Only national administrators can create hubs.");
      hubRef = db().collection("hubs").doc();
    }
    const stRef = db().doc(`states/${stateCode}`);
    const stSnap = await tx.get(stRef);
    const st = stSnap.exists ? stSnap.data() : {};

    // Leader change
    let leader = null, prevLeader = null;
    const leaderChanging = b.leaderUid !== undefined && (b.leaderUid || null) !== (existing?.leaderUid || null);
    if (leaderChanging && b.leaderUid) {
      const ls = await tx.get(db().doc(`users/${b.leaderUid}`));
      assert(ls.exists && ls.data().active !== false, 400, "That leader account is not active.");
      leader = { uid: ls.id, ...ls.data() };
      assert(isNational(actor) || leader.stateCode === stateCode, 403, "Choose a leader from your state.");
    }
    if (leaderChanging && existing?.leaderUid) {
      const ps = await tx.get(db().doc(`users/${existing.leaderUid}`));
      if (ps.exists) prevLeader = { uid: ps.id, ...ps.data() };
    }
    const renaming = existing && existing.name !== name;
    const memberSnap = existing && (leaderChanging || renaming) ? await tx.get(db().collection("participants").where("hubId", "==", existing.id)) : null;

    const count = existing?.count || 0;
    let finalStatus = status;
    const capCheck = { capacity, leaderUid: leaderChanging ? b.leaderUid || null : existing?.leaderUid };
    if (finalStatus === "active" && count >= participantCapacity(capCheck, settings)) finalStatus = "full";
    if (finalStatus === "full" && count < participantCapacity(capCheck, settings)) finalStatus = "active";
    fields.status = finalStatus;
    fields.coordinatorUid = st.coordinatorUid || null;

    if (!existing) {
      const seq = (st.hubSeq || 0) + 1;
      tx.set(stRef, { code: stateCode, hubSeq: seq }, { merge: true });
      Object.assign(fields, { code: `${stateCode}-${String(seq).padStart(3, "0")}`, count: 0, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, leaderUid: null, leaderName: null, leaderPhone: null, leaderEmail: null });
    }
    if (leaderChanging) {
      Object.assign(fields, leader
        ? { leaderUid: leader.uid, leaderName: leader.name, leaderPhone: leader.phone || "", leaderEmail: leader.email || "" }
        : { leaderUid: null, leaderName: null, leaderPhone: null, leaderEmail: null });
      if (leader) tx.update(db().doc(`users/${leader.uid}`), { hubIds: FieldValue.arrayUnion(hubRef.id) });
      if (prevLeader) tx.update(db().doc(`users/${prevLeader.uid}`), { hubIds: FieldValue.arrayRemove(hubRef.id) });
      memberSnap?.forEach((d) => tx.update(d.ref, { leaderUid: fields.leaderUid, leaderName: fields.leaderName }));
    }
    if (renaming) memberSnap?.forEach((d) => tx.update(d.ref, { hubName: name }));
    tx.set(hubRef, fields, { merge: true });
    logActivity(tx, actor, existing ? "hub.updated" : "hub.created", { type: "hub", id: hubRef.id, name, stateCode, hubId: hubRef.id }, {
      status: finalStatus,
      capacity,
      leader: leaderChanging ? fields.leaderName || "(none)" : undefined,
    });
    return { id: hubRef.id, leader, prevLeader };
  }).then(async (res) => {
    for (const u of [res.leader, res.prevLeader].filter(Boolean)) {
      const fresh = (await db().doc(`users/${u.uid}`).get()).data();
      await setClaims(u.uid, fresh);
    }
    if (res.leader?.email) {
      const batch = db().batch();
      queueMail(batch, {
        to: res.leader.email,
        subject: `You are now leading ${name}`,
        html: emailLayout("You have a prayer hub to lead", `<p>Dear ${escapeHtml(res.leader.name)},</p><p>You have been assigned as the leader of <strong>${escapeHtml(name)}</strong> in ${escapeHtml(stateName(stateCode))}. Please add the hub's WhatsApp invitation link if it is not set yet, then welcome your members as they arrive.</p>`),
        meta: { kind: "leader_assigned", hubId: res.id },
      });
      await batch.commit();
    }
    // If the hub opened up, pull waiting participants in.
    let allocated = 0;
    if (b.allocateQueue) allocated = (await allocateQueue(actor, { stateCode }, null)).assigned;
    return { id: res.id, allocated };
  });
}

// ---------------- Participants ----------------

async function move(actor, b, req) {
  const p = await loadParticipant(str(b.participantId, 60));
  assert(canState(actor, p.stateCode), 403, "You can only manage participants in your own state.");
  let target = b.target === "auto" ? "auto" : b.target ? str(b.target, 60) : null;
  let newStateCode = b.newStateCode ? str(b.newStateCode, 8) : undefined;
  if (newStateCode) {
    assert(STATE_BY_CODE[newStateCode], 400, "Unknown state.");
    assert(canState(actor, newStateCode), 403, "Only national administrators can move participants to another state.");
  }
  if (target && target !== "auto") {
    const hub = await getHub({ get: (r) => r.get() }, target);
    assert(hub, 404, "Prayer hub not found.");
    assert(canState(actor, hub.stateCode), 403, "Only national administrators can move participants to another state.");
  }
  const reason = str(b.reason, 500) || null;
  const res = await moveParticipant({ participantId: p.id, target, newStateCode, newLga: b.newLga !== undefined ? str(b.newLga, 120) : undefined, actor, reason, override: b.override === true && (isNational(actor) || actor.role === "coordinator") });
  const extra = {};
  if (p.reassignRequest?.open) extra.reassignRequest = { ...p.reassignRequest, open: false, closedAt: new Date().toISOString(), closedBy: actor.name };
  let welcomeUrl = null;
  if (res.newHub) {
    const token = newToken();
    extra.tokenHashes = [...(p.tokenHashes || []).slice(-4), hashToken(token)];
    welcomeUrl = `${siteUrl(req)}/welcome/${token}`;
  }
  if (Object.keys(extra).length) await p.ref.update(extra);
  if (res.newHub || res.oldHub) {
    await notifyMove({ participant: { ...p, welcomeUrl }, oldHub: res.oldHub, newHub: res.newHub, siteUrl: siteUrl(req), reason }).catch((e) => console.error(e));
  }
  return { assigned: Boolean(res.newHub), hubName: res.newHub?.name || null, welcomeUrl };
}

async function allocateQueue(actor, b, req) {
  const stateCode = str(b.stateCode, 8);
  assert(STATE_BY_CODE[stateCode], 400, "Choose a state.");
  assert(canState(actor, stateCode), 403, "You can only allocate your own state's queue.");
  const snap = await db().collection("participants").where("stateCode", "==", stateCode).where("status", "==", "unassigned").limit(60).get();
  let assigned = 0;
  for (const d of snap.docs) {
    const res = await moveParticipant({ participantId: d.id, target: "auto", actor, reason: "Allocated from the waiting queue" });
    if (!res.newHub) break; // nothing left with space
    assigned++;
    const token = newToken();
    const p = d.data();
    await d.ref.update({ tokenHashes: [...(p.tokenHashes || []).slice(-4), hashToken(token)] });
    if (req) await notifyMove({ participant: { ...p, id: d.id, welcomeUrl: `${siteUrl(req)}/welcome/${token}` }, oldHub: null, newHub: res.newHub, siteUrl: siteUrl(req), reason: "A prayer hub with space is now ready for you." }).catch((e) => console.error(e));
  }
  return { assigned, remaining: snap.size - assigned };
}

async function updateParticipant(actor, b) {
  const p = await loadParticipant(str(b.id, 60));
  assert(canState(actor, p.stateCode), 403, "You can only edit participants in your own state.");
  const f = b.fields || {};
  const upd = {};
  if (f.fullName !== undefined) {
    upd.fullName = str(f.fullName, 120);
    assert(upd.fullName.length >= 3, 400, "Enter the full name.");
    upd.nameLower = upd.fullName.toLowerCase();
  }
  if (f.lga !== undefined) upd.lga = str(f.lga, 120);
  if (f.category !== undefined) { assert(CATEGORIES.includes(f.category), 400, "Unknown category."); upd.category = f.category; }
  if (f.church !== undefined) upd.church = str(f.church, 200);
  if (f.notes !== undefined) upd.notes = str(f.notes, 1500);
  if (f.country !== undefined) upd.country = str(f.country, 80);

  await db().runTransaction(async (tx) => {
    const keys = [];
    if (f.phone !== undefined && normalizePhone(f.phone) !== p.phoneNorm) {
      assert(isValidPhone(f.phone), 400, "Enter a valid phone number.");
      const n = normalizePhone(f.phone);
      keys.push({ old: `dedupe/p${p.phoneNorm.replace(/\D/g, "")}`, neu: `dedupe/p${n.replace(/\D/g, "")}`, kind: "phone" });
      upd.phone = str(f.phone, 30);
      upd.phoneNorm = n;
    }
    if (f.email !== undefined && normalizeEmail(f.email) !== p.emailNorm) {
      assert(isValidEmail(f.email), 400, "Enter a valid email.");
      const n = normalizeEmail(f.email);
      keys.push({ old: `dedupe/e${hashToken(p.emailNorm).slice(0, 40)}`, neu: `dedupe/e${hashToken(n).slice(0, 40)}`, kind: "email" });
      upd.email = str(f.email, 160);
      upd.emailNorm = n;
    }
    for (const k of keys) {
      const s = await tx.get(db().doc(k.neu));
      assert(!s.exists || s.data().participantId === p.id, 409, `Another registration already uses that ${k.kind}.`);
    }
    for (const k of keys) {
      tx.delete(db().doc(k.old));
      tx.set(db().doc(k.neu), { participantId: p.id, kind: k.kind });
    }
    upd.updatedAt = FieldValue.serverTimestamp();
    tx.update(p.ref, upd);
    logActivity(tx, actor, "participant.updated", targetOf(p), { fields: Object.keys(upd).filter((k) => !["updatedAt", "nameLower", "phoneNorm", "emailNorm"].includes(k)) });
  });
  return { ok: true };
}

function canTouchParticipant(actor, p) {
  return canState(actor, p.stateCode) || (p.hubId && actor.hubIds.includes(p.hubId));
}

async function setJoinStatus(actor, b) {
  const p = await loadParticipant(str(b.id, 60));
  assert(canTouchParticipant(actor, p), 403, "This participant is not in your hub.");
  assert(JOIN_STATUSES[b.status] && b.status !== "not_issued", 400, "Unknown status.");
  assert(p.hubId, 400, "This participant has no hub yet.");
  const batch = db().batch();
  const was = p.joinStatus === "confirmed", now = b.status === "confirmed";
  batch.update(p.ref, { joinStatus: b.status, ...(now ? { joinConfirmedAt: FieldValue.serverTimestamp(), joinConfirmedBy: actor.name } : {}) });
  bumpState(batch, p.stateCode, { joined: (now ? 1 : 0) - (was ? 1 : 0) });
  logActivity(batch, actor, "participant.join_status", targetOf(p), { status: b.status });
  await batch.commit();
  return { ok: true };
}

async function setFollowUp(actor, b) {
  const p = await loadParticipant(str(b.id, 60));
  assert(canTouchParticipant(actor, p), 403, "This participant is not in your hub.");
  assert(FOLLOW_UP_STATUSES[b.status], 400, "Unknown follow-up status.");
  const note = str(b.note, 1000);
  const batch = db().batch();
  batch.update(p.ref, { followUp: { status: b.status, note, at: FieldValue.serverTimestamp(), by: actor.name } });
  logActivity(batch, actor, "participant.follow_up", targetOf(p), { status: b.status, note });
  await batch.commit();
  return { ok: true };
}

async function deactivate(actor, b, kind) {
  const id = str(b.id, 60);
  const reason = str(b.reason, 500);
  let ofId = null;
  if (kind === "duplicate") {
    ofId = str(b.ofId, 60);
    assert(ofId && ofId !== id, 400, "Choose the registration to keep.");
    const keep = await loadParticipant(ofId);
    assert(canState(actor, keep.stateCode), 403, "You can only manage participants in your own state.");
  }
  await db().runTransaction(async (tx) => {
    const ref = db().doc(`participants/${id}`);
    const s = await tx.get(ref);
    assert(s.exists, 404, "Participant not found.");
    const p = { id, ...s.data() };
    assert(canState(actor, p.stateCode), 403, "You can only manage participants in your own state.");
    assert(!["deactivated", "duplicate"].includes(p.status), 400, "This registration is already inactive.");
    const settings = await getSettings(tx);
    const hub = p.hubId ? await getHub(tx, p.hubId) : null;
    if (hub) {
      const c = Math.max((hub.count || 0) - 1, 0);
      tx.update(db().doc(`hubs/${hub.id}`), { count: c, ...(hub.status === "full" && c < participantCapacity(hub, settings) ? { status: "active" } : {}) });
      if (p.membershipId) tx.set(db().doc(`hubMemberships/${p.membershipId}`), { endedAt: FieldValue.serverTimestamp(), endReason: kind }, { merge: true });
    }
    bumpState(tx, p.stateCode, {
      registrations: -1,
      assigned: p.status === "assigned" ? -1 : 0,
      unassigned: p.status === "unassigned" ? -1 : 0,
      joined: p.joinStatus === "confirmed" ? -1 : 0,
    });
    tx.update(ref, {
      status: kind === "duplicate" ? "duplicate" : "deactivated",
      previousHubId: p.hubId || null,
      hubId: null, hubName: null, hubCode: null, leaderUid: null, leaderName: null, membershipId: null,
      joinStatus: "not_issued",
      deactivatedAt: FieldValue.serverTimestamp(),
      deactivatedBy: actor.name,
      deactivationReason: reason || null,
      duplicateOf: ofId,
    });
    logActivity(tx, actor, kind === "duplicate" ? "participant.marked_duplicate" : "participant.deactivated", targetOf(p), { reason, duplicateOf: ofId });
  });
  return { ok: true };
}

async function reactivate(actor, b) {
  await db().runTransaction(async (tx) => {
    const ref = db().doc(`participants/${str(b.id, 60)}`);
    const s = await tx.get(ref);
    assert(s.exists, 404, "Participant not found.");
    const p = { id: s.id, ...s.data() };
    assert(canState(actor, p.stateCode), 403, "You can only manage participants in your own state.");
    assert(["deactivated", "duplicate"].includes(p.status), 400, "This registration is already active.");
    tx.update(ref, { status: "unassigned", queuedAt: FieldValue.serverTimestamp(), duplicateOf: null, reactivatedAt: FieldValue.serverTimestamp() });
    bumpState(tx, p.stateCode, { registrations: 1, unassigned: 1 });
    logActivity(tx, actor, "participant.reactivated", targetOf(p));
  });
  return { ok: true };
}

async function closeReassign(actor, b) {
  const p = await loadParticipant(str(b.id, 60));
  assert(canState(actor, p.stateCode), 403, "You can only manage participants in your own state.");
  const batch = db().batch();
  batch.update(p.ref, { "reassignRequest.open": false, "reassignRequest.closedBy": actor.name });
  logActivity(batch, actor, "participant.reassign_request_closed", targetOf(p), { note: str(b.note, 300) });
  await batch.commit();
  return { ok: true };
}

// ---------------- Leadership ----------------

function canManageRole(actor, role, stateCode) {
  if (actor.role === "superadmin") return true;
  if (actor.role === "admin") return role !== "superadmin";
  if (actor.role === "coordinator") return ["leader", "volunteer"].includes(role) && stateCode === actor.stateCode;
  return false;
}

async function syncStateCoordinator(tx, uid, u, prev) {
  if (prev?.role === "coordinator" && prev.stateCode && (u.role !== "coordinator" || u.stateCode !== prev.stateCode || u.active === false)) {
    const s = await tx.get(db().doc(`states/${prev.stateCode}`));
    if (s.exists && s.data().coordinatorUid === uid) {
      tx.set(db().doc(`states/${prev.stateCode}`), { coordinatorUid: null, coordinatorName: null, coordinatorEmail: null, coordinatorPhone: null }, { merge: true });
    }
  }
  if (u.role === "coordinator" && u.stateCode && u.active !== false) {
    tx.set(db().doc(`states/${u.stateCode}`), { code: u.stateCode, coordinatorUid: uid, coordinatorName: u.name, coordinatorEmail: u.email, coordinatorPhone: u.phone || "" }, { merge: true });
  }
}

async function inviteUser(actor, b, req) {
  const role = str(b.role, 20);
  assert(ROLES[role], 400, "Choose a role.");
  const stateCode = b.stateCode ? str(b.stateCode, 8) : null;
  if (["coordinator", "leader"].includes(role)) assert(STATE_BY_CODE[stateCode], 400, "Choose the state this leader serves.");
  assert(canManageRole(actor, role, stateCode), 403, "You cannot invite someone to that role.");
  const email = normalizeEmail(b.email);
  assert(isValidEmail(email), 400, "Enter a valid email address.");
  const name = str(b.name, 120);
  assert(name.length >= 3, 400, "Enter the full name.");
  const phone = str(b.phone, 30);
  if (phone) assert(isValidPhone(phone), 400, "Enter a valid phone number.");
  const department = role === "volunteer" ? (DEPARTMENTS.includes(b.department) ? b.department : null) : null;

  let userRecord;
  try {
    userRecord = await auth().getUserByEmail(email);
    const existing = await db().doc(`users/${userRecord.uid}`).get();
    assert(!existing.exists, 409, "This person already has an account. Edit their role in the leadership directory.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    userRecord = await auth().createUser({ email, displayName: name, password: newToken() + "Aa1!", emailVerified: false });
  }
  const u = { name, email, phone, role, stateCode, hubIds: [], department, active: true, createdAt: FieldValue.serverTimestamp(), invitedBy: actor.uid, invitedByName: actor.name };
  await db().runTransaction(async (tx) => {
    await syncStateCoordinator(tx, userRecord.uid, u, null);
    tx.set(db().doc(`users/${userRecord.uid}`), u);
    logActivity(tx, actor, "leader.invited", { type: "user", id: userRecord.uid, name, stateCode }, { role, department });
  });
  await setClaims(userRecord.uid, u);
  const link = await auth().generatePasswordResetLink(email, { url: `${siteUrl(req)}/login` });
  const batch = db().batch();
  queueMail(batch, {
    to: email,
    subject: "Your Torch of Deborah leadership account",
    html: emailLayout("You have been invited to serve", `<p>Dear ${escapeHtml(name)},</p><p>${escapeHtml(actor.name)} has invited you to serve as <strong>${escapeHtml(ROLES[role])}</strong>${stateCode ? ` for ${escapeHtml(stateName(stateCode))}` : ""}.</p><p>Set your password to open your dashboard.</p>${button(link, "Set my password")}<p style="font-size:13px;color:#6b5f52">This link expires. If it has, use “Forgot password” on the sign-in page with this email address.</p>`),
    meta: { kind: "invite", uid: userRecord.uid },
  });
  await batch.commit();
  return { uid: userRecord.uid, link };
}

async function updateUser(actor, b) {
  const uid = str(b.uid, 128);
  const ref = db().doc(`users/${uid}`);
  const snap = await ref.get();
  assert(snap.exists, 404, "Account not found.");
  const prev = snap.data();
  assert(canManageRole(actor, prev.role, prev.stateCode), 403, "You cannot edit this account.");
  assert(uid !== actor.uid || (b.role === undefined && b.active === undefined), 400, "You cannot change your own role or deactivate yourself.");
  const next = { ...prev };
  if (b.name !== undefined) next.name = str(b.name, 120);
  if (b.phone !== undefined) { if (b.phone) assert(isValidPhone(b.phone), 400, "Enter a valid phone number."); next.phone = str(b.phone, 30); }
  if (b.role !== undefined) { assert(ROLES[b.role], 400, "Unknown role."); next.role = b.role; }
  if (b.stateCode !== undefined) next.stateCode = b.stateCode ? str(b.stateCode, 8) : null;
  if (b.department !== undefined) next.department = DEPARTMENTS.includes(b.department) ? b.department : null;
  if (b.active !== undefined) next.active = b.active !== false;
  if (["coordinator", "leader"].includes(next.role)) assert(STATE_BY_CODE[next.stateCode], 400, "Choose the state this leader serves.");
  assert(canManageRole(actor, next.role, next.stateCode), 403, "You cannot assign that role.");

  const deactivating = prev.active !== false && next.active === false;
  await db().runTransaction(async (tx) => {
    await syncStateCoordinator(tx, uid, next, prev);
    let hubs = [];
    if (deactivating || (prev.hubIds || []).length) {
      const hs = await tx.get(db().collection("hubs").where("leaderUid", "==", uid));
      hubs = hs.docs;
    }
    const changes = {};
    for (const k of ["name", "phone", "role", "stateCode", "department", "active"]) if (prev[k] !== next[k]) changes[k] = next[k];
    tx.update(ref, { ...changes, updatedAt: FieldValue.serverTimestamp() });
    for (const h of hubs) {
      if (deactivating) {
        tx.update(h.ref, { leaderUid: null, leaderName: null, leaderPhone: null, leaderEmail: null, previousLeaderName: prev.name });
        tx.update(ref, { hubIds: [] });
      } else if (changes.name || changes.phone !== undefined) {
        tx.update(h.ref, { leaderName: next.name, leaderPhone: next.phone || "" });
      }
    }
    logActivity(tx, actor, deactivating ? "leader.deactivated" : "leader.updated", { type: "user", id: uid, name: next.name, stateCode: next.stateCode }, changes);
  });
  if (deactivating) {
    // Members of hubs this leader led need their denormalised leader cleared.
    const ps = await db().collection("participants").where("leaderUid", "==", uid).get();
    const batch = db().batch();
    ps.forEach((d) => batch.update(d.ref, { leaderUid: null, leaderName: null }));
    if (!ps.empty) await batch.commit();
    next.hubIds = [];
  }
  await auth().updateUser(uid, { disabled: next.active === false, displayName: next.name });
  if (deactivating) await auth().revokeRefreshTokens(uid);
  await setClaims(uid, { ...next, hubIds: deactivating ? [] : prev.hubIds });
  return { ok: true };
}

async function resetAccess(actor, b, req) {
  const uid = str(b.uid, 128);
  const s = await db().doc(`users/${uid}`).get();
  assert(s.exists, 404, "Account not found.");
  const u = s.data();
  assert(canManageRole(actor, u.role, u.stateCode), 403, "You cannot reset this account.");
  assert(u.active !== false, 400, "Reactivate this account first.");
  const link = await auth().generatePasswordResetLink(u.email, { url: `${siteUrl(req)}/login` });
  const batch = db().batch();
  queueMail(batch, { to: u.email, subject: "Reset your Torch of Deborah password", html: emailLayout("Reset your password", `<p>Dear ${escapeHtml(u.name)},</p>${button(link, "Choose a new password")}`), meta: { kind: "reset", uid } });
  logActivity(batch, actor, "leader.access_reset", { type: "user", id: uid, name: u.name, stateCode: u.stateCode });
  await batch.commit();
  return { link };
}

async function saveState(actor, b) {
  const code = str(b.code, 8);
  assert(STATE_BY_CODE[code], 400, "Unknown state.");
  assert(canState(actor, code), 403, "You can only edit your own state.");
  const upd = { code };
  if (b.zoomLink !== undefined) upd.zoomLink = url(b.zoomLink);
  if (b.notes !== undefined) upd.notes = str(b.notes, 1000);
  if (b.extraLgas !== undefined) upd.extraLgas = (Array.isArray(b.extraLgas) ? b.extraLgas : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 100);
  const batch = db().batch();
  batch.set(db().doc(`states/${code}`), upd, { merge: true });
  logActivity(batch, actor, "state.updated", { type: "state", id: code, name: stateName(code), stateCode: code }, upd);
  await batch.commit();
  return { ok: true };
}

// ---------------- Volunteers ----------------

async function saveVolunteer(actor, b) {
  const stateCode = b.stateCode ? str(b.stateCode, 8) : null;
  assert(isNational(actor) || (actor.role === "coordinator" && stateCode === actor.stateCode), 403, "You can only manage volunteers in your own state.");
  const v = {
    name: str(b.name, 120),
    phone: str(b.phone, 30),
    email: normalizeEmail(b.email),
    department: DEPARTMENTS.includes(b.department) ? b.department : null,
    stateCode,
    supervisor: str(b.supervisor, 120),
    responsibilities: str(b.responsibilities, 1000),
    status: ["active", "inactive", "pending"].includes(b.status) ? b.status : "active",
    participantId: b.participantId ? str(b.participantId, 60) : null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  assert(v.name.length >= 3, 400, "Enter the volunteer's name.");
  assert(v.department, 400, "Choose a department.");
  if (v.email) assert(isValidEmail(v.email), 400, "Enter a valid email.");
  const ref = b.id ? db().doc(`volunteers/${str(b.id, 60)}`) : db().collection("volunteers").doc();
  if (b.id) {
    const s = await ref.get();
    assert(s.exists, 404, "Volunteer not found.");
    assert(isNational(actor) || s.data().stateCode === actor.stateCode, 403, "You can only manage volunteers in your own state.");
  } else v.createdAt = FieldValue.serverTimestamp();
  const batch = db().batch();
  batch.set(ref, v, { merge: true });
  logActivity(batch, actor, b.id ? "volunteer.updated" : "volunteer.added", { type: "volunteer", id: ref.id, name: v.name, stateCode }, { department: v.department, status: v.status });
  await batch.commit();
  return { id: ref.id };
}

// ---------------- Settings and schedule ----------------

async function saveSettings(actor, b) {
  assert(isNational(actor), 403, "Only national administrators can change programme settings.");
  const f = b.fields || {};
  const out = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (f[k] === undefined) continue;
    if (typeof def === "boolean") out[k] = Boolean(f[k]);
    else if (typeof def === "number") out[k] = Number(f[k]) || def;
    else if (/Link$/.test(k) || ["instagram", "facebook", "x", "youtube"].includes(k)) out[k] = url(f[k]);
    else out[k] = str(f[k], 2000);
  }
  if (out.dailyTime !== undefined) assert(/^\d{2}:\d{2}$/.test(out.dailyTime), 400, "Daily prayer time must look like 05:00.");
  if (out.startDate) assert(/^\d{4}-\d{2}-\d{2}$/.test(out.startDate), 400, "Start date must be a date.");
  if (out.timezone) {
    try { new Intl.DateTimeFormat("en", { timeZone: out.timezone }); } catch { throw new HttpError(400, "Unknown time zone. Use a name like Africa/Lagos."); }
  }
  if (out.defaultHubCapacity !== undefined) out.defaultHubCapacity = Math.max(1, Math.min(200, Math.round(out.defaultHubCapacity)));
  const batch = db().batch();
  batch.set(db().doc("settings/programme"), { ...out, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.name }, { merge: true });
  batch.set(db().doc("public/site"), pickPublic({ ...(await getSettings()), ...out }), { merge: true });
  logActivity(batch, actor, "settings.updated", { type: "settings", id: "programme" }, { fields: Object.keys(out) });
  await batch.commit();
  return { ok: true };
}

export function pickPublic(s) {
  const keys = ["programmeName", "registrationOpen", "registrationTarget", "startDate", "durationMonths", "dailyTime", "durationMinutes", "timezone", "contactEmail", "contactPhone", "instagram", "facebook", "x", "youtube"];
  return Object.fromEntries(keys.map((k) => [k, s[k] ?? DEFAULT_SETTINGS[k] ?? null]));
}

async function saveMeeting(actor, b) {
  const scope = ["national", "state", "hub"].includes(b.scope) ? b.scope : "national";
  const m = {
    kind: b.kind === "special" ? "special" : "theme",
    date: str(b.date, 10),
    time: str(b.time, 5),
    title: str(b.title, 150),
    theme: str(b.theme, 300),
    notes: str(b.notes, 2000),
    zoomLink: url(b.zoomLink),
    durationMinutes: Math.max(10, Math.min(600, parseInt(b.durationMinutes, 10) || 60)),
    scope,
    stateCode: scope === "national" ? null : str(b.stateCode, 8),
    hubId: scope === "hub" ? str(b.hubId, 60) : null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.name,
  };
  assert(/^\d{4}-\d{2}-\d{2}$/.test(m.date), 400, "Choose a date.");
  if (m.kind === "special") assert(/^\d{2}:\d{2}$/.test(m.time), 400, "Choose a start time for the special meeting.");
  assert(m.title || m.theme, 400, "Add a title or prayer focus.");
  if (scope === "national") assert(isNational(actor), 403, "Only national administrators can set national schedule items.");
  if (scope === "hub") {
    const hub = await getHub({ get: (r) => r.get() }, m.hubId);
    assert(hub, 404, "Hub not found.");
    assert(canHub(actor, hub), 403, "You can only schedule for your own hub.");
    m.stateCode = hub.stateCode;
  }
  if (scope === "state") assert(canState(actor, m.stateCode), 403, "You can only schedule for your own state.");
  const ref = b.id ? db().doc(`meetings/${str(b.id, 60)}`) : db().collection("meetings").doc();
  if (b.id) {
    const s = await ref.get();
    assert(s.exists, 404, "Schedule item not found.");
    const old = s.data();
    assert(isNational(actor) || (old.scope !== "national" && canState(actor, old.stateCode)) || (old.hubId && actor.hubIds.includes(old.hubId)), 403, "You cannot edit this item.");
  } else m.createdAt = FieldValue.serverTimestamp();
  const batch = db().batch();
  batch.set(ref, m, { merge: true });
  logActivity(batch, actor, b.id ? "schedule.updated" : "schedule.added", { type: "meeting", id: ref.id, name: m.title || m.theme, stateCode: m.stateCode, hubId: m.hubId }, { date: m.date, kind: m.kind });
  await batch.commit();
  return { id: ref.id };
}

async function deleteMeeting(actor, b) {
  const ref = db().doc(`meetings/${str(b.id, 60)}`);
  const s = await ref.get();
  assert(s.exists, 404, "Schedule item not found.");
  const old = s.data();
  assert(isNational(actor) || (old.scope !== "national" && canState(actor, old.stateCode)) || (old.hubId && actor.hubIds.includes(old.hubId)), 403, "You cannot remove this item.");
  const batch = db().batch();
  batch.delete(ref);
  logActivity(batch, actor, "schedule.removed", { type: "meeting", id: ref.id, name: old.title || old.theme, stateCode: old.stateCode }, { date: old.date });
  await batch.commit();
  return { ok: true };
}

// ---------------- Announcements ----------------

async function saveAnnouncement(actor, b, req) {
  assert(isNational(actor) || actor.role === "coordinator", 403, "Only national administrators and state coordinators can send announcements.");
  const a = b.audience || {};
  const audience = {
    type: ["all", "states", "hubs", "roles"].includes(a.type) ? a.type : "all",
    stateCodes: (a.stateCodes || []).filter((c) => STATE_BY_CODE[c]),
    hubIds: (a.hubIds || []).map((x) => str(x, 60)).slice(0, 200),
    roles: (a.roles || []).filter((r) => ["participant", "leader", "coordinator", "volunteer", "admin"].includes(r)),
  };
  if (actor.role === "coordinator") {
    if (audience.type === "hubs") {
      const hubs = await Promise.all(audience.hubIds.map((h) => db().doc(`hubs/${h}`).get()));
      assert(hubs.every((h) => h.exists && h.data().stateCode === actor.stateCode), 403, "You can only message hubs in your state.");
    } else {
      audience.type = "states";
      audience.stateCodes = [actor.stateCode];
    }
  }
  if (audience.type === "states") assert(audience.stateCodes.length, 400, "Choose at least one state.");
  if (audience.type === "hubs") assert(audience.hubIds.length, 400, "Choose at least one hub.");
  if (audience.type === "roles") assert(audience.roles.length, 400, "Choose at least one group.");
  const channels = (b.channels || []).filter((c) => ["portal", "email"].includes(c));
  assert(channels.length, 400, "Choose where to publish: welcome pages, email or both.");
  const title = str(b.title, 150), body = str(b.body, 5000);
  assert(title && body, 400, "Add a title and a message.");
  let status = "draft", scheduledAt = null;
  if (b.mode === "now") status = "sending_requested";
  if (b.mode === "schedule") {
    const t = new Date(b.scheduledAt);
    assert(!isNaN(t) && t.getTime() > Date.now() - 60000, 400, "Choose a future date and time.");
    status = "scheduled";
    scheduledAt = Timestamp.fromDate(t);
  }
  const ref = b.id ? db().doc(`announcements/${str(b.id, 60)}`) : db().collection("announcements").doc();
  if (b.id) {
    const s = await ref.get();
    assert(s.exists, 404, "Announcement not found.");
    assert(["draft", "scheduled", "failed"].includes(s.data().status), 400, "This announcement has already gone out.");
    assert(isNational(actor) || s.data().createdBy === actor.uid, 403, "You cannot edit this announcement.");
  }
  const doc = {
    title, body,
    linkUrl: url(b.linkUrl), linkLabel: str(b.linkLabel, 40),
    audience, channels, status, scheduledAt,
    stateCode: actor.role === "coordinator" ? actor.stateCode : null,
    updatedAt: FieldValue.serverTimestamp(),
    ...(b.id ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, createdByName: actor.name }),
  };
  const batch = db().batch();
  batch.set(ref, doc, { merge: true });
  logActivity(batch, actor, `announcement.${status}`, { type: "announcement", id: ref.id, name: title, stateCode: doc.stateCode }, { audience: audience.type, channels });
  await batch.commit();
  if (status === "sending_requested") {
    if (!channels.includes("email")) {
      await ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), recipientCount: 0 });
      return { id: ref.id, status: "sent" };
    }
    const r = await dispatchAnnouncement(ref.id, siteUrl(req));
    return { id: ref.id, status: r.sent ? "sent" : "failed", recipients: r.recipients };
  }
  return { id: ref.id, status };
}

async function cancelAnnouncement(actor, b) {
  const ref = db().doc(`announcements/${str(b.id, 60)}`);
  const s = await ref.get();
  assert(s.exists, 404, "Announcement not found.");
  assert(isNational(actor) || s.data().createdBy === actor.uid, 403, "You cannot change this announcement.");
  assert(["scheduled", "draft"].includes(s.data().status), 400, "Only drafts and scheduled announcements can be cancelled.");
  await ref.update({ status: "cancelled" });
  return { ok: true };
}

// ---------------- Attendance ----------------

async function recordAttendance(actor, b) {
  const hub = await getHub({ get: (r) => r.get() }, str(b.hubId, 60));
  assert(hub, 404, "Hub not found.");
  assert(canHub(actor, hub), 403, "You can only record attendance for your own hub.");
  const date = str(b.date, 10);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), 400, "Choose a date.");
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(new Date());
  assert(date <= today, 400, "You cannot record attendance for a future date.");
  const entries = (b.entries || []).filter((e) => ATTENDANCE_STATUSES[e.status]).slice(0, 250);
  assert(entries.length, 400, "Mark at least one participant.");
  const members = await db().collection("participants").where("hubId", "==", hub.id).get();
  const byId = Object.fromEntries(members.docs.map((d) => [d.id, d]));
  const batch = db().batch();
  let n = 0;
  for (const e of entries) {
    const d = byId[e.participantId];
    if (!d) continue;
    const p = d.data();
    batch.set(db().doc(`attendance/${date}_${d.id}_hub`), {
      participantId: d.id, participantName: p.fullName, hubId: hub.id, stateCode: hub.stateCode,
      date, status: e.status, source: "hub", recordedBy: actor.uid, recordedByName: actor.name, recordedAt: FieldValue.serverTimestamp(),
    });
    if (e.status === "participated" && (!p.lastParticipation || p.lastParticipation < date)) batch.update(d.ref, { lastParticipation: date });
    n++;
  }
  logActivity(batch, actor, "attendance.recorded", { type: "hub", id: hub.id, name: hub.name, stateCode: hub.stateCode, hubId: hub.id }, { date, count: n });
  await batch.commit();
  return { recorded: n };
}

async function updateHubLinks(actor, b) {
  const hub = await getHub({ get: (r) => r.get() }, str(b.hubId, 60));
  assert(hub, 404, "Hub not found.");
  assert(canHub(actor, hub), 403, "You can only update your own hub.");
  const upd = { whatsappLink: url(b.whatsappLink), telegramLink: url(b.telegramLink), updatedAt: FieldValue.serverTimestamp() };
  const batch = db().batch();
  batch.update(db().doc(`hubs/${hub.id}`), upd);
  logActivity(batch, actor, "hub.links_updated", { type: "hub", id: hub.id, name: hub.name, stateCode: hub.stateCode, hubId: hub.id });
  await batch.commit();
  return { ok: true };
}

async function logExport(actor, b) {
  const batch = db().batch();
  logActivity(batch, actor, "report.exported", { type: "report", id: str(b.report, 60), stateCode: actor.role === "coordinator" ? actor.stateCode : null }, { rows: Number(b.rows) || 0, filters: b.filters || {} });
  await batch.commit();
  return { ok: true };
}

const ACTIONS = {
  updateHubLinks: (a, b) => updateHubLinks(a, b),
  logExport: (a, b) => logExport(a, b),
  saveHub: (a, b, req, s) => saveHub(a, b, s),
  moveParticipant: (a, b, req) => move(a, b, req),
  allocateQueue: (a, b, req) => allocateQueue(a, b, req),
  updateParticipant: (a, b) => updateParticipant(a, b),
  setJoinStatus: (a, b) => setJoinStatus(a, b),
  setFollowUp: (a, b) => setFollowUp(a, b),
  deactivateParticipant: (a, b) => deactivate(a, b, "deactivated"),
  markDuplicate: (a, b) => deactivate(a, b, "duplicate"),
  reactivateParticipant: (a, b) => reactivate(a, b),
  closeReassignRequest: (a, b) => closeReassign(a, b),
  inviteUser: (a, b, req) => inviteUser(a, b, req),
  updateUser: (a, b) => updateUser(a, b),
  resetAccess: (a, b, req) => resetAccess(a, b, req),
  saveState: (a, b) => saveState(a, b),
  saveVolunteer: (a, b) => saveVolunteer(a, b),
  saveSettings: (a, b) => saveSettings(a, b),
  saveMeeting: (a, b) => saveMeeting(a, b),
  deleteMeeting: (a, b) => deleteMeeting(a, b),
  saveAnnouncement: (a, b, req) => saveAnnouncement(a, b, req),
  cancelAnnouncement: (a, b) => cancelAnnouncement(a, b),
  recordAttendance: (a, b) => recordAttendance(a, b),
};

export default handler(async (req) => {
  const body = await readJson(req);
  const actor = await requireStaff(req);
  const fn = ACTIONS[body.action];
  if (!fn) throw new HttpError(400, "Unknown action.");
  const settings = await getSettings();
  const result = await fn(actor, body, req, settings);
  return json(200, { ok: true, ...result });
});
