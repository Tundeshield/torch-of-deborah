import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import crypto from "node:crypto";
import { DEFAULT_SETTINGS, escapeHtml } from "../../../src/lib/shared.js";

export { FieldValue, Timestamp };

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new HttpError(500, "Server is not configured: FIREBASE_SERVICE_ACCOUNT is missing.");
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
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

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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

export function siteUrl(req) {
  return (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
}

export function newToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export async function getSettings(tx) {
  const ref = db().doc("settings/programme");
  const snap = tx ? await tx.get(ref) : await ref.get();
  return { ...DEFAULT_SETTINGS, ...(snap.exists ? snap.data() : {}) };
}

// ---- Staff authentication ----

export async function requireStaff(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in to continue.");
  let decoded;
  try {
    decoded = await auth().verifyIdToken(token, true);
  } catch {
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }
  const userSnap = await db().doc(`users/${decoded.uid}`).get();
  const u = userSnap.exists ? userSnap.data() : null;
  if (!u || u.active === false) throw new HttpError(403, "Your account is not active. Contact the national team.");
  return {
    uid: decoded.uid,
    name: u.name || decoded.email,
    email: u.email || decoded.email,
    role: u.role,
    stateCode: u.stateCode || null,
    hubIds: u.hubIds || [],
    department: u.department || null,
  };
}

export const isNational = (a) => a.role === "superadmin" || a.role === "admin";

export function canState(actor, stateCode) {
  return isNational(actor) || (actor.role === "coordinator" && actor.stateCode === stateCode);
}

export function canHub(actor, hub) {
  if (!hub) return false;
  return canState(actor, hub.stateCode) || actor.hubIds.includes(hub.id);
}

export function assert(cond, status, message) {
  if (!cond) throw new HttpError(status, message);
}

// ---- Activity log ----

export function logActivity(writer, actor, action, target = {}, details = {}) {
  const ref = db().collection("activityLogs").doc();
  const entry = {
    at: FieldValue.serverTimestamp(),
    actorUid: actor?.uid || "system",
    actorName: actor?.name || "System",
    actorRole: actor?.role || "system",
    action,
    targetType: target.type || null,
    targetId: target.id || null,
    targetName: target.name || null,
    stateCode: target.stateCode || null,
    hubId: target.hubId || null,
    participantId: target.participantId || null,
    details,
  };
  writer.set(ref, entry);
}

// ---- Email (Firebase "Trigger Email from Firestore" extension format) ----

export function queueMail(writer, { to, bcc, subject, html, text, meta = {} }) {
  const ref = db().collection("mail").doc();
  const doc = { message: { subject, html, text: text || html.replace(/<[^>]+>/g, " ") }, createdAt: FieldValue.serverTimestamp(), meta };
  if (to) doc.to = Array.isArray(to) ? to : [to];
  if (bcc) doc.bcc = bcc;
  writer.set(ref, doc);
  return ref;
}

export function emailLayout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f6f0e4;font-family:Georgia,serif;color:#221c17">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f0e4;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e4d8c1">
<tr><td style="background:#1d3a2c;padding:22px 28px;color:#f6f0e4;font-size:20px;letter-spacing:.5px">The Torch of Deborah</td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.6">
<h1 style="font-size:24px;font-weight:normal;margin:0 0 16px;color:#1d3a2c">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e4d8c1;font-size:13px;color:#6b5f52">Arise. Pray. Mobilise. Impact Nigeria.</td></tr>
</table></td></tr></table></body></html>`;
}

export function button(href, label) {
  return `<p style="margin:22px 0"><a href="${escapeHtml(href)}" style="background:#6b1d2a;color:#fff;text-decoration:none;padding:12px 22px;display:inline-block;font-family:Arial,sans-serif;font-size:15px">${escapeHtml(label)}</a></p>`;
}

// ---- State counters ----

export function bumpState(writer, stateCode, deltas) {
  if (!stateCode) return;
  const counts = {};
  for (const [k, v] of Object.entries(deltas)) if (v) counts[k] = FieldValue.increment(v);
  if (!Object.keys(counts).length) return;
  writer.set(db().doc(`states/${stateCode}`), { code: stateCode, counts }, { merge: true });
}
