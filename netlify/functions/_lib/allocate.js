import { db, FieldValue, HttpError, bumpState, logActivity, queueMail, emailLayout, button } from "./core.js";
import { pickHub, participantCapacity, escapeHtml } from "../../../src/lib/shared.js";
import { stateName } from "../../../src/data/states.js";

export async function readActiveHubs(tx, stateCode) {
  const q = db().collection("hubs").where("stateCode", "==", stateCode).where("status", "in", ["active", "full"]);
  const snap = await tx.get(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function hubSummary(hub) {
  if (!hub) return null;
  return {
    hubId: hub.id,
    hubName: hub.name,
    hubCode: hub.code || null,
    leaderUid: hub.leaderUid || null,
    leaderName: hub.leaderName || null,
  };
}

/**
 * Applies the writes for removing a participant from oldHub (if any) and placing them in newHub (or the queue).
 * All reads must already be done by the caller (Firestore transaction rule).
 */
export function applyPlacement(tx, { pRef, participant, oldHub, newHub, settings, actor, reason, isNew = false }) {
  const now = FieldValue.serverTimestamp();
  const stateCode = participant.stateCode;
  const wasAssigned = !isNew && participant.status === "assigned";
  const wasUnassigned = !isNew && participant.status === "unassigned";
  const wasJoined = !isNew && participant.joinStatus === "confirmed";

  if (oldHub) {
    const newCount = Math.max(Number(oldHub.count || 0) - 1, 0);
    const upd = { count: newCount, updatedAt: now };
    if (oldHub.status === "full" && newCount < participantCapacity(oldHub, settings)) upd.status = "active";
    tx.update(db().doc(`hubs/${oldHub.id}`), upd);
    if (participant.membershipId) {
      tx.set(db().doc(`hubMemberships/${participant.membershipId}`), { endedAt: now, endReason: reason || "reassigned" }, { merge: true });
    }
  }

  const pUpdate = { updatedAt: now };
  if (newHub) {
    const newCount = Number(newHub.count || 0) + 1;
    const hubUpd = { count: newCount, updatedAt: now };
    if (newCount >= participantCapacity(newHub, settings)) hubUpd.status = "full";
    tx.update(db().doc(`hubs/${newHub.id}`), hubUpd);
    const mRef = db().collection("hubMemberships").doc();
    tx.set(mRef, {
      participantId: pRef.id,
      hubId: newHub.id,
      hubName: newHub.name,
      stateCode: newHub.stateCode,
      startedAt: now,
      endedAt: null,
      assignedBy: actor?.uid || "system",
      assignedByName: actor?.name || "Automatic allocation",
      method: actor ? "manual" : "automatic",
      reason: reason || null,
    });
    Object.assign(pUpdate, hubSummary(newHub), {
      status: "assigned",
      membershipId: mRef.id,
      assignedAt: now,
      joinStatus: "issued",
      inviteIssuedAt: now,
      linkClickedAt: null,
      joinConfirmedAt: null,
    });
  } else {
    Object.assign(pUpdate, {
      hubId: null,
      hubName: null,
      hubCode: null,
      leaderUid: null,
      leaderName: null,
      membershipId: null,
      status: "unassigned",
      joinStatus: "not_issued",
      queuedAt: now,
    });
  }

  if (isNew) tx.set(pRef, { ...participant, ...pUpdate });
  else tx.update(pRef, pUpdate);

  bumpState(tx, stateCode, {
    registrations: isNew ? 1 : 0,
    assigned: (newHub ? 1 : 0) - (wasAssigned ? 1 : 0),
    unassigned: (newHub ? 0 : 1) - (wasUnassigned ? 1 : 0),
    joined: wasJoined ? -1 : 0,
  });

  logActivity(tx, actor, newHub ? (isNew ? "participant.registered_assigned" : "participant.assigned") : isNew ? "participant.registered_queued" : "participant.unassigned", {
    type: "participant",
    id: pRef.id,
    name: participant.fullName,
    stateCode,
    hubId: newHub?.id || oldHub?.id || null,
    participantId: pRef.id,
  }, {
    fromHubId: oldHub?.id || null,
    fromHubName: oldHub?.name || null,
    toHubId: newHub?.id || null,
    toHubName: newHub?.name || null,
    reason: reason || null,
  });

  return pUpdate;
}

/**
 * Moves an existing participant. target: "auto" | hubId | null (to queue).
 * newStateCode optionally moves the participant to another state first.
 */
export async function moveParticipant({ participantId, target, newStateCode, newLga, actor, reason, override = false }) {
  const result = await db().runTransaction(async (tx) => {
    const pRef = db().doc(`participants/${participantId}`);
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists) throw new HttpError(404, "Participant not found.");
    const participant = { ...pSnap.data() };
    if (participant.status === "deactivated" || participant.status === "duplicate") {
      throw new HttpError(400, "This registration is deactivated. Reactivate it before assigning a hub.");
    }
    const settings = { ...(await tx.get(db().doc("settings/programme"))).data() };
    const oldHub = participant.hubId ? await getHub(tx, participant.hubId) : null;
    const stateCode = newStateCode || participant.stateCode;

    let newHub = null;
    if (target === "auto") {
      const hubs = await readActiveHubs(tx, stateCode);
      const fresh = hubs.map((h) => (oldHub && h.id === oldHub.id ? { ...h, count: Math.max((h.count || 0) - 1, 0) } : h));
      newHub = pickHub(fresh, { stateCode, lga: newLga || participant.lga, settings });
    } else if (target) {
      newHub = await getHub(tx, target);
      if (!newHub) throw new HttpError(404, "Prayer hub not found.");
      if (oldHub && newHub.id === oldHub.id) throw new HttpError(400, "The participant is already in this hub.");
      if (newHub.status === "archived" || newHub.status === "inactive") throw new HttpError(400, "That hub is not active.");
      if (Number(newHub.count || 0) >= participantCapacity(newHub, settings)) throw new HttpError(400, "That hub is full.");
      if (!newHub.leaderUid && !settings.allowLeaderlessAssignment && !override) {
        throw new HttpError(400, "That hub has no active leader. Tick “approve assignment without a leader” to continue.", { needsOverride: true });
      }
    }
    // Moving to a hub in another state moves the participant's state too.
    const finalState = newHub ? newHub.stateCode : stateCode;
    const prevState = pSnap.data().stateCode;
    if (finalState !== prevState) {
      // Move registration counters between states.
      bumpState(tx, prevState, {
        registrations: -1,
        assigned: pSnap.data().status === "assigned" ? -1 : 0,
        unassigned: pSnap.data().status === "unassigned" ? -1 : 0,
        joined: pSnap.data().joinStatus === "confirmed" ? -1 : 0,
      });
      tx.update(pRef, { stateCode: finalState, ...(newLga !== undefined ? { lga: newLga } : {}) });
      const moved = { ...participant, stateCode: finalState, status: "new", joinStatus: null };
      const upd = applyPlacement(tx, { pRef, participant: moved, oldHub, newHub, settings, actor, reason });
      bumpState(tx, finalState, { registrations: 1 });
      return { participant: { ...participant, ...upd, stateCode: finalState }, oldHub, newHub };
    }
    if (newLga !== undefined) tx.update(pRef, { lga: newLga });
    const upd = applyPlacement(tx, { pRef, participant, oldHub, newHub, settings, actor, reason });
    return { participant: { ...participant, ...upd }, oldHub, newHub };
  });
  return result;
}

export async function getHub(tx, id) {
  const s = await tx.get(db().doc(`hubs/${id}`));
  return s.exists ? { id: s.id, ...s.data() } : null;
}

// Email both leaders when someone moves between hubs, and the participant with the new link.
export async function notifyMove({ participant, oldHub, newHub, siteUrl, reason }) {
  const batch = db().batch();
  const name = escapeHtml(participant.fullName);
  if (oldHub?.leaderEmail) {
    queueMail(batch, {
      to: oldHub.leaderEmail,
      subject: `${participant.fullName} has moved from ${oldHub.name}`,
      html: emailLayout("A participant has moved", `<p>${name} is no longer in <strong>${escapeHtml(oldHub.name)}</strong>${newHub ? ` and has joined ${escapeHtml(newHub.name)}` : ""}.</p><p>Please remove her from your WhatsApp group if she is still there.</p>`),
      meta: { kind: "leader_move_out", participantId: participant.id },
    });
  }
  if (newHub?.leaderEmail) {
    queueMail(batch, {
      to: newHub.leaderEmail,
      subject: `New member for ${newHub.name}: ${participant.fullName}`,
      html: emailLayout("A new member has joined your hub", `<p><strong>${name}</strong> (${escapeHtml(participant.phone)}) is now in <strong>${escapeHtml(newHub.name)}</strong>.</p><p>She has been sent your WhatsApp group link. Please welcome her and confirm when she joins.</p>${button(`${siteUrl}/app/hub`, "Open my prayer hub")}`),
      meta: { kind: "leader_move_in", participantId: participant.id },
    });
  }
  if (newHub && participant.email && participant.welcomeUrl) {
    queueMail(batch, {
      to: participant.email,
      subject: "Your new prayer hub — The Torch of Deborah",
      html: emailLayout("You have a new prayer hub", `<p>Dear ${name},</p><p>You are now in <strong>${escapeHtml(newHub.name)}</strong>${newHub.leaderName ? `, led by ${escapeHtml(newHub.leaderName)}` : ""}.</p>${reason ? `<p>${escapeHtml(reason)}</p>` : ""}<p>Open your welcome page to join the new WhatsApp group.</p>${button(participant.welcomeUrl, "Join my prayer hub")}`),
      meta: { kind: "participant_move", participantId: participant.id },
    });
  }
  await batch.commit();
}

export async function notifyQueued({ participant, siteUrl }) {
  const st = await db().doc(`states/${participant.stateCode}`).get();
  const email = st.exists ? st.data().coordinatorEmail : null;
  const batch = db().batch();
  const to = email ? [email] : [];
  if (!to.length) {
    const admins = await db().collection("users").where("role", "in", ["superadmin", "admin"]).where("active", "==", true).limit(5).get();
    admins.forEach((d) => d.data().email && to.push(d.data().email));
  }
  if (!to.length) return;
  queueMail(batch, {
    to,
    subject: `Unassigned registration in ${stateName(participant.stateCode)}`,
    html: emailLayout("A new registration is waiting for a hub", `<p><strong>${escapeHtml(participant.fullName)}</strong> registered from ${escapeHtml(participant.lga || "")}, ${escapeHtml(stateName(participant.stateCode))}, but no active hub with a leader has space.</p><p>Create a hub or raise a hub's capacity, then allocate the queue.</p>${button(`${siteUrl}/app/participants?status=unassigned`, "Open the unassigned queue")}`),
    meta: { kind: "queue_alert", participantId: participant.id, stateCode: participant.stateCode },
  });
  await batch.commit();
}
