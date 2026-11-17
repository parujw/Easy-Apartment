"use client";

import { useState } from "react";
import Link from "next/link";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { useShell } from "@/components/shell";
import { roomState, type StateKey } from "@/lib/room-state";
import { daysLeftTs, periodOf, todayBkk } from "@/lib/dates";
import { thb } from "@/lib/model";

const MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// Every room is the same white tile; the state is a dot + a word in the shared status colours.
const DOT: Record<StateKey, string> = {
  paid: "bg-mark", staying: "bg-mark", due: "bg-warn", late: "bg-bad", booked: "bg-warn",
  todo: "border-2 border-muted", vacant: "border-2 border-line-2", reserved: "border-2 border-warn", cleaning: "border-2 border-mark", repair: "border-2 border-bad",
};
const WORD: Partial<Record<StateKey, string>> = { late: "text-bad-ink", due: "text-warn-ink", booked: "text-warn-ink", todo: "text-ink-2" };

export default function HomePage() {
  const { property } = useProperty();
  const { rooms, bills, activeLease, reservedLease, bookings } = useData();
  const { openRoom } = useShell();
  const [only, setOnly] = useState<"all" | "owed">("all");
  const today = todayBkk(), period = periodOf(today);
  const left = daysLeftTs(property.paidUntil);
  const rows = rooms.map((r) => ({ r, s: roomState(r, { bills, hasLease: activeLease.has(r.id), reserved: reservedLease.has(r.id), bookings, period, today }) }));

  // This month's money: billed for this period (excluding carried-in debt), split into paid / waiting / late
  const thisMonth = bills.filter((b) => b.period === period && b.status !== "void");
  const billed = thisMonth.reduce((s, b) => s + b.total - b.items.filter((i) => i.kind === "prev_balance").reduce((x, i) => x + i.amount, 0), 0);
  const collected = thisMonth.reduce((s, b) => s + Math.min(b.paid, b.total), 0);
  const late = rows.filter((x) => x.s.key === "late"), due = rows.filter((x) => x.s.owed > 0 && x.s.key !== "late");
  const lateAmt = late.reduce((s, x) => s + x.s.owed, 0), dueAmt = due.reduce((s, x) => s + x.s.owed, 0);
  const paidRooms = rows.filter((x) => x.s.key === "paid").length;
  const bar = [collected, dueAmt, lateAmt];
  const shown = only === "owed" ? rows.filter((x) => x.s.owed > 0) : rows;
  const floors = Map.groupBy(shown, (x) => x.r.floor || "-");
  const sumOf = (list: typeof rows) => { const owed = list.reduce((s, x) => s + x.s.owed, 0); return owed ? `ค้าง ฿${thb(owed)}` : "ครบแล้ว"; };

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{MONTH_FULL[Number(period.slice(5)) - 1]}{property.paidUntil && left <= 3650 ? ` · ใช้ได้อีก ${left} วัน` : ""}</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">{property.name}</h1>
        </div>
        <Link href="/world" aria-label="W World" className="relative block h-[52px] w-[52px] rounded-full bg-[#050816] shadow-[0_6px_20px_rgba(80,90,255,.35)]">
          <span className="absolute inset-[2px] rounded-full" style={{ background: "conic-gradient(from 0deg,#6ee7ff,transparent 30%,#8a6bff 55%,transparent 80%,#6ee7ff)", animation: "ea-spin 3.2s linear infinite", WebkitMask: "radial-gradient(circle,transparent 19px,#000 20px)", mask: "radial-gradient(circle,transparent 19px,#000 20px)" }} />
          <span className="absolute inset-[11px] rounded-full" style={{ background: "radial-gradient(circle at 50% 40%,rgba(110,231,255,.55) 0%,rgba(90,92,255,.25) 55%,rgba(5,8,22,0) 75%)", animation: "ea-orb 2.6s ease-in-out infinite" }} />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#bff6ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute top-[15px] left-[15px]" style={{ filter: "drop-shadow(0 0 3px #6ee7ff)" }}><path d="M3 6l4.5 12L12 9l4.5 9L21 6" /></svg>
          {(late.length > 0 || rows.some((x) => x.s.key === "todo")) && <span className="absolute top-px right-px h-3 w-3 rounded-full bg-[#ff5a5a] shadow-[0_0_0_2px_var(--background),0_0_8px_#ff5a5a]" />}
        </Link>
      </header>

      <section className="mt-4 rounded-[20px] bg-surface p-[18px] ring-1 ring-line">
        <div className="flex items-baseline justify-between text-sm text-muted"><span>เก็บแล้ว</span><span>จาก ฿{thb(billed)}</span></div>
        <p className="num text-[40px] font-bold leading-tight">฿{thb(collected)}</p>
        <div className="mt-3 flex h-2.5 gap-0.5" role="img" aria-label={`เก็บแล้ว ${thb(collected)} บาท รอจ่าย ${thb(dueAmt)} บาท เลยกำหนด ${thb(lateAmt)} บาท`}>
          {bar.every((v) => v === 0) ? <div className="flex-1 rounded-full bg-line" />
            : bar.map((v, i) => v > 0 && <div key={i} style={{ flex: v }} className={`first:rounded-l-full last:rounded-r-full ${["bg-mark", "bg-warn", "bg-bad"][i]}`} />)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[["จ่ายแล้ว", paidRooms, collected, "bg-mark", ""], ["รอจ่าย", due.length, dueAmt, "bg-warn", ""], ["เลยกำหนด", late.length, lateAmt, "bg-bad", "text-bad-ink"]].map(([label, n, amt, dot, tone], i) => (
            <button key={i} onClick={() => setOnly(i === 0 || only === "owed" ? "all" : "owed")} className="min-h-14 text-left">
              <span className="flex items-center gap-1.5 text-[13px] text-muted"><span className={`h-2 w-2 rounded-full ${dot}`} />{label} {n as number}</span>
              <span className={`num block font-semibold ${tone}`}>฿{thb(amt as number)}</span>
            </button>
          ))}
        </div>
      </section>
      {only === "owed" && <button className="mt-2 min-h-11 font-semibold text-brand" onClick={() => setOnly("all")}>แสดงทุกห้อง</button>}
      {rooms.length === 0 && <p className="mt-8 text-muted">ยังไม่มีห้อง เพิ่มห้องได้ที่ การเงิน → ห้องพัก</p>}

      {[...floors].map(([floor, list]) => (
        <section key={floor} className="mt-5">
          <div className="mb-2 flex items-baseline justify-between px-0.5">
            <h2 className="font-semibold">ชั้น {floor}</h2>
            <span className="text-[13px] text-muted">{sumOf(list)}</span>
          </div>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {list.map(({ r, s }) => (
              <li key={r.id}>
                <button onClick={() => openRoom(r.id)}
                  className={`flex min-h-[74px] w-full flex-col items-center justify-center rounded-[20px] px-0.5 ${s.key === "vacant" ? "text-muted outline-[1.5px] outline-dashed outline-line-2 -outline-offset-[1.5px]" : "bg-surface ring-1 ring-line"}`}>
                  <span className="num text-[19px] font-bold">{r.number}</span>
                  <span className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${WORD[s.key] ?? "text-muted"}`}>
                    <span className={`box-border h-2 w-2 rounded-full ${DOT[s.key]}`} />{s.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
