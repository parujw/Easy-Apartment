// All writes the app makes. Firestore rules enforce membership/roles, the active subscription,
// +1-only counters and one document per booked night. Every change also appends an audit log entry.
import {
  arrayUnion, collection, deleteField, doc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type DocumentReference, type Transaction, type WriteBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { total as sumItems, type BillItem } from "@/lib/billing";
import { todayBkk } from "@/lib/dates";
import { CONDITION_TH, type Bill, type Booking, type Expense, type Lease, type Maintenance, type Payment, type Room, type RoomCondition, type Tenant } from "@/lib/model";
import type { Property } from "@/components/property-provider";

const col = (pid: string, name: string) => collection(db(), "properties", pid, name);
const ref = (pid: string, name: string, id: string) => doc(db(), "properties", pid, name, id);
const yyyymm = () => todayBkk().slice(0, 7).replace("-", "");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Append an audit entry to the same batch/transaction as the change itself (append-only by rules). */
function audit(w: WriteBatch | Transaction, pid: string, action: string, targetType: string, targetId: string, summary: string) {
  const user = auth().currentUser;
  (w as WriteBatch).set(doc(col(pid, "auditLogs")), {
    action, targetType, targetId, summary, actorUid: user?.uid ?? "", actorName: user?.displayName ?? "", at: serverTimestamp(),
  });
}

/** Race-free running number, e.g. BILL-202611-0001 (rules only allow +1 steps). */
export async function nextDocNo(pid: string, name: string, prefix: string): Promise<string> {
  const period = yyyymm();
  const r = ref(pid, "counters", `${name}_${period}`);
  const value = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(r);
    const next = snap.exists() ? (snap.data().value as number) + 1 : 1;
    tx.set(r, { value: next });
    return next;
  });
  return `${prefix}-${period}-${String(value).padStart(4, "0")}`;
}

const token = (bytes = 18) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
const statusFor = (total: number, paid: number): Bill["status"] => (paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : total <= 0 ? "paid" : "unpaid");

// ───────────── Bills & payments ─────────────

export type NewBill = {
  room: Pick<Room, "id" | "number">; tenantName: string; leaseId: string | null; bookingId: string | null;
  periodStart: string; periodEnd: string; dueDate: string; items: BillItem[]; note?: string;
  meter?: { readOn: string; elec: number; water: number };
  tenantPhone?: string;
  /** earlier open bills of this tenancy whose balance is included as a "ยอดค้างยกมา" item */
  carryFrom?: Bill[];
};

/** What the public bill/invoice page shows — a snapshot, like a printed invoice. */
export function publicProperty(p: Property) {
  return {
    name: p.name, nameEn: p.nameEn ?? "", phone: p.phone, address: p.address, promptpayId: p.promptpayId,
    accountName: p.accountName, accountNo: p.accountNo ?? "", payMethod: p.payMethod ?? "", payReference: p.payReference ?? "",
    payNote: p.payNote ?? "", preparedBy: p.preparedBy ?? "",
  };
}

function publicCopy(p: Property, b: Omit<Bill, "id">, tenantPhone = "") {
  return {
    propertyId: p.id,
    property: publicProperty(p),
    roomNumber: b.roomNumber, tenantName: b.tenantName, tenantPhone, paidOn: null, billNo: b.billNo, invoiceNo: b.invoiceNo,
    periodStart: b.periodStart, periodEnd: b.periodEnd, issueDate: b.issueDate, dueDate: b.dueDate,
    items: b.items, total: b.total, paid: b.paid, status: b.status,
  };
}

