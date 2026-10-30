import { test, before } from "node:test";
import assert from "node:assert/strict";
import { FakeDB, FakeAuth } from "./fake-firestore.js";

const db = new FakeDB();
const fauth = new FakeAuth();
globalThis.__TOD_DB = db;
globalThis.__TOD_AUTH = fauth;
process.env.SITE_URL = "https://torch.test";

const register = (await import("../netlify/functions/register.mjs")).default;
const participant = (await import("../netlify/functions/participant.mjs")).default;
const admin = (await import("../netlify/functions/admin.mjs")).default;

const post = (fn, body, uid) => fn(new Request("https://torch.test/api/x", { method: "POST", headers: { "content-type": "application/json", ...(uid ? { authorization: `Bearer ${uid}` } : {}) }, body: JSON.stringify(body) }));
const call = async (fn, body, uid) => { const r = await post(fn, body, uid); return { status: r.status, body: await r.json() }; };
const as = (uid, action, body) => call(admin, { action, ...body }, uid);

let n = 0;
const reg = (o = {}) => call(register, {
  fullName: "Ada Obi " + ++n, phone: `0803${String(1000000 + n).slice(-7)}`, email: `ada${n}@example.com`, stateCode: "LA", lga: "Ikeja",
  category: "Prayer Participant", onlineMeetings: "yes", inviteOthers: "yes", inspiration: "For Nigeria", consentPrivacy: true, consentComms: true, ...o,
});
const state = (c) => db.docs.get(`states/${c}`)?.counts || {};

before(async () => {
  await db.doc("settings/programme").set({ defaultHubCapacity: 2 });
  await db.doc("users/super").set({ name: "Super", email: "s@x.com", role: "superadmin", active: true, hubIds: [] });
  await db.doc("users/coordLA").set({ name: "Coord LA", email: "c@x.com", role: "coordinator", stateCode: "LA", active: true, hubIds: [] });
  await db.doc("states/LA").set({ code: "LA", coordinatorUid: "coordLA", coordinatorName: "Coord LA", coordinatorEmail: "c@x.com" });
  await db.doc("users/coordOG").set({ name: "Coord OG", email: "o@x.com", role: "coordinator", stateCode: "OG", active: true, hubIds: [] });
});

test("registration with no hubs goes to the queue", async () => {
  const r = await reg();
  assert.equal(r.status, 200);
  assert.equal(r.body.assigned, false);
  assert.deepEqual(state("LA"), { registrations: 1, unassigned: 1 });
});

test("duplicates are rejected by phone and by email", async () => {
  const first = db.dump("participants")[0];
  const r1 = await reg({ phone: first.phone });
  assert.equal(r1.status, 409);
  const r2 = await reg({ email: first.email.toUpperCase() });
  assert.equal(r2.status, 409);
  assert.equal(state("LA").registrations, 1);
});

test("validation errors are reported per field", async () => {
  const r = await reg({ phone: "12", consentPrivacy: false, lga: "" });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.phone && r.body.fields.consentPrivacy && r.body.fields.lga);
});

let hubA, hubB, leaderUid;
test("coordinator scope: cannot create hubs in another state", async () => {
  const r = await as("coordLA", "saveHub", { name: "Ogun hub", stateCode: "OG", capacity: 2 });
  assert.equal(r.status, 403);
});

test("invite leader, create hubs, allocate queue", async () => {
  const inv = await as("coordLA", "inviteUser", { name: "Leader One", email: "l1@x.com", phone: "08030000001", role: "leader", stateCode: "LA" });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  leaderUid = inv.body.uid;
  const bad = await as("coordLA", "inviteUser", { name: "Admin Two", email: "a2@x.com", role: "admin" });
  assert.equal(bad.status, 403);

  const a = await as("coordLA", "saveHub", { name: "Ikeja Hub", stateCode: "LA", lga: "Ikeja", capacity: 2, whatsappLink: "https://chat.whatsapp.com/abc", leaderUid, allocateQueue: true });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  hubA = a.body.id;
  assert.equal(a.body.allocated, 1);
  assert.deepEqual(fauth.claims[leaderUid].hubIds, [hubA]);
  const h = db.docs.get(`hubs/${hubA}`);
  assert.equal(h.count, 1);
  assert.equal(h.code, "LA-001");
  assert.equal(state("LA").assigned, 1);
  assert.equal(state("LA").unassigned, 0);

  const b = await as("coordLA", "saveHub", { name: "Leaderless Hub", stateCode: "LA", capacity: 2 });
  hubB = b.body.id;
});

test("auto allocation fills hubs with leaders and marks them full, then queues", async () => {
  const r1 = await reg();
  assert.equal(r1.body.assigned, true);
  assert.equal(db.docs.get(`hubs/${hubA}`).status, "full");
  const r2 = await reg();
  assert.equal(r2.body.assigned, false, "leaderless hub must not receive participants");
  assert.deepEqual({ ...state("LA") }, { registrations: 3, assigned: 2, unassigned: 1 });
  const mail = db.dump("mail");
  assert.ok(mail.some((m) => m.meta.kind === "welcome"));
  assert.ok(mail.some((m) => m.meta.kind === "leader_new_member"));
  assert.ok(mail.some((m) => m.meta.kind === "queue_alert" && m.to.includes("c@x.com")));
});

