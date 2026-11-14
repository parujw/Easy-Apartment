"use client";

import { useState } from "react";
import Link from "next/link";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import BillRow from "@/components/bill-row";
import { monthTh, periodOf, todayBkk } from "@/lib/dates";
import { balance, thb, type Bill, type BillStatus } from "@/lib/model";

const FILTERS: [BillStatus | "all" | "open", string][] = [["open", "ค้างชำระ"], ["all", "ทั้งหมด"], ["paid", "จ่ายแล้ว"], ["carried", "ยกยอด"], ["void", "ยกเลิก"]];

/** Every bill of one billing period, filterable by status and room. */
export default function BillsPage() {
  const { property } = useProperty();
  const [period, setPeriod] = useState(periodOf(todayBkk()));
  const [status, setStatus] = useState<(typeof FILTERS)[number][0]>("all");
  const [room, setRoom] = useState("");
  const list = useLive<Bill>(query(collection(db(), "properties", property.id, "bills"), where("period", "==", period)), `${property.id}/bills/=${period}`);
  const shown = list
    .filter((b) => status === "all" ? b.status !== "void" : status === "open" ? b.status === "unpaid" || b.status === "partial" : b.status === status)
    .filter((b) => !room || b.roomNumber.includes(room.trim()))
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, "th", { numeric: true }) || a.billNo.localeCompare(b.billNo));
  const sum = shown.reduce((s, b) => s + b.total, 0), owed = shown.reduce((s, b) => s + (b.status === "void" ? 0 : balance(b)), 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold"><Link href="/more" className="text-brand" aria-label="กลับ">‹</Link> บิลทั้งหมด</h1>
        <input type="month" aria-label="รอบบิล" className="min-h-12 rounded-xl border border-black/15 bg-surface px-2" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="สถานะบิล">
        {FILTERS.map(([k, label]) => (
          <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}
            className={`min-h-10 rounded-full px-3 text-sm ring-1 ${status === k ? "bg-brand text-white ring-brand" : "ring-black/15"}`}>{label}</button>
        ))}
      </div>
      <input aria-label="ค้นหาเลขห้อง" placeholder="ค้นหาเลขห้อง" className="min-h-12 w-full rounded-xl border border-black/15 bg-surface px-3" value={room} onChange={(e) => setRoom(e.target.value)} />
      <p className="text-sm text-muted">{monthTh(period)} · {shown.length} บิล · รวม ฿{thb(sum)} · ค้าง ฿{thb(owed)}</p>
      <ul className="space-y-2">{shown.map((b) => <BillRow key={b.id} bill={b} />)}</ul>
      {!shown.length && <p className="text-muted">ไม่มีบิล{status !== "all" ? `สถานะ “${FILTERS.find((f) => f[0] === status)?.[1]}”` : ""}ในรอบนี้</p>}
    </div>
  );
}
