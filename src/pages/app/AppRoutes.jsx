import { Suspense } from "react";
import { Navigate, NavLink, Route, Routes, Link, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../../lib/auth.jsx";
import { lazy } from "../../lib/lazy.js";
import { Loading, Torch } from "../../components/ui.jsx";
import Login from "../public/Login.jsx";
import { useScope } from "./common.jsx";

const Overview = lazy(() => import("./Overview.jsx"));
const People = lazy(() => import("./People.jsx"));
const Hubs = lazy(() => import("./Hubs.jsx"));
const Team = lazy(() => import("./Team.jsx"));
const Settings = lazy(() => import("./Settings.jsx"));
const MyHub = lazy(() => import("./MyHub.jsx"));

export default function Leaders() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { pathname } = useLocation();
  const { loading, profile } = useAuth();
  if (pathname.startsWith("/login")) return <Login />;
  if (loading) return <Loading />;
  if (!profile) return <Navigate to="/login" replace />;
  return <Shell />;
}

function Shell() {
  const s = useScope();
  const { profile, signOut } = useAuth();
  const nav = s.leaderOnly
    ? []
    : [["", "Overview"], ["people", "People"], ["hubs", "Hubs"], ["team", "Team"], ...(s.admin ? [["settings", "Settings"]] : [])];

  return (
    <>
      <header className="bar">
        <div className="wrap">
          <Link to="/app" className="logo"><Torch color="#fff" /><span>Torch of Deborah</span></Link>
          <nav aria-label="Dashboard">
            {nav.map(([to, label]) => <NavLink key={to} to={`/app/${to}`} end={to === ""}>{label}</NavLink>)}
          </nav>
          <div className="who"><span className="name">{profile.name}</span><button onClick={signOut}>Sign out</button></div>
        </div>
      </header>
      <main className="main">
        <Suspense fallback={<Loading />}>
          <Routes>
            {s.leaderOnly ? (
              <Route path="*" element={<MyHub />} />
            ) : (
              <>
                <Route index element={<Overview />} />
                <Route path="people" element={<People />} />
                <Route path="hubs" element={<Hubs />} />
                <Route path="team" element={<Team />} />
                {s.admin && <Route path="settings" element={<Settings />} />}
                <Route path="*" element={<Navigate to="/app" replace />} />
              </>
            )}
          </Routes>
        </Suspense>
      </main>
    </>
  );
}
