// One-time setup: creates the first super administrator, seeds settings and states,
// and deploys Firestore security rules and indexes using the service account.
// Protected by BOOTSTRAP_SECRET. After the first admin exists, only a super administrator can re-run deployment.
import { app, db, auth, handler, json, readJson, HttpError, siteUrl, newToken, FieldValue } from "./_lib/core.js";
import { getSecurityRules } from "firebase-admin/security-rules";
import { RULES, INDEXES } from "./_lib/firebase-config.js";
import { DEFAULT_SETTINGS, normalizeEmail, isValidEmail } from "../../src/lib/shared.js";
import { STATES } from "../../src/data/states.js";
import { pickPublic } from "./admin.mjs";

async function deployRules() {
  await getSecurityRules(app()).releaseFirestoreRulesetFromSource(RULES);
}

async function deployIndexes() {
  const token = (await app().options.credential.getAccessToken()).access_token;
  const project = app().options.projectId;
  const results = [];
  for (const idx of INDEXES) {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${idx.collectionGroup}/indexes`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ queryScope: "COLLECTION", fields: idx.fields }),
    });
    const ok = res.ok || res.status === 409;
    results.push({ collection: idx.collectionGroup, fields: idx.fields.map((x) => x.fieldPath).join("+"), status: ok ? (res.status === 409 ? "exists" : "building") : `error ${res.status}` });
    if (!ok) console.error(await res.text());
  }
  return results;
}

async function seed() {
  const batch = db().batch();
  const s = await db().doc("settings/programme").get();
  if (!s.exists) batch.set(db().doc("settings/programme"), { ...DEFAULT_SETTINGS, createdAt: FieldValue.serverTimestamp() });
  batch.set(db().doc("public/site"), pickPublic({ ...DEFAULT_SETTINGS, ...(s.exists ? s.data() : {}) }), { merge: true });
  for (const st of STATES) batch.set(db().doc(`states/${st.code}`), { code: st.code, name: st.name }, { merge: true });
  await batch.commit();
}

export default handler(async (req) => {
  const body = await readJson(req);
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret || secret.length < 16) throw new HttpError(500, "Set a BOOTSTRAP_SECRET (16+ characters) in Netlify environment variables first.");
  if (body.secret !== secret) throw new HttpError(403, "The setup secret is not correct.");

  const existing = await db().collection("users").where("role", "==", "superadmin").limit(1).get();
  const out = {};

  if (body.action === "deploy") {
    await seed();
    await deployRules();
    out.rules = "deployed";
    out.indexes = await deployIndexes();
    return json(200, { ok: true, ...out });
  }

  if (body.action === "passwordLink") {
    const email = normalizeEmail(body.email);
    const admin = existing.docs.find((d) => normalizeEmail(d.data().email) === email);
    if (!admin) throw new HttpError(404, "That email is not the super administrator's email.");
    const passwordLink = await auth().generatePasswordResetLink(admin.data().email, { url: `${siteUrl(req)}/login` }).catch(() => auth().generatePasswordResetLink(admin.data().email));
    return json(200, { ok: true, passwordLink });
  }

  if (!existing.empty) throw new HttpError(409, "A super administrator already exists. Use “Get my password link” below with the same email to set your password.", { exists: true });
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  const name = String(body.name || "").trim().slice(0, 120);
  if (name.length < 3) throw new HttpError(400, "Enter your full name.");

  let user;
  try {
    user = await auth().getUserByEmail(email);
  } catch {
    user = await auth().createUser({ email, displayName: name, password: newToken() + "Aa1!" });
  }
  const u = { name, email, phone: String(body.phone || "").slice(0, 30), role: "superadmin", stateCode: null, hubIds: [], department: null, active: true, createdAt: FieldValue.serverTimestamp() };
  await db().doc(`users/${user.uid}`).set(u);
  await auth().setCustomUserClaims(user.uid, { role: "superadmin", stateCode: null, hubIds: [], active: true });
  await seed();
  try {
    await deployRules();
    out.rules = "deployed";
  } catch (e) {
    console.error(e);
    out.rules = "failed — paste firestore.rules into the Firebase console";
  }
  try {
    out.indexes = await deployIndexes();
  } catch (e) {
    console.error(e);
    out.indexes = "failed — deploy firestore.indexes.json with the Firebase CLI";
  }
  out.passwordLink = await auth().generatePasswordResetLink(email, { url: `${siteUrl(req)}/login` }).catch(() => auth().generatePasswordResetLink(email));
  return json(200, { ok: true, ...out });
});
