// Pure calculations for the owner's overview, alerts, analysis and message drafts (V3: alerts.ts,
// revenue-mix.ts, forecast.ts, accounting.ts, drafts.ts). No database access — unit tested.

import { addDays } from "./dates.ts";
import { daysOverdue, reminderTone, cycleLabel, cycleOf, type ReminderTone } from "./thai-format.ts";

type B = { id: string; roomId: string; roomNumber: string; tenantName: string; period: string; dueDate: string;
  items: { kind: string; amount: number; qty: number }[]; total: number; paid: number; status: string };
type L = { id: string; roomId: string; tenantId: string; status: string; endDate: string | null; rent: number; acFee: number; internet: number; parking: number };
type R = { id: string; number: string; kind: string; status: string; rentMonthly: number };
type M = { id: string; roomNumber: string; problem: string; status: string; createdOn: string };

const open = (b: B) => (b.status === "unpaid" || b.status === "partial") && b.total - b.paid > 0;
const bal = (b: B) => Math.round((b.total - b.paid) * 100) / 100;
const NOT_REVENUE = new Set(["prev_balance"]);

/** Share of each period's bills that has been collected (carried balances count as not collected). */
export function collectionByPeriod(bills: B[], periods: string[]) {
  return periods.map((period) => {
    const list = bills.filter((b) => b.period === period && b.status !== "void");
    const billed = list.reduce((s, b) => s + b.items.filter((i) => !NOT_REVENUE.has(i.kind)).reduce((x, i) => x + i.amount, 0), 0);
    const collected = list.reduce((s, b) => s + Math.min(b.paid, b.total), 0);
    return { period, billed, collected, rate: billed > 0 ? Math.min(1, collected / billed) : 0 };
  });
}

export type AgingBucket = "not_due" | "1-30" | "31-60" | "60+";
export function aging(bills: B[], today = new Date()) {
  const out: Record<AgingBucket, number> = { not_due: 0, "1-30": 0, "31-60": 0, "60+": 0 };
  for (const b of bills.filter(open)) {
    const d = daysOverdue(b.dueDate, today);
    out[d <= 0 ? "not_due" : d <= 30 ? "1-30" : d <= 60 ? "31-60" : "60+"] += bal(b);
  }
  return out;
}

