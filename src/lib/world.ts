// W World — the building's "office": each staff member is one routine job (V3 lib/world.ts).
// Pure: computes who has work, the morning report and the drafts from data. Nothing here sends or writes;
// anything that touches money or reaches a tenant waits for the owner to press confirm.

import { roomState, type RoomState } from "./room-state.ts";
import { reminderDraft, renewalDraft, vacancyDraft } from "./insights.ts";

export type AgentId = "head" | "meter" | "billing" | "line" | "collect" | "repair" | "lease" | "rooms" | "accy";
export type AgentStatus = "idle" | "waiting" | "busy" | "alert";
export type Agent = { id: AgentId; name: string; role: string; status: AgentStatus; summary: string; auto: string; count: number };
export type Draft = { id: string; kind: "remind" | "vacancy" | "renew"; title: string; tag: string; text: string; roomId: string; tenantId?: string; urgent: boolean };

type Bill = { id: string; roomId: string; roomNumber: string; tenantName: string; period: string; dueDate: string; total: number; paid: number; status: string; leaseId: string | null; sentToLineAt?: string | null; items: { kind: string; amount: number }[] };
type Room = { id: string; number: string; floor: string; kind: string; status: string; condition?: string; rentMonthly: number; deposit: number };
type Lease = { id: string; roomId: string; tenantId: string; status: string; endDate: string | null };
type Tenant = { id: string; fullName: string; lineUserId: string | null };
type Maint = { id: string; roomNumber: string; problem: string; status: string; createdOn: string };
type Booking = { roomId: string; status: string; checkIn: string; checkOut: string };

export type WorldInput = {
  rooms: Room[]; bills: Bill[]; leases: Lease[]; tenants: Map<string, Tenant>; bookings: Booking[]; maintenance: Maint[];
  expenses: number; readRoomIds: Set<string>; today: string; property: { name: string; address: string; phone: string; lineId?: string };
};

const MON = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DAY = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

