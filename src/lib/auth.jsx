import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: Boolean(auth), user: null, profile: null });

  useEffect(() => {
    if (!auth) return;
    let unsubProfile = null;
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsubProfile?.();
      if (!user) {
        setState({ loading: false, user: null, profile: null });
        return;
      }
      // Refresh so role/hub changes made by admins apply immediately.
      await user.getIdToken(true).catch(() => {});
      unsubProfile = onSnapshot(
        doc(db, "users", user.uid),
        async (snap) => {
          const profile = snap.exists() ? { uid: user.uid, ...snap.data() } : null;
          if (profile) {
            const claims = (await user.getIdTokenResult()).claims;
            const stale = claims.role !== profile.role || claims.stateCode !== (profile.stateCode || null) || JSON.stringify(claims.hubIds || []) !== JSON.stringify(profile.hubIds || []);
            if (stale) await user.getIdToken(true).catch(() => {});
          }
          setState({ loading: false, user, profile });
        },
        () => setState({ loading: false, user, profile: null }),
      );
    });
    return () => {
      unsub();
      unsubProfile?.();
    };
  }, []);

  const value = {
    ...state,
    logout: () => auth && signOut(auth),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export const isNationalRole = (p) => p?.role === "superadmin" || p?.role === "admin";
