import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import { useAuth, AuthProvider } from "../../lib/auth.jsx";
import { firebaseConfigured } from "../../lib/firebase.js";
import { Loading, Torch } from "../../components/ui.jsx";
import { ROLES } from "../../lib/shared.js";
import { stateName } from "../../data/states.js";
import { useScope } from "./common.jsx";

const Overview = lazy(() => import("./Overview.jsx"));
const Participants = lazy(() => import("./Participants.jsx"));
const States = lazy(() => import("./States.jsx"));
const Hubs = lazy(() => import("./Hubs.jsx"));
const Leadership = lazy(() => import("./Leadership.jsx"));
const Volunteers = lazy(() => import("./Volunteers.jsx"));
const Schedule = lazy(() => import("./Schedule.jsx"));
const Notifications = lazy(() => import("./Notifications.jsx"));
const Attendance = lazy(() => import("./Attendance.jsx"));
const Reports = lazy(() => import("./Reports.jsx"));
const Settings = lazy(() => import("./Settings.jsx"));
const MyHub = lazy(() => import("./MyHub.jsx"));
const FollowUps = lazy(() => import("./FollowUps.jsx"));
const Activity = lazy(() => import("./Activity.jsx"));

function navFor(s) {
  if (s.national) {
    return [
      ["", "Overview"], ["participants", "Participants"], ["states", "States"], ["hubs", "Prayer hubs"], ["leadership", "Leadership"],
      ["volunteers", "Volunteers"], ["schedule", "Prayer schedule"], ["notifications", "Notifications"], ["attendance", "Attendance"],
      ["reports", "Reports"], ["activity", "Activity log"], ["settings", "Settings"],
    ];
  }
  if (s.coordinator) {
    return [
      ["", "Overview"], ["states", "My state"], ["hubs", "Prayer hubs"], ["participants", "Participants"], ["leadership", "Hub leaders"],
      ["volunteers", "Volunteers"], ["attendance", "Attendance"], ["schedule", "Prayer schedule"], ["notifications", "Notifications"], ["reports", "Reports"], ["activity", "Activity log"],
    ];
  }
  if (s.leader) {
    return [
      ["", "Overview"], ["hub", "My prayer hub"], ["participants", "Participants"], ["attendance", "Attendance"],
      ["schedule", "Prayer schedule"], ["hub#group", "Group information"], ["follow-ups", "Follow-ups"],
    ];
  }
  return [["", "Overview"], ["schedule", "Prayer schedule"]];
}

export default function AppRoutesWithAuth() {
  return <AuthProvider><AppRoutes /></AuthProvider>;
}

function AppRoutes() {
  const { user, profile, loading, logout } = useAuth();
  const s = useScope();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  if (!firebaseConfigured) return <Navigate to="/login" replace />;
  if (loading) return <Loading label="Opening your dashboard…" />;
  if (!user || !profile) return <Navigate to="/login" replace />;
  if (profile.active === false) {
    return <div className="narrow" style={{ padding: 60 }}><h1>Your account is inactive</h1><p>Contact the national team.</p><button className="btn btn-quiet" onClick={logout}>Sign out</button></div>;
  }

  const nav = navFor(s);
  const roleLabel = ROLES[profile.role] + (profile.stateCode ? ` · ${stateName(profile.stateCode)}` : "") + (profile.department ? ` · ${profile.department}` : "");

  return (
    <div className="app">
      <div className="app-top">
        <span className="brand-name" style={{ fontFamily: "var(--display)" }}>Torch of Deborah</span>
        <button onClick={() => setOpen(true)} aria-expanded={open}>Menu</button>
      </div>
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Dashboard navigation">
        <Link to="/" className="brand"><Torch flame={false} /><span className="brand-name">Torch of Deborah</span></Link>
        <nav className="side-nav">
          {nav.map(([to, label]) => (
            <NavLink key={to + label} to={`/app/${to}`} end={to === ""} className={({ isActive }) => (isActive && !to.includes("#") ? "active" : "")}>{label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">{profile.name}</div>
          <div className="role">{roleLabel}</div>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main" onClick={() => open && setOpen(false)}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={s.leader ? <MyHub overview /> : <Overview />} />
            <Route path="participants" element={<Participants />} />
            <Route path="states" element={<Guard ok={s.national || s.coordinator}><States /></Guard>} />
            <Route path="hubs" element={<Guard ok={s.national || s.coordinator}><Hubs /></Guard>} />
            <Route path="hub" element={<Guard ok={s.hubIds.length > 0}><MyHub /></Guard>} />
            <Route path="leadership" element={<Guard ok={s.national || s.coordinator}><Leadership /></Guard>} />
            <Route path="volunteers" element={<Guard ok={s.national || s.coordinator}><Volunteers /></Guard>} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="notifications" element={<Guard ok={s.national || s.coordinator}><Notifications /></Guard>} />
            <Route path="attendance" element={<Guard ok={s.national || s.coordinator || s.hubIds.length > 0}><Attendance /></Guard>} />
            <Route path="follow-ups" element={<Guard ok={s.hubIds.length > 0 || s.coordinator || s.national}><FollowUps /></Guard>} />
            <Route path="reports" element={<Guard ok={s.national || s.coordinator}><Reports /></Guard>} />
            <Route path="activity" element={<Guard ok={s.national || s.coordinator}><Activity /></Guard>} />
            <Route path="settings" element={<Guard ok={s.national}><Settings /></Guard>} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function Guard({ ok, children }) {
  return ok ? children : <Navigate to="/app" replace />;
}