export function buildWorld(w: WorldInput) {
  const period = w.today.slice(0, 7);
  const active = new Map(w.leases.filter((l) => l.status === "active").map((l) => [l.roomId, l]));
  const reserved = new Set(w.leases.filter((l) => l.status === "reserved").map((l) => l.roomId));
  const st = new Map<string, RoomState<Bill>>(w.rooms.map((r) => [r.id, roomState(r, { bills: w.bills, hasLease: active.has(r.id), reserved: reserved.has(r.id), bookings: w.bookings, period, today: w.today })]));
  const rooms = (k: string) => w.rooms.filter((r) => st.get(r.id)!.key === k);
  const late = rooms("late").sort((a, b) => st.get(b.id)!.lateDays - st.get(a.id)!.lateDays);
  const todo = rooms("todo");
  const vacant = w.rooms.filter((r) => r.kind === "monthly" && st.get(r.id)!.key === "vacant");
  const unread = w.rooms.filter((r) => r.kind === "monthly" && active.has(r.id) && !w.readRoomIds.has(r.id) && st.get(r.id)!.key === "todo");
  const ending = w.leases.filter((l) => l.status === "active" && l.endDate && days(w.today, l.endDate) >= 0 && days(w.today, l.endDate) <= 60);
  const openJobs = w.maintenance.filter((m) => m.status === "open" || m.status === "in_progress");
  const oldJobs = openJobs.filter((m) => days(m.createdOn, w.today) > 3);
  const thisMonth = w.bills.filter((b) => b.period === period && b.status !== "void");
  const billed = thisMonth.reduce((s, b) => s + b.total - b.items.filter((i) => i.kind === "prev_balance").reduce((x, i) => x + i.amount, 0), 0);
  const collected = thisMonth.reduce((s, b) => s + Math.min(b.paid, b.total), 0);
  const unsent = thisMonth.filter((b) => !b.sentToLineAt && b.leaseId && b.status !== "paid" && w.tenants.get(active.get(b.roomId)?.tenantId ?? "")?.lineUserId);
  const endOfMonth = Number(w.today.slice(8, 10)) >= 24;
  const nums = (list: Room[]) => list.map((r) => r.number).join(", ");

  const agents: Agent[] = [
    { id: "meter", name: "MITER", role: "จดมิเตอร์", count: unread.length, status: unread.length ? (endOfMonth ? "busy" : "waiting") : "idle",
      summary: unread.length ? `ยังไม่จด ${unread.length} ห้อง (${nums(unread.slice(0, 4))}${unread.length > 4 ? " …" : ""})` : "จดครบแล้ว", auto: "7 วันสุดท้ายของเดือน เตือนให้จด" },
    { id: "billing", name: "BILLY", role: "ออกบิล", count: todo.length, status: todo.length ? "busy" : "idle",
      summary: todo.length ? `รอออกบิล ${todo.length} ห้อง` : "ออกบิลครบแล้ว", auto: "เตรียมบิลให้ คุณกดยืนยันเอง" },
    { id: "line", name: "LINEY", role: "ส่ง LINE", count: unsent.length, status: unsent.length ? "busy" : "idle",
      summary: unsent.length ? `ยังไม่ได้ส่ง ${unsent.length} บิล` : "ส่งครบแล้ว", auto: "ส่งบิลหลังออกบิล เตือนก่อนครบกำหนด" },
    { id: "collect", name: "CASHY", role: "ตามเงินค้าง", count: late.length, status: late.length ? "alert" : rooms("due").length ? "busy" : "idle",
      summary: late.length ? `${late[0].number} ค้าง ฿${baht(st.get(late[0].id)!.owed)} เลย ${st.get(late[0].id)!.lateDays} วัน${late.length > 1 ? ` และอีก ${late.length - 1} ห้อง` : ""}` : "ไม่มีค้างเลยกำหนด", auto: "ร่างข้อความทวงทุกเช้า คุณกดส่งเอง" },
    { id: "repair", name: "FIXY", role: "ช่างซ่อม", count: openJobs.length, status: oldJobs.length ? "alert" : openJobs.length ? "busy" : "idle",
      summary: openJobs.length ? `${openJobs[0].roomNumber ? `ห้อง ${openJobs[0].roomNumber}` : "ส่วนกลาง"} ${openJobs[0].problem}${openJobs.length > 1 ? ` และอีก ${openJobs.length - 1} งาน` : ""}` : "ไม่มีงานค้าง", auto: "งานค้างเกิน 3 วันจะเตือน" },
    { id: "lease", name: "CONTRA", role: "ดูแลสัญญา", count: ending.length, status: ending.length ? "waiting" : "idle",
      summary: ending.length ? `สัญญาจะหมด ${ending.length} ห้อง` : "ไม่มีสัญญาใกล้หมด", auto: "เตือนก่อนหมด 60 วัน พร้อมข้อความถามต่อ" },
    { id: "rooms", name: "ROOMY", role: "ห้องว่าง", count: vacant.length, status: vacant.length ? "busy" : "idle",
      summary: vacant.length ? `ว่าง ${vacant.length} ห้อง (${nums(vacant.slice(0, 4))})` : "เต็มทุกห้อง", auto: "ร่างโพสต์หาคนเช่าให้" },
    { id: "accy", name: "ACCY", role: "บัญชี", count: 0, status: "idle", summary: `เดือนนี้กำไร ฿${baht(collected - w.expenses)}`, auto: "สรุปกำไรขาดทุนทุกต้นเดือน" },
  ];
  const work = agents.filter((a) => a.status !== "idle" && a.id !== "accy").length;
  agents.unshift({ id: "head", name: "WILAI", role: "หัวหน้าออฟฟิศ", count: work, status: work ? "busy" : "idle", summary: work ? `วันนี้มี ${work} เรื่องรอคุณ` : "ทุกอย่างเรียบร้อย", auto: "สรุปเช้า 08:00 เข้า LINE" });

  const tenantOf = (roomId: string) => { const l = active.get(roomId); return l ? w.tenants.get(l.tenantId) : undefined; };
  const drafts: Draft[] = [
    ...late.map((r) => {
      const s = st.get(r.id)!, b = s.open[0];
      return { id: `remind-${r.id}`, kind: "remind" as const, title: `${r.number} ค้าง ฿${baht(s.owed)}`, tag: `เลย ${s.lateDays} วัน`, roomId: r.id, tenantId: active.get(r.id)?.tenantId, urgent: true,
        text: reminderDraft({ roomNumber: r.number, tenantName: tenantOf(r.id)?.fullName ?? b.tenantName, period: b.period, dueDate: b.dueDate, balance: s.owed }, s.lateDays, w.property).text };
    }),
    ...vacant.slice(0, 3).map((r) => ({ id: `vacancy-${r.id}`, kind: "vacancy" as const, title: `ห้อง ${r.number} ว่าง`, tag: "โพสต์หาคนเช่า", roomId: r.id, urgent: false, text: vacancyDraft(r, w.property) })),
    ...ending.map((l) => {
      const r = w.rooms.find((x) => x.id === l.roomId);
      return { id: `renew-${l.id}`, kind: "renew" as const, title: `สัญญาห้อง ${r?.number ?? ""} ใกล้หมด`, tag: `อีก ${days(w.today, l.endDate!)} วัน`, roomId: l.roomId, tenantId: l.tenantId, urgent: false,
        text: renewalDraft({ roomNumber: r?.number ?? "", tenantName: w.tenants.get(l.tenantId)?.fullName ?? "", endDate: l.endDate! }) };
    }),
  ];

  // The morning report W reads out (and sends to the owner's LINE at 08:00)
  const [y, m, d] = w.today.split("-").map(Number);
  const dow = DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const brief = [
    `อรุณสวัสดิ์ครับ วัน${dow}ที่ ${d} ${MON[m - 1]}`,
    billed > 0 ? `สถานะการเงิน เก็บแล้ว ${baht(collected)} บาท จาก ${baht(billed)} บาท คิดเป็น ${Math.round((collected / billed) * 100)} เปอร์เซ็นต์` : "เดือนนี้ยังไม่ได้ออกบิลครับ",
    ...(late.length ? [`มี${late.length > 1 ? ` ${late.length} ห้อง` : "หนึ่งเรื่อง"}ที่ต้องรีบ ห้อง ${late[0].number} ค้าง ${baht(st.get(late[0].id)!.owed)} บาท เลยกำหนดมา ${st.get(late[0].id)!.lateDays} วัน ผมร่างข้อความทวงไว้ให้แล้วครับ`] : []),
    ...(todo.length ? [`ยังไม่ได้ออกบิล ${todo.length} ห้อง คือ ${nums(todo.slice(0, 5))}`] : []),
    ...(vacant.length ? [`ห้องว่าง ${vacant.length} ห้อง คือ ${nums(vacant.slice(0, 5))} โพสต์หาคนเช่าพร้อมแล้ว`] : []),
    ...(openJobs.length ? [`งานซ่อมค้าง ${openJobs.length} งาน`] : []),
    ...(ending.length ? [`สัญญาใกล้หมด ${ending.length} ห้อง`] : []),
    work ? "ระบบทั้งหมดพร้อมทำงานครับ" : "วันนี้ไม่มีเรื่องค้าง ขอให้เป็นวันที่ดีครับ",
  ];
  return { agents, drafts, brief, work, late, todo, vacant, collected, billed, st };
}

