"use client";

import { use, useEffect, useState } from "react";
import QRCode from "qrcode";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { promptPayPayload } from "@/lib/promptpay";
import { isoTh } from "@/lib/dates";
import { thb } from "@/lib/model";
import type { BillItem } from "@/lib/billing";

type PublicBill = {
  property: { name: string; phone: string; address: string; promptpayId: string; accountName: string };
  roomNumber: string; tenantName: string; billNo: string; invoiceNo: string; periodStart: string; periodEnd: string;
  issueDate: string; dueDate: string; items: BillItem[]; total: number; paid: number; status: string;
};

export default function PublicBill({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [bill, setBill] = useState<PublicBill | null | "missing">(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    getDoc(doc(db(), "publicBills", token))
      .then((s) => setBill(s.exists() ? (s.data() as PublicBill) : "missing"))
      .catch(() => setBill("missing"));
  }, [token]);

  const due = bill && bill !== "missing" ? Math.round((bill.total - bill.paid) * 100) / 100 : 0;
  useEffect(() => {
    if (!bill || bill === "missing" || due <= 0 || !bill.property.promptpayId || bill.status === "carried") return;
    try {
      QRCode.toDataURL(promptPayPayload(bill.property.promptpayId, due), { margin: 1, width: 480 }).then(setQr);
    } catch { /* invalid PromptPay ID: show the bill without a QR */ }
  }, [bill, due]);

  if (bill === null) return <p className="p-6 text-muted">กำลังโหลด…</p>;
  if (bill === "missing") return <p className="p-6">ไม่พบบิลนี้ หรือบิลถูกยกเลิกแล้ว</p>;
  const paid = bill.status === "paid";
  const carried = bill.status === "carried";

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <article className="rounded-3xl bg-surface p-5 ring-1 ring-black/10">
        <header className="border-b border-black/10 pb-3">
          <h1 className="text-xl font-bold">{bill.property.name}</h1>
          {bill.property.address && <p className="text-sm text-muted">{bill.property.address}</p>}
          {bill.property.phone && <p className="text-sm text-muted">โทร {bill.property.phone.replace(/^\+66/, "0")}</p>}
        </header>
        <div className="mt-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted">{paid ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้"} {bill.invoiceNo}</p>
            <p className="text-lg font-semibold">ห้อง {bill.roomNumber}{bill.tenantName && ` · ${bill.tenantName}`}</p>
            <p className="text-sm text-muted">รอบ {isoTh(bill.periodStart)} – {isoTh(bill.periodEnd)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${paid ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
            {paid ? "ชำระแล้ว" : carried ? "ยกยอดไปบิลถัดไป" : bill.status === "partial" ? "ชำระบางส่วน" : "รอชำระ"}
          </span>
        </div>

        <table className="mt-4 w-full text-sm">
          <tbody>
            {bill.items.map((i, k) => (
              <tr key={k} className="border-b border-black/5">
                <td className="py-2">{i.label}{i.qty !== 1 && <span className="text-muted"> ({i.qty} × {thb(i.unitPrice)})</span>}</td>
                <td className="py-2 text-right">{thb(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="font-semibold">ยอดรวม</span>
          <span className="text-2xl font-bold">฿{thb(bill.total)}</span>
        </div>
        {bill.paid > 0 && !paid && <p className="text-right text-sm">ชำระแล้ว ฿{thb(bill.paid)} · คงเหลือ <b>฿{thb(due)}</b></p>}

        {carried && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">ยอดค้าง ฿{thb(due)} ของบิลนี้ถูกรวมไว้ในบิลรอบถัดไปแล้ว กรุณาชำระตามบิลใหม่</p>}
        {!paid && !carried && (
          <section className="mt-5 rounded-2xl bg-emerald-50 p-4 text-center text-emerald-950">
            <p className="font-semibold">ชำระภายใน {isoTh(bill.dueDate)}</p>
            {qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={`QR PromptPay ยอด ${thb(due)} บาท`} className="mx-auto mt-3 w-56 rounded-xl bg-white p-2" />
                <p className="mt-2 text-sm">สแกนจ่ายด้วยแอปธนาคาร ยอด ฿{thb(due)}</p>
                {bill.property.accountName && <p className="text-sm">ชื่อบัญชี {bill.property.accountName}</p>}
              </>
            ) : (
              <p className="mt-2 text-sm">ติดต่อผู้ดูแลเพื่อชำระเงิน</p>
            )}
            <p className="mt-2 text-xs">โอนแล้วส่งสลิปให้ผู้ดูแลทาง LINE</p>
          </section>
        )}
        <p className="mt-4 text-center text-xs text-muted">ออกเมื่อ {isoTh(bill.issueDate)} · {bill.billNo} · ส่งบิลด้วย Easy Apartment</p>
      </article>
      <a href={`/print/invoice/${token}`} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-brand font-semibold text-white print:hidden">พิมพ์ใบแจ้งหนี้ A4 / บันทึก PDF</a>
    </main>
  );
}
