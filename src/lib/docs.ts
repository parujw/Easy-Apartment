import { doc, runTransaction, writeBatch, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

const yyyymm = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7).replace("-", "");

/** Race-free running number, e.g. BILL-202611-0001 (rules only allow +1 steps). */
export async function nextDocNo(pid: string, name: string, prefix: string): Promise<string> {
  const period = yyyymm();
  const ref = doc(db(), "properties", pid, "counters", `${name}_${period}`);
  const value = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? (snap.data().value as number) + 1 : 1;
    tx.set(ref, { value: next });
    return next;
  });
  return `${prefix}-${period}-${String(value).padStart(4, "0")}`;
}

/** Every night from check-in up to (not including) check-out. */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const d = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  while (d < end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Creates the booking and claims each night; fails as a whole if any night is taken. */
export async function createBooking(pid: string, b: {
  roomId: string; guestName: string; guestPhone?: string; checkIn: string; checkOut: string;
  nightlyRate: number; source?: "direct" | "airbnb" | "other";
}) {
  const nights = nightsBetween(b.checkIn, b.checkOut);
  if (!nights.length) throw new Error("วันเช็คเอาท์ต้องหลังวันเช็คอิน");
  const ref = doc(collection(db(), "properties", pid, "bookings"));
  const batch = writeBatch(db());
  batch.set(ref, { ...b, guestPhone: b.guestPhone ?? "", source: b.source ?? "direct", status: "confirmed" });
  for (const n of nights) batch.set(doc(db(), "properties", pid, "roomNights", `${b.roomId}_${n}`), { bookingId: ref.id });
  try {
    await batch.commit();
  } catch {
    throw new Error("ห้องนี้มีการจองในช่วงวันที่เลือกแล้ว");
  }
  return ref.id;
}