export async function issueBill(p: Property, n: NewBill): Promise<Bill> {
  const prefix = p.docPrefix || "EA";
  const billNo = await nextDocNo(p.id, "bill", "BILL");
  const invoiceNo = await nextDocNo(p.id, "invoice", `INV-${prefix}`);
  const bill: Omit<Bill, "id"> = {
    roomId: n.room.id, roomNumber: n.room.number, tenantName: n.tenantName, leaseId: n.leaseId, bookingId: n.bookingId,
    billNo, invoiceNo, period: n.periodStart.slice(0, 7), periodStart: n.periodStart, periodEnd: n.periodEnd,
    issueDate: todayBkk(), dueDate: n.dueDate, items: n.items, total: sumItems(n.items), paid: 0,
    status: "unpaid", publicToken: token(), note: n.note ?? "", sentToLineAt: null,
  };
  const billRef = doc(col(p.id, "bills"));
  const batch = writeBatch(db());
  batch.set(billRef, bill);
  batch.set(doc(db(), "publicBills", bill.publicToken), publicCopy(p, bill, n.tenantPhone));
  if (n.meter) batch.set(ref(p.id, "meterReadings", `${n.room.id}_${n.meter.readOn}`), { roomId: n.room.id, period: bill.period, ...n.meter });
  if (n.bookingId) batch.update(ref(p.id, "bookings", n.bookingId), { billId: billRef.id });
  for (const old of n.carryFrom ?? []) {
    batch.update(ref(p.id, "bills", old.id), { status: "carried", carriedTo: billRef.id, carriedStatus: old.status });
    batch.update(doc(db(), "publicBills", old.publicToken), { status: "carried" });
  }
  audit(batch, p.id, "bill.issue", "bill", billRef.id, `ออกบิล ${billNo} ห้อง ${n.room.number} ฿${bill.total.toLocaleString("th-TH")}`);
  await batch.commit();
  return { id: billRef.id, ...bill };
}

/**
 * Fix an issued bill (wrong meter number, forgotten discount). Bill number stays.
 * The total can't drop below what was already received (V3 bill-edit rule).
 */
export async function editBill(p: Property, bill: Bill, items: BillItem[], note = bill.note ?? "", meter?: { elec?: number; water?: number }) {
  if (bill.status === "void" || bill.status === "carried") throw new Error("บิลนี้แก้ไม่ได้ (ยกเลิกหรือยกยอดไปแล้ว)");
  const total = sumItems(items);
  if (total < bill.paid) throw new Error(`ยอดใหม่ ฿${total.toLocaleString("th-TH")} ต่ำกว่าที่รับเงินแล้ว ฿${bill.paid.toLocaleString("th-TH")} — ลบใบเสร็จที่รับเกินก่อน`);
  const status = statusFor(total, bill.paid);
  const batch = writeBatch(db());
  batch.update(ref(p.id, "bills", bill.id), { items, total, status, note });
  // merge: also recreates the tenant's bill page if it was ever missing (paidOn/tenantPhone kept)
  batch.set(doc(db(), "publicBills", bill.publicToken), { propertyId: p.id, property: publicProperty(p), items, total, status }, { merge: true });
  // Corrected "after" readings also fix the saved meter reading, so next month's "before" is right.
  if (meter && (meter.elec !== undefined || meter.water !== undefined)) {
    const { getDocs, query, where } = await import("firebase/firestore");
    const snap = await getDocs(query(col(p.id, "meterReadings"), where("roomId", "==", bill.roomId)));
    const mine = snap.docs.filter((d) => ((d.data().period as string | undefined) ?? String(d.data().readOn).slice(0, 7)) === bill.period);
    const patch: { elec?: number; water?: number } = {};
    if (meter.elec !== undefined) patch.elec = meter.elec;
    if (meter.water !== undefined) patch.water = meter.water;
    if (mine.length) for (const d of mine) batch.update(d.ref, patch);
    else batch.set(ref(p.id, "meterReadings", `${bill.roomId}_${bill.issueDate}`), { roomId: bill.roomId, period: bill.period, readOn: bill.issueDate, elec: meter.elec ?? 0, water: meter.water ?? 0 });
  }
  audit(batch, p.id, "bill.edit", "bill", bill.id, `แก้บิล ${bill.billNo}: ฿${bill.total.toLocaleString("th-TH")} → ฿${total.toLocaleString("th-TH")}`);
  await batch.commit();
}

