import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Web app config from Firebase console → Project settings → Your apps (these values are public by design).
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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
