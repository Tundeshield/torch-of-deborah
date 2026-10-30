export const nf = new Intl.NumberFormat("en-NG");

export function tsToDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  if (v.seconds) return new Date(v.seconds * 1000);
  return null;
}

export function fmtDate(v, opts = {}) {
  const d = tsToDate(v);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", ...opts });
}

export function fmtDateTime(v) {
  const d = tsToDate(v);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function fmtDay(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function daysSince(dateStr, today) {
  if (!dateStr) return Infinity;
  return Math.round((Date.parse(today) - Date.parse(dateStr)) / 86400000);
}

export function downloadFile(name, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}
