// Invisible one-time setup. Runs when an admin signs in and the stored setup version is older than this one.
import { app, db, FieldValue } from "./core.js";
import { RULES, INDEXES } from "./firebase-config.js";
import { DEFAULT_SETTINGS } from "../../../src/lib/shared.js";
import { STATES } from "../../../src/data/states.js";

export const SETUP_VERSION = 2;

export async function ensureSetup() {
  const ref = db().doc("settings/system");
  const snap = await ref.get();
  if (snap.exists && snap.data().version >= SETUP_VERSION) return;

  const batch = db().batch();
  const s = await db().doc("settings/programme").get();
  batch.set(db().doc("settings/programme"), { ...DEFAULT_SETTINGS, ...(s.exists ? s.data() : {}) }, { merge: true });
  for (const st of STATES) batch.set(db().doc(`states/${st.code}`), { code: st.code, name: st.name }, { merge: true });
  await batch.commit();

  if (!globalThis.__TOD_DB) {
    const { getSecurityRules } = await import("firebase-admin/security-rules");
    await getSecurityRules(app()).releaseFirestoreRulesetFromSource(RULES);
    const token = (await app().options.credential.getAccessToken()).access_token;
    for (const idx of INDEXES) {
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${app().options.projectId}/databases/(default)/collectionGroups/${idx.collectionGroup}/indexes`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ queryScope: "COLLECTION", fields: idx.fields }),
      });
      if (!res.ok && res.status !== 409) console.error("index", idx, await res.text());
    }
  }
  await ref.set({ version: SETUP_VERSION, at: FieldValue.serverTimestamp() });
}
