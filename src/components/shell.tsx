"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useData } from "@/components/data-provider";
import { Sheet } from "@/components/ui";
import RoomSheet, { type Panel } from "@/components/room-sheet";
import { ExpenseForm, MaintenanceForm } from "@/components/quick-add";
import { roomState } from "@/lib/room-state";
import { periodOf, todayBkk } from "@/lib/dates";
import { thb } from "@/lib/model";

// The app frame: floating dock (มิเตอร์ · หน้าแรก · การเงิน), the round หน้าแรก button with its shortcuts,
// the "which room?" picker, and the one room sheet every screen opens. Shortcuts never guess a room.

type PickMode = "pay" | "bill" | "tenant" | "repair";
type Ctx = { openRoom: (roomId: string, panel?: Panel) => void; pick: (mode: PickMode) => void };
const ShellCtx = createContext<Ctx | null>(null);
export const useShell = () => {
  const v = useContext(ShellCtx);
  if (!v) throw new Error("useShell outside Shell");
  return v;
};

const ICON = {
  pay: "M2 6h20v12H2zM2 10h20M6 15h4",
  bill: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
  tenant: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  repair: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  expense: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
};

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [room, setRoom] = useState<{ id: string; panel: Panel } | null>(null);
  const [picker, setPicker] = useState<PickMode | null>(null);
  const [form, setForm] = useState<"expense" | null>(null);
  const [ring, setRing] = useState(false);
  const { rooms } = useData();
  const onHome = path.startsWith("/rooms");
  const openRoom = (id: string, panel: Panel = { name: "main" }) => { setPicker(null); setRing(false); setRoom({ id, panel }); };
  const pick = (mode: PickMode) => { setRing(false); setPicker(mode); };
  const current = room ? rooms.find((r) => r.id === room.id) : undefined;

  const shortcuts: { key: PickMode | "expense"; label: string }[] = [
    { key: "pay", label: "รับเงิน" }, { key: "bill", label: "ออกบิล" }, { key: "tenant", label: "ผู้เช่าใหม่" },
    { key: "repair", label: "แจ้งซ่อม" }, { key: "expense", label: "จดรายจ่าย" },
  ];

  return (
    <ShellCtx.Provider value={{ openRoom, pick }}>
      <div className="pb-32">{children}</div>

      {ring && (
        <div className="fixed inset-0 z-40 bg-[rgba(10,12,16,.78)] backdrop-blur-sm" onClick={() => setRing(false)}>
          <div className="absolute inset-x-0 bottom-0 mx-auto h-[360px] max-w-[420px]">
            {shortcuts.map((s, i) => {
              // 5 buttons on an arc of radius 170: ≥ 76 px apart, labels never overlap, all above the dock
              const a = ((150 - i * 30) * Math.PI) / 180;
              return (
                <button key={s.key} onClick={(e) => { e.stopPropagation(); if (s.key === "expense") { setRing(false); setForm("expense"); } else pick(s.key); }}
                  className="ea-rise absolute flex w-[72px] flex-col items-center"
                  style={{ left: `calc(50% + ${Math.round(170 * Math.cos(a)) - 36}px)`, bottom: `${Math.round(108 + 170 * Math.sin(a)) - 30}px` }}>
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#101828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[s.key]} /></svg>
                  </span>
                  <span className="mt-1.5 text-[13px] font-semibold text-white">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto grid h-[68px] max-w-[440px] grid-cols-[1fr_96px_1fr] rounded-full bg-ink shadow-[0_10px_30px_rgba(16,24,40,.25)]">
        <Link href="/meters" className={`flex flex-col items-center justify-center gap-0.5 text-[13px] font-semibold ${path.startsWith("/meters") ? "text-[#5fcdb8]" : "text-[#98a2b3]"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9M12 12l5-5" /></svg>มิเตอร์
        </Link>
        <div className="relative">
          <button aria-label={onHome ? (ring ? "ปิดทางลัด" : "ทางลัด") : "หน้าแรก"} aria-expanded={onHome ? ring : undefined}
            onClick={() => (onHome ? setRing(!ring) : router.push("/rooms"))}
            className={`absolute -top-[22px] left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-background shadow-[0_8px_22px_rgba(14,124,110,.4)] ${ring ? "bg-white" : "bg-brand"}`}>
            {ring
              ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#101828" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              : <span className="flex flex-col items-center text-[13px] font-bold leading-none text-white">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z" /></svg>
                  <span className="mt-1">หน้าแรก</span>
                </span>}
          </button>
        </div>
        <Link href="/more" className={`flex flex-col items-center justify-center gap-0.5 text-[13px] font-semibold ${path.startsWith("/more") || path.startsWith("/bills") || path.startsWith("/tenants") ? "text-[#5fcdb8]" : "text-[#98a2b3]"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>การเงิน
        </Link>
      </nav>

      {picker && <RoomPicker mode={picker} onClose={() => setPicker(null)} onPick={(id, mode) => openRoom(id, mode === "repair" ? { name: "repair" } : mode === "tenant" ? { name: "tenant" } : mode === "bill" ? { name: "issue" } : { name: "main" })} />}
      {form === "expense" && <Sheet open tall={false} title="จดรายจ่าย" onClose={() => setForm(null)}><ExpenseForm onDone={() => setForm(null)} /></Sheet>}
      {room && current && <RoomSheet room={current} panel={room.panel} setPanel={(p) => setRoom({ id: room.id, panel: p })} onClose={() => setRoom(null)} />}
    </ShellCtx.Provider>
  );
}

/** "Which room?" — the rooms that most likely need this come first. */
function RoomPicker({ mode, onClose, onPick }: { mode: PickMode; onClose: () => void; onPick: (roomId: string, mode: PickMode) => void }) {
  const { rooms, bills, activeLease, reservedLease, tenants, bookings } = useData();
  const { openRoom } = useShell();
  const today = todayBkk(), period = periodOf(today);
  const [repairCommon, setRepairCommon] = useState(false);
  const states = rooms.map((r) => ({ r, s: roomState(r, { bills, hasLease: activeLease.has(r.id), reserved: reservedLease.has(r.id), bookings, period, today }) }));
  const name = (roomId: string) => { const l = activeLease.get(roomId); return l ? tenants.get(l.tenantId)?.fullName ?? "" : ""; };
  const T = {
    pay: { title: "รับเงินห้องไหน", hint: "เรียงจากค้างนานสุด", top: states.filter((x) => x.s.owed > 0).sort((a, b) => b.s.lateDays - a.s.lateDays || b.s.owed - a.s.owed) },
    bill: { title: "ออกบิลห้องไหน", hint: "ห้องที่ยังไม่ออกบิลเดือนนี้", top: states.filter((x) => x.s.key === "todo") },
    tenant: { title: "เข้าห้องไหน", hint: "ห้องรายเดือนที่ว่างอยู่", top: states.filter((x) => x.r.kind === "monthly" && x.s.key === "vacant") },
    repair: { title: "ซ่อมที่ไหน", hint: "แตะเลขห้อง หรือส่วนกลาง", top: [] as typeof states },
  }[mode];
  const others = mode === "bill" ? states.filter((x) => activeLease.has(x.r.id) && x.s.key !== "todo") : mode === "repair" ? states : [];

  if (repairCommon) return <Sheet open tall={false} title="แจ้งซ่อม ส่วนกลาง" onClose={onClose}><MaintenanceForm onDone={onClose} /></Sheet>;
  return (
    <Sheet open title={T.title} onClose={onClose}>
      <p className="-mt-2 mb-3 text-muted">{T.top.length || mode === "repair" ? T.hint : mode === "tenant" ? "ตอนนี้ไม่มีห้องว่าง" : mode === "bill" ? "ออกบิลครบทุกห้องแล้ว" : "ไม่มีห้องค้างจ่าย"}</p>
      <div className="space-y-2">
        {T.top.map(({ r, s }) => (
          <button key={r.id} onClick={() => onPick(r.id, mode)} className="flex min-h-16 w-full items-center gap-3 rounded-[20px] bg-surface px-4 text-left ring-1 ring-line">
            <span className="num w-14 text-xl font-bold">{r.number}</span>
            <span className="flex-1"><span className="block font-semibold">{name(r.id) || (s.key === "vacant" ? "ห้องว่าง" : "")}</span>
              <span className="block text-sm text-muted">{mode === "pay" ? (s.lateDays ? `เลยกำหนด ${s.lateDays} วัน` : "ยังไม่ถึงกำหนด") : mode === "tenant" ? `ราคา ฿${thb(r.rentMonthly)}` : "ยังไม่ออกบิลเดือนนี้"}</span></span>
            {mode === "pay" && <span className={`num font-bold ${s.lateDays ? "text-bad-ink" : ""}`}>฿{thb(s.owed)}</span>}
          </button>
        ))}
      </div>
      {mode === "repair" && <button onClick={() => setRepairCommon(true)} className="mb-2 flex min-h-14 w-full items-center rounded-[20px] bg-surface px-4 font-semibold ring-1 ring-line">ส่วนกลาง</button>}
      {others.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-sm text-muted">{mode === "bill" ? "ออกบิลอื่นให้ห้องที่ออกแล้ว" : "ทุกห้อง"}</p>
          <div className="grid grid-cols-5 gap-2">
            {others.map(({ r }) => (
              <button key={r.id} onClick={() => (mode === "bill" ? openRoom(r.id, { name: "manual" }) : onPick(r.id, mode))}
                className="num min-h-13 rounded-2xl bg-surface py-3 font-semibold ring-1 ring-line">{r.number}</button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
