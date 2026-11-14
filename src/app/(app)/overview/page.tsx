"use client";

import { useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Card, useAction } from "@/components/ui";
import { aging, buildAlerts, collectionByPeriod, forecast, periodsBack, reminderDraft, revenueMix, utilityMargin, vacancyDraft, type Alert } from "@/lib/insights";
import { daysOverdue } from "@/lib/thai-format";
import { daysLeftTs, monthRange, monthTh, periodOf, todayBkk } from "@/lib/dates";
import { balance, thb, type AuditLog, type Bill, type Expense, type Maintenance } from "@/lib/model";

const KIND = { rent: "ค่าเช่า", nightly: "ห้องรายวัน", elec: "ค่าไฟ", water: "ค่าน้ำ", internet: "อินเทอร์เน็ต", ac: "ค่าแอร์", parking: "ที่จอดรถ", other: "อื่นๆ", discount: "ส่วนลด" } as Record<string, string>;
const LEVEL = { urgent: "border-red-500 bg-red-50 text-red-900", warn: "border-amber-500 bg-amber-50 text-amber-900", info: "border-sky-500 bg-sky-50 text-sky-900" };
const ICON = { urgent: "⚠", warn: "●", info: "ℹ" };

/** Copyable message for an alert: reminder for overdue rooms, vacancy post for empty rooms. */
function AlertItem({ alert, draft }: { alert: Alert; draft: string }) {
  const a = useAction();
  return (
    <li className={`rounded-xl border-l-4 p-3 ${LEVEL[alert.level]} dark:bg-transparent dark:text-inherit`}>
      <p className="font-semibold"><span aria-hidden>{ICON[alert.level]} </span>{alert.title}</p>
      <p className="text-sm">{alert.detail}</p>
      {draft && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer underline">ข้อความพร้อมส่ง</summary>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-black">{draft}</p>
          <button className="mt-1 min-h-10 font-semibold underline" onClick={() => a.run(async () => { await navigator.clipboard.writeText(draft); return "คัดลอกแล้ว"; })}>คัดลอก</button>
        </details>
      )}
      {a.view}
    </li>
  );
}

