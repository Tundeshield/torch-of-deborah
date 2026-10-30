import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web config is public by design (security comes from Auth + Firestore rules).
// Environment variables override these defaults if set in Netlify.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDBABOIgJgzicMBLUTtiHHuNrxSD-d0VcM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "torch-of-deborah.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "torch-of-deborah",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:537064942285:web:629e95a83694db5d7d1784",
  storageBucket: "torch-of-deborah.firebasestorage.app",
  messagingSenderId: "537064942285",
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
