"use client";

import { useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { Btn, NumField, Select, Field, useAction } from "@/components/ui";
import { deletePayment, editBill, receivePayment, voidBill } from "@/lib/ops";
import { total, type BillItem } from "@/lib/billing";
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

/** Send the bill to the tenant's LINE through the server (needs LINE set up + tenant linked). */
async function sendToLine(pid: string, bill: Bill): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  const token = await auth().currentUser?.getIdToken();
  const res = await fetch("/api/line/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ propertyId: pid, billId: bill.id, origin: window.location.origin }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "ส่ง LINE ไม่สำเร็จ");
  return "ส่งบิลเข้า LINE ผู้เช่าแล้ว";
}

const KIND_LABEL: Record<BillItem["kind"], string> = {
  rent: "ค่าเช่า", nightly: "ค่าห้องรายวัน", elec: "ค่าไฟ", water: "ค่าน้ำ", internet: "อินเทอร์เน็ต", ac: "ค่าเช่าแอร์",
  parking: "ที่จอดรถ", other: "อื่นๆ", prev_balance: "ยอดค้างยกมา", discount: "ส่วนลด",
};

/** Edit lines of an issued bill (wrong meter number, forgotten discount). Number of the bill stays. */
function BillEditor({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const { property } = useProperty();
  const [items, setItems] = useState<BillItem[]>(bill.items.map((i) => ({ ...i })));
  const a = useAction();
  const set = (k: number, patch: Partial<BillItem>) => setItems(items.map((it, i) => {
    if (i !== k) return it;
    const next = { ...it, ...patch };
    next.amount = Math.round(next.qty * next.unitPrice * 100) / 100;
    if (next.kind === "discount") next.amount = -Math.abs(next.amount);
    return next;
  }));
  return (
    <div className="mt-3 space-y-2">
      {items.map((it, k) => (
        <div key={k} className="grid grid-cols-[1fr_4.5rem_5.5rem_2.5rem] items-end gap-2">
          <Field label={KIND_LABEL[it.kind]} value={it.label} onChange={(e) => set(k, { label: e.target.value })} />
          <NumField label="จำนวน" value={it.qty} onChange={(v) => set(k, { qty: Number(v) || 0 })} />
          <NumField label="ราคา" value={Math.abs(it.unitPrice)} onChange={(v) => set(k, { unitPrice: Number(v) || 0 })} />
          <button aria-label="ลบรายการ" className="min-h-12 text-red-600" onClick={() => setItems(items.filter((_, i) => i !== k))}>✕</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 text-sm">
        {(["other", "discount"] as const).map((kind) => (
          <button key={kind} className="min-h-10 rounded-full px-3 ring-1 ring-black/15"
            onClick={() => setItems([...items, { kind, label: KIND_LABEL[kind], qty: 1, unitPrice: 0, amount: 0 }])}>+ {KIND_LABEL[kind]}</button>
        ))}
      </div>
      <p className="font-semibold">ยอดใหม่ ฿{thb(total(items))} {bill.paid > 0 && <span className="text-sm text-muted">(รับแล้ว ฿{thb(bill.paid)})</span>}</p>
      <div className="grid grid-cols-2 gap-2">
        <Btn kind="ghost" onClick={onDone}>ยกเลิก</Btn>
        <Btn disabled={a.busy} onClick={() => a.run(async () => { await editBill(property, bill, items); onDone(); return `แก้บิล ${bill.billNo} แล้ว`; })}>บันทึกการแก้ไข</Btn>
      </div>
      {a.view}
    </div>
  );
}

/** Receipts of this bill; the owner can remove one recorded by mistake. */
function Payments({ bill }: { bill: Bill }) {
  const { property, role } = useProperty();
  const list = useLive<Payment>(query(collection(db(), "properties", property.id, "payments"), where("billId", "==", bill.id)), `${property.id}/pay/${bill.id}`);
  const a = useAction();
  const owner = role === "owner";
  if (!list.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {list.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-2">
          <span>{p.receiptNo} · {isoTh(p.paidOn)} · {METHOD_TH[p.method] ?? p.method}</span>
          <span className="flex items-center gap-2">฿{thb(p.amount)}
            {owner && (
              <button aria-label={`ลบใบเสร็จ ${p.receiptNo}`} className="min-h-10 px-2 text-red-600" disabled={a.busy}
                onClick={() => confirm(`ลบใบเสร็จ ${p.receiptNo} ฿${thb(p.amount)}? ยอดในบิลจะกลับมาค้าง`) && a.run(async () => { await deletePayment(property, p); return "ลบใบเสร็จแล้ว"; })}>ลบ</button>
            )}
          </span>
        </li>
      ))}
      {a.view}
    </ul>
  );
}

export default function BillRow({ bill }: { bill: Bill }) {
  const { property } = useProperty();
  const [mode, setMode] = useState<"view" | "pay" | "edit">("view");
  const [amount, setAmount] = useState<number | "">(balance(bill));
  const [method, setMethod] = useState<Payment["method"]>("transfer");
  const [bankRef, setBankRef] = useState("");
  const a = useAction();
  const open = bill.status === "unpaid" || bill.status === "partial";
  const overdue = open && bill.dueDate < todayBkk();
  const carriedNote = bill.status === "carried" ? ` · ค้าง ฿${thb(balance(bill))} ยกไปบิลถัดไป` : "";
  const editable = bill.status !== "void" && bill.status !== "carried";

  return (
    <li className="rounded-xl bg-surface p-3 ring-1 ring-black/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{bill.billNo}</p>
          <p className="text-xs text-muted">{isoTh(bill.periodStart)} – {isoTh(bill.periodEnd)} · ครบ {isoTh(bill.dueDate)}</p>
          {bill.sentToLineAt && <p className="text-xs text-emerald-700">ส่ง LINE แล้ว</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">฿{thb(bill.total)}</p>
          <p className={`text-xs ${overdue ? "text-red-600" : bill.status === "paid" ? "text-emerald-700" : "text-amber-700"}`}>
            {overdue ? "เกินกำหนด" : BILL_STATUS_TH[bill.status]}{bill.status === "partial" && ` · ค้าง ฿${thb(balance(bill))}`}{carriedNote}
          </p>
        </div>
      </div>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-muted">รายการและใบเสร็จ</summary>
        <ul className="mt-1 space-y-0.5">
          {bill.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2"><span>{i.label}{i.qty !== 1 && ` (${i.qty} × ${thb(i.unitPrice)})`}</span><span>{thb(i.amount)}</span></li>
          ))}
        </ul>
        <Payments bill={bill} />
      </details>

      {mode === "edit" && <BillEditor bill={bill} onDone={() => setMode("view")} />}

      {mode === "view" && open && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Btn onClick={() => setMode("pay")}>รับชำระ</Btn>
          <Btn kind="ghost" onClick={() => a.run(() => shareBill(bill))}>ส่งบิล</Btn>
          <Btn kind="ghost" onClick={() => window.open(`/print/invoice/${bill.publicToken}`, "_blank")}>พิมพ์</Btn>
        </div>
      )}
      {mode === "view" && !open && bill.status !== "void" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn kind="ghost" onClick={() => a.run(() => shareBill(bill))}>ส่งลิงก์บิล</Btn>
          <Btn kind="ghost" onClick={() => window.open(`/print/invoice/${bill.publicToken}`, "_blank")}>พิมพ์</Btn>
        </div>
      )}

      {mode === "pay" && (
        <div className="mt-3 space-y-3">
          <NumField label="จำนวนเงิน (บาท)" value={amount} onChange={setAmount} />
          <Select label="วิธีชำระ" value={method} onChange={(v) => setMethod(v as Payment["method"])}
            options={(Object.entries(METHOD_TH) as [string, string][]).filter(([k]) => k !== "deposit")} />
          {method !== "cash" && <Field label="เลขอ้างอิง (ถ้ามี)" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />}
          <div className="grid grid-cols-2 gap-2">
            <Btn kind="ghost" onClick={() => setMode("view")}>ยกเลิก</Btn>
            <Btn disabled={a.busy} onClick={() => a.run(async () => {
              const no = await receivePayment(property, bill.id, Number(amount), method, bankRef);
              setMode("view");
              return `รับชำระแล้ว ใบเสร็จ ${no}`;
            })}>ยืนยันรับเงิน</Btn>
          </div>
        </div>
      )}
      {mode === "view" && (
        <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {editable && <button className="min-h-10 text-brand" onClick={() => setMode("edit")}>แก้บิล</button>}
          {open && <button className="min-h-10 text-brand" disabled={a.busy} onClick={() => a.run(() => sendToLine(property.id, bill))}>ส่งเข้า LINE</button>}
          {bill.status === "unpaid" && (
            <button className="min-h-10 text-red-600" disabled={a.busy}
              onClick={() => { const reason = prompt(`ยกเลิกบิล ${bill.billNo} — เหตุผล`); if (reason !== null) a.run(async () => { await voidBill(property, bill, reason); return "ยกเลิกบิลแล้ว"; }); }}>
              ยกเลิกบิลนี้
            </button>
          )}
        </div>
      )}
      {a.view}
    </li>
  );
}
