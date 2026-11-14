// Excel import of an existing building (rooms + current tenants + last meter numbers).
// Pure parsing/validation here (unit tested); the screen writes the result with ops.ts.

export const IMPORT_HEADERS = [
  "เลขห้อง", "ชั้น", "ประเภท (รายเดือน/รายวัน/Airbnb)", "ค่าเช่า/เดือน", "ราคา/คืน", "ค่าประกัน",
  "ชื่อผู้เช่า", "เบอร์โทรผู้เช่า", "วันเข้าอยู่ (YYYY-MM-DD)", "ค่าไฟ/หน่วย", "ค่าน้ำ/หน่วย", "ครบกำหนดจ่ายวันที่",
  "เลขมิเตอร์ไฟล่าสุด", "เลขมิเตอร์น้ำล่าสุด",
] as const;

export const IMPORT_EXAMPLE = [
  ["101", "1", "รายเดือน", 3500, 0, 7000, "สมชาย ใจดี", "0812345678", "2026-01-01", 8, 18, 5, 1234, 456],
  ["102", "1", "รายเดือน", 3500, 0, 7000, "", "", "", 8, 18, 5, "", ""],
  ["201", "2", "รายวัน", 0, 600, 0, "", "", "", 0, 0, 5, "", ""],
];

export type ImportRow = {
  line: number; number: string; floor: string; kind: "monthly" | "daily" | "airbnb";
  rentMonthly: number; priceNightly: number; deposit: number;
  tenant: { fullName: string; phone: string; startDate: string; elecRate: number; waterRate: number; dueDay: number } | null;
  meter: { elec: number; water: number } | null;
};

const KIND: Record<string, ImportRow["kind"]> = { "รายเดือน": "monthly", monthly: "monthly", "รายวัน": "daily", daily: "daily", airbnb: "airbnb", "แอร์บีเอ็นบี": "airbnb" };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text).trim();
  if (typeof v === "object" && "result" in (v as object)) return cell((v as { result: unknown }).result);
  return String(v).trim();
}
const money = (s: string) => (s === "" ? 0 : Number(s.replace(/[,฿\s]/g, "")));

/** rows = sheet values without the header row; line numbers in errors match the Excel sheet (header = line 1). */
export function parseImport(rows: unknown[][], existingRoomNumbers: string[] = []): { rows: ImportRow[]; errors: string[] } {
  const out: ImportRow[] = [], errors: string[] = [];
  const seen = new Set(existingRoomNumbers);
  rows.forEach((raw, i) => {
    const c = Array.from({ length: IMPORT_HEADERS.length }, (_, k) => cell(raw[k]));
    const line = i + 2;
    if (c.every((x) => x === "")) return;
    const [number, floor, kindRaw, rent, nightly, deposit, name, phone, start, elec, water, due, mElec, mWater] = c;
    const err = (m: string) => errors.push(`แถว ${line}: ${m}`);
    if (!number) return err("ไม่มีเลขห้อง");
    if (seen.has(number)) return err(`ห้อง ${number} ซ้ำ`);
    const kind = KIND[(kindRaw || "รายเดือน").toLowerCase()];
    if (!kind) return err(`ประเภท “${kindRaw}” ไม่ถูกต้อง (รายเดือน / รายวัน / Airbnb)`);
    const nums = { rent: money(rent), nightly: money(nightly), deposit: money(deposit), elec: money(elec), water: money(water), due: money(due || "5") };
    const bad = Object.entries(nums).find(([, v]) => !Number.isFinite(v) || v < 0);
    if (bad) return err("ตัวเลขไม่ถูกต้อง");
    if (nums.due < 1 || nums.due > 28) return err("วันครบกำหนดต้องเป็น 1–28");
    let tenant: ImportRow["tenant"] = null;
    if (name) {
      if (kind !== "monthly") return err("ผู้เช่ารายเดือนใส่ได้เฉพาะห้องรายเดือน");
      if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return err("วันเข้าอยู่ต้องเป็น YYYY-MM-DD");
      tenant = { fullName: name, phone: phone.replace(/\D/g, ""), startDate: start, elecRate: nums.elec, waterRate: nums.water, dueDay: nums.due };
    }
    let meter: ImportRow["meter"] = null;
    if (mElec !== "" || mWater !== "") {
      const e = money(mElec), w = money(mWater);
      if (!Number.isFinite(e) || !Number.isFinite(w) || mElec === "" || mWater === "") return err("ใส่เลขมิเตอร์ให้ครบทั้งไฟและน้ำ");
      meter = { elec: e, water: w };
    }
    seen.add(number);
    out.push({ line, number, floor: floor || number.slice(0, -2) || "1", kind, rentMonthly: nums.rent, priceNightly: nums.nightly, deposit: nums.deposit, tenant, meter });
  });
  return { rows: out, errors };
}