/** One series (collected ÷ billed per month): single hue, value on hover, numbers repeated in the table below. */
function CollectionChart({ rows }: { rows: ReturnType<typeof collectionByPeriod> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.billed));
  return (
    <figure>
      <figcaption className="font-semibold">ออกบิล vs เก็บได้ 6 เดือน</figcaption>
      <p className="text-xs text-muted"><span className="inline-block h-2 w-3 rounded-sm bg-brand/25 align-middle" /> ออกบิล · <span className="inline-block h-2 w-3 rounded-sm bg-brand align-middle" /> เก็บได้</p>
      <div className="relative mt-2 flex h-40 items-end gap-2 border-b border-black/15" role="img" aria-label="กราฟยอดออกบิลและยอดเก็บได้รายเดือน (ตัวเลขอยู่ในตารางด้านล่าง)">
        {rows.map((r, i) => (
          <div key={r.period} className="relative flex h-full flex-1 items-end justify-center"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
            <div className="relative w-full max-w-10 rounded-t bg-brand/25" style={{ height: `${(r.billed / max) * 100}%` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t bg-brand" style={{ height: r.billed ? `${(Math.min(r.collected, r.billed) / r.billed) * 100}%` : 0 }} />
            </div>
            {hover === i && (
              <div className="absolute bottom-full z-10 mb-1 w-36 rounded-lg bg-surface p-2 text-xs shadow-lg ring-1 ring-black/10">
                <p className="font-semibold">{monthTh(r.period)}</p>
                <p>ออกบิล ฿{thb(r.billed)}</p><p>เก็บได้ ฿{thb(r.collected)} ({Math.round(r.rate * 100)}%)</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 text-center text-[11px] text-muted">{rows.map((r) => <span key={r.period} className="flex-1">{monthTh(r.period).split(" ")[0]}</span>)}</div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">ดูเป็นตาราง</summary>
        <table className="mt-1 w-full text-right">
          <thead><tr className="text-muted"><th className="text-left">เดือน</th><th>ออกบิล</th><th>เก็บได้</th><th>%</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.period}><td className="text-left">{monthTh(r.period)}</td><td>{thb(r.billed)}</td><td>{thb(r.collected)}</td><td>{Math.round(r.rate * 100)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

export default function OverviewPage() {
  const { property } = useProperty();
  const { rooms, leases, openBills, activeLease } = useData();
  const today = todayBkk();
  const period = periodOf(today);
  const periods = periodsBack(period, 6);
  const c = (n: string) => collection(db(), "properties", property.id, n);
  const bills = useLive<Bill>(query(c("bills"), where("period", ">=", periods[0])), `${property.id}/bills/p/${periods[0]}`);
  const maint = useLive<Maintenance>(query(c("maintenance"), where("status", "in", ["open", "in_progress"])), `${property.id}/maint/open`);
  const { start, end } = monthRange(period);
  const expenses = useLive<Expense>(query(c("expenses"), where("spentOn", ">=", start), where("spentOn", "<=", end)), `${property.id}/exp/${period}`);
  const logs = useLive<AuditLog>(query(c("auditLogs"), orderBy("at", "desc"), limit(15)), `${property.id}/audit`);

  const live = bills.filter((b) => b.status !== "void");
  const monthlyLeases = [...activeLease.values()].filter((l) => rooms.find((r) => r.id === l.roomId)?.billingCycle === "monthly").length;
  const billedThisPeriod = new Set(live.filter((b) => b.period === period && b.leaseId).map((b) => b.roomId)).size;
  const left = property.paidUntil ? daysLeftTs(property.paidUntil) : null;

  const alerts = buildAlerts({
    bills: openBills, leases, rooms, maintenance: maint, today, billedThisPeriod, monthlyLeases, daysLeft: left !== null && left > 3650 ? null : left,
  });

  const draftFor = (al: Alert) => {
    if (al.key.startsWith("due-")) {
      const list = openBills.filter((b) => b.roomId === al.roomId);
      if (!list.length) return "";
      const oldest = [...list].sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0];
      const days = daysOverdue(oldest.dueDate, new Date(`${today}T12:00:00`));
      return reminderDraft({ roomNumber: oldest.roomNumber, tenantName: oldest.tenantName, period: oldest.period, dueDate: oldest.dueDate,
        balance: list.reduce((s, b) => s + balance(b), 0) }, days, property).text;
    }
    if (al.key === "vacant") {
      const room = rooms.find((r) => r.status === "vacant" && r.kind === "monthly");
      return room ? vacancyDraft(room, property) : "";
    }
    return "";
  };

  const coll = collectionByPeriod(live, periods);
  const age = aging(openBills, new Date(`${today}T12:00:00`));
  const mix = revenueMix(live, [period]);
  const fc = forecast(leases, rooms, 5);
  const util = utilityMargin(live, period, property.elecCostPerUnit ?? 0, property.waterCostPerUnit ?? 0);
  const thisMonth = coll[coll.length - 1];
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const owed = openBills.reduce((s, b) => s + balance(b), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{property.name}</h1>

      <dl className="grid grid-cols-2 gap-2">
        <Card><dt className="text-sm text-muted">เข้าพัก</dt><dd className="text-2xl font-bold">{occupied}/{rooms.length}</dd></Card>
        <Card><dt className="text-sm text-muted">ค้างรับทั้งหมด</dt><dd className="text-2xl font-bold">฿{thb(owed)}</dd></Card>
        <Card><dt className="text-sm text-muted">เก็บได้ {monthTh(period)}</dt><dd className="text-2xl font-bold">฿{thb(thisMonth.collected)}</dd><dd className="text-xs text-muted">{Math.round(thisMonth.rate * 100)}% ของ ฿{thb(thisMonth.billed)}</dd></Card>
        <Card><dt className="text-sm text-muted">กำไรเดือนนี้ (เก็บได้ − จ่าย)</dt><dd className="text-2xl font-bold">฿{thb(thisMonth.collected - spent)}</dd><dd className="text-xs text-muted">ค่าใช้จ่าย ฿{thb(spent)}</dd></Card>
      </dl>

      <section>
        <h2 className="mb-2 font-semibold">ต้องจัดการ ({alerts.length})</h2>
        {alerts.length === 0 ? <p className="text-sm text-muted">ไม่มีเรื่องค้าง 👍</p>
          : <ul className="space-y-2">{alerts.map((al) => <AlertItem key={al.key} alert={al} draft={draftFor(al)} />)}</ul>}
      </section>

      <Card><CollectionChart rows={coll} /></Card>

      <Card>
        <h2 className="font-semibold">อายุหนี้ค้าง</h2>
        <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
          {([["not_due", "ยังไม่ถึงกำหนด"], ["1-30", "เกิน 1–30 วัน"], ["31-60", "31–60 วัน"], ["60+", "เกิน 60 วัน"]] as const).map(([k, label]) => (
            <div key={k}><dt className="text-xs text-muted">{label}</dt><dd className="font-bold">฿{thb(age[k])}</dd></div>
          ))}
        </dl>
      </Card>

      <details className="rounded-2xl bg-surface p-4 ring-1 ring-black/10">
        <summary className="cursor-pointer font-semibold">วิเคราะห์รายได้</summary>
        <h3 className="mt-3 text-sm font-semibold">รายได้ {monthTh(period)} แยกประเภท</h3>
        <ul className="mt-1 text-sm">
          {mix.map((m) => (
            <li key={m.kind} className="flex items-center gap-2 py-0.5">
              <span className="w-24">{KIND[m.kind] ?? m.kind}</span>
              <span className="h-2 rounded-r bg-brand" style={{ width: `${Math.max(2, (Math.abs(m.amount) / Math.max(1, mix[0]?.amount ?? 1)) * 50)}%` }} />
              <span className="ml-auto">฿{thb(m.amount)}</span>
            </li>
          ))}
          {!mix.length && <li className="text-muted">ยังไม่มีบิลเดือนนี้</li>}
        </ul>

        <h3 className="mt-4 text-sm font-semibold">ค่าน้ำค่าไฟ: เก็บจากผู้เช่า vs ต้นทุน</h3>
        {!property.elecCostPerUnit && !property.waterCostPerUnit
          ? <p className="text-sm text-muted">ตั้งต้นทุนต่อหน่วยที่ “เงิน &amp; อื่นๆ → ตั้งค่า” เพื่อดูส่วนต่าง</p>
          : (
            <table className="mt-1 w-full text-right text-sm">
              <thead><tr className="text-muted"><th className="text-left" /><th>หน่วย</th><th>เก็บ</th><th>ต้นทุน</th><th>ส่วนต่าง</th></tr></thead>
              <tbody>
                <tr><td className="text-left">ไฟ</td><td>{thb(util.elecUnits)}</td><td>{thb(util.elecBilled)}</td><td>{thb(util.elecCost)}</td><td>{thb(util.elecBilled - util.elecCost)}</td></tr>
                <tr><td className="text-left">น้ำ</td><td>{thb(util.waterUnits)}</td><td>{thb(util.waterBilled)}</td><td>{thb(util.waterCost)}</td><td>{thb(util.waterBilled - util.waterCost)}</td></tr>
              </tbody>
            </table>
          )}

        <h3 className="mt-4 text-sm font-semibold">คาดการณ์รายได้ประจำ</h3>
        <p className="text-sm">ต่อเดือน ฿{thb(fc.monthly)} จาก {fc.leases} สัญญา · ถ้าเต็มทุกห้อง +฿{thb(fc.vacantRent)}/เดือน</p>
        <table className="mt-1 w-full text-right text-sm">
          <thead><tr className="text-muted"><th className="text-left">ปี</th><th>ตามปัจจุบัน</th><th>ถ้าเต็ม</th></tr></thead>
          <tbody>{fc.rows.map((r) => <tr key={r.year}><td className="text-left">{r.year}</td><td>{thb(r.current)}</td><td>{thb(r.full)}</td></tr>)}</tbody>
        </table>
      </details>

      <details className="rounded-2xl bg-surface p-4 ring-1 ring-black/10">
        <summary className="cursor-pointer font-semibold">ความเคลื่อนไหวล่าสุด</summary>
        <ul className="mt-2 divide-y divide-black/5 text-sm">
          {logs.map((l) => (
            <li key={l.id} className="py-2">
              <p>{l.summary}</p>
              <p className="text-xs text-muted">{l.at ? new Date(l.at.toMillis()).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : ""}{l.actorName && ` · ${l.actorName}`}</p>
            </li>
          ))}
          {!logs.length && <li className="py-2 text-muted">ยังไม่มีรายการ</li>}
        </ul>
      </details>
    </div>
  );
}
