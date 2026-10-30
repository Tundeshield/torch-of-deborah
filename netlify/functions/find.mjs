// "My hub": reopens a woman's hub on the phone she registered on, using the private key saved there.
// There is no public lookup, so no one can see another person's hub.
import crypto from "node:crypto";
import { db, handler, json, readJson, HttpError } from "./_lib/core.js";
import { hubInfo } from "./_lib/allocate.js";

export default handler(async (req) => {
  const { deviceKey } = await readJson(req);
  if (!deviceKey || String(deviceKey).length < 20) throw new HttpError(404, "Not found.");
  const hash = crypto.createHash("sha256").update(String(deviceKey)).digest("hex");
  const snap = await db().collection("participants").where("deviceKeyHash", "==", hash).limit(1).get();
  const p = snap.empty ? null : snap.docs[0].data();
  if (!p || p.status === "removed") throw new HttpError(404, "Not found.");
  const hubSnap = p.hubId ? await db().doc(`hubs/${p.hubId}`).get() : null;
  return json(200, await hubInfo(p, hubSnap?.exists ? { id: hubSnap.id, ...hubSnap.data() } : null));
});
