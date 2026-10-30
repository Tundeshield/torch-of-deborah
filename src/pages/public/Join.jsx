import { useState } from "react";
import { Link } from "react-router-dom";
import { Field } from "../../components/ui.jsx";
import { STATES, STATE_BY_CODE } from "../../data/states.js";
import { CATEGORIES, isValidPhone, isValidEmail } from "../../lib/shared.js";
import { api } from "../../lib/api.js";
import { useSite } from "../../components/PublicLayout.jsx";
import HubResult from "./HubResult.jsx";
import { saveHubKey } from "../../lib/device.js";

const blank = { fullName: "", phone: "", email: "", stateCode: "", lga: "", category: "Prayer Participant", consent: false, website: "" };

export default function Join() {
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const site = useSite();

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === "stateCode" ? { lga: "" } : {}) }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (f.fullName.trim().length < 3) errs.fullName = "Enter your full name.";
    if (!isValidPhone(f.phone)) errs.phone = "Enter your WhatsApp number, e.g. 0803 123 4567.";
    if (f.email && !isValidEmail(f.email)) errs.email = "Check your email address, or leave it empty.";
    if (!f.stateCode) errs.stateCode = "Choose your state.";
    if (!f.lga.trim()) errs.lga = f.stateCode === "INTL" ? "Enter your city and country." : "Choose your LGA.";
    if (!f.consent) errs.consent = "Please tick to agree.";
    setErrors(errs);
    setError("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await api.register(f);
      if (r.deviceKey) saveHubKey(r.deviceKey);
      setResult(r);
      window.scrollTo(0, 0);
    } catch (err) {
      setErrors(err.data?.fields || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <div className="page"><div className="narrow"><HubResult info={result} title={`Welcome, ${result.firstName}!`} /></div></div>;
  }

  const lgas = STATE_BY_CODE[f.stateCode]?.lgas || [];

  return (
    <div className="page">
      <form className="narrow" onSubmit={submit} noValidate>
        <h1>Join the movement</h1>
        <p className="muted">You'll see your prayer hub as soon as you finish.</p>
        {site.registrationOpen === false && <div className="alert">Registration is paused at the moment. Please check back soon.</div>}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} />

        <Field label="Full name" id="n" error={errors.fullName}>
          <input id="n" className="input" autoComplete="name" value={f.fullName} onChange={set("fullName")} aria-invalid={!!errors.fullName} />
        </Field>
        <Field label="WhatsApp number" id="p" error={errors.phone} hint="Your hub leader will reach you here.">
          <input id="p" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={f.phone} onChange={set("phone")} aria-invalid={!!errors.phone} />
        </Field>
        <div className="row2">
          <Field label="State" id="s" error={errors.stateCode}>
            <select id="s" className="input" value={f.stateCode} onChange={set("stateCode")} aria-invalid={!!errors.stateCode}>
              <option value="">Choose</option>
              {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </Field>
          {f.stateCode === "INTL" ? (
            <Field label="City and country" id="l" error={errors.lga}>
              <input id="l" className="input" value={f.lga} onChange={set("lga")} aria-invalid={!!errors.lga} />
            </Field>
          ) : (
            <Field label="LGA" id="l" error={errors.lga}>
              <select id="l" className="input" value={f.lga} onChange={set("lga")} disabled={!f.stateCode} aria-invalid={!!errors.lga}>
                <option value="">{f.stateCode ? "Choose" : "Choose a state first"}</option>
                {lgas.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="field">
          <span className="label">How would you like to take part?</span>
          <div className="choices">
            {Object.entries(CATEGORIES).map(([value, label]) => (
              <label className="choice" key={value}>
                <input type="radio" name="category" value={value} checked={f.category === value} onChange={set("category")} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <Field label="Email" optional id="e" error={errors.email}>
          <input id="e" className="input" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors.email} />
        </Field>
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={f.consent} onChange={set("consent")} />
            <span>I agree to my details being shared with my hub leader and state coordinator, and to receive prayer updates. <Link to="/privacy" target="_blank">Privacy policy</Link></span>
          </label>
          {errors.consent && <div className="err">{errors.consent}</div>}
        </div>
        <button className="btn block" disabled={busy || site.registrationOpen === false}>{busy ? "Registering…" : "Register"}</button>
      </form>
    </div>
  );
}
