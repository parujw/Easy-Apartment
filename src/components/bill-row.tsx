"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { Btn, NumField, Select, Field, useAction } from "@/components/ui";
import { receivePayment, voidBill } from "@/lib/ops";
import { isoTh, todayBkk } from "@/lib/dates";
import { BILL_STATUS_TH, METHOD_TH, balance, thb, type Bill, type Payment } from "@/lib/model";

export const billLink = (b: Pick<Bill, "publicToken">) => `${window.location.origin}/b/${b.publicToken}`;

/** Share the bill page (LINE etc. via the phone's share sheet) or copy the link. */
export async function shareBill(b: Bill): Promise<string> {
  const url = billLink(b);
  const text = `บิลห้อง ${b.roomNumber} ยอด ${thb(balance(b))} บาท ครบกำหนด ${isoTh(b.dueDate)}`;
  if (navigator.share) {
    try { await navigator.share({ title: text, text, url }); return ""; } catch { /* cancelled → fall back to copy */ }
  }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return "คัดลอกลิงก์บิลแล้ว วางในแชท LINE ได้เลย";
}

export default function BillRow({ bill }: { bill: Bill }) {
  const { property } = useProperty();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState<number | "">(balance(bill));
  const [method, setMethod] = useState<Payment["method"]>("transfer");
  const [bankRef, setBankRef] = useState("");
  const a = useAction();
  const open = bill.status === "unpaid" || bill.status === "partial";
  const overdue = open && bill.dueDate < todayBkk();
  const carriedNote = bill.status === "carried" ? ` · ค้าง ฿${thb(balance(bill))} ยกไปบิลถัดไป` : "";

  return (
    <li className="rounded-xl bg-surface p-3 ring-1 ring-black/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{bill.billNo}</p>
          <p className="text-xs text-muted">{isoTh(bill.periodStart)} – {isoTh(bill.periodEnd)} · ครบ {isoTh(bill.dueDate)}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">฿{thb(bill.total)}</p>
          <p className={`text-xs ${overdue ? "text-red-600" : bill.status === "paid" ? "text-emerald-700" : "text-amber-700"}`}>
            {overdue ? "เกินกำหนด" : BILL_STATUS_TH[bill.status]}{bill.status === "partial" && ` · ค้าง ฿${thb(balance(bill))}`}{carriedNote}
          </p>
        </div>
      </div>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-muted">รายการ</summary>
        <ul className="mt-1 space-y-0.5">
          {bill.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2"><span>{i.label}{i.qty !== 1 && ` (${i.qty} × ${thb(i.unitPrice)})`}</span><span>{thb(i.amount)}</span></li>
          ))}
        </ul>
      </details>

      {open && !paying && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Btn onClick={() => setPaying(true)}>รับชำระ</Btn>
          <Btn kind="ghost" onClick={() => a.run(() => shareBill(bill))}>ส่งบิล</Btn>
          <Btn kind="ghost" onClick={() => window.open(`/print/invoice/${bill.publicToken}`, "_blank")}>พิมพ์</Btn>
        </div>
      )}
      {!open && bill.status !== "void" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn kind="ghost" onClick={() => a.run(() => shareBill(bill))}>ส่งลิงก์บิล</Btn>
          <Btn kind="ghost" onClick={() => window.open(`/print/invoice/${bill.publicToken}`, "_blank")}>พิมพ์</Btn>
        </div>
      )}

      {paying && (
        <div className="mt-3 space-y-3">
          <NumField label="จำนวนเงิน (บาท)" value={amount} onChange={setAmount} />
          <Select label="วิธีชำระ" value={method} onChange={(v) => setMethod(v as Payment["method"])}
            options={Object.entries(METHOD_TH) as [string, string][]} />
          {method !== "cash" && <Field label="เลขอ้างอิง (ถ้ามี)" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />}
          <div className="grid grid-cols-2 gap-2">
            <Btn kind="ghost" onClick={() => setPaying(false)}>ยกเลิก</Btn>
            <Btn disabled={a.busy} onClick={() => a.run(async () => {
              const no = await receivePayment(property, bill.id, Number(amount), method, bankRef);
              setPaying(false);
              return `รับชำระแล้ว ใบเสร็จ ${no}`;
            })}>ยืนยันรับเงิน</Btn>
          </div>
        </div>
      )}
      {bill.status === "unpaid" && !paying && (
        <button className="mt-2 min-h-10 text-sm text-red-600" disabled={a.busy}
          onClick={() => confirm(`ยกเลิกบิล ${bill.billNo}?`) && a.run(async () => { await voidBill(property, bill); return "ยกเลิกบิลแล้ว"; })}>
          ยกเลิกบิลนี้
        </button>
      )}
      {a.view}
    </li>
  );
}
