"use client";

// A4 invoice — same markup and CSS as Wilai Communities V3 (/invoice/[billId]/print),
// rendered from the bill's public snapshot so the tenant's link and the owner's print are the same document.
import { use, useEffect, useState } from "react";
import QRCode from "qrcode";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { promptPayPayload } from "@/lib/promptpay";
import { BILL_STATUS_LABEL, baht, cycleLabel, cycleOf, localPhone, thaiDate } from "@/lib/thai-format";
import PrintBar from "@/components/print-bar";

/** "ค่าไฟ (8862 → 8937)": the arrow is drawn, not typed — server PDFs have no font with "→" and showed a box. */
function Arrowed({ text }: { text: string }) {
  const parts = text.split("→");
  return <span style={parts.length > 1 ? { whiteSpace: "nowrap" } : undefined}>{parts.map((p, i) => <span key={i}>{i > 0 && <svg width="0.85em" height="0.6em" viewBox="0 0 14 10" style={{ margin: "0 .25em", verticalAlign: "0.05em" }} aria-label="ถึง"><path d="M1 5h11M8 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}{p}</span>)}</span>;
}
import type { BillItem } from "@/lib/billing";

type PublicBill = {
  property: { name: string; nameEn?: string; phone: string; address: string; promptpayId: string; accountName: string;
    accountNo?: string; payMethod?: string; payReference?: string; payNote?: string; preparedBy?: string };
  roomNumber: string; tenantName: string; tenantPhone?: string; paidOn?: string | null; billNo: string; invoiceNo: string;
  periodStart: string; issueDate: string; dueDate: string; items: BillItem[]; total: number; paid: number; status: string;
};

const STATUS_CLASS: Record<string, string> = {
  paid: "pill-paid", partial: "pill-partial", unpaid: "pill-unpaid", void: "pill-void", carried: "pill-void",
};

export default function InvoicePrint({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [bill, setBill] = useState<PublicBill | null | "missing">(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    getDoc(doc(db(), "publicBills", token))
      .then((s) => setBill(s.exists() ? (s.data() as PublicBill) : "missing"))
      .catch(() => setBill("missing"));
  }, [token]);

  useEffect(() => {
    if (!bill || bill === "missing" || !bill.property.promptpayId) return;
    const balance = Math.max(0, bill.total - bill.paid);
    try {
      // Amount filled in while something is owed; a plain account QR once paid (like the original card).
      QRCode.toDataURL(promptPayPayload(bill.property.promptpayId, balance > 0 && bill.status !== "carried" ? balance : undefined),
        { margin: 1, width: 480 }).then(setQr);
    } catch { /* invalid PromptPay ID: no QR */ }
  }, [bill]);

  if (bill === null) return <p style={{ padding: 24 }}>กำลังโหลด…</p>;
  if (bill === "missing") return <p style={{ padding: 24 }}>ไม่พบใบแจ้งหนี้นี้ หรือบิลถูกยกเลิกแล้ว</p>;

  const property = bill.property;
  const cycle = cycleOf(bill.periodStart);
  const balance = Math.round((bill.total - bill.paid) * 100) / 100;
  const phone = localPhone(property.phone);
  const reference = (property.payReference ?? "").trim() || bill.billNo;

  return (
    <main className="sheet">
      <PrintBar backHref={`/b/${token}`} pdfHref={`/api/pdf/invoice/${token}`} />

      {/* the whole sheet is a table so the header repeats on every printed page */}
      <table className="doc">
        <thead>
          <tr>
            <td>
              <header className="head">
                <div>
                  <h1 className="brand">
                    {property.nameEn ? `${property.nameEn} / ` : ""}
                    {property.name}
                  </h1>
                  <p className="sub">{[property.address, phone ? `โทร ${phone}` : ""].filter(Boolean).join("  ·  ")}</p>
                  <p className="doctype">ใบแจ้งหนี้ / INVOICE</p>
                </div>
                <div className="head-right">
                  <p className="invno">{bill.invoiceNo}</p>
                  <dl className="meta">
                    <div><dt>วันที่ออก</dt><dd>{thaiDate(bill.issueDate)}</dd></div>
                    <div><dt>ค่าเช่าเดือน</dt><dd>{cycleLabel(cycle, "full")}</dd></div>
                    <div><dt>ครบกำหนด</dt><dd>{thaiDate(bill.dueDate)}</dd></div>
                  </dl>
                  <p><span className={`pill ${STATUS_CLASS[bill.status] ?? "pill-unpaid"}`}>{BILL_STATUS_LABEL[bill.status] ?? bill.status}</span></p>
                </div>
              </header>
              <div className="rule" />
            </td>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>
              <section className="cards">
                <div className="card">
                  <p className="card-title">ข้อมูลผู้เช่า</p>
                  <div className="row"><span>ชื่อ-นามสกุล</span><strong>{bill.tenantName}</strong></div>
                  <div className="row"><span>เลขที่ห้อง</span><strong>ห้อง {bill.roomNumber}</strong></div>
                  {bill.tenantPhone ? <div className="row"><span>โทรศัพท์</span><strong>{bill.tenantPhone}</strong></div> : null}
                </div>
                <div className="card">
                  <p className="card-title">สรุปการชำระ</p>
                  <div className="row"><span>ยอดรวม</span><strong>฿{baht(bill.total)}</strong></div>
                  <div className="row"><span>ชำระแล้ว</span><strong className="ok">฿{baht(bill.paid)}</strong></div>
                  <div className="row"><span>คงค้าง</span><strong className={balance > 0 ? "due" : "ok"}>฿{baht(balance)}</strong></div>
                  <div className="row"><span>วันชำระ</span><strong>{bill.paidOn ? thaiDate(bill.paidOn) : "—"}</strong></div>
                </div>
              </section>

              <table className="items">
                <thead>
                  <tr><th>รายการ</th><th className="amount">จำนวน (฿)</th></tr>
                </thead>
                <tbody>
                  {bill.items.map((line, i) => (
                    <tr key={`${line.kind}-${i}`}>
                      <td>
                        <Arrowed text={line.label} />
                        {line.kind === "rent" ? ` — เดือน${cycleLabel(cycle, "full")}` : null}
                        {line.qty !== 1 ? <span className="qty"> · {line.qty} หน่วย × {line.unitPrice} บาท</span> : null}
                      </td>
                      <td className="amount">{baht(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grand"><span>ยอดรวมทั้งสิ้น</span><strong>฿{baht(bill.total)}</strong></div>

              <section className="pay">
                {qr ? (
                  <div className="thaiqr">
                    <p className="thaiqr-head">THAI QR PAYMENT</p>
                    <p className="thaiqr-pp">PromptPay</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR พร้อมเพย์" />
                  </div>
                ) : null}
                <div className="pay-body">
                  <p className="pay-title">ชำระผ่าน {property.payMethod || "โอนธนาคาร"}</p>
                  {property.accountName ? <p>ชื่อบัญชี: <strong>{property.accountName}</strong></p> : null}
                  {property.accountNo ? <p>เลขบัญชี: {property.accountNo}</p> : null}
                  <p>เลขที่อ้างอิง: {reference}</p>
                  {property.payNote ? <p className="muted">{property.payNote}</p> : null}
                </div>
              </section>

              <aside className="notice">
                <p>กรุณาชำระเงินภายในวันที่ <strong>{thaiDate(bill.dueDate)}</strong> และส่งหลักฐานการชำระเงินผ่าน LINE</p>
                <p>หากมีข้อสงสัย กรุณาติดต่อผู้จัดการ{property.name} ก่อนวันครบกำหนดชำระ{phone ? `  ·  โทร ${phone}` : ""}</p>
              </aside>

              <section className="signs">
                <div>
                  <p className="line" />
                  <p className="role">ผู้จัดทำ / Prepared by</p>
                  <p className="who">{property.preparedBy || "ผู้จัดการ"}</p>
                </div>
                <div>
                  <p className="line" />
                  <p className="role">ผู้เช่ารับทราบ / Tenant</p>
                  <p className="who">{bill.tenantName}</p>
                </div>
              </section>

              <footer className="foot">
                <span>{property.name} · {bill.billNo}</span>
                <span>ออกโดยระบบ Easy Apartment</span>
              </footer>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}
