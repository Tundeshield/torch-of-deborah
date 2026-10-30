// Called after Google sign-in. Matches the account to the team by email and grants its access.
import { db, auth, handler, json, verifiedEmail, adminEmails, FieldValue } from "./_lib/core.js";
import { ensureSetup } from "./_lib/setup.js";

export default handler(async (req) => {
  const { email, uid, name } = await verifiedEmail(req);
  const ref = db().doc(`users/${email}`);
  let snap = await ref.get();

  // Admins listed in ADMIN_EMAILS, or the admin created by the earlier setup page, are always on the team.
  if (!snap.exists || snap.data().role !== "admin") {
    const legacy = await db().collection("users").where("email", "==", email).where("role", "==", "superadmin").limit(1).get();
    if (adminEmails().includes(email) || !legacy.empty) {
      await ref.set({ email, name: snap.data()?.name || legacy.docs[0]?.data().name || name || email, role: "admin", stateCode: null, hubIds: [], createdAt: FieldValue.serverTimestamp() }, { merge: true });
      snap = await ref.get();
    }
  }

  if (!snap.exists) {
    // Not on the team: remove the sign-in Google created so no account lingers.
    await auth().deleteUser(uid).catch(() => {});
    return json(200, { member: false, email });
  }
  const u = snap.data();
  if (u.role === "admin") await ensureSetup();
  if (!u.uid || !u.signedInBefore) await ref.set({ uid, signedInBefore: true, ...(u.name ? {} : { name }) }, { merge: true });
  await auth().setCustomUserClaims(uid, { role: u.role, stateCode: u.stateCode || null, hubIds: (u.hubIds || []).slice(0, 30) });
  return json(200, { member: true, profile: { email, name: u.name || name, role: u.role, stateCode: u.stateCode || null, hubIds: u.hubIds || [] } });
});
