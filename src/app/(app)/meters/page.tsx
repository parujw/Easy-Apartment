"use client";

import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Card, useAction } from "@/components/ui";
import { shareBill, billLink } from "@/components/bill-row";
import { hardGo } from "@/lib/nav";
import { editBill, fixPrevReading, issueBill, saveReadings } from "@/lib/ops";
import { meterBill, total, type BillItem } from "@/lib/billing";
import { carryAmount, carryOverBills, tenancyLeaseIds } from "@/lib/carry";
import { addDays, dueDateAfterPeriod, monthRange, periodOf, todayBkk } from "@/lib/dates";
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
  const [editPrev, setEditPrev] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Set<string>>(new Set());
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
    // A "before" number typed by the owner wins (e.g. a placeholder 1 carried over from the old system).
    const elecPrev = r.elecPrev !== "" ? num(r.elecPrev) : last ? last.elec : fromBill("elec", saved?.elec) ?? NaN;
    const waterPrev = r.waterPrev !== "" ? num(r.waterPrev) : last ? last.water : fromBill("water", saved?.water) ?? NaN;
    const knownPrev = (!!last || (!!bill && !!saved)) && !editPrev.has(room.id);
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
    // a corrected (or first-time) "before" number is saved with the readings, not just used for this bill
    const prevTyped = r.elecPrev !== "" && r.waterPrev !== "" && Number.isFinite(elecPrev) && Number.isFinite(waterPrev)
      && (!last || last.elec !== elecPrev || last.water !== waterPrev);
    return { room, lease, last, saved, bill, r, items, error, carry, done: !!bill, complete, unsaved: unsaved || (prevTyped && complete), elecCurr, waterCurr, knownPrev, elecPrev, waterPrev, prevTyped };
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

  const savePrev = async (list: typeof prepared) => {
    for (const p of list.filter((x) => x.prevTyped)) await fixPrevReading(property.id, p.room, p.last ?? null, period, p.elecPrev, p.waterPrev);
  };

  async function issueAll() {
    const { start, end } = monthRange(period);
    const out: Bill[] = [];
    await savePrev(ready);
    for (const p of ready) {
      const tenant = tenants.get(p.lease.tenantId);
      out.push(await issueBill(property, {
        room: p.room, tenantName: tenant?.fullName ?? "", tenantPhone: tenant?.phone ?? "", leaseId: p.lease.id, bookingId: null,
        periodStart: start, periodEnd: end, dueDate: dueDateAfterPeriod(period, p.lease.dueDay), items: p.items!,
        meter: { readOn: p.saved?.readOn ?? today, elec: num(p.r.elecCurr), water: num(p.r.waterCurr), id: p.saved?.id }, carryFrom: p.carry,
      }));
      setIssued([...out]);
    }
    setRows({}); setEditPrev(new Set());
    return `ออกบิลแล้ว ${out.length} ห้อง`;
  }

  async function saveOnly() {
    await savePrev(toSave);
    await saveReadings(property.id, toSave.map((p) => ({ room: p.room, period, readOn: p.saved?.readOn ?? today, elec: p.elecCurr, water: p.waterCurr, id: p.saved?.id })));
    setRows({}); setEditPrev(new Set());
    return `บันทึกเลขมิเตอร์ ${toSave.length} ห้องแล้ว ออกบิลทีหลังได้`;
  }

  /** Re-entered numbers for a room that already has a bill this period: fix that bill instead of issuing a new one. */
  async function updateIssued(p: (typeof prepared)[number]) {
    if (!p.bill || !p.items) throw new Error("กรอกเลขมิเตอร์ให้ครบก่อน");
    await editBill(property, p.bill, p.items, p.bill.note);
    await saveReadings(property.id, [{ room: p.room, period, readOn: p.saved?.readOn ?? p.bill.issueDate, elec: p.elecCurr, water: p.waterCurr, id: p.saved?.id }]);
    setFixing(null);
    setRows((s) => { const n = { ...s }; delete n[p.room.id]; return n; });
    return `อัปเดตบิล ${p.bill.billNo} แล้ว · ฿${thb(total(p.items))}`;
  }

  async function copyAll() {
    const text = issued.map((b) => `ห้อง ${b.roomNumber} ฿${thb(b.total)}\n${billLink(b)}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    return "คัดลอกลิงก์ทุกห้องแล้ว";
  }

  const box = "mt-1 block w-full min-h-14 rounded-2xl bg-background px-3.5 text-xl font-semibold text-ink outline-none ring-0 focus:ring-2 focus:ring-brand";
  const todo = prepared.filter((p) => !p.done || fixing === p.room.id);
  const doneRows = prepared.filter((p) => p.done && fixing !== p.room.id);
  const MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const shortP = (p: string) => `${MONTH[Number(p.slice(5)) - 1]} ${String(Number(p.slice(0, 4)) + 543).slice(2)}`;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted">รอบ {shortP(period)}</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">จดมิเตอร์</h1>
        </div>
        <input type="month" aria-label="เปลี่ยนรอบบิล" className="min-h-12 rounded-2xl bg-surface px-3 ring-1 ring-line-2" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>

      {list.length === 0 && <p className="mt-6 text-muted">ยังไม่มีห้องรายเดือนที่มีผู้เช่า</p>}
      {list.length > 0 && <p className="mt-4 mb-2 px-0.5 font-semibold">{todo.length ? `เหลือ ${todo.length} ห้อง` : "ออกบิลครบทุกห้องแล้ว"}</p>}

      <ul className="space-y-2.5">
        {todo.map((p) => { const { room, lease, r, items, error, carry, done, saved, knownPrev, elecPrev, waterPrev } = p; return (
          <li key={room.id} className="rounded-[20px] bg-surface p-3.5 ring-1 ring-line">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold">{room.number} <span className="text-[15px] font-medium text-muted">{tenants.get(lease.tenantId)?.fullName ?? ""}</span></span>
              <span className="num font-bold">{items ? `฿${thb(total(items))}` : error ? <span className="text-sm font-medium text-bad-ink">{error}</span> : ""}</span>
            </div>
            {!done && carry.length > 0 && <p className="mt-0.5 text-[13px] text-warn-ink">มียอดค้างเดิม ฿{thb(carryAmount(carry))} รวมในบิลนี้</p>}
            {!done && saved && <p className="mt-0.5 text-[13px] text-brand">เก็บเลขไว้แล้ว {saved.elec} / {saved.water}</p>}
            {done && <p className="mt-0.5 text-[13px] text-muted">แก้เลขของบิลที่ออกแล้ว ยอดในบิลจะเปลี่ยนตาม</p>}
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[13px] text-muted">
              {([["elec", "ไฟ", elecPrev], ["water", "น้ำ", waterPrev]] as const).map(([k, label, prevVal]) => (
                <div key={k}>
                  <p>{label}{knownPrev ? ` · ครั้งก่อน ${thb(prevVal)}` : ""}</p>
                  {!knownPrev && (
                    <label className="mt-1 block">เลขครั้งก่อน
                      <input className={`${box} !mt-0.5 ring-1 ring-warn`} inputMode="decimal" placeholder="เลขครั้งก่อน" data-meter value={k === "elec" ? r.elecPrev : r.waterPrev} onKeyDown={next}
                        onChange={(e) => set(room.id, k === "elec" ? "elecPrev" : "waterPrev", e.target.value)} />
                    </label>
                  )}
                  <input aria-label={`${label} เลขวันนี้ ห้อง ${room.number}`} className={box} inputMode="decimal" enterKeyHint="next" placeholder="เลขวันนี้" data-meter
                    value={k === "elec" ? r.elecCurr : r.waterCurr} onKeyDown={next} onChange={(e) => set(room.id, k === "elec" ? "elecCurr" : "waterCurr", e.target.value)} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {knownPrev ? (
                <button type="button" className="min-h-11 text-sm font-semibold text-brand"
                  onClick={() => { setEditPrev(new Set(editPrev).add(room.id)); setRows((x) => ({ ...x, [room.id]: { ...(x[room.id] ?? EMPTY), elecPrev: String(elecPrev), waterPrev: String(waterPrev) } })); }}>
                  แก้เลขครั้งก่อน
                </button>
              ) : editPrev.has(room.id) && (
                <button type="button" className="min-h-11 text-sm font-semibold text-muted"
                  onClick={() => { const n = new Set(editPrev); n.delete(room.id); setEditPrev(n); setRows((x) => ({ ...x, [room.id]: { ...(x[room.id] ?? EMPTY), elecPrev: "", waterPrev: "" } })); }}>
                  ใช้เลขเดิม
                </button>
              )}
              {!done && (
                <button type="button" className="min-h-11 text-sm font-semibold text-brand" aria-expanded={extras.has(room.id)}
                  onClick={() => { const n = new Set(extras); if (n.has(room.id)) n.delete(room.id); else n.add(room.id); setExtras(n); }}>
                  ส่วนลด / ค่าอื่นๆ{(r.other || r.discount) ? " •" : ""}
                </button>
              )}
            </div>
            {editPrev.has(room.id) && <p className="text-[13px] text-warn-ink">เลขครั้งก่อนที่แก้จะบันทึกไว้ตอนกด “เก็บเลขไว้” หรือ “ออกบิล”</p>}
            {!done && extras.has(room.id) && (
              <div className="mt-1 grid grid-cols-2 gap-2 text-[13px] text-muted">
                <label>ค่าอื่นๆ<input className={box} inputMode="decimal" value={r.other} onChange={(e) => set(room.id, "other", e.target.value)} /></label>
                <label>ส่วนลด<input className={box} inputMode="decimal" value={r.discount} onChange={(e) => set(room.id, "discount", e.target.value)} /></label>
              </div>
            )}
            {done && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Btn kind="ghost" onClick={() => setFixing(null)}>ยกเลิก</Btn>
                <Btn kind="ghost" className="!bg-brand !text-white !ring-0" disabled={a.busy || !items} onClick={() => a.run(() => updateIssued(p))}>อัปเดตบิล</Btn>
              </div>
            )}
          </li>
        ); })}
      </ul>

      {doneRows.length > 0 && (
        <details className="mt-3 overflow-hidden rounded-[20px] bg-surface ring-1 ring-line">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between px-4 font-semibold [&::-webkit-details-marker]:hidden">
            ออกบิลแล้ว {doneRows.length} ห้อง <span className="font-normal text-muted">ดู</span>
          </summary>
          {doneRows.map(({ room, bill }) => (
            <div key={room.id} className="flex min-h-14 items-center justify-between gap-2 border-t border-line px-4">
              <span><b>{room.number}</b> <span className="num text-muted">฿{thb(bill!.total)}</span></span>
              <button className="min-h-11 px-2 font-semibold text-brand" onClick={() => setFixing(room.id)}>แก้เลข</button>
            </div>
          ))}
        </details>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn kind="ghost" onClick={() => hardGo(`/print/slips?cycle=${period.replace("-", "")}`)}>พิมพ์ใบจดมิเตอร์</Btn>
        <Btn kind="ghost" onClick={() => hardGo("/print/slips/blank")}>ใบเปล่า</Btn>
      </div>

      {issued.length > 0 && (
        <Card className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">ส่งบิลให้ผู้เช่า</h2>
            <Btn kind="text" onClick={() => a.run(copyAll)}>คัดลอกทั้งหมด</Btn>
          </div>
          {issued.map((b) => (
            <div key={b.id} className="flex min-h-14 items-center justify-between gap-2 border-t border-line">
              <span>ห้อง {b.roomNumber} · <span className="num">฿{thb(b.total)}</span></span>
              <Btn kind="ghost" onClick={() => a.run(() => shareBill(b))}>ส่ง</Btn>
            </div>
          ))}
        </Card>
      )}

      {list.length > 0 && <div className="h-24" />}
      {list.length > 0 && (ready.length > 0 || toSave.length > 0) && (
        <div className="fixed inset-x-4 bottom-[calc(1rem+68px+12px+env(safe-area-inset-bottom))] z-30 mx-auto grid max-w-[440px] grid-cols-[1fr_2fr] gap-2">
          <Btn kind="ghost" className="shadow-[0_2px_10px_rgba(16,24,40,.08)]" disabled={a.busy || !toSave.length} onClick={() => a.run(saveOnly)}>เก็บเลขไว้</Btn>
          <Btn className="shadow-[0_6px_16px_rgba(14,124,110,.3)]" disabled={a.busy || !ready.length} onClick={() => a.run(issueAll)}>
            {a.busy ? `กำลังออกบิล ${issued.length}/${ready.length}` : `ออกบิล ${ready.length} ห้อง ฿${thb(ready.reduce((s, p) => s + total(p.items!), 0))}`}
          </Btn>
        </div>
      )}
      {a.view}
    </>
  );
}
