"use client";

import { useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Card, Field, NumField, Select, useAction } from "@/components/ui";
import { addRooms, roomDefaults, setMaintenanceStatus, updateProperty } from "@/lib/ops";
import { promptPayPayload } from "@/lib/promptpay";
import { parseRoomNumbers } from "@/lib/rooms";
import { billedRevenue } from "@/lib/carry";
import { PLANS } from "@/lib/plans";
import { dateTh, daysLeftTs, isoTh, monthRange, monthTh, periodOf, todayBkk } from "@/lib/dates";
import { KIND_TH, METHOD_TH, balance, thb, type Expense, type Maintenance, type Payment, type Room } from "@/lib/model";

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-2xl bg-surface ring-1 ring-black/10 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-14 cursor-pointer items-center justify-between px-4 font-semibold">{title}<span className="text-muted">›</span></summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

const csv = (rows: (string | number)[][]) => "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

function MonthSummary() {
  const { property } = useProperty();
  const { bills, openBills } = useData();
  const [period, setPeriod] = useState(periodOf(todayBkk()));
  const { start, end } = monthRange(period);
  const c = (n: string) => collection(db(), "properties", property.id, n);
  const payments = useLive<Payment>(query(c("payments"), where("paidOn", ">=", start), where("paidOn", "<=", end)), `${property.id}/pay/${period}`);
  const expenses = useLive<Expense>(query(c("expenses"), where("spentOn", ">=", start), where("spentOn", "<=", end)), `${property.id}/exp/${period}`);
  const billed = billedRevenue(bills.filter((b) => b.period === period));
  const got = payments.reduce((s, p) => s + p.amount, 0);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const owed = openBills.reduce((s, b) => s + balance(b), 0);

  function download() {
    const rows: (string | number)[][] = [["ประเภท", "วันที่", "ห้อง", "เลขที่", "รายละเอียด", "จำนวนเงิน"]];
    for (const b of bills.filter((x) => x.period === period)) rows.push(["บิล", b.issueDate, b.roomNumber, b.billNo, b.tenantName, b.total]);
    for (const p of payments) rows.push(["รับเงิน", p.paidOn, p.roomNumber, p.receiptNo, METHOD_TH[p.method], p.amount]);
    for (const e of expenses) rows.push(["ค่าใช้จ่าย", e.spentOn, "", "", `${e.category}: ${e.description}`, -e.amount]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }));
    a.download = `easy-apartment-${period}.csv`;
    a.click();
  }

  return (
    <Section title={`สรุป ${monthTh(period)}`} open>
      <input type="month" aria-label="เดือน" className="mb-3 min-h-12 rounded-xl border border-black/15 bg-surface px-2" value={period} onChange={(e) => setPeriod(e.target.value)} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted">ออกบิล (ไม่รวมยอดยกมา)</dt><dd className="text-lg font-bold">฿{thb(billed)}</dd></div>
        <div><dt className="text-muted">รับเงินแล้ว</dt><dd className="text-lg font-bold text-emerald-700">฿{thb(got)}</dd></div>
        <div><dt className="text-muted">ค่าใช้จ่าย</dt><dd className="text-lg font-bold">฿{thb(spent)}</dd></div>
        <div><dt className="text-muted">คงเหลือ (รับ − จ่าย)</dt><dd className="text-lg font-bold">฿{thb(got - spent)}</dd></div>
        <div className="col-span-2"><dt className="text-muted">ค้างรับทั้งหมด (ทุกเดือน)</dt><dd className="text-lg font-bold text-amber-700">฿{thb(owed)}</dd></div>
      </dl>
      {payments.length > 0 && (
        <ul className="mt-3 divide-y divide-black/5 text-sm">
          {[...payments].sort((a, b) => b.paidOn.localeCompare(a.paidOn)).map((p) => (
            <li key={p.id} className="flex justify-between py-2"><span>{isoTh(p.paidOn)} · ห้อง {p.roomNumber} · {METHOD_TH[p.method]}</span><span>฿{thb(p.amount)}</span></li>
          ))}
        </ul>
      )}
      {expenses.length > 0 && (
        <ul className="mt-3 divide-y divide-black/5 text-sm">
          {expenses.map((e) => <li key={e.id} className="flex justify-between py-2"><span>{isoTh(e.spentOn)} · {e.description}</span><span>−฿{thb(e.amount)}</span></li>)}
        </ul>
      )}
      <Btn kind="ghost" className="mt-3 w-full" onClick={download}>ดาวน์โหลด Excel (CSV)</Btn>
    </Section>
  );
}

