import { Component, Suspense, useEffect } from "react";
import { lazy } from "./lib/lazy.js";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { PageFallback } from "./components/ui.jsx";
import PublicLayout from "./components/PublicLayout.jsx";
import Home from "./pages/public/Home.jsx";

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>This page did not load</h1>
        <p>Check your connection and try again.</p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload the page</button>
          <a className="btn btn-quiet" href="/">Go to the home page</a>
        </div>
      </div>
    );
  }
}

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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary key={useLocation().pathname}>
    <Suspense fallback={<PageFallback />}>
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
    </ErrorBoundary>
  );
}
