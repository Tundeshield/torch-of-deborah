// Pure helpers shared by the browser app and the Netlify functions.

export const ROLES = {
  superadmin: "National administrator (super)",
  admin: "National administrator",
  coordinator: "State coordinator",
  leader: "Prayer hub leader",
  volunteer: "Volunteer",
};

export const CATEGORIES = [
  "Prayer Participant",
  "Mobilisation Volunteer",
  "Leadership",
  "General Volunteer",
];

export const HUB_STATUSES = ["pending", "active", "full", "inactive", "archived"];

export const ATTENDANCE_STATUSES = {
  participated: "Participated",
  absent: "Absent",
  excused: "Excused",
  not_reported: "Not reported",
};

export const JOIN_STATUSES = {
  not_issued: "No invitation yet",
  issued: "Invitation issued",
  clicked: "Opened invitation",
  confirmed: "Confirmed joined",
};

export const FOLLOW_UP_STATUSES = {
  none: "No follow-up",
  needed: "Needs follow-up",
  contacted: "Contacted",
  resolved: "Resolved",
};

export const DEPARTMENTS = [
  "Mobilisation",
  "Communications",
  "Prayer Coordination",
  "Administration",
  "State Operations",
  "Technical Support",
];

export const DEFAULT_SETTINGS = {
  programmeName: "The Torch of Deborah",
  registrationOpen: true,
  registrationTarget: 10000,
  defaultHubCapacity: 20,
  leaderCountsTowardCapacity: false,
  allowLeaderlessAssignment: false,
  coordinatorsCanCreateHubs: true,
  coordinatorsCanAssignLeaders: true,
  telegramLink: "",
  zoomLink: "",
  zoomMeetingId: "",
  zoomPasscode: "",
  startDate: "",
  durationMonths: 6,
  dailyTime: "05:00",
  durationMinutes: 60,
  timezone: "Africa/Lagos",
  prayerInstructions:
    "Join a few minutes early. Keep your Bible and notebook close. If you cannot make the live meeting, pray at the same hour wherever you are.",
  contactEmail: "",
  contactPhone: "",
  instagram: "",
  facebook: "",
  x: "",
  youtube: "",
  inactiveAfterDays: 7,
};

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

// Returns E.164-ish string. Nigerian local formats become +234...
export function normalizePhone(raw) {
  let s = String(raw || "").trim();
  const plus = s.startsWith("+") || s.startsWith("00");
  let d = s.replace(/\D/g, "");
  if (s.startsWith("00")) d = d.slice(2);
  if (!d) return "";
  // Common mistake: +234 followed by the local leading zero.
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

export function waLink(phone) {
  const d = normalizePhone(phone).replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}

// Effective capacity for participants in a hub.
export function participantCapacity(hub, settings = DEFAULT_SETTINGS) {
  const cap = Number(hub.capacity || settings.defaultHubCapacity || 20);
  return settings.leaderCountsTowardCapacity && hub.leaderUid ? Math.max(cap - 1, 0) : cap;
}

/**
 * Allocation engine: choose the active hub with the lowest occupancy in the state.
 * hubs: [{id, stateCode, status, leaderUid, count, capacity, lga}]
 * Returns the chosen hub or null.
 */
export function pickHub(hubs, { stateCode, lga, settings = DEFAULT_SETTINGS, excludeHubId } = {}) {
  const candidates = hubs.filter((h) => {
    if (h.id === excludeHubId) return false;
    if (h.stateCode !== stateCode) return false;
    if (h.status !== "active") return false;
    if (!h.leaderUid && !settings.allowLeaderlessAssignment) return false;
    return Number(h.count || 0) < participantCapacity(h, settings);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const ra = Number(a.count || 0) / participantCapacity(a, settings);
    const rb = Number(b.count || 0) / participantCapacity(b, settings);
    if (ra !== rb) return ra - rb;
    // Tie-break: prefer the participant's LGA, then the oldest hub.
    const la = lga && a.lga === lga ? 0 : 1;
    const lb = lga && b.lga === lga ? 0 : 1;
    if (la !== lb) return la - lb;
    return String(a.id).localeCompare(String(b.id));
  });
  return candidates[0];
}

// ---------- Time and schedule ----------

function tzParts(date, timeZone) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    h: +p.hour % 24,
    min: +p.minute,
    s: +p.second,
  };
}

// Offset in minutes of timeZone at the given instant.
export function tzOffsetMinutes(date, timeZone) {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// Instant for a wall-clock date ("YYYY-MM-DD") and time ("HH:MM") in a time zone.
export function zonedInstant(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - off * 60000);
}

export function todayInZone(timeZone, now = new Date()) {
  const p = tzParts(now, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function programmeEndDate(settings) {
  if (!settings.startDate) return "";
  const [y, m, d] = settings.startDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + Number(settings.durationMonths || 6), d - 1));
  return t.toISOString().slice(0, 10);
}

/**
 * Next daily prayer meeting, honouring programme dates and one-off special meetings.
 * meetings: [{date, time, title, theme, zoomLink, kind: 'special'|'theme', durationMinutes}]
 */
export function nextMeeting(settings, meetings = [], now = new Date()) {
  const tz = settings.timezone || "Africa/Lagos";
  const dur = Number(settings.durationMinutes || 60);
  const end = programmeEndDate(settings);
  let date = todayInZone(tz, now);
  if (settings.startDate && date < settings.startDate) date = settings.startDate;
  const upcoming = [];
  for (let i = 0; i < 3; i++) {
    const day = addDays(date, i);
    if (end && day > end) break;
    const start = zonedInstant(day, settings.dailyTime || "05:00", tz);
    if (start.getTime() + dur * 60000 > now.getTime()) {
      const theme = meetings.find((m) => m.kind === "theme" && m.date === day);
      upcoming.push({
        kind: "daily",
        date: day,
        start,
        end: new Date(start.getTime() + dur * 60000),
        title: "Daily prayer",
        theme: theme?.theme || theme?.title || "",
        notes: theme?.notes || "",
        zoomLink: theme?.zoomLink || "",
      });
      break;
    }
  }
  for (const m of meetings) {
    if (m.kind !== "special" || !m.date) continue;
    const start = zonedInstant(m.date, m.time || "00:00", tz);
    const mDur = Number(m.durationMinutes || dur);
    if (start.getTime() + mDur * 60000 > now.getTime()) {
      upcoming.push({
        kind: "special",
        date: m.date,
        start,
        end: new Date(start.getTime() + mDur * 60000),
        title: m.title || "Special prayer meeting",
        theme: m.theme || "",
        notes: m.notes || "",
        zoomLink: m.zoomLink || "",
      });
    }
  }
  upcoming.sort((a, b) => a.start - b.start);
  return upcoming;
}

export function formatInZone(date, timeZone, opts = {}) {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...opts,
  }).format(date);
}

export function formatTime12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.value])).join(","));
  return "﻿" + [head, ...body].join("\r\n");
}
