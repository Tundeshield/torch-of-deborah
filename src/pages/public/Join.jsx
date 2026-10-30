import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Field } from "../../components/ui.jsx";
import { STATES, STATE_BY_CODE } from "../../data/states.js";
import { CATEGORIES, isValidEmail, isValidPhone } from "../../lib/shared.js";
import { api } from "../../lib/api.js";
import { usePublicStats } from "../../lib/publicStats.js";

const initial = {
  fullName: "", phone: "", email: "", stateCode: "", country: "", lga: "", category: "Prayer Participant",
  onlineMeetings: "", inviteOthers: "", inspiration: "", church: "", notes: "", consentPrivacy: false, consentComms: false, website: "",
};

function clientValidate(f) {
  const e = {};
  if (f.fullName.trim().length < 3) e.fullName = "Enter your full name.";
  if (!isValidPhone(f.phone)) e.phone = "Enter a WhatsApp number we can reach, e.g. 0803 123 4567.";
  if (!isValidEmail(f.email)) e.email = "Enter a valid email address.";
  if (!f.stateCode) e.stateCode = "Choose your state of residence.";
  if (f.stateCode === "INTL" && !f.country.trim()) e.country = "Tell us the country you live in.";
  if (!f.lga.trim()) e.lga = f.stateCode === "INTL" ? "Tell us your city." : "Choose your Local Government Area.";
  if (!f.onlineMeetings) e.onlineMeetings = "Let us know about online prayer meetings.";
  if (!f.inviteOthers) e.inviteOthers = "Let us know if you will invite other women.";
  if (f.inspiration.trim().length < 3) e.inspiration = "Share a few words about what inspired you to join.";
  if (!f.consentPrivacy) e.consentPrivacy = "Please agree to how we handle your information.";
  if (!f.consentComms) e.consentComms = "We need your permission to send you prayer updates.";
  return e;
}

