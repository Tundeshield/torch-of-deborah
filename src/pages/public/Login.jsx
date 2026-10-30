import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import { Loading, Torch } from "../../components/ui.jsx";

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
);

export default function Login() {
  const { profile, loading, refused, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.site().catch(() => {}); // makes sure this address is allowed for Google sign-in
  }, []);

  if (loading) return <Loading />;
  if (profile) return <Navigate to="/app" replace />;

  async function go() {
    setErr("");
    setBusy(true);
    try {
      await signIn();
    } catch (e) {
      setErr(
        e.code === "auth/operation-not-allowed" ? "Google sign-in is not turned on yet. In Firebase, go to Authentication → Sign-in method and enable Google."
        : e.code === "auth/unauthorized-domain" ? "This address is being allowed for sign-in. Wait a minute, reload the page and try again."
        : e.code === "auth/network-request-failed" ? "Couldn't reach Google. Check your connection, turn off any ad or tracker blocker for this site, and try again."
        : e.message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <div className="box">
        <Link to="/" aria-label="Home"><Torch className="mark" color="#5a1028" /></Link>
        {refused && <div className="alert"><strong>{refused}</strong> is not on the team. Ask an admin to add you, then try again.</div>}
          <>
            <h1>Leader sign in</h1>
            <p>For coordinators, hub leaders and the national team.</p>
            {err && <div className="alert">{err}</div>}
            <button className="google" onClick={go} disabled={busy}><GoogleIcon /> {busy ? "Signing in…" : "Sign in with Google"}</button>
            <p className="small" style={{ margin: "24px 0 0" }}>Registered to pray? <Link to="/">Go to the home page</Link></p>
          </>
      </div>
    </div>
  );
}
