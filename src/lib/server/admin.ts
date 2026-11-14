// firebase-admin for server routes only. Credentials come from the FIREBASE_SERVICE_ACCOUNT env var
// (the service-account JSON, set as a sensitive variable in Vercel) — never from a file in the repo.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function app(): App {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}
export const adminDb = () => getFirestore(app());
export const adminAuth = () => getAuth(app());

/** The signed-in user (Firebase ID token in Authorization: Bearer) and their role in a property. */
export async function memberRole(req: Request, propertyId: string): Promise<{ uid: string; role: string } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { uid } = await adminAuth().verifyIdToken(token).catch(() => ({ uid: "" }));
  if (!uid) return null;
  const p = await adminDb().doc(`properties/${propertyId}`).get();
  const role = (p.data()?.members as Record<string, string> | undefined)?.[uid];
  return role ? { uid, role } : null;
}

/** Subscription still active (paid until + 3 days grace) — same rule as firestore.rules. */
export function activeProperty(data: FirebaseFirestore.DocumentData | undefined): boolean {
  const until = data?.paidUntil?.toMillis?.() as number | undefined;
  return !!until && until + 3 * 864e5 > Date.now();
}
