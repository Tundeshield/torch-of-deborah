// Pure helpers shared by the browser app and the Netlify functions.

export const ROLES = {
  admin: "Admin",
  coordinator: "State coordinator",
  leader: "Hub leader",
};

// How a woman wants to take part. Stored values stay stable for exports.
export const CATEGORIES = {
  "Prayer Participant": "Pray with us",
  "Volunteer": "Pray and volunteer",
  "Leadership": "Pray and lead a hub",
};

export const DEFAULT_SETTINGS = {
  registrationOpen: true,
  defaultHubCapacity: 20,
  telegramLink: "",
  zoomLink: "",
  dailyTime: "05:00",
  startDate: "",
  contactEmail: "",
  contactPhone: "",
};

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

// Returns +<digits>. Nigerian local formats become +234...
export function normalizePhone(raw) {
  const s = String(raw || "").trim();
  const plus = s.startsWith("+") || s.startsWith("00");
  let d = s.replace(/\D/g, "");
  if (s.startsWith("00")) d = d.slice(2);
  if (!d) return "";
  if (d.startsWith("2340") && d.length === 14) d = "234" + d.slice(4);
  if (plus) return "+" + d;
  if (d.startsWith("234") && d.length >= 12) return "+" + d;
  if (d.startsWith("0") && d.length === 11) return "+234" + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) return "+234" + d;
  return "+" + d;
}

export function isValidPhone(raw) {
  const p = normalizePhone(raw);
  const d = p.replace(/\D/g, "");
  if (p.startsWith("+234")) return d.length === 13;
  return d.length >= 8 && d.length <= 15;
}

export function waLink(phone, text) {
  const d = normalizePhone(phone).replace(/\D/g, "");
  if (!d) return "";
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const capacityOf = (hub, settings = DEFAULT_SETTINGS) => Number(hub.capacity || settings.defaultHubCapacity || 20);

/**
 * Allocation: an active hub in her state, with a leader and space; the emptiest one wins,
 * preferring her LGA when two are equally full.
 */
export function pickHub(hubs, { stateCode, lga, settings = DEFAULT_SETTINGS } = {}) {
  const open = hubs.filter((h) => h.stateCode === stateCode && h.active !== false && h.leaderEmail && Number(h.count || 0) < capacityOf(h, settings));
  if (!open.length) return null;
  open.sort((a, b) => {
    const ra = Number(a.count || 0) / capacityOf(a, settings);
    const rb = Number(b.count || 0) / capacityOf(b, settings);
    if (ra !== rb) return ra - rb;
    const la = lga && a.lga === lga ? 0 : 1;
    const lb = lga && b.lga === lga ? 0 : 1;
    if (la !== lb) return la - lb;
    return String(a.id).localeCompare(String(b.id));
  });
  return open[0];
}

export function formatTime12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // block spreadsheet formulas
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.value])).join(","));
  return "﻿" + [head, ...body].join("\r\n");
}
