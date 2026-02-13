
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, FacebookAuthProvider, GoogleAuthProvider } from "firebase/auth";

// Use the app's own domain as authDomain in production to avoid cross-origin
// storage partitioning issues (Android Chrome, iOS Safari).
// The Vercel rewrite in vercel.json proxies /__/auth/* to firebaseapp.com.
const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: isLocalhost
    ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN  // localhost: use firebaseapp.com directly
    : window.location.hostname,                    // production: use own domain (proxied)
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