export async function receivePayment(p: Property, billId: string, amount: number, method: Payment["method"], bankRef = "") {
  if (!(amount > 0)) throw new Error("จำนวนเงินต้องมากกว่า 0");
  const receiptNo = await nextDocNo(p.id, "receipt", p.docPrefix || "EA");
  const billRef = ref(p.id, "bills", billId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(billRef);
    if (!snap.exists()) throw new Error("ไม่พบบิล");
    const b = snap.data() as Omit<Bill, "id">;
    if (round2(b.paid + amount) > b.total) throw new Error(`รับเกินยอดค้าง (ค้างอยู่ ฿${round2(b.total - b.paid).toLocaleString("th-TH")})`);
    const paid = round2(b.paid + amount);
    const status = statusFor(b.total, paid);
    const payRef = doc(col(p.id, "payments"));
    tx.set(payRef, {
      billId, roomId: b.roomId, roomNumber: b.roomNumber, receiptNo, paidOn: todayBkk(), amount, method, bankRef,
    } satisfies Omit<Payment, "id">);
    tx.update(billRef, { paid, status });
    tx.update(doc(db(), "publicBills", b.publicToken), { paid, status, paidOn: todayBkk() });
    audit(tx, p.id, "payment.create", "payment", payRef.id, `รับเงิน ${receiptNo} ห้อง ${b.roomNumber} ฿${amount.toLocaleString("th-TH")} (${b.billNo})`);
  });
  return receiptNo;
}

/** Remove a receipt recorded by mistake; the bill's paid amount and status follow (owner only, by rules). */
export async function deletePayment(p: Property, payment: Payment) {
  const billRef = ref(p.id, "bills", payment.billId);
  await runTransaction(db(), async (tx) => {
    const snap = payment.billId ? await tx.get(billRef) : null;
    if (snap?.exists()) {
      const b = snap.data() as Omit<Bill, "id">;
      if (b.status === "carried") throw new Error("ยอดของบิลนี้ยกไปบิลใหม่แล้ว ลบใบเสร็จไม่ได้");
      const paid = Math.max(0, round2(b.paid - payment.amount));
      const status = b.status === "void" ? "void" : statusFor(b.total, paid);
      tx.update(billRef, { paid, status });
      if (b.status !== "void") tx.update(doc(db(), "publicBills", b.publicToken), { paid, status });
    }
    tx.delete(ref(p.id, "payments", payment.id));
    audit(tx, p.id, "payment.delete", "payment", payment.id, `ลบใบเสร็จ ${payment.receiptNo} ห้อง ${payment.roomNumber} ฿${payment.amount.toLocaleString("th-TH")}`);
  });
}

/** Void (never delete). Bills whose balance was carried into this one become open again. */
export async function voidBill(p: Property, bill: Bill, reason = "") {
  if (bill.paid > 0) throw new Error("บิลที่รับชำระแล้วยกเลิกไม่ได้ (ลบใบเสร็จก่อน)");
  const carried = await getDocs(query(col(p.id, "bills"), where("carriedTo", "==", bill.id)));
  const batch = writeBatch(db());
  batch.update(ref(p.id, "bills", bill.id), { status: "void", note: reason ? `ยกเลิก: ${reason}` : bill.note });
  batch.delete(doc(db(), "publicBills", bill.publicToken));
  for (const d of carried.docs) {
    const old = d.data() as Omit<Bill, "id">;
    const status = old.carriedStatus ?? (old.paid > 0 ? "partial" : "unpaid");
    batch.update(d.ref, { status, carriedTo: null, carriedStatus: null });
    batch.update(doc(db(), "publicBills", old.publicToken), { status });
  }
  audit(batch, p.id, "bill.void", "bill", bill.id, `ยกเลิกบิล ${bill.billNo} ห้อง ${bill.roomNumber}${reason ? `: ${reason}` : ""}`);
  await batch.commit();
}

/** Save meter numbers without issuing bills yet (bill later from the saved numbers). */
export async function saveReadings(pid: string, rows: { room: Pick<Room, "id" | "number">; period: string; readOn: string; elec: number; water: number }[]) {
  if (!rows.length) throw new Error("ยังไม่มีเลขมิเตอร์ที่กรอกครบ");
  const batch = writeBatch(db());
  for (const r of rows) batch.set(ref(pid, "meterReadings", `${r.room.id}_${r.readOn}`), { roomId: r.room.id, period: r.period, readOn: r.readOn, elec: r.elec, water: r.water });
  audit(batch, pid, "meter.save", "period", rows[0].period, `บันทึกเลขมิเตอร์ ${rows.length} ห้อง รอบ ${rows[0].period}`);
  await batch.commit();
}

// ───────────── Rooms, tenants, leases ─────────────

export const roomDefaults = (number: string, floor: string, kind: Room["kind"], rent: number): Omit<Room, "id"> => ({
  number, floor, kind, status: "vacant", condition: "ready", billingCycle: kind === "monthly" ? "monthly" : "daily",
  rentMonthly: kind === "monthly" ? rent : 0, priceNightly: kind === "monthly" ? 0 : rent, deposit: 0, note: "",
});

