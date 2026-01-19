
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// REPLACE THESE WITH YOUR ACTUAL FIREBASE PROJECT CONFIG FROM THE FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const isConfigured = firebaseConfig.projectId !== "your-app" && firebaseConfig.apiKey !== "YOUR_API_KEY";

let db: any = null;

if (isConfigured) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
  } catch (e) {
    console.warn("Firebase initialization failed. Falling back to local mode.", e);
  }
}

export { db, isConfigured };
