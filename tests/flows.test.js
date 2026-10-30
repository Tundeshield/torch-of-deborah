import { test, before } from "node:test";
import assert from "node:assert/strict";
import { FakeDB, FakeAuth } from "./fake-firestore.js";

const db = new FakeDB();
const fauth = new FakeAuth();
globalThis.__TOD_DB = db;
globalThis.__TOD_AUTH = fauth;
process.env.ADMIN_EMAILS = "boss@x.com";
fauth.verifyIdToken = async (t) => ({ uid: "uid-" + t, email: t, email_verified: true, name: t.split("@")[0] });

const register = (await import("../netlify/functions/register.mjs")).default;
const find = (await import("../netlify/functions/find.mjs")).default;
const admin = (await import("../netlify/functions/admin.mjs")).default;
const me = (await import("../netlify/functions/me.mjs")).default;

const req = (body, email) => new Request("https://t/api/x", { method: "POST", headers: { "content-type": "application/json", ...(email ? { authorization: `Bearer ${email}` } : {}) }, body: JSON.stringify(body) });
const call = async (fn, body, email) => { const r = await fn(req(body, email)); return { status: r.status, body: await r.json() }; };
const as = (email, action, body) => call(admin, { action, ...body }, email);
let n = 0;
const reg = (o = {}) => call(register, { fullName: "Ada Obi " + ++n, phone: `0803${String(1000000 + n).slice(-7)}`, stateCode: "LA", lga: "Ikeja", consent: true, ...o });
const counts = (c) => db.docs.get(`states/${c}`)?.counts || {};

before(async () => { await db.doc("settings/programme").set({ defaultHubCapacity: 2, telegramLink: "https://t.me/x" }); });

test("admin from ADMIN_EMAILS becomes admin on first sign-in; strangers are not members", async () => {
  const r = await call(me, {}, "boss@x.com");
  assert.equal(r.body.member, true);
  assert.equal(r.body.profile.role, "admin");
  assert.equal(fauth.claims["uid-boss@x.com"].role, "admin");
  assert.equal((await call(me, {}, "stranger@x.com")).body.member, false);
  assert.equal((await as("stranger@x.com", "saveHub", { name: "X", stateCode: "LA" })).status, 403);
});

test("registration with no hubs joins the waiting list; duplicates are blocked", async () => {
  const r = await reg();
  assert.equal(r.status, 200);
  assert.equal(r.body.hub, null);
  assert.equal(r.body.telegramLink, "https://t.me/x");
  assert.deepEqual(counts("LA"), { registrations: 1, waiting: 1 });
  const dup = await reg({ phone: db.dump("participants")[0].phone });
  assert.equal(dup.status, 409);
  const bad = await reg({ phone: "1", consent: false, lga: "" });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.phone && bad.body.fields.consent && bad.body.fields.lga);
});

let hubA;
test("team, hubs and placing the waiting list", async () => {
  assert.equal((await as("boss@x.com", "saveMember", { isNew: true, email: "coord@x.com", name: "Coord", role: "coordinator", stateCode: "LA" })).status, 200);
  const lead = await as("coord@x.com", "saveMember", { isNew: true, email: "Lead@X.com", name: "Funmi", phone: "08030000001", role: "leader", stateCode: "LA" });
  assert.equal(lead.status, 200, JSON.stringify(lead.body));
  assert.equal((await as("coord@x.com", "saveMember", { isNew: true, email: "a2@x.com", name: "A2", role: "admin" })).status, 403);
  assert.equal((await as("coord@x.com", "saveHub", { name: "Ogun hub", stateCode: "OG" })).status, 403);
  const h = await as("coord@x.com", "saveHub", { name: "Ikeja Hub", stateCode: "LA", capacity: 2, leaderEmail: "lead@x.com", whatsappLink: "https://chat.whatsapp.com/abc" });
  assert.equal(h.status, 200, JSON.stringify(h.body));
  hubA = h.body.id;
  assert.deepEqual(db.docs.get("users/lead@x.com").hubIds, [hubA]);
  const placed = await as("coord@x.com", "placeWaiting", { stateCode: "LA" });
  assert.equal(placed.body.placed, 1);
  assert.deepEqual({ ...counts("LA") }, { registrations: 1, waiting: 0, assigned: 1 });
});

