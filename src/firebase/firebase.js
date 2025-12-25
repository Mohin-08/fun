import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

/* ===============================
   FIREBASE CONFIG (PRODUCTION SAFE)
   - NO localhost fallbacks
   - Emulator only via explicit connection
=============================== */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

/* ===============================
   AUTH
=============================== */
export const auth = getAuth(app);

/* ===============================
   REALTIME DATABASE
=============================== */
export const rtdb = getDatabase(app);

/* ===============================
   CLOUD FUNCTIONS (europe-west1 region)
=============================== */
export const functions = getFunctions(app, "europe-west1");

/* ===============================
   ALL SERVICES USE PRODUCTION FIREBASE
   No emulators connected
=============================== */