test("welcome page shows hub info via secret token and actions work", async () => {
  const r = await reg({ stateCode: "OG", lga: "Abeokuta South" });
  const token = r.body.token;
  const v = await participant(new Request(`https://torch.test/api/participant?t=${token}`));
  const body = await v.json();
  assert.equal(v.status, 200);
  assert.equal(body.participant.stateName, "Ogun");
  assert.equal(body.hub, null);
  const bad = await participant(new Request(`https://torch.test/api/participant?t=${"x".repeat(30)}`));
  assert.equal(bad.status, 404);
  const pr = await call(participant, { token, action: "prayed" });
  assert.equal(pr.status, 200);
  assert.ok(db.dump("attendance").some((a) => a.source === "self"));
});

test("manual moves respect leader rule, capacity and log history", async () => {
  const queued = db.dump("participants").find((p) => p.stateCode === "LA" && p.status === "unassigned");
  const toLeaderless = await as("coordLA", "moveParticipant", { participantId: queued.id, target: hubB });
  assert.equal(toLeaderless.status, 400);
  assert.equal(toLeaderless.body.needsOverride, true);
  const ok = await as("coordLA", "moveParticipant", { participantId: queued.id, target: hubB, override: true, reason: "Approved" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(db.docs.get(`hubs/${hubB}`).count, 1);
  assert.deepEqual({ ...state("LA") }, { registrations: 3, assigned: 3, unassigned: 0 });
  const full = await as("coordLA", "moveParticipant", { participantId: queued.id, target: hubA });
  assert.equal(full.status, 400);
  const ms = db.dump("hubMemberships").filter((m) => m.participantId === queued.id);
  assert.equal(ms.length, 1);
  const cross = await as("coordLA", "moveParticipant", { participantId: queued.id, target: "auto", newStateCode: "OG" });
  assert.equal(cross.status, 403);
});

test("national admin moves a participant across states; counters follow", async () => {
  const p = db.dump("participants").find((x) => x.hubId === hubB);
  const r = await as("super", "moveParticipant", { participantId: p.id, target: null, newStateCode: "OG", newLga: "Abeokuta North" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = db.docs.get(`participants/${p.id}`);
  assert.equal(after.stateCode, "OG");
  assert.equal(after.status, "unassigned");
  assert.equal(db.docs.get(`hubs/${hubB}`).count, 0);
  assert.deepEqual({ ...state("LA") }, { registrations: 2, assigned: 2, unassigned: 0 });
  assert.equal(state("OG").registrations, 2);
  assert.equal(state("OG").unassigned, 2);
});

test("join confirmation, deactivation and reactivation keep counters right", async () => {
  const p = db.dump("participants").find((x) => x.hubId === hubA);
  assert.equal((await as(leaderUid, "setJoinStatus", { id: p.id, status: "confirmed" })).status, 200);
  assert.equal(state("LA").joined, 1);
  const other = await as("coordOG", "setJoinStatus", { id: p.id, status: "issued" });
  assert.equal(other.status, 403);
  assert.equal((await as("coordLA", "deactivateParticipant", { id: p.id, reason: "Asked to leave" })).status, 200);
  assert.deepEqual({ ...state("LA") }, { registrations: 1, assigned: 1, unassigned: 0, joined: 0 });
  assert.equal(db.docs.get(`hubs/${hubA}`).status, "active");
  assert.equal(db.docs.get(`hubs/${hubA}`).count, 1);
  assert.equal((await as("coordLA", "reactivateParticipant", { id: p.id })).status, 200);
  assert.equal(state("LA").unassigned, 1);
});

test("leader records attendance only for own hub", async () => {
  const members = db.dump("participants").filter((x) => x.hubId === hubA);
  const r = await as(leaderUid, "recordAttendance", { hubId: hubA, date: "2026-10-29", entries: members.map((m) => ({ participantId: m.id, status: "participated" })) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.recorded, members.length);
  const no = await as(leaderUid, "recordAttendance", { hubId: hubB, date: "2026-10-29", entries: [] });
  assert.equal(no.status, 403);
});

test("deactivating a leader clears them from their hubs", async () => {
  const r = await as("coordLA", "updateUser", { uid: leaderUid, active: false });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(db.docs.get(`hubs/${hubA}`).leaderUid, null);
  assert.deepEqual(fauth.claims[leaderUid].hubIds, []);
  const gone = await as(leaderUid, "recordAttendance", { hubId: hubA, date: "2026-10-29", entries: [] });
  assert.equal(gone.status, 403);
});

test("coordinator announcements are forced to their own state", async () => {
  const r = await as("coordLA", "saveAnnouncement", { title: "Vigil", body: "Friday vigil", audience: { type: "all" }, channels: ["portal", "email"], mode: "now" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = db.docs.get(`announcements/${r.body.id}`);
  assert.deepEqual(a.audience.stateCodes, ["LA"]);
  assert.equal(a.status, "sent");
  const mails = db.dump("mail").filter((m) => m.meta.announcementId === r.body.id);
  const all = mails.flatMap((m) => [...(m.to || []), ...(m.bcc || [])]);
  assert.ok(all.length >= 1);
  assert.ok(all.every((e) => !e.includes("@") || db.dump("participants").concat(db.dump("users")).some((p) => p.email === e && (p.stateCode === "LA"))));
});
