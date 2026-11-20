import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInAnonymously, 
  updateProfile,
  signOut, 
  onAuthStateChanged
} from "firebase/auth";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  onValue, 
  runTransaction,
  push, 
  remove, 
  update, 
  serverTimestamp,
  onDisconnect 
} from "firebase/database";

// Load configuration from env or localStorage (ENV always takes priority)
export const getStoredFirebaseConfig = () => {
  const envApiKey = (import.meta.env.VITE_FIREBASE_API_KEY || "").trim();
  const envDbUrl = (import.meta.env.VITE_FIREBASE_DATABASE_URL || "").trim().replace(/\/+$/, "");

  if (envApiKey && envDbUrl) {
    return {
      apiKey: envApiKey,
      authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
      databaseURL: envDbUrl,
      projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
      storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
      messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
      appId: (import.meta.env.VITE_FIREBASE_APP_ID || "").trim()
    };
  }

  const local = localStorage.getItem("firebase_config");
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (parsed.apiKey && parsed.databaseURL) {
        return parsed;
      }
    } catch (e) {
      console.error("Failed to parse stored firebase config", e);
    }
  }

  return {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };
};

export const saveFirebaseConfig = (config) => {
  localStorage.setItem("firebase_config", JSON.stringify(config));
  window.location.reload();
};

const config = getStoredFirebaseConfig();

// Check if config is present
export const isFirebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.databaseURL
);

let app = null;
let auth = null;
let rtdb = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(config) : getApp();
    auth = getAuth(app);
    rtdb = getDatabase(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  } catch (error) {
    console.error("Firebase init error:", error);
  }
}

// Track server time offset via RTDB .info/serverTimeOffset
let serverTimeOffset = 0;
let offsetListeners = [];

export const getServerTimeOffset = () => serverTimeOffset;
export const getServerTime = () => Date.now() + serverTimeOffset;

if (rtdb) {
  const offsetRef = ref(rtdb, ".info/serverTimeOffset");
  onValue(offsetRef, (snap) => {
    serverTimeOffset = snap.val() || 0;
    offsetListeners.forEach((fn) => fn(serverTimeOffset));
  });
}

export const subscribeServerTimeOffset = (callback) => {
  offsetListeners.push(callback);
  callback(serverTimeOffset);
  return () => {
    offsetListeners = offsetListeners.filter((fn) => fn !== callback);
  };
};

export {
  app,
  auth,
  rtdb,
  googleProvider,
  signInWithPopup,
  signInAnonymously,
  updateProfile,
  signOut,
  onAuthStateChanged,
  ref,
  set,
  get,
  onValue,
  runTransaction,
  push,
  remove,
  update,
  serverTimestamp,
  onDisconnect
};