export async function addRooms(pid: string, rooms: Omit<Room, "id">[]) {
  const batch = writeBatch(db());
  for (const r of rooms) batch.set(doc(col(pid, "rooms")), r);
  audit(batch, pid, "room.add", "room", "", `เพิ่มห้อง ${rooms.map((r) => r.number).join(", ")}`);
  await batch.commit();
}

async function one(pid: string, action: string, targetType: string, targetId: string, summary: string, apply: (b: WriteBatch) => void) {
  const batch = writeBatch(db());
  apply(batch);
  audit(batch, pid, action, targetType, targetId, summary);
  await batch.commit();
}

export const updateRoom = (pid: string, room: Pick<Room, "id" | "number">, data: Partial<Omit<Room, "id">>) =>
  one(pid, "room.update", "room", room.id, `แก้ไขห้อง ${room.number}`, (b) => b.update(ref(pid, "rooms", room.id), data));
export const setCondition = (pid: string, room: Pick<Room, "id" | "number">, condition: RoomCondition) =>
  one(pid, "room.condition", "room", room.id, `ห้อง ${room.number}: ${CONDITION_TH[condition]}`, (b) => b.update(ref(pid, "rooms", room.id), { condition }));
export const deleteRoom = (pid: string, room: Pick<Room, "id" | "number">) =>
  one(pid, "room.delete", "room", room.id, `ลบห้อง ${room.number}`, (b) => b.delete(ref(pid, "rooms", room.id)));
export const updateTenant = (pid: string, id: string, data: Partial<Omit<Tenant, "id">>, label = "") =>
  one(pid, "tenant.update", "tenant", id, `แก้ไขผู้เช่า ${label || data.fullName || ""}`.trim(), (b) => b.update(ref(pid, "tenants", id), data));
export const updateLease = (pid: string, id: string, data: Partial<Omit<Lease, "id">>, label = "") =>
  one(pid, "lease.update", "lease", id, `แก้ไขสัญญา ${label}`.trim(), (b) => b.update(ref(pid, "leases", id), data));

type NewLease = Omit<Lease, "id" | "roomId" | "tenantId" | "status">;

/**
 * New tenancy in a room — now (active) or later (reserved: room held until move-in day).
 * `tenant` with an id = a person already on file (found by phone): no second record, their history continues.
 */
