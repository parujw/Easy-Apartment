// Same formatting as Wilai Communities V3 (src/lib/format.ts) so printed documents match.

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

export const baht = (amount: number) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** "202609" → "ก.ย. 69" / "กันยายน 2569" */
export function cycleLabel(cycle: string, style: "short" | "full" = "short"): string {
  const year = Number(cycle.slice(0, 4)) + 543;
  const month = Number(cycle.slice(4, 6)) - 1;
  if (Number.isNaN(month) || month < 0 || month > 11) return cycle;
  return style === "full" ? `${MONTHS_FULL[month]} ${year}` : `${MONTHS_SHORT[month]} ${String(year).slice(2)}`;
}

/** "2026-09-12" → "12 ก.ย. 2569" */
export function thaiDate(iso: string | null | undefined, style: "short" | "full" = "short"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${style === "full" ? MONTHS_FULL[m - 1] : MONTHS_SHORT[m - 1]} ${y + 543}`;
}

/** "+66625055446" → "0625055446" for print */
export const localPhone = (p: string | undefined) => (p ?? "").replace(/^\+66/, "0");

export const cycleOf = (isoDate: string) => isoDate.slice(0, 7).replace("-", "");

export const BILL_STATUS_LABEL: Record<string, string> = {
  unpaid: "ค้างชำระ", partial: "ชำระบางส่วน", paid: "ชำระแล้ว", void: "ยกเลิก", carried: "ยกยอดแล้ว",
};

/** Whole days past the due date (0 when not yet due). */
export function daysOverdue(dueDate: string, today = new Date()): number {
  const ms = today.getTime() - new Date(`${dueDate}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export type ReminderTone = "gentle" | "firm" | "formal";
export const reminderTone = (days: number): ReminderTone => (days <= 7 ? "gentle" : days <= 30 ? "firm" : "formal");

/** Split into fixed-size pages so every A4 sheet has the same cut lines. */
export function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** Day `day` of the cycle month, clamped to the month's last day. */
export function slipDueDate(cycle: string, day: number): string | null {
  if (!/^\d{6}$/.test(cycle) || !Number.isInteger(day) || day < 1) return null;
  const y = Number(cycle.slice(0, 4)), m = Number(cycle.slice(4, 6));
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