/** Billed amount by item kind (carried-over debt is not new revenue; deposits shown separately). */
export function revenueMix(bills: B[], periods: string[]) {
  const mix = new Map<string, number>();
  for (const b of bills.filter((x) => periods.includes(x.period) && x.status !== "void")) {
    for (const i of b.items) if (!NOT_REVENUE.has(i.kind)) mix.set(i.kind, (mix.get(i.kind) ?? 0) + i.amount);
  }
  return [...mix.entries()].map(([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount);
}

/** Recurring monthly income from running leases (rent + fixed services; electricity/water pass through). */
export function forecast(leases: L[], rooms: R[], years = 5) {
  const active = leases.filter((l) => l.status === "active");
  const monthly = active.reduce((s, l) => s + l.rent + l.acFee + l.internet + l.parking, 0);
  const occupied = new Set(active.map((l) => l.roomId));
  const vacantRent = rooms.filter((r) => r.kind === "monthly" && !occupied.has(r.id)).reduce((s, r) => s + r.rentMonthly, 0);
  return {
    monthly, vacantRent, leases: active.length,
    rows: Array.from({ length: years }, (_, i) => ({ year: i + 1, current: monthly * 12 * (i + 1), full: (monthly + vacantRent) * 12 * (i + 1) })),
  };
}

/** Electricity/water billed vs what the owner pays the utility for the same units. */
export function utilityMargin(bills: B[], period: string, elecCost: number, waterCost: number) {
  let elecUnits = 0, elecBilled = 0, waterUnits = 0, waterBilled = 0;
  for (const b of bills.filter((x) => x.period === period && x.status !== "void")) for (const i of b.items) {
    if (i.kind === "elec") { elecUnits += i.qty; elecBilled += i.amount; }
    if (i.kind === "water") { waterUnits += i.qty; waterBilled += i.amount; }
  }
  return { elecUnits, elecBilled, elecCost: elecUnits * elecCost, waterUnits, waterBilled, waterCost: waterUnits * waterCost };
}

export type Alert = { key: string; level: "urgent" | "warn" | "info"; title: string; detail: string; roomId?: string };
/** Only things the owner can act on now, most urgent first (V3 alerts.ts rule). */
export function buildAlerts(input: { bills: B[]; leases: L[]; rooms: R[]; maintenance: M[]; today: string; billedThisPeriod: number; monthlyLeases: number; daysLeft: number | null }): Alert[] {
  const now = new Date(`${input.today}T12:00:00`);
  const out: Alert[] = [];
  const byRoom = new Map<string, { roomNumber: string; amount: number; days: number; roomId: string }>();
  for (const b of input.bills.filter(open)) {
    const d = daysOverdue(b.dueDate, now);
    if (d <= 0) continue;
    const cur = byRoom.get(b.roomId) ?? { roomNumber: b.roomNumber, amount: 0, days: 0, roomId: b.roomId };
    cur.amount += bal(b); cur.days = Math.max(cur.days, d);
    byRoom.set(b.roomId, cur);
  }
  for (const r of [...byRoom.values()].sort((a, b) => b.days - a.days))
    out.push({ key: `due-${r.roomId}`, level: r.days > 30 ? "urgent" : "warn", title: `ห้อง ${r.roomNumber} ค้าง ${r.amount.toLocaleString("th-TH")} บาท`, detail: `เกินกำหนดมา ${r.days} วัน`, roomId: r.roomId });
  const soon = addDays(input.today, 30);
  for (const l of input.leases.filter((x) => x.status === "active" && x.endDate && x.endDate <= soon)) {
    const room = input.rooms.find((r) => r.id === l.roomId);
    out.push({ key: `lease-${l.id}`, level: l.endDate! < input.today ? "urgent" : "warn", title: `สัญญาห้อง ${room?.number ?? ""} ${l.endDate! < input.today ? "หมดแล้ว" : "จะหมด"} ${l.endDate}`, detail: "ต่อสัญญาหรือเตรียมห้องว่าง", roomId: l.roomId });
  }
  for (const m of input.maintenance.filter((x) => (x.status === "open" || x.status === "in_progress") && x.createdOn <= addDays(input.today, -7)))
    out.push({ key: `maint-${m.id}`, level: "warn", title: `งานซ่อมห้อง ${m.roomNumber} ค้างเกิน 7 วัน`, detail: m.problem });
  const day = Number(input.today.slice(8, 10));
  if (day >= 25 && input.billedThisPeriod < input.monthlyLeases)
    out.push({ key: "billing", level: "warn", title: `ยังไม่ได้ออกบิล ${input.monthlyLeases - input.billedThisPeriod} ห้องของรอบนี้`, detail: "ไปที่แท็บ “ออกบิล”" });
  const vacant = input.rooms.filter((r) => r.status === "vacant").length;
  if (vacant) out.push({ key: "vacant", level: "info", title: `ห้องว่าง ${vacant} ห้อง`, detail: "มีข้อความประกาศหาผู้เช่าให้คัดลอก" });
  if (input.daysLeft !== null && input.daysLeft <= 7) out.push({ key: "plan", level: "urgent", title: `แพ็กเกจเหลือ ${input.daysLeft} วัน`, detail: "ต่ออายุเพื่อให้ออกบิลได้ต่อ" });
  const rank = { urgent: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Polite → firm → formal reminder text, ready to copy into LINE/SMS (V3 drafts.ts). */
export function reminderDraft(b: { roomNumber: string; tenantName: string; period: string; dueDate: string; balance: number }, days: number, prop: { name: string; payNote?: string }): { tone: ReminderTone; text: string } {
  const tone = reminderTone(days);
  const who = b.tenantName ? `คุณ${b.tenantName.replace(/^คุณ\s*/, "")}` : "ผู้เช่า";
  const what = `ค่าเช่าห้อง ${b.roomNumber} รอบ ${cycleLabel(b.period.replace("-", ""), "full")} ยอด ${b.balance.toLocaleString("th-TH")} บาท`;
  const text = tone === "gentle"
    ? `สวัสดีค่ะ ${who} ขอแจ้งเตือน${what} ครบกำหนดแล้ว ถ้าโอนแล้วรบกวนส่งสลิปให้ด้วยนะคะ ขอบคุณค่ะ — ${prop.name}`
    : tone === "firm"
      ? `เรียน ${who} ${what} เลยกำหนดชำระมา ${days} วันแล้ว กรุณาชำระภายใน 3 วัน หรือแจ้งวันที่จะชำระกลับมาค่ะ — ${prop.name}`
      : `เรียน ${who} ${what} ค้างชำระเกิน ${days} วัน ขอให้ติดต่อผู้ดูแลเพื่อชำระหรือตกลงแผนการชำระภายใน 7 วัน มิฉะนั้นทางหอพักจำเป็นต้องดำเนินการตามสัญญาเช่า — ${prop.name}`;
  return { tone, text };
}

/** Vacancy post for Facebook/Marketplace — only facts the system knows (V3 rule: never invent amenities). */
export function vacancyDraft(room: { number: string; floor: string; rentMonthly: number; deposit: number }, prop: { name: string; address: string; phone: string; lineId?: string }) {
  return [
    `ห้องว่างพร้อมเข้าอยู่ — ${prop.name}`,
    `ห้อง ${room.number} ชั้น ${room.floor}`,
    room.rentMonthly ? `ค่าเช่า ${room.rentMonthly.toLocaleString("th-TH")} บาท/เดือน` : "",
    room.deposit ? `เงินประกัน ${room.deposit.toLocaleString("th-TH")} บาท` : "",
    prop.address ? `ที่ตั้ง: ${prop.address}` : "",
    `สนใจติดต่อ ${prop.phone.replace(/^\+66/, "0")}${prop.lineId ? ` · LINE ${prop.lineId}` : ""}`,
  ].filter(Boolean).join("\n");
}

export const periodsBack = (period: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const [y, m] = period.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
export { cycleOf };
