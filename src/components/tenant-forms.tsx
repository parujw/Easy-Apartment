"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { Btn, Field, NumField, useAction } from "@/components/ui";
import { moveIn, moveOut, updateLease, updateTenant } from "@/lib/ops";
import { addDays, isoTh, todayBkk } from "@/lib/dates";
import { thb, type Lease, type Room, type Tenant } from "@/lib/model";

const n = (v: number | "") => (v === "" ? 0 : v);

export function TenantCard({ room, tenant, lease }: { room: Room; tenant: Tenant | undefined; lease: Lease }) {
  const { property } = useProperty();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    fullName: tenant?.fullName ?? "", phone: tenant?.phone ?? "", endDate: lease.endDate ?? "",
    rent: lease.rent as number | "", elecRate: lease.elecRate as number | "", waterRate: lease.waterRate as number | "",
    acFee: lease.acFee as number | "", internet: lease.internet as number | "", parking: lease.parking as number | "",
    dueDay: lease.dueDay as number | "",
  });
  const a = useAction();

  if (!editing) {
    return (
      <div className="rounded-xl bg-surface p-3 ring-1 ring-black/10">
        <p className="font-semibold">{tenant?.fullName ?? "—"}</p>
        {tenant?.phone ? <a className="text-brand underline" href={`tel:${tenant.phone}`}>{tenant.phone}</a> : <p className="text-sm text-muted">ไม่มีเบอร์โทร</p>}
        <p className="mt-1 text-sm text-muted">สัญญา {isoTh(lease.startDate)} – {isoTh(lease.endDate)} · ค่าเช่า ฿{thb(lease.rent)} · ครบกำหนดทุกวันที่ {lease.dueDay}</p>
        <p className="text-sm text-muted">ไฟ {lease.elecRate} ฿/หน่วย · น้ำ {lease.waterRate} ฿/หน่วย{lease.acFee ? ` · แอร์ ฿${thb(lease.acFee)}` : ""}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn kind="ghost" onClick={() => setEditing(true)}>แก้ไข</Btn>
          <Btn kind="danger" disabled={a.busy}
            onClick={() => confirm(`ย้ายผู้เช่าออกจากห้อง ${room.number}?`) && a.run(async () => { await moveOut(property.id, room, lease); return "ย้ายออกแล้ว ห้องเปลี่ยนเป็นทำความสะอาด"; })}>
            ย้ายออก
          </Btn>
        </div>
        {a.view}
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-xl bg-surface p-3 ring-1 ring-black/10">
      <Field label="ชื่อ-นามสกุล" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      <Field label="เบอร์โทร" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <Field label="สิ้นสุดสัญญา" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label="ค่าเช่า" value={f.rent} onChange={(v) => setF({ ...f, rent: v })} />
        <NumField label="ครบกำหนดวันที่" value={f.dueDay} onChange={(v) => setF({ ...f, dueDay: v })} />
        <NumField label="ค่าไฟ/หน่วย" value={f.elecRate} onChange={(v) => setF({ ...f, elecRate: v })} />
        <NumField label="ค่าน้ำ/หน่วย" value={f.waterRate} onChange={(v) => setF({ ...f, waterRate: v })} />
        <NumField label="ค่าเช่าแอร์" value={f.acFee} onChange={(v) => setF({ ...f, acFee: v })} />
        <NumField label="อินเทอร์เน็ต" value={f.internet} onChange={(v) => setF({ ...f, internet: v })} />
        <NumField label="ที่จอดรถ" value={f.parking} onChange={(v) => setF({ ...f, parking: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Btn kind="ghost" onClick={() => setEditing(false)}>ยกเลิก</Btn>
        <Btn disabled={a.busy} onClick={() => a.run(async () => {
          if (tenant) await updateTenant(property.id, tenant.id, { fullName: f.fullName.trim(), phone: f.phone.trim() });
          await updateLease(property.id, lease.id, {
            endDate: f.endDate || null, rent: n(f.rent), dueDay: n(f.dueDay) || 5, elecRate: n(f.elecRate), waterRate: n(f.waterRate),
            acFee: n(f.acFee), internet: n(f.internet), parking: n(f.parking),
          });
          setEditing(false);
          return "บันทึกแล้ว";
        })}>บันทึก</Btn>
      </div>
      {a.view}
    </div>
  );
}

export function MoveInForm({ room, onDone }: { room: Room; onDone: () => void }) {
  const { property } = useProperty();
  const today = todayBkk();
  const [f, setF] = useState({
    fullName: "", phone: "", startDate: today, endDate: addDays(today, 365),
    rent: room.rentMonthly as number | "", deposit: room.deposit as number | "", advance: "" as number | "",
    elecRate: 8 as number | "", waterRate: 20 as number | "", acFee: "" as number | "", internet: "" as number | "",
    parking: "" as number | "", dueDay: 5 as number | "",
  });
  const [more, setMore] = useState(false);
  const a = useAction();
  return (
    <div className="space-y-3">
      <Field label="ชื่อ-นามสกุล *" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      <Field label="เบอร์โทร" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label="ค่าเช่า/เดือน" value={f.rent} onChange={(v) => setF({ ...f, rent: v })} />
        <NumField label="ค่าประกัน" value={f.deposit} onChange={(v) => setF({ ...f, deposit: v })} />
      </div>
      {!more ? (
        <button className="min-h-10 text-sm text-brand" onClick={() => setMore(true)}>+ วันที่สัญญา ค่าไฟ ค่าน้ำ ค่าบริการอื่น</button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="เริ่มสัญญา" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          <Field label="สิ้นสุดสัญญา" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          <NumField label="ค่าไฟ/หน่วย" value={f.elecRate} onChange={(v) => setF({ ...f, elecRate: v })} />
          <NumField label="ค่าน้ำ/หน่วย" value={f.waterRate} onChange={(v) => setF({ ...f, waterRate: v })} />
          <NumField label="ค่าเช่าแอร์" value={f.acFee} onChange={(v) => setF({ ...f, acFee: v })} />
          <NumField label="อินเทอร์เน็ต" value={f.internet} onChange={(v) => setF({ ...f, internet: v })} />
          <NumField label="ที่จอดรถ" value={f.parking} onChange={(v) => setF({ ...f, parking: v })} />
          <NumField label="ครบกำหนดวันที่" value={f.dueDay} onChange={(v) => setF({ ...f, dueDay: v })} />
          <NumField label="ค่าเช่าล่วงหน้า" value={f.advance} onChange={(v) => setF({ ...f, advance: v })} />
        </div>
      )}
      <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
        if (!f.fullName.trim()) throw new Error("กรุณากรอกชื่อผู้เช่า");
        await moveIn(property.id, room,
          { fullName: f.fullName.trim(), nickname: "", phone: f.phone.trim(), lineUserId: null, emergency: "", note: "" },
          { startDate: f.startDate || null, endDate: f.endDate || null, rent: n(f.rent), deposit: n(f.deposit), advance: n(f.advance),
            elecRate: n(f.elecRate), waterRate: n(f.waterRate), acFee: n(f.acFee), internet: n(f.internet), parking: n(f.parking),
            dueDay: n(f.dueDay) || 5 });
        onDone();
      })}>บันทึกผู้เช่า</Btn>
      {a.view}
    </div>
  );
}
