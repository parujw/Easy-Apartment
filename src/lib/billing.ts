// Bill calculation shared by monthly (meter-based) and nightly bills.
// Same formula as the original app: rent + electricity + water + services + previous balance − discount.

export type BillItem = {
  kind: "rent" | "nightly" | "elec" | "water" | "internet" | "ac" | "parking" | "other" | "prev_balance" | "discount";
  label: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function item(kind: BillItem["kind"], label: string, qty: number, unitPrice: number): BillItem {
  return { kind, label, qty, unitPrice, amount: round2(qty * unitPrice) };
}

export type Extras = {
  internet?: number;
  ac?: number;
  parking?: number;
  other?: number;
  prevBalance?: number;
  discount?: number;
};

function extras(e: Extras): BillItem[] {
  const out: BillItem[] = [];
  if (e.internet) out.push(item("internet", "ค่าอินเทอร์เน็ต", 1, e.internet));
  if (e.ac) out.push(item("ac", "ค่าเช่าแอร์", 1, e.ac));
  if (e.parking) out.push(item("parking", "ค่าที่จอดรถ", 1, e.parking));
  if (e.other) out.push(item("other", "ค่าอื่นๆ", 1, e.other));
  if (e.prevBalance) out.push(item("prev_balance", "ยอดค้างยกมา", 1, e.prevBalance));
  if (e.discount) out.push(item("discount", "ส่วนลด", 1, -Math.abs(e.discount)));
  return out;
}

export function meterBill(input: {
  rent: number;
  elecPrev: number; elecCurr: number; elecRate: number;
  waterPrev: number; waterCurr: number; waterRate: number;
} & Extras): BillItem[] {
  if (input.elecCurr < input.elecPrev) throw new Error("เลขมิเตอร์ไฟน้อยกว่าครั้งก่อน");
  if (input.waterCurr < input.waterPrev) throw new Error("เลขมิเตอร์น้ำน้อยกว่าครั้งก่อน");
  const items: BillItem[] = [];
  if (input.rent) items.push(item("rent", "ค่าเช่าห้อง", 1, input.rent));
  const eu = round2(input.elecCurr - input.elecPrev);
  const wu = round2(input.waterCurr - input.waterPrev);
  if (eu) items.push(item("elec", `ค่าไฟ ${input.elecPrev}→${input.elecCurr}`, eu, input.elecRate));
  if (wu) items.push(item("water", `ค่าน้ำ ${input.waterPrev}→${input.waterCurr}`, wu, input.waterRate));
  return [...items, ...extras(input)];
}

export function nights(checkIn: string, checkOut: string): number {
  const ms = Date.parse(checkOut + "T00:00:00Z") - Date.parse(checkIn + "T00:00:00Z");
  const n = Math.round(ms / 86_400_000);
  if (!(n > 0)) throw new Error("วันเช็คเอาท์ต้องหลังวันเช็คอิน");
  return n;
}

export function nightlyBill(input: { checkIn: string; checkOut: string; nightlyRate: number } & Extras): BillItem[] {
  const n = nights(input.checkIn, input.checkOut);
  return [item("nightly", `ค่าห้อง ${n} คืน`, n, input.nightlyRate), ...extras(input)];
}

export const total = (items: BillItem[]) => round2(items.reduce((s, i) => s + i.amount, 0));
