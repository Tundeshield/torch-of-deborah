import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, isValidPhone, pickHub, toCsv, DEFAULT_SETTINGS } from "../src/lib/shared.js";

test("Nigerian phone numbers normalise to +234", () => {
  for (const n of ["08031234567", "0803 123 4567", "+2348031234567", "2348031234567", "+234 0803 123 4567", "8031234567"]) assert.equal(normalizePhone(n), "+2348031234567", n);
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.ok(isValidPhone("08031234567"));
  assert.ok(!isValidPhone("0803123"));
});

const hub = (id, o) => ({ id, stateCode: "LA", active: true, leaderEmail: id + "@x.com", count: 0, capacity: 20, ...o });

test("allocation picks the emptiest active hub with a leader in her state", () => {
  assert.equal(pickHub([hub("a", { count: 10 }), hub("b", { count: 3 }), hub("c", { stateCode: "OG" })], { stateCode: "LA" }).id, "b");
  assert.equal(pickHub([hub("full", { count: 20 }), hub("noleader", { leaderEmail: null }), hub("off", { active: false })], { stateCode: "LA" }), null);
  assert.equal(pickHub([hub("a", { lga: "Ikeja" }), hub("b", { lga: "Epe" })], { stateCode: "LA", lga: "Epe", settings: DEFAULT_SETTINGS }).id, "b");
});

test("CSV escapes and blocks formula injection", () => {
  const csv = toCsv([{ a: '=HYPERLINK("x")', b: "x,y" }], [{ label: "A", value: "a" }, { label: "B", value: "b" }]);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"x,y"'));
});
