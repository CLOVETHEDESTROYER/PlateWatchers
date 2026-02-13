
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, FacebookAuthProvider, GoogleAuthProvider } from "firebase/auth";

// REPLACE THESE WITH YOUR ACTUAL FIREBASE PROJECT CONFIG FROM THE FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const isConfigured =
  !!firebaseConfig.projectId &&
  firebaseConfig.projectId !== "your-app" &&
  !String(firebaseConfig.projectId).includes("undefined");

let db: any = null;
let auth: any = null;

if (isConfigured) {
  try {

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    // Connect to the named database "platewatchers"
    db = getFirestore(app, "platewatchers");
    auth = getAuth(app);

  } catch (e) {
    console.error("Firebase initialization failed:", e);
    console.warn("Falling back to local mode.");
  }
}

const facebookProvider = new FacebookAuthProvider();
const googleProvider = new GoogleAuthProvider();

export { db, auth, facebookProvider, googleProvider, isConfigured };