export async function moveIn(pid: string, room: Room, tenant: Omit<Tenant, "id"> | (Partial<Tenant> & { id: string }), lease: NewLease, reserve = false) {
  const existing = "id" in tenant && !!tenant.id;
  const t = existing ? ref(pid, "tenants", tenant.id as string) : doc(col(pid, "tenants"));
  const l = doc(col(pid, "leases"));
  const name = tenant.fullName ?? "";
  await one(pid, reserve ? "lease.reserve" : "lease.create", "lease", l.id, `${reserve ? "จอง" : "ผู้เช่าเข้า"}ห้อง ${room.number}: ${name}`, (b) => {
    if (existing) {
      const { id: _id, ...patch } = tenant as Tenant;
      void _id;
      b.update(t, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    } else b.set(t, tenant);
    b.set(l, { ...lease, roomId: room.id, tenantId: t.id, status: reserve ? "reserved" : "active", depositRefund: null });
    b.update(ref(pid, "rooms", room.id), { status: reserve ? "reserved" : "occupied" });
  });
}

export const activateReservation = (pid: string, room: Room, lease: Lease) =>
  one(pid, "lease.activate", "lease", lease.id, `ผู้เช่าเข้าห้อง ${room.number} ตามที่จอง`, (b) => {
    b.update(ref(pid, "leases", lease.id), { status: "active", startDate: lease.startDate ?? todayBkk() });
    b.update(ref(pid, "rooms", room.id), { status: "occupied" });
  });

export const cancelReservation = (pid: string, room: Room, lease: Lease) =>
  one(pid, "lease.cancel", "lease", lease.id, `ยกเลิกการจองห้อง ${room.number}`, (b) => {
    b.update(ref(pid, "leases", lease.id), { status: "ended", endedReason: "ยกเลิกการจอง", endDate: todayBkk() });
    b.update(ref(pid, "rooms", room.id), { status: "vacant" });
  });

/**
 * Move out. The deposit settles open bills of this tenancy first (recorded as "หักเงินประกัน" receipts),
 * the rest is refunded and written on the lease.
 */
export async function moveOut(p: Property, room: Room, lease: Lease, openBills: Bill[], refundNote = "") {
  let left = lease.deposit;
  const deductions: { bill: Bill; amount: number }[] = [];
  for (const b of [...openBills].sort((x, y) => x.period.localeCompare(y.period))) {
    if (left <= 0) break;
    const amt = Math.min(left, round2(b.total - b.paid));
    if (amt > 0) { deductions.push({ bill: b, amount: amt }); left = round2(left - amt); }
  }
  for (const d of deductions) await receivePayment(p, d.bill.id, d.amount, "deposit", "หักจากเงินประกัน");
  const deducted = round2(lease.deposit - left);
  await one(p.id, "lease.end", "lease", lease.id, `ย้ายออกห้อง ${room.number} · คืนประกัน ฿${left.toLocaleString("th-TH")}${deducted ? ` (หักค้าง ฿${deducted.toLocaleString("th-TH")})` : ""}`, (b) => {
    b.update(ref(p.id, "leases", lease.id), {
      status: "ended", endDate: todayBkk(), endedReason: "ย้ายออก",
      depositRefund: { amount: left, deducted, date: todayBkk(), note: refundNote },
    });
    b.update(ref(p.id, "rooms", room.id), { status: "vacant", condition: "cleaning" });
  });
  return { refund: left, deducted };
}

/** Room transfer = end this lease, start a new one in the other room; deposit and debt follow the tenant. */
export async function transferRoom(pid: string, from: Room, lease: Lease, to: Room, rent: number) {
  if (to.id === from.id) throw new Error("เลือกห้องปลายทางที่ไม่ใช่ห้องเดิม");
  const l = doc(col(pid, "leases"));
  const { id: _old, ...terms } = lease;
  void _old;
  await one(pid, "lease.transfer", "lease", l.id, `ย้ายห้อง ${from.number} → ${to.number}`, (b) => {
    b.update(ref(pid, "leases", lease.id), { status: "ended", endDate: todayBkk(), endedReason: `ย้ายไปห้อง ${to.number}`, transferredTo: l.id });
    b.set(l, { ...terms, roomId: to.id, rent, startDate: todayBkk(), status: "active", transferredFrom: lease.id, transferredTo: null, depositRefund: null });
    b.update(ref(pid, "rooms", from.id), { status: "vacant", condition: "cleaning" });
    b.update(ref(pid, "rooms", to.id), { status: "occupied" });
  });
}

/** Tenant photo / building photo: shrink in the browser and keep as a small JPEG data URL. */
export function shrinkImage(file: File, maxSide: number, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("อ่านรูปไม่ได้"));
    img.src = URL.createObjectURL(file);
  });
}

// ───────────── Daily bookings ─────────────

