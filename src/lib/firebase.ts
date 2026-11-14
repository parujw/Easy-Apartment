import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Web app config of the "easy-apartment" Firebase project. These values are public by design:
// data is protected by firestore.rules, not by hiding this config. NEXT_PUBLIC_FIREBASE_* overrides
// them (e.g. the local emulator setup in .env.local).
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCcZZhFDpOAHSuKKGL7y1BZ6cQOs4-2K4U",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "easy-apartment.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "easy-apartment",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "easy-apartment.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "82421922649",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:82421922649:web:55fe905fdeaf1cae082a48",
};

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "1"; // local development only

export const app = () => {
  if (getApps().length) return getApp();
  const a = initializeApp(config);
  if (useEmulators) {
    connectAuthEmulator(getAuth(a), "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(a), "127.0.0.1", 8080);
  }
  return a;
};
export const auth = () => getAuth(app());
export const db = () => getFirestore(app());
