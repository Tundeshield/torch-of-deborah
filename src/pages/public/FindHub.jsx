import { useState } from "react";
import { Link } from "react-router-dom";
import { Field } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import HubResult from "./HubResult.jsx";

export default function FindHub() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setResult(await api.find(phone));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) return <div className="page"><div className="narrow"><HubResult info={result} title={`Hello, ${result.firstName}`} /></div></div>;

  return (
    <div className="page">
      <form className="narrow" onSubmit={submit}>
        <h1>Find my hub</h1>
        <p className="muted">Enter the WhatsApp number you registered with.</p>
        {error && <div className="alert" role="alert">{error} {error.includes("could not find") && <Link to="/join">Register</Link>}</div>}
        <Field label="WhatsApp number" id="fp">
          <input id="fp" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <button className="btn block" disabled={busy || phone.trim().length < 7}>{busy ? "Looking…" : "Show my hub"}</button>
      </form>
    </div>
  );
}
