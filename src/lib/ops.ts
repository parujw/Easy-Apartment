// All writes the app makes. Firestore rules enforce membership, the active subscription,
// +1-only counters and one document per booked night.
import {
  collection, deleteDoc, doc, runTransaction, updateDoc, writeBatch, type DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { total as sumItems, type BillItem } from "@/lib/billing";
import { todayBkk } from "@/lib/dates";
import type { Bill, Booking, Lease, Maintenance, Payment, Room, Tenant } from "@/lib/model";
import type { Property } from "@/components/property-provider";

const col = (pid: string, name: string) => collection(db(), "properties", pid, name);
const ref = (pid: string, name: string, id: string) => doc(db(), "properties", pid, name, id);
const yyyymm = () => todayBkk().slice(0, 7).replace("-", "");

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

const token = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");

// ───────────── Bills & payments ─────────────

export type NewBill = {
  room: Pick<Room, "id" | "number">; tenantName: string; leaseId: string | null; bookingId: string | null;
  periodStart: string; periodEnd: string; dueDate: string; items: BillItem[]; note?: string;
  meter?: { readOn: string; elec: number; water: number };
};

function publicCopy(p: Property, b: Omit<Bill, "id">) {
  return {
    propertyId: p.id,
    property: { name: p.name, phone: p.phone, address: p.address, promptpayId: p.promptpayId, accountName: p.accountName },
    roomNumber: b.roomNumber, tenantName: b.tenantName, billNo: b.billNo, invoiceNo: b.invoiceNo,
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
    status: "unpaid", publicToken: token(), note: n.note ?? "",
  };
  const billRef = doc(col(p.id, "bills"));
  const batch = writeBatch(db());
  batch.set(billRef, bill);
  batch.set(doc(db(), "publicBills", bill.publicToken), publicCopy(p, bill));
  if (n.meter) batch.set(ref(p.id, "meterReadings", `${n.room.id}_${n.meter.readOn}`), { roomId: n.room.id, ...n.meter });
  if (n.bookingId) batch.update(ref(p.id, "bookings", n.bookingId), { billId: billRef.id });
  await batch.commit();
  return { id: billRef.id, ...bill };
}

export async function receivePayment(p: Property, billId: string, amount: number, method: Payment["method"], bankRef = "") {
  if (!(amount > 0)) throw new Error("จำนวนเงินต้องมากกว่า 0");
  const receiptNo = await nextDocNo(p.id, "receipt", p.docPrefix || "EA");
  const billRef = ref(p.id, "bills", billId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(billRef);
    if (!snap.exists()) throw new Error("ไม่พบบิล");
    const b = snap.data() as Omit<Bill, "id">;
    const paid = Math.round((b.paid + amount) * 100) / 100;
    const status = paid >= b.total ? "paid" : "partial";
    tx.set(doc(col(p.id, "payments")), {
      billId, roomId: b.roomId, roomNumber: b.roomNumber, receiptNo, paidOn: todayBkk(), amount, method, bankRef,
    } satisfies Omit<Payment, "id">);
    tx.update(billRef, { paid, status });
    tx.update(doc(db(), "publicBills", b.publicToken), { paid, status });
  });
  return receiptNo;
}

export async function voidBill(p: Property, bill: Bill) {
  if (bill.paid > 0) throw new Error("บิลที่รับชำระแล้วยกเลิกไม่ได้");
  const batch = writeBatch(db());
  batch.update(ref(p.id, "bills", bill.id), { status: "void" });
  batch.delete(doc(db(), "publicBills", bill.publicToken));
  await batch.commit();
}

// ───────────── Rooms, tenants, leases ─────────────

export const roomDefaults = (number: string, floor: string, kind: Room["kind"], rent: number): Omit<Room, "id"> => ({
  number, floor, kind, status: "vacant", billingCycle: kind === "monthly" ? "monthly" : "daily",
  rentMonthly: kind === "monthly" ? rent : 0, priceNightly: kind === "monthly" ? 0 : rent, deposit: 0, note: "",
});

export async function addRooms(pid: string, rooms: Omit<Room, "id">[]) {
  const batch = writeBatch(db());
  for (const r of rooms) batch.set(doc(col(pid, "rooms")), r);
  await batch.commit();
}

