"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Field, NumField, Select, Sheet, useAction } from "@/components/ui";
import { addExpense, addMaintenance } from "@/lib/ops";
import { EXPENSE_CATEGORIES, MAINT_CATEGORIES, type Maintenance } from "@/lib/model";

export function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { property } = useProperty();
  const [f, setF] = useState({ amount: "" as number | "", description: "", category: EXPENSE_CATEGORIES[0] });
  const a = useAction();
  return (
    <div className="space-y-3">
      <NumField label="จำนวนเงิน (บาท) *" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} autoFocus />
      <Field label="รายละเอียด *" placeholder="เช่น ค่าไฟส่วนกลาง ต.ค." value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <Select label="หมวด" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={EXPENSE_CATEGORIES.map((c) => [c, c])} />
      <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
        await addExpense(property.id, { amount: Number(f.amount), description: f.description, category: f.category });
        onDone();
      })}>บันทึกค่าใช้จ่าย</Btn>
      {a.view}
    </div>
  );
}

export function MaintenanceForm({ onDone }: { onDone: () => void }) {
  const { property } = useProperty();
  const { rooms } = useData();
  const [f, setF] = useState({ roomId: "", problem: "", category: MAINT_CATEGORIES[0], priority: "normal" });
  const a = useAction();
  return (
    <div className="space-y-3">
      <Select label="ห้อง" value={f.roomId} onChange={(v) => setF({ ...f, roomId: v })}
        options={[["", "ส่วนกลาง"], ...rooms.map((r) => [r.id, `ห้อง ${r.number}`] as [string, string])]} />
      <Field label="ปัญหา *" placeholder="เช่น แอร์ไม่เย็น" value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="หมวด" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={MAINT_CATEGORIES.map((c) => [c, c])} />
        <Select label="ความเร่งด่วน" value={f.priority} onChange={(v) => setF({ ...f, priority: v })}
          options={[["normal", "ปกติ"], ["urgent", "ด่วน"], ["critical", "ด่วนมาก"]]} />
      </div>
      <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
        const room = rooms.find((r) => r.id === f.roomId) ?? null;
        await addMaintenance(property.id, { room, problem: f.problem, category: f.category, priority: f.priority as Maintenance["priority"] });
        onDone();
      })}>แจ้งซ่อม</Btn>
      {a.view}
    </div>
  );
}

/** Floating “+” on every tab: record an expense or a repair in ≤3 fields. */
export default function QuickAdd() {
  const [mode, setMode] = useState<null | "menu" | "expense" | "maint">(null);
  const close = () => setMode(null);
  return (
    <>
      <button aria-label="เพิ่มรายการ" onClick={() => setMode("menu")}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full bg-brand text-3xl text-white shadow-lg">+</button>
      <Sheet open={mode !== null} onClose={close} title={mode === "expense" ? "บันทึกค่าใช้จ่าย" : mode === "maint" ? "แจ้งซ่อม" : "เพิ่มรายการ"}>
        {mode === "menu" && (
          <div className="grid gap-2">
            <Btn onClick={() => setMode("expense")}>บันทึกค่าใช้จ่าย</Btn>
            <Btn kind="ghost" onClick={() => setMode("maint")}>แจ้งซ่อม</Btn>
          </div>
        )}
        {mode === "expense" && <ExpenseForm onDone={close} />}
        {mode === "maint" && <MaintenanceForm onDone={close} />}
      </Sheet>
    </>
  );
}