function MaintenanceSection() {
  const { property } = useProperty();
  const jobs = useLive<Maintenance>(
    query(collection(db(), "properties", property.id, "maintenance"), where("status", "in", ["open", "in_progress"])),
    `${property.id}/maint/open`);
  const [cost, setCost] = useState<Record<string, number | "">>({});
  const a = useAction();
  return (
    <Section title={`งานซ่อมค้าง (${jobs.length})`}>
      {jobs.length === 0 && <p className="text-sm text-muted">ไม่มีงานซ่อมค้าง · แจ้งซ่อมได้จากปุ่ม + มุมขวาล่าง</p>}
      <ul className="space-y-2">
        {[...jobs].sort((x, y) => x.no.localeCompare(y.no)).map((m) => (
          <li key={m.id} className="rounded-xl p-3 ring-1 ring-black/10">
            <p className="font-semibold">ห้อง {m.roomNumber} · {m.problem}</p>
            <p className="text-xs text-muted">{m.no} · {m.category} · {m.priority === "normal" ? "ปกติ" : m.priority === "urgent" ? "ด่วน" : "ด่วนมาก"} · {m.status === "open" ? "รอดำเนินการ" : "กำลังซ่อม"}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {m.status === "open" && <Btn kind="ghost" disabled={a.busy} onClick={() => a.run(() => setMaintenanceStatus(property.id, m, "in_progress"))}>เริ่มซ่อม</Btn>}
              <NumField label="ค่าซ่อม (บาท)" value={cost[m.id] ?? ""} onChange={(v) => setCost({ ...cost, [m.id]: v })} />
              <Btn disabled={a.busy} onClick={() => a.run(async () => {
                await setMaintenanceStatus(property.id, m, "done", Number(cost[m.id] || 0));
                return cost[m.id] ? "ปิดงานแล้ว บันทึกค่าซ่อมเป็นค่าใช้จ่าย" : "ปิดงานแล้ว";
              })}>ซ่อมเสร็จ</Btn>
            </div>
          </li>
        ))}
      </ul>
      {a.view}
    </Section>
  );
}

function RoomsSection() {
  const { property } = useProperty();
  const { rooms } = useData();
  const [f, setF] = useState({ numbers: "", floor: "", kind: "monthly", rent: "" as number | "" });
  const a = useAction();
  const plan = PLANS[property.plan];
  return (
    <Section title={`ห้องพัก (${rooms.length}/${plan.maxRooms})`}>
      <p className="mb-3 text-sm text-muted">แก้ไขห้องเดิม: แตะห้องในแท็บ “ห้อง” แล้วเลือก “แก้ไขห้อง”</p>
      <div className="space-y-3">
        <Field label="เลขห้องที่จะเพิ่ม" placeholder="เช่น 101-105, 201" value={f.numbers} onChange={(e) => setF({ ...f, numbers: e.target.value })} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="ชั้น" value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} />
          <Select label="ประเภท" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={Object.entries(KIND_TH)} />
          <NumField label={f.kind === "monthly" ? "ค่าเช่า/เดือน" : "ราคา/คืน"} value={f.rent} onChange={(v) => setF({ ...f, rent: v })} />
        </div>
        <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
          const nums = parseRoomNumbers(f.numbers);
          if (!nums.length) throw new Error("กรุณากรอกเลขห้อง");
          const dup = nums.filter((n) => rooms.some((r) => r.number === n));
          if (dup.length) throw new Error(`มีห้องนี้แล้ว: ${dup.join(", ")}`);
          if (rooms.length + nums.length > plan.maxRooms) throw new Error(`แพ็กเกจ ${plan.name} รองรับสูงสุด ${plan.maxRooms} ห้อง`);
          if (f.kind !== "monthly" && !plan.dailyRooms) throw new Error("ห้องรายวัน/Airbnb ใช้ได้ตั้งแต่แพ็กเกจ Pro");
          await addRooms(property.id, nums.map((n) => roomDefaults(n, f.floor.trim() || n.slice(0, -2) || "1", f.kind as Room["kind"], Number(f.rent || 0))));
          setF({ ...f, numbers: "" });
          return `เพิ่ม ${nums.length} ห้องแล้ว`;
        })}>เพิ่มห้อง</Btn>
      </div>
      {a.view}
    </Section>
  );
}