test("new registration goes straight into a hub, then the waiting list when full", async () => {
  const r = await reg();
  assert.equal(r.body.hub.name, "Ikeja Hub");
  assert.equal(r.body.hub.leaderName, "Funmi");
  assert.equal(r.body.hub.whatsappLink, "https://chat.whatsapp.com/abc");
  assert.equal((await reg()).body.hub, null);
  assert.deepEqual({ ...counts("LA") }, { registrations: 3, waiting: 1, assigned: 2 });
});

test("find my hub by WhatsApp number", async () => {
  const p = db.dump("participants").find((x) => x.hubId);
  const r = await call(find, { phone: p.phone.replace(/^0/, "+234") });
  assert.equal(r.status, 200);
  assert.equal(r.body.hub.name, "Ikeja Hub");
  assert.equal((await call(find, { phone: "08099999999" })).status, 404);
});

test("moving, removing and restoring keep hub counts and totals right", async () => {
  const waiting = db.dump("participants").find((x) => x.status === "waiting");
  assert.equal((await as("coord@x.com", "moveParticipant", { participantId: waiting.id, target: hubA })).status, 400); // full
  const inHub = db.dump("participants").find((x) => x.hubId === hubA);
  assert.equal((await as("coord@x.com", "removeParticipant", { id: inHub.id })).status, 200);
  assert.equal(db.docs.get(`hubs/${hubA}`).count, 1);
  const mv = await as("coord@x.com", "moveParticipant", { participantId: waiting.id, target: hubA });
  assert.equal(mv.status, 200, JSON.stringify(mv.body));
  assert.deepEqual({ ...counts("LA") }, { registrations: 2, waiting: 0, assigned: 2 });
  assert.equal((await as("coord@x.com", "restoreParticipant", { id: inHub.id })).status, 200);
  assert.deepEqual({ ...counts("LA") }, { registrations: 3, waiting: 1, assigned: 2 });
  assert.equal((await as("lead@x.com", "moveParticipant", { participantId: inHub.id, target: "auto" })).status, 403);
});

test("leaders sign in, update their group link, and lose access when removed", async () => {
  const r = await call(me, {}, "lead@x.com");
  assert.deepEqual(r.body.profile.hubIds, [hubA]);
  assert.deepEqual(fauth.claims["uid-lead@x.com"].hubIds, [hubA]);
  assert.equal((await as("lead@x.com", "updateHubLink", { hubId: hubA, whatsappLink: "https://chat.whatsapp.com/new" })).status, 200);
  assert.equal((await as("lead@x.com", "updateHubLink", { hubId: hubA, whatsappLink: "http://bad" })).status, 400);
  assert.equal((await as("coord@x.com", "removeMember", { email: "lead@x.com" })).status, 200);
  assert.equal(db.docs.get(`hubs/${hubA}`).leaderEmail, null);
  assert.equal(fauth.claims["uid-lead@x.com"], null);
  assert.equal((await as("lead@x.com", "updateHubLink", { hubId: hubA, whatsappLink: "https://chat.whatsapp.com/x" })).status, 403);
});

test("only admins change settings", async () => {
  assert.equal((await as("coord@x.com", "saveSettings", { fields: { zoomLink: "https://zoom.us/j/1" } })).status, 403);
  assert.equal((await as("boss@x.com", "saveSettings", { fields: { zoomLink: "https://zoom.us/j/1", dailyTime: "06:00" } })).status, 200);
  assert.equal(db.docs.get("settings/programme").dailyTime, "06:00");
});
