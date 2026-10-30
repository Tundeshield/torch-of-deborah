import { Component, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy } from "./lib/lazy.js";
import { Loading } from "./components/ui.jsx";
import PublicLayout from "./components/PublicLayout.jsx";
import Home from "./pages/public/Home.jsx";

const Join = lazy(() => import("./pages/public/Join.jsx"));
const FindHub = lazy(() => import("./pages/public/FindHub.jsx"));
const Privacy = lazy(() => import("./pages/public/Privacy.jsx"));
const Leaders = lazy(() => import("./pages/app/AppRoutes.jsx"));

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidUpdate(prev) {
    if (prev.pathname !== this.props.pathname && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>This page didn't load</h1>
        <p className="muted">Check your connection and try again.</p>
        <button className="btn" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <ErrorBoundary pathname={pathname}>
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="join" element={<Join />} />
          <Route path="find" element={<FindHub />} />
          <Route path="privacy" element={<Privacy />} />
        </Route>
        <Route path="login" element={<Leaders />} />
        <Route path="app/*" element={<Leaders />} />
        <Route path="welcome/*" element={<Navigate to="/find" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