/** Every night from check-in up to (not including) check-out. */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const d = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  while (d < end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Creates the booking and claims each night; fails as a whole if any night is taken. */
export async function createBooking(pid: string, b: Omit<Booking, "id" | "status">): Promise<string> {
  const nights = nightsBetween(b.checkIn, b.checkOut);
  if (!nights.length) throw new Error("วันเช็คเอาท์ต้องหลังวันเช็คอิน");
  const r = doc(col(pid, "bookings"));
  const batch = writeBatch(db());
  batch.set(r, { ...b, status: "confirmed", billId: null });
  for (const n of nights) batch.set(ref(pid, "roomNights", `${b.roomId}_${n}`), { bookingId: r.id });
  audit(batch, pid, "booking.create", "booking", r.id, `จอง ${b.guestName} ${b.checkIn} → ${b.checkOut}`);
  try {
    await batch.commit();
  } catch {
    throw new Error("ห้องนี้มีการจองในช่วงวันที่เลือกแล้ว");
  }
  return r.id;
}

export async function cancelBooking(pid: string, b: Booking) {
  const batch = writeBatch(db());
  batch.update(ref(pid, "bookings", b.id), { status: "cancelled" });
  for (const n of nightsBetween(b.checkIn, b.checkOut)) batch.delete(ref(pid, "roomNights", `${b.roomId}_${n}`));
  audit(batch, pid, "booking.cancel", "booking", b.id, `ยกเลิกจอง ${b.guestName}`);
  await batch.commit();
}

export async function setBookingStatus(pid: string, b: Booking, status: "checked_in" | "checked_out") {
  const batch = writeBatch(db());
  batch.update(ref(pid, "bookings", b.id), { status });
  batch.update(ref(pid, "rooms", b.roomId), status === "checked_in" ? { status: "occupied" } : { status: "vacant", condition: "cleaning" });
  audit(batch, pid, `booking.${status}`, "booking", b.id, `${status === "checked_in" ? "เช็คอิน" : "เช็คเอาท์"} ${b.guestName}`);
  await batch.commit();
}

// ───────────── Expenses & maintenance ─────────────

export async function addExpense(pid: string, e: { amount: number; description: string; category: string; spentOn?: string; method?: string; supplier?: string; maintenanceId?: string | null }) {
  if (!(e.amount > 0)) throw new Error("จำนวนเงินต้องมากกว่า 0");
  if (!e.description.trim()) throw new Error("กรุณากรอกรายละเอียด");
  const r = doc(col(pid, "expenses"));
  await one(pid, "expense.create", "expense", r.id, `ค่าใช้จ่าย ${e.description.trim()} ฿${e.amount.toLocaleString("th-TH")}`, (b) => b.set(r, {
    spentOn: e.spentOn ?? todayBkk(), category: e.category, description: e.description.trim(), amount: e.amount,
    method: e.method ?? "cash", supplier: e.supplier ?? "", maintenanceId: e.maintenanceId ?? null,
  }));
}

export async function updateExpense(pid: string, e: Expense, data: Pick<Expense, "amount" | "description" | "category" | "spentOn">) {
  if (!(data.amount > 0)) throw new Error("จำนวนเงินต้องมากกว่า 0");
  await one(pid, "expense.update", "expense", e.id, `แก้ค่าใช้จ่าย ${e.description}: ฿${e.amount.toLocaleString("th-TH")} → ฿${data.amount.toLocaleString("th-TH")}`,
    (b) => b.update(ref(pid, "expenses", e.id), data));
}

export const deleteExpense = (pid: string, e: Expense) =>
  one(pid, "expense.delete", "expense", e.id, `ลบค่าใช้จ่าย ${e.description} ฿${e.amount.toLocaleString("th-TH")}`, (b) => b.delete(ref(pid, "expenses", e.id)));

export async function addMaintenance(pid: string, m: { room: Pick<Room, "id" | "number"> | null; problem: string; category: string; priority: Maintenance["priority"]; reportedBy?: string }) {
  if (!m.problem.trim()) throw new Error("กรุณาบอกปัญหา");
  const no = await nextDocNo(pid, "maintenance", "MNT");
  const r = doc(col(pid, "maintenance"));
  await one(pid, "maintenance.create", "maintenance", r.id, `แจ้งซ่อม ${no} ห้อง ${m.room?.number ?? "ส่วนกลาง"}: ${m.problem.trim()}`, (b) => b.set(r, {
    no, roomId: m.room?.id ?? null, roomNumber: m.room?.number ?? "ส่วนกลาง", category: m.category, problem: m.problem.trim(),
    priority: m.priority, status: "open", reportedBy: m.reportedBy ?? "", cost: 0, createdOn: todayBkk(),
  } satisfies Omit<Maintenance, "id">));
  return no;
}

/** Closing a job with a cost also records it as an expense. */
export async function setMaintenanceStatus(pid: string, m: Maintenance, status: Maintenance["status"], cost = 0) {
  await one(pid, "maintenance.status", "maintenance", m.id, `${m.no} ห้อง ${m.roomNumber}: ${({ open: "รอดำเนินการ", in_progress: "เริ่มซ่อม", done: "ซ่อมเสร็จ", cancelled: "ยกเลิก" } as const)[status]}${cost ? ` ค่าซ่อม ฿${cost.toLocaleString("th-TH")}` : ""}`, (b) => {
    b.update(ref(pid, "maintenance", m.id), { status, cost, closedOn: status === "done" || status === "cancelled" ? todayBkk() : null });
    if (status === "done" && cost > 0) {
      b.set(doc(col(pid, "expenses")), {
        spentOn: todayBkk(), category: "ค่าซ่อมบำรุง", description: `${m.no} ห้อง ${m.roomNumber}: ${m.problem}`, amount: cost,
        method: "cash", supplier: "", maintenanceId: m.id,
      });
    }
  });
}

// ───────────── Settings, buildings, assistants ─────────────

export const PROPERTY_EDITABLE = ["name", "phone", "address", "promptpayId", "accountName", "docPrefix",
  "nameEn", "preparedBy", "payMethod", "accountNo", "payReference", "payNote", "lineId", "lineUrl",
  "photo", "elecCostPerUnit", "waterCostPerUnit", "defaultElecRate", "defaultWaterRate", "defaultDueDay"] as const;

export function updateProperty(pid: string, data: Partial<Pick<Property, (typeof PROPERTY_EDITABLE)[number]>>) {
  if (data.docPrefix !== undefined && !/^[A-Z0-9]{1,6}$/.test(data.docPrefix)) throw new Error("อักษรนำหน้าเอกสาร: A-Z หรือ 0-9 ไม่เกิน 6 ตัว");
  return updateDoc(doc(db(), "properties", pid) as DocumentReference, data);
}

/** Another building under the same login (starts unpaid like any new property). */
export async function addProperty(name: string, phone: string) {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบ");
  const r = doc(collection(db(), "properties"));
  const batch = writeBatch(db());
  batch.set(r, { name: name.trim() || "อาคารใหม่", phone, address: "", promptpayId: "", accountName: "", docPrefix: "EA",
    plan: "pro", paidUntil: null, introUsed: false, ownerUid: uid, members: { [uid]: "owner" }, createdAt: serverTimestamp() });
  batch.set(doc(db(), "users", uid), { propertyIds: arrayUnion(r.id), propertyId: r.id }, { merge: true });
  await batch.commit();
  return r.id;
}

export const switchProperty = (pid: string) =>
  setDoc(doc(db(), "users", auth().currentUser!.uid), { propertyId: pid, propertyIds: arrayUnion(pid) }, { merge: true });

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — people type these
const code = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

export async function createInvite(pid: string, role: "assistant" | "viewer") {
  const c = code(8);
  await setDoc(doc(db(), "invites", c), { propertyId: pid, role, createdBy: auth().currentUser?.uid ?? "", expiresAt: new Date(Date.now() + 7 * 864e5) });
  return c;
}

export async function redeemInvite(c: string, name: string) {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบ");
  const { getDoc } = await import("firebase/firestore");
  const inv = await getDoc(doc(db(), "invites", c.trim().toUpperCase()));
  if (!inv.exists()) throw new Error("ไม่พบรหัสเชิญนี้");
  const { propertyId, role } = inv.data() as { propertyId: string; role: string };
  await setDoc(doc(db(), "joinRequests", `${propertyId}_${uid}`), { propertyId, uid, code: inv.id, role, name, requestedAt: serverTimestamp() });
  // Keep working in the current building; the new one appears in the building switcher once approved.
  const me = await getDoc(doc(db(), "users", uid));
  await setDoc(doc(db(), "users", uid), { propertyIds: arrayUnion(propertyId), ...(me.data()?.propertyId ? {} : { propertyId }) }, { merge: true });
  return propertyId;
}

export async function approveJoin(pid: string, req: { id: string; uid: string; role: string; name: string }) {
  const batch = writeBatch(db());
  batch.update(doc(db(), "properties", pid), { [`members.${req.uid}`]: req.role, [`memberNames.${req.uid}`]: req.name || "" });
  batch.delete(doc(db(), "joinRequests", req.id));
  await batch.commit();
}

export const removeMember = (pid: string, uid: string) =>
  updateDoc(doc(db(), "properties", pid), { [`members.${uid}`]: deleteField(), [`memberNames.${uid}`]: deleteField() });

/** One-time code a tenant sends to the LINE bot to link their LINE account (consumed by the server). */
export async function createLineLink(pid: string, tenant: Pick<Tenant, "id" | "fullName">, roomNumber: string) {
  const c = code(6);
  await setDoc(doc(db(), "lineLinks", c), { propertyId: pid, tenantId: tenant.id, tenantName: tenant.fullName, roomNumber,
    createdBy: auth().currentUser?.uid ?? "", expiresAt: new Date(Date.now() + 7 * 864e5), usedAt: null });
  return c;
}
