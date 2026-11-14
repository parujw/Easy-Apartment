"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Field, NumField, Select, useAction } from "@/components/ui";
import { createLineLink, moveIn, moveOut, shrinkImage, transferRoom, updateLease, updateTenant } from "@/lib/ops";
import { carryOverBills, tenancyLeaseIds } from "@/lib/carry";
import { addDays, isoTh, todayBkk } from "@/lib/dates";
import { thb, type Lease, type Room, type Tenant } from "@/lib/model";

const n = (v: number | "") => (v === "" ? 0 : v);

export function TenantPhoto({ tenant, size = 56 }: { tenant: Pick<Tenant, "photo" | "fullName"> | undefined; size?: number }) {
  const initials = (tenant?.fullName ?? "?").replace(/^(คุณ|นาย|นางสาว|นาง)\s*/, "").slice(0, 2);
  return tenant?.photo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={tenant.photo} alt={tenant.fullName} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-bold text-brand" style={{ width: size, height: size }}>{initials}</span>;
}

type Mode = "view" | "edit" | "transfer" | "moveout";

export function TenantCard({ room, tenant, lease }: { room: Room; tenant: Tenant | undefined; lease: Lease }) {
  const { property } = useProperty();
  const { rooms, leases, openBills, activeLease } = useData();
  const [mode, setMode] = useState<Mode>("view");
  const [f, setF] = useState({
    fullName: tenant?.fullName ?? "", phone: tenant?.phone ?? "", endDate: lease.endDate ?? "",
    rent: lease.rent as number | "", elecRate: lease.elecRate as number | "", waterRate: lease.waterRate as number | "",
    acFee: lease.acFee as number | "", internet: lease.internet as number | "", parking: lease.parking as number | "",
    dueDay: lease.dueDay as number | "", deposit: lease.deposit as number | "",
  });
  const [target, setTarget] = useState("");
  const [newRent, setNewRent] = useState<number | "">("");
  const [refundNote, setRefundNote] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const a = useAction();
  const tenancyOpen = carryOverBills(openBills, tenancyLeaseIds(leases, lease.id), "9999-12");
  const owed = tenancyOpen.reduce((s, b) => s + b.total - b.paid, 0);
  const vacant = rooms.filter((r) => r.kind === "monthly" && r.id !== room.id && !activeLease.has(r.id) && r.status !== "reserved");

  if (mode === "edit") {
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
          <NumField label="เงินประกัน" value={f.deposit} onChange={(v) => setF({ ...f, deposit: v })} />
        </div>
        <label className="block text-sm">รูปผู้เช่า
          <input type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && tenant) a.run(async () => { await updateTenant(property.id, tenant.id, { photo: await shrinkImage(file, 320) }, tenant.fullName); return "บันทึกรูปแล้ว"; });
          }} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Btn kind="ghost" onClick={() => setMode("view")}>ยกเลิก</Btn>
          <Btn disabled={a.busy} onClick={() => a.run(async () => {
            if (tenant) await updateTenant(property.id, tenant.id, { fullName: f.fullName.trim(), phone: f.phone.trim() });
            await updateLease(property.id, lease.id, {
              endDate: f.endDate || null, rent: n(f.rent), dueDay: n(f.dueDay) || 5, elecRate: n(f.elecRate), waterRate: n(f.waterRate),
              acFee: n(f.acFee), internet: n(f.internet), parking: n(f.parking), deposit: n(f.deposit),
            }, `ห้อง ${room.number}`);
            setMode("view");
            return "บันทึกแล้ว · มีผลกับบิลรอบถัดไป";
          })}>บันทึก</Btn>
        </div>
        {a.view}
      </div>
    );
  }

  if (mode === "transfer") {
    return (
      <div className="space-y-3 rounded-xl bg-surface p-3 ring-1 ring-black/10">
        <p className="font-semibold">ย้าย {tenant?.fullName} จากห้อง {room.number}</p>
        <Select label="ไปห้อง" value={target} onChange={(v) => { setTarget(v); setNewRent(rooms.find((r) => r.id === v)?.rentMonthly ?? ""); }}
          options={[["", "— เลือกห้องว่าง —"], ...vacant.map((r) => [r.id, `ห้อง ${r.number}`] as [string, string])]} />
        <NumField label="ค่าเช่าห้องใหม่" value={newRent} onChange={setNewRent} />
        <p className="text-sm text-muted">เงินประกัน ฿{thb(lease.deposit)} และยอดค้าง ฿{thb(owed)} ตามไปห้องใหม่ บิลเก่ายังเป็นของห้องเดิม</p>
        <div className="grid grid-cols-2 gap-2">
          <Btn kind="ghost" onClick={() => setMode("view")}>ยกเลิก</Btn>
          <Btn disabled={a.busy || !target} onClick={() => a.run(async () => {
            const to = rooms.find((r) => r.id === target)!;
            await transferRoom(property.id, room, lease, to, n(newRent));
            return `ย้ายไปห้อง ${to.number} แล้ว`;
          })}>ยืนยันย้ายห้อง</Btn>
        </div>
        {a.view}
      </div>
    );
  }

  if (mode === "moveout") {
    const deduct = Math.min(lease.deposit, owed);
    return (
      <div className="space-y-3 rounded-xl bg-surface p-3 ring-1 ring-black/10">
        <p className="font-semibold">ย้ายออกห้อง {room.number}</p>
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt>เงินประกัน</dt><dd className="text-right">฿{thb(lease.deposit)}</dd>
          <dt>ยอดค้าง</dt><dd className="text-right text-red-600">฿{thb(owed)}</dd>
          <dt>หักจากประกัน</dt><dd className="text-right">฿{thb(deduct)}</dd>
          <dt className="font-semibold">คืนผู้เช่า</dt><dd className="text-right text-lg font-bold">฿{thb(lease.deposit - deduct)}</dd>
        </dl>
        {owed > deduct && <p className="text-sm text-red-600">ยังค้างอีก ฿{thb(owed - deduct)} หลังหักประกัน — บิลยังเปิดอยู่ ตามเก็บได้จากหน้าบิล</p>}
        <Field label="หมายเหตุการคืนเงิน" placeholder="เช่น โอนคืนวันที่…" value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Btn kind="ghost" onClick={() => setMode("view")}>ยกเลิก</Btn>
          <Btn kind="danger" disabled={a.busy} onClick={() => a.run(async () => {
            const r = await moveOut(property, room, lease, tenancyOpen, refundNote);
            return `ย้ายออกแล้ว · คืนประกัน ฿${thb(r.refund)}${r.deducted ? ` (หักค้าง ฿${thb(r.deducted)})` : ""}`;
          })}>ยืนยันย้ายออก</Btn>
        </div>
        {a.view}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-3 ring-1 ring-black/10">
      <div className="flex items-center gap-3">
        <TenantPhoto tenant={tenant} />
        <div>
          <p className="font-semibold">{tenant?.fullName ?? "—"}</p>
          {tenant?.phone ? <a className="text-brand underline" href={`tel:${tenant.phone}`}>{tenant.phone}</a> : <p className="text-sm text-muted">ไม่มีเบอร์โทร</p>}
          {tenant?.lineUserId && <p className="text-xs text-emerald-700">เชื่อม LINE แล้ว</p>}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">สัญญา {isoTh(lease.startDate)} – {isoTh(lease.endDate)} · ค่าเช่า ฿{thb(lease.rent)} · ครบกำหนดทุกวันที่ {lease.dueDay}</p>
      <p className="text-sm text-muted">ไฟ {lease.elecRate} ฿/หน่วย · น้ำ {lease.waterRate} ฿/หน่วย{lease.acFee ? ` · แอร์ ฿${thb(lease.acFee)}` : ""} · ประกัน ฿{thb(lease.deposit)}</p>
      {owed > 0 && <p className="text-sm text-red-600">ค้างชำระรวม ฿{thb(owed)}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Btn kind="ghost" onClick={() => setMode("edit")}>แก้ไข</Btn>
        <Btn kind="ghost" onClick={() => setMode("transfer")}>ย้ายห้อง</Btn>
        <Btn kind="danger" onClick={() => setMode("moveout")}>ย้ายออก</Btn>
      </div>
      {tenant && !tenant.lineUserId && (
        <div className="mt-2">
          {linkCode ? (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">ส่งรหัส <b className="text-lg tracking-widest">{linkCode}</b> ให้ผู้เช่าพิมพ์ในแชท LINE {property.lineId ?? ""} (ใช้ได้ 7 วัน ครั้งเดียว)</p>
          ) : (
            <button className="min-h-10 text-sm text-brand" disabled={a.busy} onClick={() => a.run(async () => { setLinkCode(await createLineLink(property.id, tenant, room.number)); })}>
              + สร้างรหัสเชื่อม LINE ของผู้เช่า
            </button>
          )}
        </div>
      )}
      {a.view}
    </div>
  );
}

export function ReservationCard({ room, tenant, lease }: { room: Room; tenant: Tenant | undefined; lease: Lease }) {
  const { property } = useProperty();
  const a = useAction();
  return (
    <div className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-200">
      <p className="font-semibold">จองโดย {tenant?.fullName}</p>
      <p className="text-sm text-muted">เข้าอยู่ {isoTh(lease.startDate)} · ค่าเช่า ฿{thb(lease.rent)} · มัดจำ/ประกัน ฿{thb(lease.deposit)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn disabled={a.busy} onClick={() => a.run(async () => {
          const { activateReservation } = await import("@/lib/ops");
          await activateReservation(property.id, room, lease); return "ผู้เช่าเข้าอยู่แล้ว";
        })}>ผู้เช่าเข้าแล้ว</Btn>
        <Btn kind="danger" disabled={a.busy} onClick={() => confirm("ยกเลิกการจองนี้?") && a.run(async () => {
          const { cancelReservation } = await import("@/lib/ops");
          await cancelReservation(property.id, room, lease); return "ยกเลิกการจองแล้ว";
        })}>ยกเลิกจอง</Btn>
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
  const [reserve, setReserve] = useState(false);
  const a = useAction();
  return (
    <div className="space-y-3">
      <Field label="ชื่อ-นามสกุล *" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      <Field label="เบอร์โทร" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label="ค่าเช่า/เดือน" value={f.rent} onChange={(v) => setF({ ...f, rent: v })} />
        <NumField label="ค่าประกัน" value={f.deposit} onChange={(v) => setF({ ...f, deposit: v })} />
      </div>
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={reserve} onChange={(e) => { setReserve(e.target.checked); setMore(true); }} />
        จองล่วงหน้า (ยังไม่เข้าอยู่ — กำหนดวันเข้าอยู่ด้านล่าง)
      </label>
      {!more ? (
        <button className="min-h-10 text-sm text-brand" onClick={() => setMore(true)}>+ วันที่สัญญา ค่าไฟ ค่าน้ำ ค่าบริการอื่น</button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={reserve ? "วันเข้าอยู่" : "เริ่มสัญญา"} type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
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
            dueDay: n(f.dueDay) || 5 }, reserve);
        onDone();
      })}>{reserve ? "บันทึกการจอง" : "บันทึกผู้เช่า"}</Btn>
      {a.view}
    </div>
  );
}
