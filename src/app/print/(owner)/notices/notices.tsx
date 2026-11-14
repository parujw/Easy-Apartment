"use client";

// Overdue notices for the door — A4, 2 per sheet, one per room (several overdue bills on one notice).
// Same wording and layout as Wilai Communities V3 (/bills/notices).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import PrintBar from "@/components/print-bar";
import { todayBkk } from "@/lib/dates";
import { chunk, cycleLabel, cycleOf, daysOverdue, localPhone, reminderTone, thaiDate, type ReminderTone } from "@/lib/thai-format";

const FILTERS = [{ days: 1, label: "ค้างทุกห้อง" }, { days: 8, label: "เกิน 7 วัน" }, { days: 31, label: "เกิน 30 วัน" }];

const NOTICE_TITLE: Record<ReminderTone, string> = {
  gentle: "แจ้งเตือนการชำระค่าเช่า",
  firm: "แจ้งค้างชำระค่าเช่า",
  formal: "หนังสือทวงถามค่าเช่าค้างชำระ",
};
const NOTICE_BODY: Record<ReminderTone, string> = {
  gentle: "ทางหอพักขอแจ้งยอดค่าเช่าที่ครบกำหนดแล้วตามรายการด้านล่าง หากท่านชำระแล้ว ขออภัยและขอบคุณมาก",
  firm: "ยอดค่าเช่าตามรายการด้านล่างเลยกำหนดชำระแล้ว กรุณาชำระภายใน 3 วันนับจากวันที่ในใบนี้ หรือติดต่อแจ้งกำหนดวันชำระกับผู้ดูแล",
  formal: "ยอดค่าเช่าตามรายการด้านล่างค้างชำระเกินกว่า 30 วัน ขอให้ติดต่อผู้ดูแลเพื่อชำระหรือตกลงแผนการชำระภายใน 7 วันนับจากวันที่ในใบนี้ มิฉะนั้นทางหอพักจำเป็นต้องดำเนินการตามสัญญาเช่าต่อไป",
};

type Notice = { roomId: string; roomNo: string; tenantName: string; total: number; maxDays: number; tone: ReminderTone;
  bills: { id: string; cycle: string; dueDate: string; balance: number; days: number }[] };

export default function Notices() {
  const sp = useSearchParams();
  const { property } = useProperty();
  const { openBills } = useData();
  const min = sp.get("min");
  const room = sp.get("room");
  const minDays = /^\d{1,3}$/.test(min ?? "") ? Math.max(1, Number(min)) : 1;
  const today = new Date();
  const issued = todayBkk();

  const byRoom = new Map<string, Notice>();
  for (const b of openBills) {
    const balance = Math.round((b.total - b.paid) * 100) / 100;
    if (balance <= 0) continue;
    const days = daysOverdue(b.dueDate, today);
    if (days < minDays) continue;
    const n = byRoom.get(b.roomId) ?? { roomId: b.roomId, roomNo: b.roomNumber, tenantName: b.tenantName, bills: [], total: 0, maxDays: 0, tone: "gentle" as ReminderTone };
    n.bills.push({ id: b.id, cycle: cycleOf(b.periodStart), dueDate: b.dueDate, balance, days });
    n.total += balance;
    n.maxDays = Math.max(n.maxDays, days);
    byRoom.set(b.roomId, n);
  }
  const notices = [...byRoom.values()]
    .map((n) => ({ ...n, tone: reminderTone(n.maxDays), bills: n.bills.sort((a, b) => a.cycle.localeCompare(b.cycle)) }))
    .filter((n) => !room || n.roomNo === room)
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, "th", { numeric: true }));
  const phone = localPhone(property.phone);

  return (
    <main className="slips">
      <PrintBar backHref="/rooms" />
      <nav className="notice-filter">
        {FILTERS.map((f) => (
          <Link key={f.days} href={`/print/notices?min=${f.days}`} className={f.days === minDays ? "on" : ""}>{f.label}</Link>
        ))}
      </nav>
      {notices.length === 0 ? (
        <div className="empty">
          <p className="empty-title">ไม่มีห้องค้างชำระ</p>
          <p>ไม่มีบิลที่เลยกำหนดตามเงื่อนไขนี้</p>
          <Link href="/rooms" className="empty-link">กลับไปหน้าห้อง</Link>
        </div>
      ) : (
        chunk(notices, 2).map((page, i) => (
          <section className="page" key={i}>
            {page.map((n) => (
              <article className="slip notice" key={n.roomId}>
                <p className={`title ${n.tone}`}>{NOTICE_TITLE[n.tone]}</p>
                <p className="org">{property.name}{phone ? ` · โทร ${phone}` : ""}</p>
                <div className="meta">
                  <div>
                    <p className="room">ห้อง {n.roomNo}</p>
                    <p>เรียน {n.tenantName || "ผู้เช่า"}</p>
                  </div>
                  <p>วันที่ {thaiDate(issued, "full")}</p>
                </div>
                <p className="body">{NOTICE_BODY[n.tone]}</p>
                <table>
                  <thead>
                    <tr><th>รอบ</th><th>ครบกำหนด</th><th className="num">เกินมา</th><th className="num">ยอดค้าง (บาท)</th></tr>
                  </thead>
                  <tbody>
                    {n.bills.map((b) => (
                      <tr key={b.id}>
                        <td>{cycleLabel(b.cycle, "full")}</td>
                        <td>{thaiDate(b.dueDate)}</td>
                        <td className="num">{b.days} วัน</td>
                        <td className="num">{b.balance.toLocaleString("th-TH")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={3}>รวมยอดค้างชำระ</td><td className="num">{n.total.toLocaleString("th-TH")}</td></tr>
                  </tfoot>
                </table>
                {property.accountNo ? (
                  <p className="pay">
                    ชำระได้ที่ {property.payMethod} {property.accountNo}
                    {property.accountName ? ` (${property.accountName})` : ""}
                    {property.payNote ? ` · ${property.payNote}` : ""}
                  </p>
                ) : null}
                <div className="foot">
                  <span>หากชำระแล้ว โปรดแจ้งผู้ดูแลพร้อมหลักฐานการโอน</span>
                  <span>ผู้ดูแลหอพัก</span>
                </div>
              </article>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
