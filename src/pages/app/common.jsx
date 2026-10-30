import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useAuth, isNationalRole } from "../../lib/auth.jsx";
import { useLiveQuery, useLiveDoc } from "../../lib/hooks.js";
import { doc } from "firebase/firestore";
import { STATES, stateName } from "../../data/states.js";
import { DEFAULT_SETTINGS } from "../../lib/shared.js";

export function useScope() {
  const { profile } = useAuth();
  const national = isNationalRole(profile);
  const coordinator = profile?.role === "coordinator";
  const hubIds = profile?.hubIds || [];
  return {
    profile,
    national,
    coordinator,
    leader: hubIds.length > 0 && !national && !coordinator,
    stateCode: coordinator ? profile.stateCode : null,
    hubIds,
    canManageState: (code) => national || (coordinator && profile.stateCode === code),
  };
}

// Hubs visible to the current user, live.
export function useHubs(stateFilter) {
  const s = useScope();
  const q = useLiveQuery(() => {
    const col = collection(db, "hubs");
    if (s.national) return stateFilter ? query(col, where("stateCode", "==", stateFilter)) : query(col);
    if (s.coordinator) return query(col, where("stateCode", "==", s.stateCode));
    return null;
  }, [s.national, s.coordinator, s.stateCode, stateFilter]);
  const own = useOwnHubs(!s.national && !s.coordinator ? s.hubIds : []);
  return s.national || s.coordinator ? q : own;
}

// Leaders read their hubs one document at a time (security rules check each hub id).
function useOwnHubs(ids) {
  const key = ids.join(",");
  const [state, setState] = useState({ data: [], loading: ids.length > 0, error: null });
  useEffect(() => {
    if (!ids.length) return setState({ data: [], loading: false, error: null });
    const found = {};
    const unsubs = ids.map((id) =>
      onSnapshot(doc(db, "hubs", id), (snap) => {
        found[id] = snap.exists() ? { id, ...snap.data() } : null;
        setState({ data: ids.map((i) => found[i]).filter(Boolean), loading: Object.keys(found).length < ids.length, error: null });
      }, (error) => setState({ data: [], loading: false, error })),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useSettings() {
  const r = useLiveDoc(() => doc(db, "settings", "programme"), []);
  return { ...r, data: { ...DEFAULT_SETTINGS, ...(r.data || {}) } };
}

export function useStates() {
  return useLiveQuery(() => query(collection(db, "states")), []);
}

// Staff accounts visible to the current user.
export function useStaff() {
  const s = useScope();
  return useLiveQuery(() => {
    const col = collection(db, "users");
    if (s.national) return query(col);
    if (s.coordinator) return query(col, where("stateCode", "==", s.stateCode));
    return null;
  }, [s.national, s.coordinator, s.stateCode]);
}

export function StateSelect({ value, onChange, allowAll = true, allLabel = "All states", id, className = "input", includeIntl = true }) {
  const s = useScope();
  if (!s.national) {
    return <select id={id} className={className} value={s.stateCode || ""} disabled><option value={s.stateCode || ""}>{stateName(s.stateCode)}</option></select>;
  }
  return (
    <select id={id} className={className} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {allowAll && <option value="">{allLabel}</option>}
      {!allowAll && <option value="">Choose a state</option>}
      {STATES.filter((x) => includeIntl || x.code !== "INTL").map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
    </select>
  );
}

export function PageTitle({ title, sub, children }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

export { orderBy };
