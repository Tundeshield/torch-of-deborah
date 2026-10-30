import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import PublicLayout from "./components/PublicLayout.jsx";
import Home from "./pages/public/Home.jsx";
import { Loading } from "./components/ui.jsx";

const About = lazy(() => import("./pages/public/About.jsx"));
const Join = lazy(() => import("./pages/public/Join.jsx"));
const Volunteer = lazy(() => import("./pages/public/Volunteer.jsx"));
const Contact = lazy(() => import("./pages/public/Contact.jsx"));
const Privacy = lazy(() => import("./pages/public/Privacy.jsx"));
const Welcome = lazy(() => import("./pages/public/Welcome.jsx"));
const Login = lazy(() => import("./pages/public/Login.jsx"));
const Setup = lazy(() => import("./pages/public/Setup.jsx"));
const AppRoutes = lazy(() => import("./pages/app/AppRoutes.jsx"));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <ScrollTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="mission" element={<Navigate to="/about#mission" replace />} />
          <Route path="join" element={<Join />} />
          <Route path="volunteer" element={<Volunteer />} />
          <Route path="contact" element={<Contact />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="welcome/:token" element={<Welcome />} />
          <Route path="welcome" element={<Welcome />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="setup" element={<Setup />} />
        <Route path="app/*" element={<AppRoutes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
