"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { Btn, Field, NumField, useAction } from "@/components/ui";
import { issueBill } from "@/lib/ops";
import { total, type BillItem } from "@/lib/billing";
import { addDays, todayBkk } from "@/lib/dates";
import { thb, type Lease, type Room } from "@/lib/model";

const n = (v: number | "") => (v === "" ? 0 : v);

/** Bill for any period the owner chooses: weekly, custom, deposit, one-off charges. */
export default function ManualBill({ room, lease, tenantName, onDone }: { room: Room; lease: Lease | undefined; tenantName: string; onDone: () => void }) {
  const { property } = useProperty();
  const today = todayBkk();
  const weekly = room.billingCycle === "weekly";
  const [f, setF] = useState({
    start: today, end: addDays(today, weekly ? 6 : 29), due: addDays(today, 3),
    rent: (weekly ? "" : lease?.rent ?? room.rentMonthly) as number | "", other: "" as number | "", otherLabel: "", discount: "" as number | "", note: "",
  });
  const items: BillItem[] = [];
  if (n(f.rent)) items.push({ kind: "rent", label: "ค่าเช่าห้อง", qty: 1, unitPrice: n(f.rent), amount: n(f.rent) });
  if (n(f.other)) items.push({ kind: "other", label: f.otherLabel.trim() || "ค่าอื่นๆ", qty: 1, unitPrice: n(f.other), amount: n(f.other) });
  if (n(f.discount)) items.push({ kind: "discount", label: "ส่วนลด", qty: 1, unitPrice: -n(f.discount), amount: -n(f.discount) });
  const a = useAction();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="ตั้งแต่" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <Field label="ถึง" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        <NumField label="ค่าเช่า" value={f.rent} onChange={(v) => setF({ ...f, rent: v })} />
        <Field label="ครบกำหนด" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        <Field label="รายการอื่น" placeholder="เช่น ค่าประกัน" value={f.otherLabel} onChange={(e) => setF({ ...f, otherLabel: e.target.value })} />
        <NumField label="จำนวนเงิน" value={f.other} onChange={(v) => setF({ ...f, other: v })} />
        <NumField label="ส่วนลด" value={f.discount} onChange={(v) => setF({ ...f, discount: v })} />
      </div>
      <p className="text-lg font-bold">รวม ฿{thb(total(items))}</p>
      <Btn className="w-full" disabled={a.busy || !items.length} onClick={() => a.run(async () => {
        if (f.end < f.start) throw new Error("วันที่สิ้นสุดต้องไม่ก่อนวันเริ่ม");
        const b = await issueBill(property, { room, tenantName, leaseId: lease?.id ?? null, bookingId: null,
          periodStart: f.start, periodEnd: f.end, dueDate: f.due, items, note: f.note });
        onDone();
        return `ออกบิล ${b.billNo} แล้ว`;
      })}>ออกบิล</Btn>
      {a.view}
    </div>
  );
}
