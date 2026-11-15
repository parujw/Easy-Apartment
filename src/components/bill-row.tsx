"use client";

import { useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { Btn, NumField, Select, Field, useAction } from "@/components/ui";
import { deletePayment, editBill, receivePayment, voidBill } from "@/lib/ops";
import { amountItem, meterItem, parseMeterLabel, total, type BillItem } from "@/lib/billing";
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

/** Editor row kept as text so people can clear a box, type decimals, etc. Converted on save. */
type EditRow = {
  kind: BillItem["kind"]; label: string; qty: string; price: string;
  meter: { base: string; prev: string; curr: string } | null;
};

const toRow = (i: BillItem): EditRow => {
  const m = i.kind === "elec" || i.kind === "water" ? parseMeterLabel(i.label) : null;
  return { kind: i.kind, label: i.label, qty: String(i.qty), price: String(Math.abs(i.unitPrice)),
    meter: m ? { base: m.base, prev: String(m.prev), curr: String(m.curr) } : null };
};
const numOf = (s: string, what: string) => {
  const v = Number(s.replace(/,/g, "").trim());
  if (s.trim() === "" || !Number.isFinite(v)) throw new Error(`กรอก${what}ให้เป็นตัวเลข`);
  return v;
};
function toItem(r: EditRow): BillItem {
  const name = r.meter?.base ?? r.label.trim();
  if (r.meter) return meterItem(r.kind as "elec" | "water", r.meter.base, numOf(r.meter.prev, `เลขก่อน (${name})`), numOf(r.meter.curr, `เลขหลัง (${name})`), numOf(r.price, `ราคาต่อหน่วย (${name})`));
  if (!r.label.trim()) throw new Error("กรอกชื่อรายการให้ครบ");
  return amountItem(r.kind, r.label.trim(), numOf(r.qty, `จำนวน (${name})`), numOf(r.price, `จำนวนเงิน (${name})`));
}
const tryTotal = (rows: EditRow[]) => { try { return { sum: total(rows.map(toItem)), err: "" }; } catch (e) { return { sum: NaN, err: (e as Error).message }; } };

const box = "mt-1 block w-full min-h-12 rounded-xl border border-black/15 bg-surface px-3 text-base";

/** Edit an issued bill: meter lines by readings (before → after), other lines by amount. Bill number stays. */
function BillEditor({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const { property } = useProperty();
  const [rows, setRows] = useState<EditRow[]>(bill.items.map(toRow));
  const a = useAction();
  const set = (k: number, patch: Partial<EditRow>) => setRows(rows.map((r, i) => (i === k ? { ...r, ...patch } : r)));
  const setMeter = (k: number, patch: Partial<NonNullable<EditRow["meter"]>>) => setRows(rows.map((r, i) => (i === k && r.meter ? { ...r, meter: { ...r.meter, ...patch } } : r)));
  const { sum, err } = tryTotal(rows);

  async function save() {
    const items = rows.map(toItem);
    const after = (kind: "elec" | "water") => { const r = rows.find((x) => x.kind === kind && x.meter); return r ? Number(r.meter!.curr) : undefined; };
    const before = (kind: "elec" | "water") => { const i = bill.items.find((x) => x.kind === kind); return i ? parseMeterLabel(i.label)?.curr : undefined; };
    const meter: { elec?: number; water?: number } = {};
    if (after("elec") !== undefined && after("elec") !== before("elec")) meter.elec = after("elec");
    if (after("water") !== undefined && after("water") !== before("water")) meter.water = after("water");
    await editBill(property, bill, items, bill.note ?? "", meter);
    onDone();
    return `แก้บิล ${bill.billNo} แล้ว · ฿${thb(total(items))}`;
  }

  return (
    <div className="mt-3 space-y-3">
      {rows.map((r, k) => (
        <div key={k} className="rounded-xl p-3 ring-1 ring-black/10">
          <div className="flex items-center justify-between gap-2">
            {r.meter || r.kind === "prev_balance"
              ? <p className="font-semibold">{r.meter ? r.meter.base : r.label}</p>
              : <input aria-label="ชื่อรายการ" className={`${box} mt-0 font-semibold`} value={r.label} onChange={(e) => set(k, { label: e.target.value })} />}
            {r.kind !== "prev_balance" && (
              <button type="button" aria-label={`ลบ ${r.meter?.base ?? r.label}`} className="min-h-12 min-w-12 text-red-600" onClick={() => setRows(rows.filter((_, i) => i !== k))}>✕</button>
            )}
          </div>
          {r.meter ? (
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <label>เลขก่อน<input className={box} inputMode="decimal" value={r.meter.prev} onChange={(e) => setMeter(k, { prev: e.target.value })} /></label>
              <label>เลขหลัง<input className={box} inputMode="decimal" value={r.meter.curr} onChange={(e) => setMeter(k, { curr: e.target.value })} /></label>
              <label>บาท/หน่วย<input className={box} inputMode="decimal" value={r.price} onChange={(e) => set(k, { price: e.target.value })} /></label>
              <p className="col-span-3 text-muted">{(() => { try { const it = toItem(r); return `${it.qty} หน่วย × ${thb(it.unitPrice)} = ฿${thb(it.amount)}`; } catch (e) { return (e as Error).message; } })()}</p>
            </div>
          ) : r.kind === "prev_balance" ? (
            <p className="mt-1 text-sm text-muted">฿{thb(Number(r.price) * Number(r.qty))} · ยอดค้างจากบิลก่อน แก้ที่บิลเดิม</p>
          ) : r.qty !== "1" ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <label>จำนวน<input className={box} inputMode="decimal" value={r.qty} onChange={(e) => set(k, { qty: e.target.value })} /></label>
              <label>ราคาต่อหน่วย<input className={box} inputMode="decimal" value={r.price} onChange={(e) => set(k, { price: e.target.value })} /></label>
            </div>
          ) : (
            <label className="mt-2 block text-sm">{r.kind === "discount" ? "ส่วนลด (บาท)" : "จำนวนเงิน (บาท)"}
              <input className={box} inputMode="decimal" value={r.price} onChange={(e) => set(k, { price: e.target.value })} />
            </label>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2 text-sm">
        {(["other", "discount"] as const).map((kind) => (
          <button key={kind} type="button" className="min-h-12 rounded-xl px-4 ring-1 ring-black/15"
            onClick={() => setRows([...rows, { kind, label: KIND_LABEL[kind], qty: "1", price: "", meter: null }])}>+ {KIND_LABEL[kind]}</button>
        ))}
      </div>
      <p className="font-semibold">
        {err ? <span className="text-red-600">{err}</span> : <>ยอดใหม่ ฿{thb(sum)} <span className="text-sm font-normal text-muted">(เดิม ฿{thb(bill.total)}{bill.paid > 0 && ` · รับแล้ว ฿${thb(bill.paid)}`})</span></>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Btn kind="ghost" onClick={onDone}>ยกเลิก</Btn>
        <Btn disabled={a.busy || !!err} onClick={() => a.run(save)}>บันทึกการแก้ไข</Btn>
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
