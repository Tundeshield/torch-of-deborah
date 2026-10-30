import { db, FieldValue, HttpError, bumpState, logActivity, getSettings } from "./core.js";
import { pickHub, capacityOf } from "../../../src/lib/shared.js";
import { stateName } from "../../../src/data/states.js";

export async function hubsInState(tx, stateCode) {
  const snap = await tx.get(db().collection("hubs").where("stateCode", "==", stateCode));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getHub(tx, id) {
  const s = await tx.get(db().doc(`hubs/${id}`));
  return s.exists ? { id: s.id, ...s.data() } : null;
}

const hubFields = (hub) =>
  hub
    ? { status: "assigned", hubId: hub.id, hubName: hub.name, leaderName: hub.leaderName || null, assignedAt: FieldValue.serverTimestamp() }
    : { status: "waiting", hubId: null, hubName: null, leaderName: null, assignedAt: null };

/**
 * Writes the move of a participant out of `from` and into `to` (either may be null).
 * Caller has done all reads. `prev` is the participant's status before the move ("new" for a fresh registration).
 */
export function applyMove(tx, { ref, participant, prev, from, to, stateFrom, stateTo, actor }) {
  if (from) tx.update(db().doc(`hubs/${from.id}`), { count: Math.max((from.count || 0) - 1, 0) });
  if (to) tx.update(db().doc(`hubs/${to.id}`), { count: (to.count || 0) + 1 });
  const fields = { ...hubFields(to), stateCode: stateTo, updatedAt: FieldValue.serverTimestamp() };
  if (prev === "new") tx.set(ref, { ...participant, ...fields });
  else tx.update(ref, fields);

  const was = { assigned: prev === "assigned" ? 1 : 0, waiting: prev === "waiting" ? 1 : 0 };
  if (stateFrom !== stateTo || prev === "new") {
    if (prev !== "new") bumpState(tx, stateFrom, { registrations: -1, assigned: -was.assigned, waiting: -was.waiting });
    bumpState(tx, stateTo, { registrations: 1, assigned: to ? 1 : 0, waiting: to ? 0 : 1 });
  } else {
    bumpState(tx, stateTo, { assigned: (to ? 1 : 0) - was.assigned, waiting: (to ? 0 : 1) - was.waiting });
  }
  logActivity(tx, actor, prev === "new" ? "registered" : "moved", { id: ref.id, name: participant.fullName, stateCode: stateTo }, { from: from?.name || null, to: to?.name || null });
}

/** target: "auto" | hubId | null (waiting list). */
export async function moveParticipant({ participantId, target, actor, canUseState }) {
  return db().runTransaction(async (tx) => {
    const ref = db().doc(`participants/${participantId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "This person was not found.");
    const p = snap.data();
    if (p.status === "removed") throw new HttpError(400, "Restore this registration first.");
    const settings = await getSettings(tx);
    const from = p.hubId ? await getHub(tx, p.hubId) : null;

    let to = null;
    if (target === "auto") {
      const hubs = (await hubsInState(tx, p.stateCode)).map((h) => (from && h.id === from.id ? { ...h, count: (h.count || 1) - 1 } : h));
      to = pickHub(hubs, { stateCode: p.stateCode, lga: p.lga, settings });
      if (!to) throw new HttpError(400, `No hub in ${stateName(p.stateCode)} has space and a leader. Create a hub or give one a leader first.`);
    } else if (target) {
      to = await getHub(tx, target);
      if (!to) throw new HttpError(404, "Hub not found.");
      if (canUseState && !canUseState(to.stateCode)) throw new HttpError(403, "You can only use hubs in your own state.");
      if (from && to.id === from.id) return { hub: to };
      if (to.active === false) throw new HttpError(400, "That hub is turned off.");
      if ((to.count || 0) >= capacityOf(to, settings)) throw new HttpError(400, "That hub is full.");
    }
    applyMove(tx, { ref, participant: p, prev: p.status, from, to, stateFrom: p.stateCode, stateTo: to ? to.stateCode : p.stateCode, actor });
    return { hub: to };
  });
}

// What a woman needs to see: her hub, her leader and how to join.
export async function hubInfo(p, hub) {
  const settings = await getSettings();
  return {
    firstName: String(p.fullName || "").split(" ")[0],
    stateName: stateName(p.stateCode),
    hub: hub
      ? { name: hub.name, leaderName: hub.leaderName || "", leaderPhone: hub.leaderPhone || "", whatsappLink: hub.whatsappLink || "" }
      : null,
    telegramLink: settings.telegramLink,
    zoomLink: settings.zoomLink,
    dailyTime: settings.dailyTime,
    startDate: settings.startDate,
  };
}
