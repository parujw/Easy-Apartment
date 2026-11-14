"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { Btn, Field, NumField, Select, useAction } from "@/components/ui";
import { deleteRoom, updateRoom } from "@/lib/ops";
import { CONDITION_TH, CYCLE_TH, KIND_TH, conditionOf, type Room } from "@/lib/model";

export default function RoomEdit({ room, canDelete, onDeleted }: { room: Room; canDelete: boolean; onDeleted: () => void }) {
  const { property } = useProperty();
  const [f, setF] = useState({
    number: room.number, floor: room.floor, kind: room.kind, billingCycle: room.billingCycle, condition: conditionOf(room),
    rentMonthly: room.rentMonthly as number | "", priceNightly: room.priceNightly as number | "", deposit: room.deposit as number | "", note: room.note,
  });
  const a = useAction();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="เลขห้อง" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
        <Field label="ชั้น" value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} />
        <Select label="ประเภท" value={f.kind} onChange={(v) => setF({ ...f, kind: v as Room["kind"] })} options={Object.entries(KIND_TH)} />
        <Select label="รอบบิล" value={f.billingCycle} onChange={(v) => setF({ ...f, billingCycle: v as Room["billingCycle"] })} options={Object.entries(CYCLE_TH)} />
        <NumField label="ค่าเช่า/เดือน" value={f.rentMonthly} onChange={(v) => setF({ ...f, rentMonthly: v })} />
        <NumField label="ราคา/คืน" value={f.priceNightly} onChange={(v) => setF({ ...f, priceNightly: v })} />
        <NumField label="ค่าประกัน" value={f.deposit} onChange={(v) => setF({ ...f, deposit: v })} />
        <Select label="สภาพห้อง" value={f.condition} onChange={(v) => setF({ ...f, condition: v as NonNullable<Room["condition"]> })} options={Object.entries(CONDITION_TH)} />
      </div>
      <Field label="หมายเหตุ" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
        if (!f.number.trim()) throw new Error("กรุณากรอกเลขห้อง");
        await updateRoom(property.id, room, { ...f, number: f.number.trim(), rentMonthly: f.rentMonthly || 0, priceNightly: f.priceNightly || 0, deposit: f.deposit || 0 });
        return "บันทึกแล้ว";
      })}>บันทึกห้อง</Btn>
      {canDelete && (
        <Btn kind="danger" className="w-full" disabled={a.busy} onClick={() => confirm(`ลบห้อง ${room.number}?`) && a.run(async () => { await deleteRoom(property.id, room); onDeleted(); })}>
          ลบห้อง
        </Btn>
      )}
      {a.view}
    </div>
  );
}
