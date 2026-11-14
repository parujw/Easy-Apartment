"use client";

import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Card, useAction } from "@/components/ui";
import { shareBill, billLink } from "@/components/bill-row";
import { issueBill } from "@/lib/ops";
import { meterBill, total } from "@/lib/billing";
import { carryAmount, carryOverBills } from "@/lib/carry";
import { addDays, dueDateFor, monthRange, monthTh, periodOf, todayBkk } from "@/lib/dates";
import { thb, type Bill, type MeterReading } from "@/lib/model";

type Row = { elecPrev: string; elecCurr: string; waterPrev: string; waterCurr: string };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export default function MetersPage() {
  const { property } = useProperty();
  const { rooms, activeLease, tenants, bills, openBills } = useData();
  const today = todayBkk();
  const [period, setPeriod] = useState(periodOf(today));
  const since = addDays(today, -400);
  const readings = useLive<MeterReading>(
    query(collection(db(), "properties", property.id, "meterReadings"), where("readOn", ">=", since)),
    `${property.id}/meter/${since}`);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [issued, setIssued] = useState<Bill[]>([]);
  const a = useAction();

  // Monthly rooms with a tenant, in room order
  const list = rooms.filter((r) => r.kind === "monthly" && r.billingCycle === "monthly" && activeLease.has(r.id));
  const lastReading = useMemo(() => {
    const m = new Map<string, MeterReading>();
    for (const r of [...readings].sort((x, y) => x.readOn.localeCompare(y.readOn))) m.set(r.roomId, r);
    return m;
  }, [readings]);
  const billed = new Set(bills.filter((b) => b.period === period && b.leaseId && !b.bookingId).map((b) => b.roomId));

  const prepared = list.map((room) => {
    const lease = activeLease.get(room.id)!;
    const last = lastReading.get(room.id);
    const r = rows[room.id] ?? { elecPrev: "", elecCurr: "", waterPrev: "", waterCurr: "" };
    const elecPrev = last ? last.elec : num(r.elecPrev);
    const waterPrev = last ? last.water : num(r.waterPrev);
    const elecCurr = num(r.elecCurr), waterCurr = num(r.waterCurr);
    const carry = carryOverBills(openBills, lease.id, period);
    let items = null, error = "";
    if ([elecPrev, waterPrev, elecCurr, waterCurr].every(Number.isFinite)) {
      try {
        items = meterBill({ rent: lease.rent, elecPrev, elecCurr, elecRate: lease.elecRate, waterPrev, waterCurr, waterRate: lease.waterRate,
          ac: lease.acFee, internet: lease.internet, parking: lease.parking, prevBalance: carryAmount(carry) });
      } catch (e) { error = (e as Error).message; }
    }
    return { room, lease, last, r, items, error, carry, done: billed.has(room.id) };
  });
  const ready = prepared.filter((p) => p.items && !p.done);
  const set = (id: string, k: keyof Row, v: string) =>
    setRows((s) => ({ ...s, [id]: { ...(s[id] ?? { elecPrev: "", elecCurr: "", waterPrev: "", waterCurr: "" }), [k]: v } }));
  const next = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const all = [...document.querySelectorAll<HTMLInputElement>("input[data-meter]")];
    all[all.indexOf(e.currentTarget) + 1]?.focus();
  };

  async function issueAll() {
    const { start, end } = monthRange(period);
    const out: Bill[] = [];
    for (const p of ready) {
      const tenant = tenants.get(p.lease.tenantId);
      out.push(await issueBill(property, {
        room: p.room, tenantName: tenant?.fullName ?? "", leaseId: p.lease.id, bookingId: null,
        periodStart: start, periodEnd: end, dueDate: dueDateFor(today, p.lease.dueDay), items: p.items!,
        meter: { readOn: today, elec: num(p.r.elecCurr), water: num(p.r.waterCurr) }, carryFrom: p.carry,
      }));
      setIssued([...out]);
    }
    setRows({});
    return `ออกบิลแล้ว ${out.length} ห้อง`;
  }

  async function copyAll() {
    const text = issued.map((b) => `ห้อง ${b.roomNumber} ฿${thb(b.total)}\n${billLink(b)}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    return "คัดลอกลิงก์ทุกห้องแล้ว";
  }

  const field = "w-full min-h-12 rounded-xl border border-black/15 bg-surface px-2 text-base";
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">จดมิเตอร์ &amp; ออกบิล</h1>
        <input type="month" aria-label="รอบบิล" className="min-h-12 rounded-xl border border-black/15 bg-surface px-2" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      <p className="mt-1 text-sm text-muted">รอบ {monthTh(period)} · กรอกเลขมิเตอร์ปัจจุบัน กด Enter เพื่อไปช่องถัดไป</p>

      {list.length === 0 && <p className="mt-6 text-muted">ยังไม่มีห้องรายเดือนที่มีผู้เช่า</p>}

      <ul className="mt-4 space-y-2">
        {prepared.map(({ room, last, r, items, error, carry, done }) => (
          <li key={room.id} className={`rounded-2xl p-3 ring-1 ${done ? "bg-black/5 ring-black/5" : "bg-surface ring-black/10"}`}>
            <div className="flex items-baseline justify-between">
              <p className="text-lg font-bold">ห้อง {room.number}</p>
              <p className="text-sm">{done ? "ออกบิลแล้ว" : items ? <b>฿{thb(total(items))}</b> : error ? <span className="text-red-600">{error}</span> : ""}</p>
            </div>
            {!done && carry.length > 0 && (
              <p className="mt-1 text-sm text-amber-800">ยกยอดค้างเดิม ฿{thb(carryAmount(carry))} เข้าบิลนี้ ({carry.map((b) => b.billNo).join(", ")})</p>
            )}
            {!done && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <label>ไฟ {last ? <span className="text-muted">(ก่อน {last.elec})</span> : ""}
                  {!last && <input className={field} inputMode="decimal" placeholder="เลขก่อน" data-meter value={r.elecPrev} onKeyDown={next} onChange={(e) => set(room.id, "elecPrev", e.target.value)} />}
                  <input className={`${field} mt-1`} inputMode="decimal" enterKeyHint="next" placeholder="เลขปัจจุบัน" data-meter value={r.elecCurr} onKeyDown={next} onChange={(e) => set(room.id, "elecCurr", e.target.value)} />
                </label>
                <label>น้ำ {last ? <span className="text-muted">(ก่อน {last.water})</span> : ""}
                  {!last && <input className={field} inputMode="decimal" placeholder="เลขก่อน" data-meter value={r.waterPrev} onKeyDown={next} onChange={(e) => set(room.id, "waterPrev", e.target.value)} />}
                  <input className={`${field} mt-1`} inputMode="decimal" enterKeyHint="next" placeholder="เลขปัจจุบัน" data-meter value={r.waterCurr} onKeyDown={next} onChange={(e) => set(room.id, "waterCurr", e.target.value)} />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>

      {list.length > 0 && (
        <div className="sticky bottom-20 mt-4">
          <Btn className="w-full shadow-lg" disabled={a.busy || !ready.length} onClick={() => a.run(issueAll)}>
            {a.busy ? `กำลังออกบิล… ${issued.length}/${ready.length}` : `ออกบิล ${ready.length} ห้อง · ฿${thb(ready.reduce((s, p) => s + total(p.items!), 0))}`}
          </Btn>
          {a.view}
        </div>
      )}

      {issued.length > 0 && (
        <Card className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">ส่งบิลให้ผู้เช่า</h2>
            <Btn kind="ghost" onClick={() => a.run(copyAll)}>คัดลอกทั้งหมด</Btn>
          </div>
          <ul className="mt-2 divide-y divide-black/5">
            {issued.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                <span>ห้อง {b.roomNumber} · ฿{thb(b.total)}</span>
                <Btn kind="ghost" onClick={() => a.run(() => shareBill(b))}>ส่ง</Btn>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
