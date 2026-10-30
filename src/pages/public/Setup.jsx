import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Field, Torch } from "../../components/ui.jsx";

export default function Setup() {
  const [f, setF] = useState({ secret: "", name: "", email: "", phone: "" });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function run(action) {
    setErr("");
    setRes(null);
    setBusy(true);
    try {
      setRes(await api.setup({ ...f, action }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="side">
        <Link to="/" className="brand"><Torch flame={false} /><span className="brand-name">The Torch of Deborah</span></Link>
        <div>
          <h1>First-time setup</h1>
          <p style={{ opacity: .8, maxWidth: "28em" }}>Creates the first national administrator, seeds the 37 states and programme settings, and applies the database security rules and indexes. You need the setup secret from Netlify.</p>
        </div>
        <span />
      </div>
      <div className="form">
        <div>
          <Field label="Setup secret" id="ss"><input id="ss" className="input" type="password" value={f.secret} onChange={set("secret")} /></Field>
          <Field label="Your full name" id="sn"><input id="sn" className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label="Your email" id="se"><input id="se" className="input" type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Phone" optional id="sp"><input id="sp" className="input" value={f.phone} onChange={set("phone")} /></Field>
          {err && <div className="form-error" role="alert">{err}</div>}
          {res?.rules && (
            <div className="notice" role="status">
              <div>Security rules: {res.rules}</div>
              {Array.isArray(res.indexes) && <div>Indexes: {res.indexes.filter((i) => i.status !== "exists").length} building, {res.indexes.filter((i) => i.status === "exists").length} already in place. They take a few minutes.</div>}
              {res.passwordLink && <div style={{ marginTop: 8 }}><a href={res.passwordLink}>Set your password</a>, then <Link to="/login">sign in</Link>.</div>}
            </div>
          )}
          {res?.passwordLink && !res.rules && (
            <div className="notice" role="status">
              <a className="btn btn-primary btn-block" href={res.passwordLink}>Set my password</a>
              <div className="small" style={{ marginTop: 8 }}>After choosing a password, <Link to="/login">sign in here</Link> with your email.</div>
            </div>
          )}
          <button className="btn btn-primary btn-block" onClick={() => run("bootstrap")} disabled={busy}>{busy ? "Working…" : "Create the first administrator"}</button>
          <button className="btn btn-quiet btn-block" style={{ marginTop: 10 }} onClick={() => run("passwordLink")} disabled={busy || !f.secret || !f.email}>Get my password link</button>
          <p className="small muted" style={{ marginTop: 6 }}>Already set up? Enter the setup secret and your admin email, then choose “Get my password link”.</p>
          <p className="small muted" style={{ marginTop: 14 }}>
            <button className="linkish" onClick={() => run("deploy")} disabled={busy}>Re-apply database rules and indexes</button>
          </p>
        </div>
      </div>
    </div>
  );
}