function SettingsSection() {
  const { property } = useProperty();
  const [f, setF] = useState({
    name: property.name, phone: property.phone.replace(/^\+66/, "0"), address: property.address,
    promptpayId: property.promptpayId, accountName: property.accountName, docPrefix: property.docPrefix,
    nameEn: property.nameEn ?? "", preparedBy: property.preparedBy ?? "", payMethod: property.payMethod ?? "",
    accountNo: property.accountNo ?? "", payReference: property.payReference ?? "", payNote: property.payNote ?? "",
    lineId: property.lineId ?? "", lineUrl: property.lineUrl ?? "",
  });
  const a = useAction();
  return (
    <Section title="ตั้งค่าหอพัก">
      <div className="space-y-3">
        <Field label="ชื่อหอพัก/โรงแรม" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="เบอร์โทร (แสดงบนบิล)" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Field label="ที่อยู่ (แสดงบนบิล)" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Field label="PromptPay (เบอร์มือถือหรือเลขบัตร)" inputMode="numeric" value={f.promptpayId} onChange={(e) => setF({ ...f, promptpayId: e.target.value })} />
        <Field label="ชื่อบัญชีผู้รับเงิน" value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} />
        <Field label="อักษรนำหน้าเลขใบแจ้งหนี้" value={f.docPrefix} onChange={(e) => setF({ ...f, docPrefix: e.target.value.toUpperCase() })} />
        <p className="pt-2 text-sm font-semibold">หัวและท้ายใบแจ้งหนี้</p>
        <Field label="ชื่อภาษาอังกฤษ (หัวใบ เช่น WILAI PLACE)" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
        <Field label="ผู้จัดทำ (ท้ายใบ)" placeholder="ผู้จัดการ" value={f.preparedBy} onChange={(e) => setF({ ...f, preparedBy: e.target.value })} />
        <Field label="ช่องทางชำระ (เช่น PromptPay / KBank)" value={f.payMethod} onChange={(e) => setF({ ...f, payMethod: e.target.value })} />
        <Field label="เลขบัญชีที่แสดงบนใบ" value={f.accountNo} onChange={(e) => setF({ ...f, accountNo: e.target.value })} />
        <Field label="เลขที่อ้างอิง (เว้นว่าง = ใช้เลขบิล)" value={f.payReference} onChange={(e) => setF({ ...f, payReference: e.target.value })} />
        <Field label="ข้อความใต้ช่องชำระ" placeholder="กรุณาส่งสลิปหลังโอนผ่าน LINE" value={f.payNote} onChange={(e) => setF({ ...f, payNote: e.target.value })} />
        <p className="pt-2 text-sm font-semibold">LINE ที่ผู้เช่าส่งใบจดมิเตอร์/สลิปกลับมา</p>
        <Field label="LINE ID (เช่น @933yhkou)" value={f.lineId} onChange={(e) => setF({ ...f, lineId: e.target.value })} />
        <Field label="ลิงก์เพิ่มเพื่อน (https://lin.ee/…)" value={f.lineUrl} onChange={(e) => setF({ ...f, lineUrl: e.target.value })} />
        <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
          if (f.promptpayId.trim()) promptPayPayload(f.promptpayId); // throws a Thai message if the ID is invalid
          if (f.lineUrl && !/^https:\/\//.test(f.lineUrl)) throw new Error("ลิงก์ LINE ต้องขึ้นต้นด้วย https://");
          await updateProperty(property.id, { ...f, name: f.name.trim(), promptpayId: f.promptpayId.replace(/\D/g, "") });
          return "บันทึกแล้ว บิลที่ออกต่อจากนี้ใช้ข้อมูลใหม่";
        })}>บันทึก</Btn>
      </div>
      {a.view}
    </Section>
  );
}

