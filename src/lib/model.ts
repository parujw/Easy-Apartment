// Firestore document shapes (properties/{pid}/<collection>/{id})
import type { BillItem } from "@/lib/billing";

export type RoomKind = "monthly" | "daily" | "airbnb";
export type RoomStatus = "vacant" | "occupied" | "reserved" | "cleaning" | "maintenance";
export type BillingCycle = "daily" | "weekly" | "monthly" | "custom";

export type Room = {
  id: string; number: string; floor: string; kind: RoomKind; status: RoomStatus; billingCycle: BillingCycle;
  rentMonthly: number; priceNightly: number; deposit: number; note: string; icalUrl?: string;
};

export type Tenant = { id: string; fullName: string; nickname: string; phone: string; lineUserId: string | null; emergency: string; note: string };

export type Lease = {
  id: string; roomId: string; tenantId: string; startDate: string | null; endDate: string | null;
  rent: number; deposit: number; advance: number; elecRate: number; waterRate: number;
  internet: number; acFee: number; parking: number; dueDay: number; status: "active" | "ended";
};

export type MeterReading = { id: string; roomId: string; readOn: string; elec: number; water: number };

/** carried = its unpaid balance moved into a later bill of the same lease (see lib/carry.ts) */
export type BillStatus = "unpaid" | "partial" | "paid" | "void" | "carried";
export type Bill = {
  id: string; roomId: string; roomNumber: string; tenantName: string; leaseId: string | null; bookingId: string | null;
  billNo: string; invoiceNo: string; period: string; periodStart: string; periodEnd: string;
  issueDate: string; dueDate: string; items: BillItem[]; total: number; paid: number; status: BillStatus;
  publicToken: string; note: string;
  /** set on a carried bill: the bill that now holds its balance, and the status to restore if that bill is voided */
  carriedTo?: string; carriedStatus?: "unpaid" | "partial";
};

export type Payment = {
  id: string; billId: string; roomId: string; roomNumber: string; receiptNo: string; paidOn: string;
  amount: number; method: "cash" | "transfer" | "promptpay" | "card"; bankRef: string;
};

export type Expense = {
  id: string; spentOn: string; category: string; description: string; amount: number; method: string;
  supplier: string; maintenanceId: string | null;
};

export type Maintenance = {
  id: string; no: string; roomId: string | null; roomNumber: string; category: string; problem: string;
  priority: "normal" | "urgent" | "critical"; status: "open" | "in_progress" | "done" | "cancelled";
  reportedBy: string; cost: number; createdOn: string;
};

export type Booking = {
  id: string; roomId: string; guestName: string; guestPhone: string; checkIn: string; checkOut: string;
  nightlyRate: number; source: "direct" | "airbnb" | "other"; status: "confirmed" | "checked_in" | "checked_out" | "cancelled";
  externalUid?: string; billId?: string | null;
};

export const STATUS_TH: Record<RoomStatus, string> = {
  vacant: "ว่าง", occupied: "มีผู้เช่า", reserved: "จอง", cleaning: "ทำความสะอาด", maintenance: "ซ่อมบำรุง",
};
export const KIND_TH: Record<RoomKind, string> = { monthly: "รายเดือน", daily: "รายวัน", airbnb: "Airbnb" };
export const CYCLE_TH: Record<BillingCycle, string> = { daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน", custom: "กำหนดเอง" };
export const METHOD_TH: Record<Payment["method"], string> = { transfer: "โอน", promptpay: "PromptPay", cash: "เงินสด", card: "บัตร" };
export const BILL_STATUS_TH: Record<BillStatus, string> = { unpaid: "รอจ่าย", partial: "จ่ายบางส่วน", paid: "จ่ายแล้ว", void: "ยกเลิก", carried: "ยกยอดแล้ว" };
export const EXPENSE_CATEGORIES = ["ค่าซ่อมบำรุง", "ค่าน้ำส่วนกลาง", "ค่าไฟส่วนกลาง", "ค่าทำความสะอาด", "ค่าจ้าง", "อื่นๆ"];
export const MAINT_CATEGORIES = ["ไฟฟ้า", "ประปา", "แอร์", "ประตู/หน้าต่าง", "เฟอร์นิเจอร์", "อื่นๆ"];

export const thb = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export const balance = (b: Pick<Bill, "total" | "paid">) => Math.round((b.total - b.paid) * 100) / 100;
