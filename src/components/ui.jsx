import { createContext, useCallback, useContext, useEffect, useState } from "react";

export function Torch({ className = "", color = "currentColor", flame = "#e8b84a" }) {
  return (
    <svg className={className} viewBox="0 0 40 80" aria-hidden="true">
      <path d="M20 2c5 6 8 10 8 16a8 8 0 0 1-16 0c0-4 2-6 4-9 0 3 2 5 4 5-1-4 0-8 0-12z" fill={flame} />
      <path d="M10 27h20l-2 4H12z" fill={flame} />
      <path d="M13 33h14l-4 44h-6z" fill={color} />
    </svg>
  );
}

export function Field({ label, optional, hint, error, children, id }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label} {optional && <span className="opt">(optional)</span>}</label>}
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}

export function Panel({ title, onClose, children, actions }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="shade" onClick={onClose} />
      <aside className="panel" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="body">{children}</div>
        {actions && <div className="foot-actions">{actions}</div>}
      </aside>
    </>
  );
}

export function Loading() {
  return <div className="loading" role="status" aria-label="Loading"><div className="spinner" /></div>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
      {action && <div>{action}</div>}
    </div>
  );
}

export function ErrorText({ error }) {
  if (!error) return null;
  const msg = error.code === "permission-denied"
    ? "You don't have access to this. Try signing out and in again."
    : error.code === "failed-precondition"
      ? "The database is still getting ready. Try again in a few minutes."
      : error.message;
  return <div className="alert" role="alert">{msg}</div>;
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, tone = "") => {
    const id = Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
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

// Runs a server action with a busy flag and a toast on success or failure.
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
