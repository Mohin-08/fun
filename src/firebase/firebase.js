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

const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "localhost",
  projectId: "ai-complaint-analyzer-d0bc1",

  // 🔥 THIS IS THE KEY LINE (MATCHES EMULATOR UI)
  databaseURL:
    "http://127.0.0.1:9000?ns=ai-complaint-analyzer-d0bc1-default-rtdb",
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
   EMULATOR CONNECTIONS (LOCAL)
=============================== */
if (location.hostname === "localhost") {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectDatabaseEmulator(rtdb, "localhost", 9000);
  connectFunctionsEmulator(functions, "localhost", 5001);
}
