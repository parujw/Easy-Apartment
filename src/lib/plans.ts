// Pricing from the requirement doc. Prepaid only: each top-up adds days.

export type PlanId = "starter" | "pro" | "business";
export type Term = "intro" | "month" | "year";

export const PLANS: Record<PlanId, {
  name: string; maxRooms: number; dailyRooms: boolean; lineQuota: number; month: number; year: number;
}> = {
  starter:  { name: "Starter",  maxRooms: 20,  dailyRooms: false, lineQuota: 300,  month: 690,  year: 7_590 },
  pro:      { name: "Pro",      maxRooms: 100, dailyRooms: true,  lineQuota: 2000, month: 890,  year: 9_790 },
  business: { name: "Business", maxRooms: 500, dailyRooms: true,  lineQuota: 8000, month: 1990, year: 21_890 },
};

export const INTRO_PRICE = 100; // first 30 days of Pro, once per account
export const GRACE_DAYS = 3;

export function quote(plan: PlanId, term: Term, introUsed: boolean): { plan: PlanId; days: number; amount: number } {
  if (term === "intro") {
    if (introUsed) throw new Error("ใช้สิทธิ์เดือนแรก 100 บาทไปแล้ว");
    return { plan: "pro", days: 30, amount: INTRO_PRICE };
  }
  const p = PLANS[plan];
  return term === "year" ? { plan, days: 365, amount: p.year } : { plan, days: 30, amount: p.month };
}

/** New expiry: paying early extends from the current expiry, otherwise from today. */
export function extend(paidUntil: string | null, today: string, days: number): string {
  const base = paidUntil && paidUntil > today ? paidUntil : today;
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Smallest plan that fits the property; daily/Airbnb rooms need Pro or above. */
export function suggestPlan(rooms: number, hasDailyRooms: boolean): PlanId {
  if (rooms <= PLANS.starter.maxRooms && !hasDailyRooms) return "starter";
  if (rooms <= PLANS.pro.maxRooms) return "pro";
  return "business";
}

export function daysLeft(paidUntil: string | null, today: string): number {
  if (!paidUntil) return 0;
  return Math.round((Date.parse(paidUntil) - Date.parse(today)) / 86_400_000);
}
