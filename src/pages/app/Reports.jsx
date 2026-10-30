import { useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useScope, useHubs, useSettings, PageTitle, StateSelect } from "./common.jsx";
import { STATE_BY_CODE, STATES, stateName } from "../../data/states.js";
import { ATTENDANCE_STATUSES, FOLLOW_UP_STATUSES, JOIN_STATUSES, ROLES, addDays, participantCapacity, todayInZone, toCsv } from "../../lib/shared.js";
import { Field, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { downloadFile, tsToDate } from "../../lib/format.js";

const iso = (v) => { const d = tsToDate(v); return d ? d.toISOString().slice(0, 19).replace("T", " ") : ""; };

export default function Reports() {
  const s = useScope();
  const settings = useSettings().data;
  const today = todayInZone(settings.timezone || "Africa/Lagos");
  const [f, setF] = useState({ state: "", lga: "", hub: "", status: "", from: "", to: "", attFrom: addDays(today, -6), attTo: today });
  const stateCode = s.coordinator ? s.stateCode : f.state;
  const hubs = useHubs(s.national ? stateCode || undefined : undefined);
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e, ...(k === "state" ? { lga: "", hub: "" } : {}) }));
  const hubName = Object.fromEntries(hubs.data.map((h) => [h.id, h.name]));
  const stamp = today;
  const scopeName = stateCode ? stateName(stateCode).replace(/\W+/g, "-") : "national";

  async function participants() {
    const col = collection(db, "participants");
    const snap = await getDocs(stateCode ? query(col, where("stateCode", "==", stateCode)) : query(col));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => {
      if (f.lga && p.lga !== f.lga) return false;
      if (f.hub && p.hubId !== f.hub) return false;
      if (f.status && p.status !== f.status) return false;
      const c = tsToDate(p.createdAt);
      if (f.from && c && c < new Date(f.from)) return false;
      if (f.to && c && c > new Date(f.to + "T23:59:59")) return false;
      return true;
    }).sort((a, b) => a.stateCode.localeCompare(b.stateCode) || (a.hubName || "").localeCompare(b.hubName || "") || a.fullName.localeCompare(b.fullName));
  }

  async function exportReport(name, loader, columns) {
    await run(async () => {
      const rows = await loader();
      downloadFile(`torch-of-deborah_${name}_${scopeName}_${stamp}.csv`, toCsv(rows, columns));
      api.admin("logExport", { report: name, rows: rows.length, filters: { stateCode, lga: f.lga, hub: f.hub, status: f.status, from: f.from, to: f.to } }).catch(() => {});
      return rows.length;
    }, (n) => `Downloaded ${n} rows.`);
  }

  const reports = [
    {
      key: "participants", title: "Participants", desc: "Everyone matching the filters, with contact details, location and hub.",
      go: () => exportReport("participants", participants, [
        { label: "Full name", value: "fullName" }, { label: "WhatsApp", value: "phone" }, { label: "Email", value: "email" },
        { label: "State", value: (p) => stateName(p.stateCode) }, { label: "LGA / city", value: "lga" }, { label: "Country", value: "country" },
        { label: "Category", value: "category" }, { label: "Status", value: "status" }, { label: "Hub", value: "hubName" }, { label: "Hub code", value: "hubCode" },
        { label: "Hub leader", value: "leaderName" }, { label: "Online meetings", value: "onlineMeetings" }, { label: "Will invite others", value: (p) => (p.inviteOthers ? "Yes" : "No") },
        { label: "Church", value: "church" }, { label: "Inspiration", value: "inspiration" }, { label: "Registered", value: (p) => iso(p.createdAt) },
      ]),
    },
    {
      key: "onboarding", title: "Group onboarding status", desc: "Who has been given a group link, opened it and confirmed joining.",
      go: () => exportReport("onboarding", participants, [
        { label: "Full name", value: "fullName" }, { label: "WhatsApp", value: "phone" }, { label: "State", value: (p) => stateName(p.stateCode) },
        { label: "Hub", value: "hubName" }, { label: "Hub leader", value: "leaderName" }, { label: "Group status", value: (p) => JOIN_STATUSES[p.joinStatus] || "" },
        { label: "Invitation issued", value: (p) => iso(p.inviteIssuedAt) }, { label: "Opened link", value: (p) => iso(p.linkClickedAt) }, { label: "Confirmed joined", value: (p) => iso(p.joinConfirmedAt) },
        { label: "Last prayed", value: "lastParticipation" }, { label: "Follow-up", value: (p) => FOLLOW_UP_STATUSES[p.followUp?.status] || "" }, { label: "Follow-up note", value: (p) => p.followUp?.note || "" },
      ]),
    },
    {
      key: "hub-occupancy", title: "Hub occupancy", desc: "Every hub with its leader, capacity, members and group links.",
      go: () => exportReport("hub-occupancy", async () => hubs.data.filter((h) => (!stateCode || h.stateCode === stateCode)).sort((a, b) => a.stateCode.localeCompare(b.stateCode) || a.name.localeCompare(b.name)), [
        { label: "Hub code", value: "code" }, { label: "Hub", value: "name" }, { label: "State", value: (h) => stateName(h.stateCode) }, { label: "LGA / area", value: "lga" },
        { label: "Leader", value: "leaderName" }, { label: "Leader phone", value: "leaderPhone" }, { label: "Members", value: (h) => h.count || 0 },
        { label: "Capacity", value: (h) => participantCapacity(h, settings) }, { label: "Open places", value: (h) => Math.max(participantCapacity(h, settings) - (h.count || 0), 0) },
        { label: "Status", value: "status" }, { label: "WhatsApp link", value: "whatsappLink" }, { label: "Telegram link", value: "telegramLink" },
      ]),
    },
    {
      key: "states", title: "Registrations by state", desc: "Totals per state: registered, assigned, waiting and confirmed in groups.",
      go: () => exportReport("states", async () => {
        const snap = await getDocs(collection(db, "states"));
        const byId = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
        return STATES.filter((x) => !stateCode || x.code === stateCode).map((x) => ({ name: x.name, ...(byId[x.code]?.counts || {}), coordinator: byId[x.code]?.coordinatorName || "", hubs: hubs.data.filter((h) => h.stateCode === x.code && h.status !== "archived").length }));
      }, [
        { label: "State", value: "name" }, { label: "Registrations", value: (r) => r.registrations || 0 }, { label: "Assigned", value: (r) => r.assigned || 0 },
        { label: "Waiting", value: (r) => r.unassigned || 0 }, { label: "Confirmed in group", value: (r) => r.joined || 0 }, { label: "Hubs", value: "hubs" }, { label: "Coordinator", value: "coordinator" },
      ]),
    },
    {
      key: "leadership", title: "Leadership directory", desc: "Coordinators, hub leaders, administrators and volunteers with accounts.",
      go: () => exportReport("leadership", async () => {
        const col = collection(db, "users");
        const snap = await getDocs(s.national ? (stateCode ? query(col, where("stateCode", "==", stateCode)) : query(col)) : query(col, where("stateCode", "==", s.stateCode)));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
      }, [
        { label: "Name", value: "name" }, { label: "Role", value: (u) => ROLES[u.role] }, { label: "State", value: (u) => (u.stateCode ? stateName(u.stateCode) : "National") },
        { label: "Email", value: "email" }, { label: "Phone", value: "phone" }, { label: "Department", value: "department" },
        { label: "Hubs led", value: (u) => (u.hubIds || []).map((h) => hubName[h] || h).join("; ") }, { label: "Active", value: (u) => (u.active === false ? "No" : "Yes") },
      ]),
    },
    {
      key: "volunteers", title: "Volunteer directory", desc: "Volunteers by department with supervisor and responsibilities.",
      go: () => exportReport("volunteers", async () => {
        const col = collection(db, "volunteers");
        const snap = await getDocs(s.national ? (stateCode ? query(col, where("stateCode", "==", stateCode)) : query(col)) : query(col, where("stateCode", "==", s.stateCode)));
        return snap.docs.map((d) => d.data()).sort((a, b) => (a.department || "").localeCompare(b.department || "") || a.name.localeCompare(b.name));
      }, [
        { label: "Name", value: "name" }, { label: "Department", value: "department" }, { label: "State", value: (v) => (v.stateCode ? stateName(v.stateCode) : "National") },
        { label: "Phone", value: "phone" }, { label: "Email", value: "email" }, { label: "Supervisor", value: "supervisor" }, { label: "Responsibilities", value: "responsibilities" }, { label: "Status", value: "status" },
      ]),
    },
  ];

  async function attendance() {
    await exportReport("attendance", async () => {
      const col = collection(db, "attendance");
      const cons = stateCode ? [where("stateCode", "==", stateCode), where("date", ">=", f.attFrom)] : [where("date", ">=", f.attFrom)];
      const snap = await getDocs(query(col, ...cons));
      return snap.docs.map((d) => d.data()).filter((a) => a.date <= f.attTo && (!f.hub || a.hubId === f.hub)).sort((a, b) => a.date.localeCompare(b.date) || (a.participantName || "").localeCompare(b.participantName || ""));
    }, [
      { label: "Date", value: "date" }, { label: "Participant", value: "participantName" }, { label: "Hub", value: (a) => hubName[a.hubId] || "" },
      { label: "State", value: (a) => stateName(a.stateCode) }, { label: "Status", value: (a) => ATTENDANCE_STATUSES[a.status] || a.status },
      { label: "Source", value: (a) => ({ hub: "Hub leader", self: "Self-reported", zoom: "Zoom" })[a.source] || a.source }, { label: "Recorded by", value: "recordedByName" },
    ]);
  }

  const lgas = STATE_BY_CODE[stateCode]?.lgas || [];

  return (
    <>
      <PageTitle title="Reports" sub="Download CSV files that open in Excel or Google Sheets. Exports are logged; store them securely." />
      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Filters for participant reports</h2>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          {s.national && <div><label>State</label><StateSelect value={f.state} onChange={set("state")} /></div>}
          {lgas.length > 0 && <div><label htmlFor="rl">LGA</label><select id="rl" className="input" value={f.lga} onChange={set("lga")}><option value="">Any LGA</option>{lgas.map((l) => <option key={l}>{l}</option>)}</select></div>}
          {stateCode && <div><label htmlFor="rh">Hub</label><select id="rh" className="input" value={f.hub} onChange={set("hub")}><option value="">Any hub</option>{hubs.data.filter((h) => h.stateCode === stateCode).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>}
          <div><label htmlFor="rs">Status</label><select id="rs" className="input" value={f.status} onChange={set("status")}><option value="">Any</option><option value="assigned">Assigned</option><option value="unassigned">Waiting</option><option value="deactivated">Deactivated</option><option value="duplicate">Duplicate</option></select></div>
          <div><label htmlFor="rf">Registered from</label><input id="rf" type="date" className="input" value={f.from} onChange={set("from")} /></div>
          <div><label htmlFor="rt">to</label><input id="rt" type="date" className="input" value={f.to} onChange={set("to")} /></div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="t">
          <tbody>
            {reports.map((r) => (
              <tr key={r.key}>
                <td><strong>{r.title}</strong><div className="sub">{r.desc}</div></td>
                <td style={{ textAlign: "right" }}><button className="btn btn-quiet btn-sm" disabled={busy} onClick={r.go}>Download CSV</button></td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Attendance and engagement</strong>
                <div className="sub">Hub-reported and self-reported participation for a date range.</div>
                <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                  <Field label="From" id="raf"><input id="raf" type="date" className="input" value={f.attFrom} onChange={set("attFrom")} /></Field>
                  <Field label="To" id="rat"><input id="rat" type="date" className="input" value={f.attTo} onChange={set("attTo")} /></Field>
                </div>
              </td>
              <td style={{ textAlign: "right", verticalAlign: "middle" }}><button className="btn btn-quiet btn-sm" disabled={busy} onClick={attendance}>Download CSV</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
