import type { Timestamp } from "firebase/firestore";

export const todayBkk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
export const periodOf = (isoDate: string) => isoDate.slice(0, 7); // YYYY-MM

/** Whole days left until paidUntil (0 if never paid or already past). */
export function daysLeftTs(paidUntil: Timestamp | null): number {
  if (!paidUntil) return 0;
  return Math.max(0, Math.ceil((paidUntil.toMillis() - Date.now()) / 86_400_000));
}

export const dateTh = (t: Timestamp) =>
  t.toDate().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });

export const isoTh = (iso: string | null | undefined) =>
  iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "2-digit" }) : "—";

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthRange(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start: `${period}-01`, end };
}

/** Next due date on `dueDay` on or after `fromIso` (same month if not passed, else next month). */
export function dueDateFor(fromIso: string, dueDay: number): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const day = Math.min(Math.max(dueDay || 5, 1), 28);
  const due = d <= day ? new Date(Date.UTC(y, m - 1, day)) : new Date(Date.UTC(y, m, day));
  return due.toISOString().slice(0, 10);
}

export const monthTh = (period: string) =>
  new Date(period + "-01T00:00:00Z").toLocaleDateString("th-TH", { timeZone: "UTC", month: "long", year: "numeric" });
