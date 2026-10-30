import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "./firebase.js";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, profile: null, error: null });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setState({ loading: false, user: null, profile: null, error: null });
      setState((s) => ({ ...s, loading: true }));
      try {
        const r = await api.me();
        if (r.member) await user.getIdToken(true); // pick up access granted by the server
        setState({ loading: false, user, profile: r.member ? r.profile : null, error: null });
      } catch (error) {
        setState({ loading: false, user, profile: null, error });
      }
    });
  }, []);

  const value = {
    ...state,
    signIn: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, provider);
        else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e;
      }
    },
    signOut: () => signOut(auth),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
