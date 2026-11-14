"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import RoomSheet from "@/components/room-sheet";
import { daysLeftTs, todayBkk } from "@/lib/dates";
import { balance, thb, type Bill, type Room } from "@/lib/model";

// Money state drives the colour: red overdue · amber waiting · green paid · grey vacant
function tone(room: Room, open: Bill[], latest: Bill | undefined, today: string, booked: boolean) {
  if (open.some((b) => b.dueDate < today)) return { label: "เกินกำหนด", cls: "bg-red-100 text-red-900" };
  if (open.length) return { label: "รอจ่าย", cls: "bg-amber-100 text-amber-900" };
  if (room.status === "cleaning") return { label: "ทำความสะอาด", cls: "bg-sky-100 text-sky-900" };
  if (room.status === "maintenance") return { label: "ซ่อม", cls: "bg-black/10 text-muted" };
  if (room.kind !== "monthly") {
    if (room.status === "occupied") return { label: "เข้าพักอยู่", cls: "bg-emerald-100 text-emerald-900" };
    return booked ? { label: "มีจอง", cls: "bg-violet-100 text-violet-900" } : { label: "ว่าง", cls: "bg-black/5 text-muted" };
  }
  if (room.status === "vacant") return { label: "ว่าง", cls: "bg-black/5 text-muted" };
  if (latest?.status === "paid") return { label: "จ่ายแล้ว", cls: "bg-emerald-100 text-emerald-900" };
  return { label: "ยังไม่ออกบิล", cls: "bg-surface ring-1 ring-black/10" };
}

export default function RoomsPage() {
  const { property } = useProperty();
  const { rooms, bills, openBills, bookings } = useData();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "due" | "vacant">("all");
  const today = todayBkk();
  const due = openBills.reduce((s, b) => s + balance(b), 0);
  const overdue = openBills.filter((b) => b.dueDate < today);
  const left = daysLeftTs(property.paidUntil);
  const shown = rooms.filter((r) => filter === "all" ? true
    : filter === "vacant" ? r.status === "vacant"
    : openBills.some((b) => b.roomId === r.id));
  const floors = Map.groupBy(shown, (r) => r.floor || "-");

  return (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">{property.name}</h1>
        <span className="text-sm text-muted">{property.paidUntil ? (left > 3650 ? "ใช้ฟรี" : `ใช้ได้อีก ${left} วัน`) : ""}</span>
      </header>

      <section className="mt-4 grid grid-cols-3 gap-2">
        <button onClick={() => setFilter(filter === "due" ? "all" : "due")} className={`rounded-2xl bg-surface p-3 text-left ring-1 ${filter === "due" ? "ring-2 ring-brand" : "ring-black/10"}`}>
          <p className="text-xs text-muted">ค้างรับ</p>
          <p className="text-lg font-bold">฿{thb(due)}</p>
        </button>
        <button onClick={() => setFilter(filter === "due" ? "all" : "due")} className={`rounded-2xl bg-surface p-3 text-left ring-1 ${overdue.length ? "ring-red-300" : "ring-black/10"}`}>
          <p className="text-xs text-muted">เกินกำหนด</p>
          <p className={`text-lg font-bold ${overdue.length ? "text-red-600" : ""}`}>{overdue.length} บิล</p>
        </button>
        <button onClick={() => setFilter(filter === "vacant" ? "all" : "vacant")} className={`rounded-2xl bg-surface p-3 text-left ring-1 ${filter === "vacant" ? "ring-2 ring-brand" : "ring-black/10"}`}>
          <p className="text-xs text-muted">ห้องว่าง</p>
          <p className="text-lg font-bold">{rooms.filter((r) => r.status === "vacant").length}/{rooms.length}</p>
        </button>
      </section>
      {filter !== "all" && <button className="mt-2 min-h-10 text-sm text-brand" onClick={() => setFilter("all")}>แสดงทุกห้อง</button>}

      {rooms.length === 0 && <p className="mt-8 text-muted">ยังไม่มีห้อง — เพิ่มห้องได้ที่แท็บ “เงิน &amp; อื่นๆ” → ห้องพัก</p>}

      {[...floors].map(([floor, list]) => (
        <section key={floor} className="mt-5">
          <h2 className="text-sm font-semibold text-muted">ชั้น {floor}</h2>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {list.map((r) => {
              const roomOpen = openBills.filter((b) => b.roomId === r.id);
              const latest = bills.find((b) => b.roomId === r.id);
              const booked = bookings.some((b) => b.roomId === r.id && b.status === "confirmed");
              const t = tone(r, roomOpen, latest, today, booked);
              return (
                <li key={r.id}>
                  <button onClick={() => setSelected(r.id)} className={`flex min-h-20 w-full flex-col items-center justify-center rounded-xl p-2 ${t.cls}`}>
                    <span className="text-lg font-bold">{r.number}</span>
                    <span className="text-xs">{t.label}</span>
                    {r.kind !== "monthly" && <span className="text-[11px] opacity-70">{r.kind === "daily" ? "รายวัน" : "Airbnb"}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <RoomSheet room={rooms.find((r) => r.id === selected) ?? null} onClose={() => setSelected(null)} />
    </>
  );
}
