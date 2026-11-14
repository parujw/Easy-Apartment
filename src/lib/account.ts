import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { toE164 } from "@/lib/phone";

// Firebase has no "phone + password" sign-in, so the phone number becomes a login e-mail.
// SMS OTP verification can be linked to the same account later.
export const loginEmail = (phone: string) => `${toE164(phone).slice(1)}@phone.easy-apartment.app`;

export async function signIn(phone: string, password: string) {
  await signInWithEmailAndPassword(auth(), loginEmail(phone), password);
}

export async function signUp(input: { first: string; last: string; phone: string; password: string; property: string }) {
  const cred = await createUserWithEmailAndPassword(auth(), loginEmail(input.phone), input.password);
  const uid = cred.user.uid;
  const property = doc(collection(db(), "properties"));
  const batch = writeBatch(db());
  batch.set(property, {
    name: input.property.trim() || "หอพักของฉัน",
    phone: toE164(input.phone), address: "", promptpayId: "", accountName: "", docPrefix: "EA",
    plan: "pro", paidUntil: null, introUsed: false,
    ownerUid: uid, members: { [uid]: "owner" }, createdAt: serverTimestamp(),
  });
  batch.set(doc(db(), "users", uid), {
    firstName: input.first.trim(), lastName: input.last.trim(), phone: toE164(input.phone),
    propertyId: property.id, createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export function authError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/email-already-in-use") return "เบอร์นี้สมัครไว้แล้ว กรุณาเข้าสู่ระบบ";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
    return "เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง";
  if (code === "auth/weak-password") return "รหัสผ่านอย่างน้อย 8 ตัวอักษร";
  if (code === "auth/too-many-requests") return "ลองหลายครั้งเกินไป กรุณารอสักครู่";
  return e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
}
