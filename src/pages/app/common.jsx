import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useAuth } from "../../lib/auth.jsx";
import { useLiveDoc, useLiveQuery } from "../../lib/hooks.js";
import { STATES, stateName } from "../../data/states.js";
import { DEFAULT_SETTINGS } from "../../lib/shared.js";

export function useScope() {
  const { profile } = useAuth();
  const admin = profile?.role === "admin";
  const coordinator = profile?.role === "coordinator";
  return {
    profile,
    admin,
    coordinator,
    leaderOnly: !admin && !coordinator,
    stateCode: coordinator ? profile.stateCode : null,
    hubIds: profile?.hubIds || [],
  };
}

// Hubs this person can see, live. Admins can narrow to one state.
export function useHubs(stateFilter) {
  const s = useScope();
  const q = useLiveQuery(() => {
    const col = collection(db, "hubs");
    if (s.admin) return stateFilter ? query(col, where("stateCode", "==", stateFilter)) : query(col);
    if (s.coordinator) return query(col, where("stateCode", "==", s.stateCode));
    return null;
  }, [s.admin, s.coordinator, s.stateCode, stateFilter]);
  const own = useOwnHubs(s.leaderOnly ? s.hubIds : []);
  const r = s.leaderOnly ? own : q;
  return { ...r, data: [...r.data].sort((a, b) => a.name.localeCompare(b.name)) };
}

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

export function useTeam() {
  const s = useScope();
  return useLiveQuery(() => {
    const col = collection(db, "users");
    if (s.admin) return query(col);
    if (s.coordinator) return query(col, where("stateCode", "==", s.stateCode));
    return null;
  }, [s.admin, s.coordinator, s.stateCode]);
}

export function useSettings() {
  const r = useLiveDoc(() => doc(db, "settings", "programme"), []);
  return { ...r, data: { ...DEFAULT_SETTINGS, ...(r.data || {}) } };
}

export function useStates() {
  return useLiveQuery(() => query(collection(db, "states")), []);
}

export function StateSelect({ value, onChange, all = "All states", id, required }) {
  const s = useScope();
  if (s.coordinator) return <select id={id} className="input" value={s.stateCode} disabled><option value={s.stateCode}>{stateName(s.stateCode)}</option></select>;
  return (
    <select id={id} className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{required ? "Choose a state" : all}</option>
      {STATES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
    </select>
  );
}

export function Head({ title, sub, children }) {
  return (
    <div className="head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
