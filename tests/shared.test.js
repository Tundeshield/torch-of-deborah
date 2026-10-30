import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, isValidPhone, pickHub, nextMeeting, zonedInstant, toCsv, participantCapacity, programmeEndDate, DEFAULT_SETTINGS } from "../src/lib/shared.js";
import { matchesParticipant, matchesStaff, meetingApplies } from "../netlify/functions/_lib/audience.js";

test("Nigerian phone numbers normalise to +234", () => {
  for (const n of ["08031234567", "0803 123 4567", "+2348031234567", "2348031234567", "+234 0803 123 4567", "8031234567"]) {
    assert.equal(normalizePhone(n), "+2348031234567", n);
  }
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.ok(isValidPhone("08031234567"));
  assert.ok(!isValidPhone("0803123"));
  assert.ok(isValidPhone("+447700900123"));
});

const S = { ...DEFAULT_SETTINGS };
const hub = (id, o) => ({ id, stateCode: "LA", status: "active", leaderUid: "u" + id, count: 0, capacity: 20, ...o });

test("allocation picks the active hub with lowest occupancy in the state", () => {
  const hubs = [hub("a", { count: 10 }), hub("b", { count: 3 }), hub("c", { count: 1, stateCode: "OG" })];
  assert.equal(pickHub(hubs, { stateCode: "LA", settings: S }).id, "b");
});

test("allocation never uses full, leaderless or inactive hubs", () => {
  const hubs = [hub("full", { count: 20 }), hub("noleader", { leaderUid: null }), hub("inactive", { status: "inactive" }), hub("pending", { status: "pending" })];
  assert.equal(pickHub(hubs, { stateCode: "LA", settings: S }), null);
  assert.equal(pickHub(hubs, { stateCode: "LA", settings: { ...S, allowLeaderlessAssignment: true } }).id, "noleader");
});

test("leader counted toward capacity when configured", () => {
  assert.equal(participantCapacity(hub("x"), S), 20);
  assert.equal(participantCapacity(hub("x"), { ...S, leaderCountsTowardCapacity: true }), 19);
  const h = [hub("x", { count: 19 })];
  assert.equal(pickHub(h, { stateCode: "LA", settings: { ...S, leaderCountsTowardCapacity: true } }), null);
});

test("ties prefer the participant's LGA", () => {
  const hubs = [hub("a", { lga: "Ikeja" }), hub("b", { lga: "Epe" })];
  assert.equal(pickHub(hubs, { stateCode: "LA", lga: "Epe", settings: S }).id, "b");
});

test("zoned time and next meeting", () => {
  const t = zonedInstant("2026-11-01", "05:00", "Africa/Lagos");
  assert.equal(t.toISOString(), "2026-11-01T04:00:00.000Z");
  const settings = { ...S, startDate: "2026-11-01", dailyTime: "05:00", timezone: "Africa/Lagos" };
  const before = nextMeeting(settings, [], new Date("2026-10-30T12:00:00Z"));
  assert.equal(before[0].date, "2026-11-01");
  const during = nextMeeting(settings, [{ kind: "theme", date: "2026-11-05", theme: "Families" }], new Date("2026-11-05T04:30:00Z"));
  assert.equal(during[0].date, "2026-11-05");
  assert.equal(during[0].theme, "Families");
  const after = nextMeeting(settings, [], new Date("2026-11-05T05:30:00Z"));
  assert.equal(after[0].date, "2026-11-06");
  assert.equal(programmeEndDate(settings), "2027-04-30");
  assert.equal(nextMeeting(settings, [], new Date("2027-05-02T00:00:00Z")).length, 0);
});

test("CSV escapes and blocks formula injection", () => {
  const csv = toCsv([{ a: '=HYPERLINK("x")', b: "x,y" }], [{ label: "A", value: "a" }, { label: "B", value: "b" }]);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"x,y"'));
});

test("announcement audiences", () => {
  const p = { stateCode: "LA", hubId: "h1" };
  assert.ok(matchesParticipant({ type: "all" }, p));
  assert.ok(matchesParticipant({ type: "states", stateCodes: ["LA"] }, p));
  assert.ok(!matchesParticipant({ type: "states", stateCodes: ["OG"] }, p));
  assert.ok(matchesParticipant({ type: "hubs", hubIds: ["h1"] }, p));
  assert.ok(!matchesParticipant({ type: "roles", roles: ["leader"] }, p));
  assert.ok(matchesStaff({ type: "roles", roles: ["admin"] }, { role: "superadmin" }));
  assert.ok(matchesStaff({ type: "hubs", hubIds: ["h1"] }, { role: "leader", hubIds: ["h1"] }));
  assert.ok(meetingApplies({ scope: "state", stateCode: "LA" }, p));
  assert.ok(!meetingApplies({ scope: "hub", hubId: "h2" }, p));
});