export default function Join() {
  const [params] = useSearchParams();
  const preset = CATEGORIES.includes(params.get("as")) ? params.get("as") : "Prayer Participant";
  const [f, setF] = useState({ ...initial, category: preset });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [resent, setResent] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const stats = usePublicStats();
  const closed = stats.data?.site?.registrationOpen === false;

  const lgas = useMemo(() => {
    const base = STATE_BY_CODE[f.stateCode]?.lgas || [];
    const extra = stats.data?.extraLgas?.[f.stateCode] || [];
    return [...new Set([...base, ...extra])].sort((a, b) => a.localeCompare(b));
  }, [f.stateCode, stats.data]);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === "stateCode" ? { lga: "" } : {}) }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    setDuplicate(false);
    const errs = clientValidate(f);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Please check the highlighted fields.");
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api.register(f);
      if (res.token) {
        try { localStorage.setItem("tod_welcome", res.token); } catch { /* storage may be blocked */ }
        nav(`/welcome/${res.token}`, { replace: true, state: { fresh: true } });
      }
    } catch (err) {
      if (err.data?.fields) setErrors(err.data.fields);
      if (err.data?.duplicate) setDuplicate(true);
      setFormError(err.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const r = await api.resendLink(f.email);
      setResent(r.message);
    } catch (e) {
      setResent(e.message);
    }
  }

  const choice = (name, value, label) => (
    <label className="choice" key={value}>
      <input type="radio" name={name} value={value} checked={f[name] === value} onChange={set(name)} />
      <span>{label}</span>
    </label>
  );

  return (
    <>
      <div className="page-head">
        <div className="narrow">
          <h1>Join the movement</h1>
          <p>Register in a few minutes. You will be placed in a prayer hub in your state and see your hub's details straight away.</p>
        </div>
      </div>
      <form className="form-shell" onSubmit={submit} noValidate>
        {closed && <div className="form-note">Registration is paused at the moment. Please check back soon.</div>}
        {formError && (
          <div className="form-error" role="alert">
            {formError}
            {duplicate && (
              <div style={{ marginTop: 8 }}>
                Already registered? {resent ? <strong>{resent}</strong> : <button type="button" className="linkish" onClick={resend}>Email me my welcome link</button>}
              </div>
            )}
          </div>
        )}
        <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} name="website" />

        <fieldset className="fieldset">
          <legend>About you</legend>
          <Field label="Full name" id="fullName" error={errors.fullName}>
            <input id="fullName" className="input" autoComplete="name" value={f.fullName} onChange={set("fullName")} aria-invalid={!!errors.fullName} />
          </Field>
          <div className="grid-2">
            <Field label="WhatsApp phone number" id="phone" error={errors.phone} hint="Include the country code if you live outside Nigeria.">
              <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={f.phone} onChange={set("phone")} aria-invalid={!!errors.phone} />
            </Field>
            <Field label="Email address" id="email" error={errors.email}>
              <input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors.email} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Where you live</legend>
          <div className="grid-2">
            <Field label="State of residence" id="stateCode" error={errors.stateCode}>
              <select id="stateCode" className="input" value={f.stateCode} onChange={set("stateCode")} aria-invalid={!!errors.stateCode}>
                <option value="">Choose your state</option>
                {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </Field>
            {f.stateCode === "INTL" ? (
              <Field label="Country" id="country" error={errors.country}>
                <input id="country" className="input" autoComplete="country-name" value={f.country} onChange={set("country")} aria-invalid={!!errors.country} />
              </Field>
            ) : (
              <Field label="Local Government Area" id="lga" error={errors.lga}>
                <select id="lga" className="input" value={f.lga} onChange={set("lga")} disabled={!f.stateCode} aria-invalid={!!errors.lga}>
                  <option value="">{f.stateCode ? "Choose your LGA" : "Choose your state first"}</option>
                  {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            )}
          </div>
          {f.stateCode === "INTL" && (
            <Field label="City" id="lga" error={errors.lga}>
              <input id="lga" className="input" autoComplete="address-level2" value={f.lga} onChange={set("lga")} aria-invalid={!!errors.lga} />
            </Field>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend>How you will take part</legend>
          <div className="field">
            <span className="label" id="cat-l">I am joining as</span>
            <div className="choices" role="radiogroup" aria-labelledby="cat-l">{CATEGORIES.map((c) => choice("category", c, c))}</div>
          </div>
          <div className="field">
            <span className="label" id="om-l">Will you join the online prayer meetings?</span>
            <div className="choices" role="radiogroup" aria-labelledby="om-l">
              {choice("onlineMeetings", "yes", "Yes")}
              {choice("onlineMeetings", "sometimes", "When I can")}
              {choice("onlineMeetings", "no", "No")}
            </div>
            {errors.onlineMeetings && <div className="err">{errors.onlineMeetings}</div>}
          </div>
          <div className="field">
            <span className="label" id="io-l">Will you invite other women to join?</span>
            <div className="choices" role="radiogroup" aria-labelledby="io-l">
              {choice("inviteOthers", "yes", "Yes")}
              {choice("inviteOthers", "no", "Not yet")}
            </div>
            {errors.inviteOthers && <div className="err">{errors.inviteOthers}</div>}
          </div>
          <Field label="What inspired you to join?" id="inspiration" error={errors.inspiration}>
            <textarea id="inspiration" className="input" value={f.inspiration} onChange={set("inspiration")} aria-invalid={!!errors.inspiration} maxLength={1500} />
          </Field>
          <div className="grid-2">
            <Field label="Church or ministry" optional id="church">
              <input id="church" className="input" value={f.church} onChange={set("church")} />
            </Field>
            <Field label="Anything else we should know?" optional id="notes">
              <input id="notes" className="input" value={f.notes} onChange={set("notes")} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Your consent</legend>
          <label className="check">
            <input type="checkbox" checked={f.consentPrivacy} onChange={set("consentPrivacy")} />
            <span>I agree that The Torch of Deborah may store my details and share my name and phone number with my hub leader and state coordinator, as described in the <Link to="/privacy" target="_blank">privacy policy</Link>.</span>
          </label>
          {errors.consentPrivacy && <div className="err" style={{ marginTop: -6, marginBottom: 12 }}>{errors.consentPrivacy}</div>}
          <label className="check">
            <input type="checkbox" checked={f.consentComms} onChange={set("consentComms")} />
            <span>I agree to receive prayer schedules, reminders and announcements by email, WhatsApp and Telegram.</span>
          </label>
          {errors.consentComms && <div className="err" style={{ marginTop: -6 }}>{errors.consentComms}</div>}
        </fieldset>

        <button className="btn btn-primary btn-block" disabled={busy || closed}>{busy ? "Registering…" : "Register and find my prayer hub"}</button>
        <p className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
          Registered before? <Link to="/welcome">Find my prayer hub</Link>
        </p>
      </form>
    </>
  );
}