function PlanSection() {
  const { property } = useProperty();
  const left = daysLeftTs(property.paidUntil);
  return (
    <Section title={`แพ็กเกจ ${PLANS[property.plan].name}`}>
      <p className="text-sm">
        {!property.paidUntil ? "ยังไม่ได้เปิดใช้งาน"
          : left > 3650 ? "ใช้ฟรี ไม่มีวันหมดอายุ"
          : `หมดอายุ ${dateTh(property.paidUntil)} (อีก ${left} วัน)`}
      </p>
      {left <= 3650 && <p className="mt-2 text-sm text-muted">ต่ออายุ: ติดต่อผู้ดูแลระบบ Easy Apartment (ระบบชำระผ่าน QR อัตโนมัติกำลังพัฒนา)</p>}
    </Section>
  );
}

function AccountSection() {
  const [pw, setPw] = useState({ current: "", next: "" });
  const a = useAction();
  return (
    <Section title="บัญชีผู้ใช้">
      <div className="space-y-3">
        <Field label="รหัสผ่านปัจจุบัน" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <Field label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <Btn kind="ghost" className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
          const user = auth().currentUser;
          if (!user?.email) throw new Error("กรุณาเข้าสู่ระบบใหม่");
          if (pw.next.length < 8) throw new Error("รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร");
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw.current));
          } catch { throw new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง"); }
          await updatePassword(user, pw.next);
          setPw({ current: "", next: "" });
          return "เปลี่ยนรหัสผ่านแล้ว";
        })}>เปลี่ยนรหัสผ่าน</Btn>
        <Btn kind="danger" className="w-full" onClick={async () => { await signOut(auth()); window.location.replace("/login"); /* full reload clears cached screens */ }}>ออกจากระบบ</Btn>
      </div>
      {a.view}
    </Section>
  );
}

export default function MorePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">เงิน &amp; อื่นๆ</h1>
      <MonthSummary />
      <Section title="เอกสารสำหรับพิมพ์">
        <div className="grid gap-2">
          <a href="/print/slips" target="_blank" className="flex min-h-12 items-center rounded-xl px-4 ring-1 ring-black/15">ใบจดมิเตอร์ (ทุกห้อง)</a>
          <a href="/print/slips/blank" target="_blank" className="flex min-h-12 items-center rounded-xl px-4 ring-1 ring-black/15">ใบจดมิเตอร์เปล่า</a>
          <a href="/print/notices" target="_blank" className="flex min-h-12 items-center rounded-xl px-4 ring-1 ring-black/15">ใบเตือนค้างชำระติดประตู</a>
          <p className="text-sm text-muted">ใบแจ้งหนี้ A4: แตะห้อง → บิล → ปุ่ม “พิมพ์”</p>
        </div>
      </Section>
      <MaintenanceSection />
      <RoomsSection />
      <SettingsSection />
      <PlanSection />
      <AccountSection />
      <Card className="text-sm text-muted">ส่งบิลทาง LINE อัตโนมัติ: เร็วๆ นี้ · ตอนนี้ใช้ปุ่ม “ส่งบิล” แล้วเลือก LINE</Card>
    </div>
  );
}