// ───────────── Voice commands: fixed phrases (free, works offline). Money and messages always ask to confirm. ─────────────

export type Intent =
  | { kind: "owed" } | { kind: "profit" } | { kind: "vacant" }
  | { kind: "pay"; room: string; amount?: number; method: "transfer" | "cash" }
  | { kind: "bill"; room: string } | { kind: "remind"; room: string } | { kind: "repair"; room: string | null; problem: string }
  | { kind: "brief" } | { kind: "unknown"; text: string };

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const norm = (s: string) => s.replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c))).replace(/(\d),(\d)/g, "$1$2").replace(/\s+/g, " ").trim();

export function parseCommand(raw: string): Intent {
  const t = norm(raw);
  const room = t.match(/ห้อง\s*(\d{2,4})/)?.[1];
  if (/สรุป|รายงาน|วันนี้มีอะไร/.test(t)) return { kind: "brief" };
  if (/(ห้องไหน|ใคร).*(ค้าง|ยังไม่จ่าย)|ค้างกี่ห้อง|ยอดค้าง/.test(t) && !room) return { kind: "owed" };
  if (/กำไร|รายได้/.test(t)) return { kind: "profit" };
  if (/ห้องว่าง/.test(t) && !room) return { kind: "vacant" };
  if (/รับเงิน|จ่ายแล้ว|โอนแล้ว|ได้รับ/.test(t) && room) {
    const rest = t.slice(t.indexOf(room) + room.length);
    const amt = rest.match(/(\d[\d.]*)/)?.[1];
    return { kind: "pay", room, amount: amt ? Number(amt) : undefined, method: /เงินสด|สด/.test(t) ? "cash" : "transfer" };
  }
  if (/ออกบิล/.test(t) && room) return { kind: "bill", room };
  if (/ทวง|เตือน/.test(t) && room) return { kind: "remind", room };
  if (/ซ่อม|เสีย|พัง|รั่ว|ไม่เย็น|ตัน/.test(t)) {
    const problem = t.replace(/แจ้งซ่อม|ห้อง\s*\d+/g, "").trim() || "แจ้งซ่อม";
    return { kind: "repair", room: room ?? null, problem };
  }
  return { kind: "unknown", text: raw };
}