export const updateRoom = (pid: string, id: string, data: Partial<Omit<Room, "id">>) => updateDoc(ref(pid, "rooms", id), data);
export const deleteRoom = (pid: string, id: string) => deleteDoc(ref(pid, "rooms", id));
export const updateTenant = (pid: string, id: string, data: Partial<Omit<Tenant, "id">>) => updateDoc(ref(pid, "tenants", id), data);
export const updateLease = (pid: string, id: string, data: Partial<Omit<Lease, "id">>) => updateDoc(ref(pid, "leases", id), data);

export async function moveIn(pid: string, room: Room, tenant: Omit<Tenant, "id">, lease: Omit<Lease, "id" | "roomId" | "tenantId" | "status">) {
  const t = doc(col(pid, "tenants"));
  const batch = writeBatch(db());
  batch.set(t, tenant);
  batch.set(doc(col(pid, "leases")), { ...lease, roomId: room.id, tenantId: t.id, status: "active" });
  batch.update(ref(pid, "rooms", room.id), { status: "occupied" });
  await batch.commit();
}

export async function moveOut(pid: string, room: Room, lease: Lease) {
  const batch = writeBatch(db());
  batch.update(ref(pid, "leases", lease.id), { status: "ended", endDate: todayBkk() });
  batch.update(ref(pid, "rooms", room.id), { status: "cleaning" });
  await batch.commit();
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
  await batch.commit();
}

export async function setBookingStatus(pid: string, b: Booking, status: "checked_in" | "checked_out") {
  const batch = writeBatch(db());
  batch.update(ref(pid, "bookings", b.id), { status });
  batch.update(ref(pid, "rooms", b.roomId), { status: status === "checked_in" ? "occupied" : "cleaning" });
  await batch.commit();
}

// ───────────── Expenses & maintenance ─────────────

export async function addExpense(pid: string, e: { amount: number; description: string; category: string; spentOn?: string; method?: string; supplier?: string; maintenanceId?: string | null }) {
  if (!(e.amount > 0)) throw new Error("จำนวนเงินต้องมากกว่า 0");
  if (!e.description.trim()) throw new Error("กรุณากรอกรายละเอียด");
  const batch = writeBatch(db());
  batch.set(doc(col(pid, "expenses")), {
    spentOn: e.spentOn ?? todayBkk(), category: e.category, description: e.description.trim(), amount: e.amount,
    method: e.method ?? "cash", supplier: e.supplier ?? "", maintenanceId: e.maintenanceId ?? null,
  });
  await batch.commit();
}

export async function addMaintenance(pid: string, m: { room: Pick<Room, "id" | "number"> | null; problem: string; category: string; priority: Maintenance["priority"]; reportedBy?: string }) {
  if (!m.problem.trim()) throw new Error("กรุณาบอกปัญหา");
  const no = await nextDocNo(pid, "maintenance", "MNT");
  const batch = writeBatch(db());
  batch.set(doc(col(pid, "maintenance")), {
    no, roomId: m.room?.id ?? null, roomNumber: m.room?.number ?? "ส่วนกลาง", category: m.category, problem: m.problem.trim(),
    priority: m.priority, status: "open", reportedBy: m.reportedBy ?? "", cost: 0, createdOn: todayBkk(),
  } satisfies Omit<Maintenance, "id">);
  await batch.commit();
  return no;
}

/** Closing a job with a cost also records it as an expense. */
export async function setMaintenanceStatus(pid: string, m: Maintenance, status: Maintenance["status"], cost = 0) {
  const batch = writeBatch(db());
  batch.update(ref(pid, "maintenance", m.id), { status, cost });
  if (status === "done" && cost > 0) {
    batch.set(doc(col(pid, "expenses")), {
      spentOn: todayBkk(), category: "ค่าซ่อมบำรุง", description: `${m.no} ห้อง ${m.roomNumber}: ${m.problem}`, amount: cost,
      method: "cash", supplier: "", maintenanceId: m.id,
    });
  }
  await batch.commit();
}

// ───────────── Settings ─────────────

export function updateProperty(pid: string, data: Partial<Pick<Property, "name" | "phone" | "address" | "promptpayId" | "accountName" | "docPrefix">>) {
  if (data.docPrefix !== undefined && !/^[A-Z0-9]{1,6}$/.test(data.docPrefix)) throw new Error("อักษรนำหน้าเอกสาร: A-Z หรือ 0-9 ไม่เกิน 6 ตัว");
  return updateDoc(doc(db(), "properties", pid) as DocumentReference, data);
}
