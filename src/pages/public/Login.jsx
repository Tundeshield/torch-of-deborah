import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth, firebaseConfigured } from "../../lib/firebase.js";
import { useAuth, AuthProvider } from "../../lib/auth.jsx";
import { Field, Torch } from "../../components/ui.jsx";

export default function LoginWithAuth() {
  return <AuthProvider><Login /></AuthProvider>;
}

function Login() {
  const { user, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user && profile) return <Navigate to="/app" replace />;

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e2) {
      setErr(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(e2.code)
        ? "That email and password do not match. Try again or reset your password."
        : e2.code === "auth/user-disabled" ? "This account has been deactivated. Contact the national team." : e2.code === "auth/too-many-requests" ? "Too many attempts. Wait a few minutes, or reset your password." : e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setErr("");
    if (!email.includes("@")) return setErr("Enter your email address first, then choose “Forgot password”.");
    try {
      await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/login` });
    } catch { /* do not reveal whether the account exists */ }
    setInfo("If that email has a leadership account, a password reset link is on its way.");
  }

  return (
    <div className="auth-shell">
      <div className="side">
        <Link to="/" className="brand"><Torch flame={false} /><span className="brand-name">The Torch of Deborah</span></Link>
        <div>
          <h1>Leadership sign in</h1>
          <p style={{ opacity: .8, maxWidth: "26em" }}>For the national team, state coordinators, hub leaders and volunteers. Participants do not need to sign in; use your welcome link instead.</p>
        </div>
        <Link to="/welcome" style={{ color: "var(--gold-bright)" }}>I am a participant looking for my hub</Link>
      </div>
      <div className="form">
        <div>
          {!firebaseConfigured && <div className="form-error">Firebase is not configured for this site yet. Add the VITE_FIREBASE_* environment variables in Netlify.</div>}
          {user && !profile && !loading && <div className="form-error">This sign-in has no leadership role. Ask the national team to invite you.</div>}
          <form onSubmit={submit}>
            <Field label="Email" id="le"><input id="le" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password" id="lp"><input id="lp" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err && <div className="form-error" role="alert">{err}</div>}
            {info && <div className="notice" role="status">{info}</div>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={busy || !firebaseConfigured}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p style={{ marginTop: 16 }}><button className="linkish" onClick={reset}>Forgot password</button></p>
        </div>
      </div>
    </div>
  );
}
