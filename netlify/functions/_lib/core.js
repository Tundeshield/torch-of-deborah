import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { DEFAULT_SETTINGS, normalizeEmail } from "../../../src/lib/shared.js";

export { FieldValue };

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new HttpError(500, "Server is not configured: FIREBASE_SERVICE_ACCOUNT is missing.");
  return JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
}

export function app() {
  if (!getApps().length) {
    const sa = loadServiceAccount();
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  return getApps()[0];
}

// Tests can inject in-memory fakes through globalThis.__TOD_DB / __TOD_AUTH.
export const db = () => globalThis.__TOD_DB || getFirestore(app());
export const auth = () => globalThis.__TOD_AUTH || getAuth(app());

export function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export function handler(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message, ...err.extra });
      console.error(err);
      return json(500, { error: "Something went wrong on our side. Please try again in a moment." });
    }
  };
}

export async function readJson(req) {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}

export function assert(cond, status, message) {
  if (!cond) throw new HttpError(status, message);
}

export async function getSettings(tx) {
  const ref = db().doc("settings/programme");
  const snap = tx ? await tx.get(ref) : await ref.get();
  return { ...DEFAULT_SETTINGS, ...(snap.exists ? snap.data() : {}) };
}

export const adminEmails = () => (process.env.ADMIN_EMAILS || "").split(",").map(normalizeEmail).filter(Boolean);

// Verifies the Google sign-in token. Returns the verified email.
export async function verifiedEmail(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in to continue.");
  let decoded;
  try {
    decoded = await auth().verifyIdToken(token);
  } catch {
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }
  if (!decoded.email || decoded.email_verified === false) throw new HttpError(403, "Sign in with a Google account.");
  return { email: normalizeEmail(decoded.email), uid: decoded.uid, name: decoded.name || "" };
}

// Team members are stored at users/{email}. Server-side checks always read this document.
export async function requireStaff(req) {
  const { email } = await verifiedEmail(req);
  const snap = await db().doc(`users/${email}`).get();
  const u = snap.exists ? snap.data() : null;
  if (!u) throw new HttpError(403, "This Google account is not on the team.");
  return { email, name: u.name || email, role: u.role, stateCode: u.stateCode || null, hubIds: u.hubIds || [] };
}

export const isAdmin = (a) => a.role === "admin";
export const canState = (a, stateCode) => isAdmin(a) || (a.role === "coordinator" && a.stateCode === stateCode);
export const canHub = (a, hub) => Boolean(hub) && (canState(a, hub.stateCode) || a.hubIds.includes(hub.id));

export function logActivity(writer, actor, action, target = {}, details = {}) {
  writer.set(db().collection("activityLogs").doc(), {
    at: FieldValue.serverTimestamp(),
    actor: actor?.email || "public",
    action,
    targetId: target.id || null,
    targetName: target.name || null,
    stateCode: target.stateCode || null,
    details,
  });
}

export function bumpState(writer, stateCode, deltas) {
  if (!stateCode) return;
  const counts = {};
  for (const [k, v] of Object.entries(deltas)) if (v) counts[k] = FieldValue.increment(v);
  if (Object.keys(counts).length) writer.set(db().doc(`states/${stateCode}`), { code: stateCode, counts }, { merge: true });
}
