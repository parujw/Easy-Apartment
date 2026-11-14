import type { Timestamp } from "firebase/firestore";

export const todayBkk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

/** Whole days left until paidUntil (0 if never paid or already past). */
export function daysLeftTs(paidUntil: Timestamp | null): number {
  if (!paidUntil) return 0;
  return Math.max(0, Math.ceil((paidUntil.toMillis() - Date.now()) / 86_400_000));
}

export const dateTh = (t: Timestamp) =>
  t.toDate().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });
