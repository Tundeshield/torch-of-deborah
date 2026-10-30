import { createContext, useCallback, useContext, useEffect, useState } from "react";

export function Torch({ className = "", flame = true, color = "#f6f0e4", accent = "#d9b25f" }) {
  return (
    <svg className={className} viewBox="0 0 80 160" aria-hidden="true">
      <g className={flame ? "flame" : ""}>
        <path d="M40 4c9 11 15 19 15 30a15 15 0 0 1-30 0c0-7 3-11 7-16 1 5 3 8 7 9-2-8 0-15 1-23z" fill={accent} />
        <path d="M40 22c4 6 7 10 7 15a7 7 0 0 1-14 0c0-4 2-6 4-9 0 3 1 4 3 5-1-4 0-8 0-11z" fill={color} opacity=".9" />
      </g>
      <path d="M22 54h36l-4 6H26z" fill={accent} />
      <path d="M27 62h26l-7 92h-12z" fill="none" stroke={color} strokeWidth="2" />
      <path d="M31 84h18M33 104h14M35 124h10" stroke={accent} strokeWidth="1.5" />
    </svg>
  );
}

export function Field({ label, optional, hint, error, children, id }) {
  return (
    <div className="field">
      {label && (
        <label htmlFor={id}>
          {label} {optional && <span className="opt">(optional)</span>}
        </label>
      )}
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

const TONE = {
  assigned: "ok", active: "ok", confirmed: "ok", participated: "ok", sent: "ok", resolved: "ok", delivered: "ok",
  unassigned: "warn", pending: "warn", full: "info", issued: "info", clicked: "info", scheduled: "info", needed: "warn", excused: "warn", contacted: "info", sending: "info", draft: "",
  deactivated: "bad", duplicate: "bad", inactive: "bad", archived: "", absent: "bad", failed: "bad", cancelled: "",
};

export function Badge({ value, label, tone }) {
  return <span className={`badge ${tone ?? TONE[value] ?? ""}`}>{label || value}</span>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return <div className="loading" role="status">{label}</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  const msg = error.code === "permission-denied"
    ? "You do not have access to this information. If your role changed recently, sign out and back in."
    : error.code === "failed-precondition"
      ? "The database is still preparing an index for this view. Try again in a few minutes."
      : error.message || String(error);
  return <div className="err-box" role="alert">{msg}</div>;
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, tone = "") => {
    const id = Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-zone" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// Runs an API action with busy state and toast feedback.
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, success) => {
    setBusy(true);
    try {
      const r = await fn();
      if (success) toast(typeof success === "function" ? success(r) : success);
      return r;
    } catch (e) {
      toast(e.message || "That did not work.", "bad");
      throw e;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}
