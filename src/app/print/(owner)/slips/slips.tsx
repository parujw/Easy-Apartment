"use client";

// Meter-reading slips for tenants — A4, 2 per sheet, same layout as Wilai Communities V3 (/meter/slips).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import PrintBar from "@/components/print-bar";
import SendToLine from "@/components/send-to-line";
import { addDays, todayBkk } from "@/lib/dates";
import { chunk, cycleLabel, localPhone, slipDueDate, thaiDate } from "@/lib/thai-format";
import type { MeterReading } from "@/lib/model";

const SLIPS_PER_PAGE = 2;
const DEFAULT_DUE_DAY = 25;
// No previous reading prints a dash, never 0 (0 makes tenants think the meter is broken)
const previousText = (v: number | null) => (v === null ? "—" : v.toLocaleString("th-TH"));

export default function Slips() {
  const sp = useSearchParams();
  const { property } = useProperty();
  const { rooms, activeLease, tenants } = useData();
  const today = todayBkk();
  const cycle = /^\d{6}$/.test(sp.get("cycle") ?? "") ? sp.get("cycle")! : today.slice(0, 7).replace("-", "");
  const dueDay = /^\d{1,2}$/.test(sp.get("due") ?? "") ? Number(sp.get("due")) : DEFAULT_DUE_DAY;
  const roomParam = sp.get("room");
  const dueDate = slipDueDate(cycle, dueDay);
  const since = addDays(today, -400);
  const readings = useLive<MeterReading>(
    query(collection(db(), "properties", property.id, "meterReadings"), where("readOn", ">=", since)), `${property.id}/slipread/${since}`);
  const cyclePeriod = `${cycle.slice(0, 4)}-${cycle.slice(4, 6)}`;

  const slips = rooms
    .filter((r) => activeLease.has(r.id) && (!roomParam || r.number === roomParam))
    .map((r) => {
      const tenant = tenants.get(activeLease.get(r.id)!.tenantId);
      const prev = readings
        .filter((m) => m.roomId === r.id && (m.period ?? m.readOn.slice(0, 7)) < cyclePeriod)
        .sort((a, b) => b.readOn.localeCompare(a.readOn))[0];
      return { roomNo: r.number, tenantName: tenant?.fullName ?? "", elecPrevious: prev?.elec ?? null, waterPrevious: prev?.water ?? null, readAt: prev?.readOn ?? null };
    })
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, "th", { numeric: true }));
  const phone = localPhone(property.phone);

  return (
    <main className="slips">
      <PrintBar backHref="/meters" />
      {slips.length === 0 ? (
        <div className="empty">
          <p className="empty-title">ยังไม่มีใบให้พิมพ์</p>
          <p>{roomParam ? `ไม่พบห้อง ${roomParam} ที่มีผู้เช่าอยู่` : "ห้องที่มีผู้เช่าและสัญญาอยู่เท่านั้นที่จะมีใบจดมิเตอร์"}</p>
          <Link href="/meters" className="empty-link">กลับไปหน้าออกบิล</Link>
        </div>
      ) : (
        chunk(slips, SLIPS_PER_PAGE).map((page, pageIndex) => (
          <section className="page" key={pageIndex}>
            {page.map((slip) => (
              <article className="slip" key={slip.roomNo}>
                <header className="slip-head">
                  <div>
                    <p className="title">ใบจดมิเตอร์น้ำ–ไฟ ด้วยตนเอง</p>
                    <p className="org">{property.name}{phone ? ` · โทร ${phone}` : ""}</p>
                  </div>
                  <div className="cycle">
                    <p className="cycle-label">รอบเดือน</p>
                    <p className="cycle-value">{cycleLabel(cycle, "full")}</p>
                  </div>
                </header>
                <div className="who">
                  <p className="room">ห้อง {slip.roomNo}</p>
                  <p className="tenant">{slip.tenantName}</p>
                  {dueDate ? <p className="due">ส่งคืนภายใน <strong>{thaiDate(dueDate, "full")}</strong></p> : null}
                </div>
                <table className="reads">
                  <thead>
                    <tr>
                      <th className="what">มิเตอร์</th>
                      <th className="prev">เลขครั้งก่อน{slip.readAt ? <span className="when"> ({thaiDate(slip.readAt)})</span> : null}</th>
                      <th className="fix">แก้ให้ถูก (ถ้าไม่ตรง)</th>
                      <th className="now">เลขครั้งนี้ — เขียนในช่องนี้</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="what">ไฟฟ้า <span className="unit">(หน่วย)</span></td>
                      <td className="prev">{previousText(slip.elecPrevious)}</td>
                      <td className="fix"><span className="box soft" /></td>
                      <td className="now"><span className="box" /></td>
                    </tr>
                    <tr>
                      <td className="what">น้ำ <span className="unit">(หน่วย)</span></td>
                      <td className="prev">{previousText(slip.waterPrevious)}</td>
                      <td className="fix"><span className="box soft" /></td>
                      <td className="now"><span className="box" /></td>
                    </tr>
                  </tbody>
                </table>
                <p className="hint">ช่อง <strong>แก้ให้ถูก</strong> เขียนเฉพาะกรณีเลขครั้งก่อนที่พิมพ์มาไม่ตรงกับหน้าปัดจริง ถ้าตรงอยู่แล้วเว้นว่างไว้</p>
                <div className="fill">
                  <span className="field">วันที่จด <span className="rule short" /></span>
                  <span className="field">ผู้จด <span className="rule" /></span>
                  <span className="field">โทร <span className="rule" /></span>
                </div>
                <div className="sign-row">
                  <span className="sign"><span className="sign-line" /><span className="sign-label">ลงชื่อผู้เช่า</span></span>
                  <span className="check"><span className="tick" /> มิเตอร์ชำรุด / อ่านเลขไม่ได้</span>
                </div>
                <SendToLine lineId={property.lineId} lineUrl={property.lineUrl} />
              </article>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
