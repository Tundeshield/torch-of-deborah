// "Find my hub": a woman enters her WhatsApp number and sees her hub again.
import { db, handler, json, readJson, HttpError } from "./_lib/core.js";
import { hubInfo } from "./_lib/allocate.js";
import { isValidPhone, normalizePhone } from "../../src/lib/shared.js";

export default handler(async (req) => {
  const { phone } = await readJson(req);
  if (!isValidPhone(phone)) throw new HttpError(400, "Enter the WhatsApp number you registered with.");
  const snap = await db().collection("participants").where("phoneNorm", "==", normalizePhone(phone)).limit(1).get();
  const p = snap.empty ? null : snap.docs[0].data();
  if (!p || p.status === "removed") throw new HttpError(404, "We could not find that number. Check it, or register now.");
  const hubSnap = p.hubId ? await db().doc(`hubs/${p.hubId}`).get() : null;
  const hub = hubSnap?.exists ? { id: hubSnap.id, ...hubSnap.data() } : null;
  return json(200, await hubInfo(p, hub));
});
