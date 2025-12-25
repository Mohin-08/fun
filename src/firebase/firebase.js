import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getDatabase,
  connectDatabaseEmulator,
} from "firebase/database";
import {
  getFunctions,
  connectFunctionsEmulator,
} from "firebase/functions";

// Firebase configuration - uses environment variables in production
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "fake-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "localhost",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ai-complaint-analyzer-d0bc1",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 
    "http://127.0.0.1:9000?ns=ai-complaint-analyzer-d0bc1-default-rtdb",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

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
   CLOUD FUNCTIONS
=============================== */
export const functions = getFunctions(app);

/* ===============================
   EMULATOR CONNECTIONS (LOCAL DEV ONLY)
=============================== */
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectDatabaseEmulator(rtdb, "localhost", 9000);
  connectFunctionsEmulator(functions, "localhost", 5001);
  console.log("🔧 Firebase Emulators connected (dev mode)");
}
