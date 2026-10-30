import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "./firebase.js";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, profile: null, error: null });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setState((s) => ({ loading: false, user: null, profile: null, error: null, refused: s.refused }));
      setState((s) => ({ ...s, loading: true }));
      try {
        const r = await api.me();
        if (!r.member) {
          await signOut(auth);
          return setState({ loading: false, user: null, profile: null, error: null, refused: r.email });
        }
        await user.getIdToken(true); // pick up access granted by the server
        setState({ loading: false, user, profile: r.profile, error: null });
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
        // Popups can be blocked, or fail in browsers that block cross-site storage; a full-page redirect works there.
        if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/network-request-failed", "auth/web-storage-unsupported"].includes(e.code)) await signInWithRedirect(auth, provider);
        else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e;
      }
    },
    signOut: () => signOut(auth),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
