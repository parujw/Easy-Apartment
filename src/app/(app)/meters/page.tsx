"use client";

import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Card, useAction } from "@/components/ui";
import { shareBill, billLink } from "@/components/bill-row";
import { editBill, issueBill, saveReadings } from "@/lib/ops";
import { meterBill, total, type BillItem } from "@/lib/billing";
import { carryAmount, carryOverBills, tenancyLeaseIds } from "@/lib/carry";
import { addDays, dueDateAfterPeriod, monthRange, monthTh, periodOf, todayBkk } from "@/lib/dates";
import { thb, type Bill, type MeterReading } from "@/lib/model";

type Row = { elecPrev: string; elecCurr: string; waterPrev: string; waterCurr: string; other: string; discount: string };
const EMPTY: Row = { elecPrev: "", elecCurr: "", waterPrev: "", waterCurr: "", other: "", discount: "" };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export default function MetersPage() {
  const { property } = useProperty();
  const { rooms, activeLease, tenants, bills, openBills, leases } = useData();
  const today = todayBkk();
  const [period, setPeriod] = useState(periodOf(today));
  const since = addDays(today, -400);
  const readings = useLive<MeterReading>(
    query(collection(db(), "properties", property.id, "meterReadings"), where("readOn", ">=", since)),
    `${property.id}/meter/${since}`);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [issued, setIssued] = useState<Bill[]>([]);
  const [fixing, setFixing] = useState<string | null>(null);
  const a = useAction();

  // Monthly rooms with a tenant, in room order
  const list = rooms.filter((r) => r.kind === "monthly" && r.billingCycle === "monthly" && activeLease.has(r.id));
  // Previous reading = latest one from an earlier period; this period's saved reading prefills the form.
  const { prevReading, curReading } = useMemo(() => {
    const prev = new Map<string, MeterReading>(), cur = new Map<string, MeterReading>();
    for (const r of [...readings].sort((x, y) => x.readOn.localeCompare(y.readOn))) {
      const per = r.period ?? periodOf(r.readOn);
      if (per < period) prev.set(r.roomId, r);
      else if (per === period) cur.set(r.roomId, r);
    }
    return { prevReading: prev, curReading: cur };
  }, [readings, period]);
  const billOf = new Map(bills.filter((b) => b.period === period && b.leaseId && !b.bookingId).map((b) => [b.roomId, b]));

  const prepared = list.map((room) => {
    const lease = activeLease.get(room.id)!;
    const last = prevReading.get(room.id);
    const saved = curReading.get(room.id);
    const bill = billOf.get(room.id);
    const typed = rows[room.id] ?? EMPTY;
    const r: Row = { ...typed,
      elecCurr: typed.elecCurr || (saved ? String(saved.elec) : ""), waterCurr: typed.waterCurr || (saved ? String(saved.water) : "") };
    // First bill of a room has no earlier reading: recover "previous" from the issued bill (saved current − billed units).
    const fromBill = (kind: "elec" | "water", cur: number | undefined) => {
      const units = bill?.items.find((i) => i.kind === kind)?.qty;
      return units === undefined || cur === undefined ? undefined : (cur - units + 100000) % 100000;
    };
    const elecPrev = last ? last.elec : fromBill("elec", saved?.elec) ?? num(r.elecPrev);
    const waterPrev = last ? last.water : fromBill("water", saved?.water) ?? num(r.waterPrev);
    const knownPrev = !!last || (!!bill && !!saved);
    const elecCurr = num(r.elecCurr), waterCurr = num(r.waterCurr);
    const carry = bill ? [] : carryOverBills(openBills, tenancyLeaseIds(leases, lease.id), period);
    const keep = bill ? bill.items.filter((i) => i.kind === "other" || i.kind === "discount") : [];
    const prevBalance = bill ? bill.items.filter((i) => i.kind === "prev_balance").reduce((s, i) => s + i.amount, 0) : carryAmount(carry);
    let items: BillItem[] | null = null, error = "";
    if ([elecPrev, waterPrev, elecCurr, waterCurr].every(Number.isFinite)) {
      try {
        items = [...meterBill({ rent: lease.rent, elecPrev, elecCurr, elecRate: lease.elecRate, waterPrev, waterCurr, waterRate: lease.waterRate,
          ac: lease.acFee, internet: lease.internet, parking: lease.parking, prevBalance,
          other: Number(r.other) || 0, discount: Number(r.discount) || 0 }), ...keep];
      } catch (e) { error = (e as Error).message; }
    }
    const complete = Number.isFinite(elecCurr) && Number.isFinite(waterCurr);
    const unsaved = complete && (!saved || saved.elec !== elecCurr || saved.water !== waterCurr);
    return { room, lease, last, saved, bill, r, items, error, carry, done: !!bill, complete, unsaved, elecCurr, waterCurr, knownPrev, elecPrev, waterPrev };
  });
  const ready = prepared.filter((p) => p.items && !p.done);
  const toSave = prepared.filter((p) => p.unsaved && !p.done);
  const set = (id: string, k: keyof Row, v: string) =>
    setRows((s) => ({ ...s, [id]: { ...(s[id] ?? EMPTY), [k]: v } }));
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
        room: p.room, tenantName: tenant?.fullName ?? "", tenantPhone: tenant?.phone ?? "", leaseId: p.lease.id, bookingId: null,
        periodStart: start, periodEnd: end, dueDate: dueDateAfterPeriod(period, p.lease.dueDay), items: p.items!,
        meter: { readOn: p.saved?.readOn ?? today, elec: num(p.r.elecCurr), water: num(p.r.waterCurr) }, carryFrom: p.carry,
      }));
      setIssued([...out]);
    }
    setRows({});
    return `ออกบิลแล้ว ${out.length} ห้อง`;
  }

  async function saveOnly() {
    await saveReadings(property.id, toSave.map((p) => ({ room: p.room, period, readOn: p.saved?.readOn ?? today, elec: p.elecCurr, water: p.waterCurr })));
    setRows({});
    return `บันทึกเลขมิเตอร์ ${toSave.length} ห้องแล้ว ออกบิลทีหลังได้`;
  }

  /** Re-entered numbers for a room that already has a bill this period: fix that bill instead of issuing a new one. */
  async function updateIssued(p: (typeof prepared)[number]) {
    if (!p.bill || !p.items) throw new Error("กรอกเลขมิเตอร์ให้ครบก่อน");
    await editBill(property, p.bill, p.items, p.bill.note);
    await saveReadings(property.id, [{ room: p.room, period, readOn: p.saved?.readOn ?? p.bill.issueDate, elec: p.elecCurr, water: p.waterCurr }]);
    setFixing(null);
    setRows((s) => { const n = { ...s }; delete n[p.room.id]; return n; });
    return `อัปเดตบิล ${p.bill.billNo} แล้ว · ฿${thb(total(p.items))}`;
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
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`/print/slips?cycle=${period.replace("-", "")}`} target="_blank" className="flex min-h-12 items-center justify-center rounded-xl px-3 text-center text-sm font-semibold ring-1 ring-black/15">พิมพ์ใบจดมิเตอร์</a>
        <a href="/print/slips/blank" target="_blank" className="flex min-h-12 items-center justify-center rounded-xl px-3 text-center text-sm font-semibold ring-1 ring-black/15">ใบจดมิเตอร์เปล่า</a>
      </div>

      {list.length === 0 && <p className="mt-6 text-muted">ยังไม่มีห้องรายเดือนที่มีผู้เช่า</p>}

      <ul className="mt-4 space-y-2">
        {prepared.map((p) => { const { room, r, items, error, carry, done, bill, saved, knownPrev, elecPrev, waterPrev } = p; const editing = !done || fixing === room.id; return (
          <li key={room.id} className={`rounded-2xl p-3 ring-1 ${done ? "bg-black/5 ring-black/5" : "bg-surface ring-black/10"}`}>
            <div className="flex items-baseline justify-between">
              <p className="text-lg font-bold">ห้อง {room.number}</p>
              <p className="text-sm">{done && fixing !== room.id ? <>ออกบิลแล้ว ฿{thb(bill!.total)} <button className="min-h-10 px-1 text-brand" onClick={() => setFixing(room.id)}>แก้เลข</button></>
                : items ? <b>฿{thb(total(items))}</b> : error ? <span className="text-red-600">{error}</span> : ""}</p>
            </div>
            {!done && saved && <p className="text-xs text-emerald-700">บันทึกเลขไว้แล้ว ({saved.elec} / {saved.water})</p>}
            {!done && carry.length > 0 && (
              <p className="mt-1 text-sm text-amber-800">ยกยอดค้างเดิม ฿{thb(carryAmount(carry))} เข้าบิลนี้ ({carry.map((b) => b.billNo).join(", ")})</p>
            )}
            {editing && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <label>ไฟ {knownPrev ? <span className="text-muted">(ก่อน {elecPrev})</span> : ""}
                  {!knownPrev && <input className={field} inputMode="decimal" placeholder="เลขก่อน" data-meter value={r.elecPrev} onKeyDown={next} onChange={(e) => set(room.id, "elecPrev", e.target.value)} />}
                  <input className={`${field} mt-1`} inputMode="decimal" enterKeyHint="next" placeholder="เลขปัจจุบัน" data-meter value={r.elecCurr} onKeyDown={next} onChange={(e) => set(room.id, "elecCurr", e.target.value)} />
                </label>
                <label>น้ำ {knownPrev ? <span className="text-muted">(ก่อน {waterPrev})</span> : ""}
                  {!knownPrev && <input className={field} inputMode="decimal" placeholder="เลขก่อน" data-meter value={r.waterPrev} onKeyDown={next} onChange={(e) => set(room.id, "waterPrev", e.target.value)} />}
                  <input className={`${field} mt-1`} inputMode="decimal" enterKeyHint="next" placeholder="เลขปัจจุบัน" data-meter value={r.waterCurr} onKeyDown={next} onChange={(e) => set(room.id, "waterCurr", e.target.value)} />
                </label>
                {!done && (
                  <details className="col-span-2">
                    <summary className="cursor-pointer text-muted">ค่าอื่นๆ / ส่วนลด {(r.other || r.discount) && "•"}</summary>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <label>ค่าอื่นๆ<input className={field} inputMode="decimal" value={r.other} onChange={(e) => set(room.id, "other", e.target.value)} /></label>
                      <label>ส่วนลด<input className={field} inputMode="decimal" value={r.discount} onChange={(e) => set(room.id, "discount", e.target.value)} /></label>
                    </div>
                  </details>
                )}
                {done && (
                  <div className="col-span-2 grid grid-cols-2 gap-2">
                    <Btn kind="ghost" onClick={() => setFixing(null)}>ยกเลิก</Btn>
                    <Btn disabled={a.busy || !items} onClick={() => a.run(() => updateIssued(p))}>อัปเดตบิล</Btn>
                  </div>
                )}
              </div>
            )}
          </li>
        ); })}
      </ul>

      {list.length > 0 && (
        <div className="sticky bottom-20 mt-4">
          {toSave.length > 0 && (
            <Btn kind="ghost" className="mb-2 w-full bg-surface shadow" disabled={a.busy} onClick={() => a.run(saveOnly)}>บันทึกเลขอย่างเดียว ({toSave.length} ห้อง)</Btn>
          )}
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
