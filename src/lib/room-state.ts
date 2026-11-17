// One answer to "what's going on in this room?" — used by the home grid, the room picker and the room sheet,
// so a room never shows two different states on two screens. Pure: unit tested.

export type StateKey = "paid" | "due" | "late" | "todo" | "vacant" | "reserved" | "staying" | "booked" | "cleaning" | "repair";

type B = { id: string; roomId: string; period: string; dueDate: string; total: number; paid: number; status: string; leaseId: string | null };
type R = { id: string; kind: string; status: string; condition?: string };
type K = { roomId: string; status: string; checkIn: string; checkOut: string };

export type RoomState<TB extends B = B> = { key: StateKey; label: string; open: TB[]; owed: number; lateDays: number; current?: TB };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export function roomState<TB extends B>(room: R, ctx: { bills: TB[]; hasLease: boolean; reserved: boolean; bookings: K[]; period: string; today: string }): RoomState<TB> {
  const mine = ctx.bills.filter((b) => b.roomId === room.id && b.status !== "void");
  const open = mine.filter((b) => (b.status === "unpaid" || b.status === "partial") && b.total - b.paid > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const owed = Math.round(open.reduce((s, b) => s + b.total - b.paid, 0) * 100) / 100;
  const lateDays = open.length && open[0].dueDate < ctx.today ? daysBetween(open[0].dueDate, ctx.today) : 0;
  const current = mine.find((b) => b.period === ctx.period && !!b.leaseId) ?? open[open.length - 1];
  const base = { open, owed, lateDays, current };
  if (lateDays > 0) return { ...base, key: "late", label: `เลย ${lateDays} วัน` };

  if (room.kind !== "monthly") {
    if (open.length) return { ...base, key: "due", label: "รอจ่าย" };
    if (ctx.bookings.some((k) => k.roomId === room.id && k.status === "checked_in")) return { ...base, key: "staying", label: "เข้าพักอยู่" };
    if (room.condition === "cleaning" || room.status === "cleaning") return { ...base, key: "cleaning", label: "ทำความสะอาด" };
    if (room.condition === "repair" || room.status === "maintenance") return { ...base, key: "repair", label: "กำลังซ่อม" };
    if (ctx.bookings.some((k) => k.roomId === room.id && k.status === "confirmed" && k.checkOut > ctx.today)) return { ...base, key: "booked", label: "มีจอง" };
    return { ...base, key: "vacant", label: "ว่าง" };
  }
  if (!ctx.hasLease) return ctx.reserved ? { ...base, key: "reserved", label: "จองแล้ว" } : { ...base, key: "vacant", label: "ว่าง" };
  if (open.length) return { ...base, key: "due", label: "รอจ่าย" };
  if (mine.some((b) => b.period === ctx.period && b.leaseId)) return { ...base, key: "paid", label: "จ่ายแล้ว" };
  return { ...base, key: "todo", label: "ยังไม่ออกบิล" };
}

/** Latest meter reading from an earlier billing period, and the one already saved for this period. */
export function readingsFor<T extends { roomId: string; readOn: string; period?: string }>(readings: T[], roomId: string, period: string) {
  let prev: T | undefined, saved: T | undefined;
  for (const r of [...readings].filter((x) => x.roomId === roomId).sort((a, b) => a.readOn.localeCompare(b.readOn))) {
    const p = r.period ?? r.readOn.slice(0, 7);
    if (p < period) prev = r; else if (p === period) saved = r;
  }
  return { prev, saved };
}
