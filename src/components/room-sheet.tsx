"use client";

import { useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Card, Field, NumField, Pill, Row, Sheet, useAction } from "@/components/ui";
import { BillEditor, Payments, sendToLine, shareBill } from "@/components/bill-row";
import { ReservationCard, TenantCard, TenantPhoto } from "@/components/tenant-forms";
import ManualBill from "@/components/manual-bill";
import { BookingList, IcalSync, NewBooking } from "@/components/bookings";
import RoomEdit from "@/components/room-edit";
import { MaintenanceForm } from "@/components/quick-add";
import { issueBill, moveIn, receivePayment, setBookingStatus, setCondition, voidBill } from "@/lib/ops";
import { meterBill, total, type BillItem } from "@/lib/billing";
import { carryAmount, carryOverBills, tenancyLeaseIds } from "@/lib/carry";
import { readingsFor, roomState, type RoomState } from "@/lib/room-state";
import { addDays, dueDateAfterPeriod, isoTh, monthRange, periodOf, todayBkk } from "@/lib/dates";
import { CONDITION_TH, METHOD_TH, balance, conditionOf, thb, type Bill, type Lease, type MeterReading, type Payment, type Room, type RoomCondition, type Tenant } from "@/lib/model";

export type Panel =
  | { name: "main" } | { name: "bill"; billId: string } | { name: "pay"; billId: string } | { name: "edit-bill"; billId: string }
  | { name: "issue" } | { name: "done"; billId: string } | { name: "tenant" } | { name: "manage" } | { name: "room" }
  | { name: "booking" } | { name: "manual" } | { name: "repair" };

const MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthShort = (period: string) => MONTH[Number(period.slice(5, 7)) - 1];
const toneOf = (k: RoomState["key"]) => (k === "late" ? "bad" : k === "due" || k === "todo" ? "warn" : k === "paid" || k === "staying" ? "ok" : "muted") as "bad" | "warn" | "ok" | "muted";
const billTone = (b: Bill, today: string) => (b.status === "paid" ? "ok" : (b.status === "unpaid" || b.status === "partial") && b.dueDate < today ? "bad" : b.status === "carried" ? "muted" : "warn");
const billLabel = (b: Bill, today: string) => b.status === "paid" ? "จ่ายแล้ว" : b.status === "carried" ? "ยกไปบิลถัดไป" : b.dueDate < today ? "เลยกำหนด" : b.status === "partial" ? "จ่ายบางส่วน" : "รอจ่าย";
const go = (url: string) => { window.location.href = url; }; // same tab: pop-ups are blocked inside LINE / home-screen apps

/** Everything about one room. The host (shell) keeps which room and which panel is open. */
export default function RoomSheet({ room, panel, setPanel, onClose }: { room: Room; panel: Panel; setPanel: (p: Panel) => void; onClose: () => void }) {
  const { activeLease, reservedLease, tenants, bills, bookings } = useData();
  const today = todayBkk(), period = periodOf(today);
  const lease = activeLease.get(room.id);
  const tenant = lease ? tenants.get(lease.tenantId) : undefined;
  const st = roomState(room, { bills, hasLease: !!lease, reserved: reservedLease.has(room.id), bookings, period, today });
  const toMain = () => setPanel({ name: "main" });
  const back = { label: `ห้อง ${room.number}`, onClick: toMain };
  const bill = "billId" in panel ? bills.find((b) => b.id === panel.billId) : undefined;
  const common = { room, lease, tenant, st, setPanel, onClose, back, today, period };

  switch (panel.name) {
    case "bill": return bill ? <BillPanel {...common} bill={bill} /> : <Main {...common} />;
    case "pay": return bill ? <PayPanel {...common} bill={bill} /> : <Main {...common} />;
    case "edit-bill": return bill ? (
      <Sheet open title={`แก้บิล ${monthShort(bill.period)}`} onClose={onClose} back={{ label: "บิล", onClick: () => setPanel({ name: "bill", billId: bill.id }) }}>
        <BillEditor bill={bill} onDone={() => setPanel({ name: "bill", billId: bill.id })} />
      </Sheet>) : <Main {...common} />;
    case "issue": return lease ? <IssuePanel {...common} lease={lease} /> : <Main {...common} />;
    case "done": return bill ? <DonePanel {...common} bill={bill} /> : <Main {...common} />;
    case "tenant": return <NewTenantPanel {...common} />;
    case "manage": return (
      <Sheet open title={tenant?.fullName ?? "ผู้เช่า"} onClose={onClose} back={back}>
        {lease && <TenantCard key={lease.id} room={room} tenant={tenant} lease={lease} />}
      </Sheet>);
    case "room": return (
      <Sheet open title={`ข้อมูลห้อง ${room.number}`} onClose={onClose} back={back}>
        <RoomEdit room={room} canDelete={!lease && !bills.some((b) => b.roomId === room.id)} onDeleted={onClose} />
      </Sheet>);
    case "booking": return (
      <Sheet open title="จองใหม่" onClose={onClose} back={back}><NewBooking room={room} onDone={toMain} /></Sheet>);
    case "manual": return (
      <Sheet open title="ออกบิลอื่น" onClose={onClose} back={back}>
        <ManualBill room={room} lease={lease} tenantName={tenant?.fullName ?? ""} onDone={toMain} />
      </Sheet>);
    case "repair": return (
      <Sheet open title={`แจ้งซ่อม ห้อง ${room.number}`} onClose={onClose} back={back}><MaintenanceForm roomId={room.id} onDone={toMain} /></Sheet>);
    default: return <Main {...common} />;
  }
}

type Common = { room: Room; lease?: Lease; tenant?: Tenant; st: RoomState<Bill>; setPanel: (p: Panel) => void; onClose: () => void; back: { label: string; onClick: () => void }; today: string; period: string };

// ───────────────────────── Main ─────────────────────────

function Main({ room, lease, tenant, st, setPanel, onClose, today, period }: Common) {
  const { property } = useProperty();
  const { bills, reservedLease, tenants, bookings } = useData();
  const a = useAction();
  const mine = bills.filter((b) => b.roomId === room.id);
  const reserved = reservedLease.get(room.id);
  const nightly = room.kind !== "monthly";
  const cur = st.current;
  const history = mine.filter((b) => b.id !== cur?.id).slice(0, 6);
  const oldestOpen = st.open[0];
  const inStay = bookings.find((k) => k.roomId === room.id && k.status === "checked_in");
  const arriving = bookings.find((k) => k.roomId === room.id && k.status === "confirmed" && k.checkIn <= today);

  let primary: { label: string; run: () => void } | null = null;
  if (oldestOpen) primary = { label: `รับเงิน ฿${thb(balance(oldestOpen))}`, run: () => setPanel({ name: "pay", billId: oldestOpen.id }) };
  else if (nightly) {
    if (inStay) primary = { label: `เช็กเอาต์ ${inStay.guestName}`, run: () => a.run(async () => { await setBookingStatus(property.id, inStay, "checked_out"); return "เช็กเอาต์แล้ว"; }) };
    else if (arriving) primary = { label: `เช็กอิน ${arriving.guestName}`, run: () => a.run(async () => { await setBookingStatus(property.id, arriving, "checked_in"); return "เช็กอินแล้ว"; }) };
    else if (conditionOf(room) === "cleaning") primary = { label: "ทำความสะอาดเสร็จ", run: () => a.run(async () => { await setCondition(property.id, room, "ready"); return "ห้องพร้อมแล้ว"; }) };
    else primary = { label: "จองใหม่", run: () => setPanel({ name: "booking" }) };
  } else if (!lease) primary = reserved ? null : { label: "เพิ่มผู้เช่า", run: () => setPanel({ name: "tenant" }) };
  else if (st.key === "todo") primary = { label: `ออกบิล ${monthShort(period)}`, run: () => setPanel({ name: "issue" }) };
  else if (cur) primary = { label: "ส่งใบเสร็จ", run: () => a.run(() => shareBill(cur)) };

  return (
    <Sheet open title={`ห้อง ${room.number}`} onClose={onClose}
      footer={primary && <Btn className="w-full" disabled={a.busy} onClick={primary.run}>{primary.label}</Btn>}>
      <p className="-mt-2 mb-3 flex items-center gap-2 text-muted">
        {nightly ? (room.kind === "daily" ? "รายวัน" : "Airbnb") : "รายเดือน"}{tenant ? ` · ${tenant.fullName}` : ""} <Pill tone={toneOf(st.key)}>{st.label}</Pill>
      </p>
      <div className="space-y-3">
        {!nightly && lease && (cur ? (
          <button onClick={() => setPanel({ name: "bill", billId: cur.id })} className="block w-full rounded-[20px] bg-surface p-4 text-left ring-1 ring-line">
            <span className="flex items-center justify-between"><span className="text-muted">บิล {monthShort(cur.period)}</span><Pill tone={billTone(cur, today)}>{billLabel(cur, today)}</Pill></span>
            <span className="num mt-1 block text-[34px] font-bold">฿{thb(cur.total)}</span>
            <span className="block text-sm text-muted">{cur.status === "partial" ? `จ่ายแล้ว ฿${thb(cur.paid)} · ` : ""}จ่ายภายใน {isoTh(cur.dueDate)}</span>
          </button>
        ) : (
          <Card>
            <p className="text-muted">บิล {monthShort(period)}</p>
            <p className="mt-1 text-[22px] font-bold">ยังไม่ออก</p>
            <p className="text-sm text-muted">ค่าเช่า ค่าบริการ และยอดค้างใส่ไว้แล้ว เหลือเลขไฟกับน้ำ</p>
          </Card>
        ))}

        {!nightly && !lease && (
          <Card>
            <p className="text-muted">{reserved ? "จองไว้แล้ว" : "ว่างอยู่"}</p>
            <p className="mt-1 text-[22px] font-bold">ราคา ฿{thb(room.rentMonthly)} / เดือน</p>
            <p className="text-sm text-muted">ประกัน ฿{thb(room.deposit)} · ชั้น {room.floor} · {CONDITION_TH[conditionOf(room)]}</p>
          </Card>
        )}
        {reserved && <ReservationCard key={reserved.id} room={room} tenant={tenants.get(reserved.tenantId)} lease={reserved} />}

        {lease && (
          <button onClick={() => setPanel({ name: "manage" })} className="flex w-full items-center gap-3 rounded-[20px] bg-surface p-4 text-left ring-1 ring-line">
            <TenantPhoto tenant={tenant} size={48} />
            <span className="flex-1"><span className="block font-semibold">{tenant?.fullName ?? "—"}</span>
              <span className="block text-sm text-muted">เช่า ฿{thb(lease.rent)} · สัญญาถึง {isoTh(lease.endDate)}{tenant?.lineUserId ? " · LINE ✓" : ""}</span></span>
            <span className="text-line-2">›</span>
          </button>
        )}

        {nightly && (
          <Card className="space-y-3">
            <p className="font-semibold">การจอง</p>
            <BookingList room={room} />
            {room.kind === "airbnb" && <IcalSync room={room} />}
          </Card>
        )}

        {history.length > 0 && (
          <div className="overflow-hidden rounded-[20px] bg-surface ring-1 ring-line">
            <p className="px-4 pt-3 pb-1 text-sm text-muted">บิลก่อนหน้า</p>
            {history.map((b) => (
              <Row key={b.id} onClick={() => setPanel({ name: "bill", billId: b.id })} label={`${monthShort(b.period)} ${b.period.slice(2, 4) === today.slice(2, 4) ? "" : String(Number(b.period.slice(0, 4)) + 543).slice(2)}`}
                value={<><span className="num font-semibold text-ink">฿{thb(b.total)}</span> <span className="text-sm">{billLabel(b, today)}</span></>}
                tone={billTone(b, today) === "bad" ? "bad" : billTone(b, today) === "ok" ? "ok" : "warn"} />
            ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-sm text-muted">สภาพห้อง</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="สภาพห้อง">
            {(Object.entries(CONDITION_TH) as [RoomCondition, string][]).map(([k, label]) => (
              <button key={k} aria-pressed={conditionOf(room) === k} disabled={a.busy}
                onClick={() => conditionOf(room) !== k && a.run(async () => { await setCondition(property.id, room, k); return `ห้อง ${room.number}: ${label}`; })}
                className={`min-h-12 rounded-2xl text-[15px] font-semibold ring-1 ${conditionOf(room) === k ? "bg-ink text-white ring-ink" : "bg-surface ring-line-2"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Btn kind="ghost" onClick={() => setPanel({ name: "repair" })}>แจ้งซ่อม</Btn>
          <Btn kind="ghost" onClick={() => setPanel({ name: "manual" })}>บิลอื่น</Btn>
          <Btn kind="ghost" onClick={() => setPanel({ name: "room" })}>แก้ห้อง</Btn>
        </div>
        {!nightly && lease && <Btn kind="text" className="w-full" onClick={() => go(`/print/slips?room=${encodeURIComponent(room.number)}`)}>พิมพ์ใบจดมิเตอร์ห้องนี้</Btn>}
        {a.view}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Bill ─────────────────────────

function BillPanel({ bill, tenant, setPanel, onClose, back, today }: Common & { bill: Bill }) {
  const { property, role } = useProperty();
  const a = useAction();
  const open = bill.status === "unpaid" || bill.status === "partial";
  const canWrite = role !== "viewer";
  const send = () => a.run(async () => (tenant?.lineUserId ? sendToLine(property.id, bill).catch(() => shareBill(bill)) : shareBill(bill)));
  const actions: { label: string; icon: string; run: () => void; main?: boolean; off?: boolean }[] = [
    open ? { label: "รับเงิน", icon: "M2 6h20v12H2zM2 10h20M6 15h4", run: () => setPanel({ name: "pay", billId: bill.id }), main: true, off: !canWrite }
      : { label: "ใบเสร็จ", icon: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6", run: () => a.run(() => shareBill(bill)), main: true },
    { label: "ส่ง", icon: "M22 2L11 13M22 2l-7 20-4-9-9-4z", run: send },
    { label: "พิมพ์", icon: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z", run: () => go(`/print/invoice/${bill.publicToken}`) },
    { label: "แก้ไข", icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z", run: () => setPanel({ name: "edit-bill", billId: bill.id }), off: !canWrite || bill.status === "void" || bill.status === "carried" },
  ];
  return (
    <Sheet open title={`บิล ${monthShort(bill.period)} ${String(Number(bill.period.slice(0, 4)) + 543).slice(2)}`} onClose={onClose} back={back}
      footer={
        <div className="grid grid-cols-4 gap-2">
          {actions.map((x) => (
            <button key={x.label} onClick={x.run} disabled={x.off || a.busy}
              className={`flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold disabled:opacity-35 ${x.main ? "bg-brand text-white" : "bg-surface text-ink ring-1 ring-line-2"}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={x.icon} /></svg>
              {x.label}
            </button>
          ))}
        </div>
      }>
      <p className="-mt-2 text-sm text-muted">{bill.billNo} · ออก {isoTh(bill.issueDate)}</p>
      <p className="num mt-1 text-[40px] font-bold leading-tight">฿{thb(bill.total)}</p>
      <div className="mt-1 flex items-center gap-2"><Pill tone={billTone(bill, today)}>{billLabel(bill, today)}</Pill>
        <span className="text-sm text-muted">{open ? `ค้าง ฿${thb(balance(bill))} · จ่ายภายใน ${isoTh(bill.dueDate)}` : bill.status === "paid" ? `รับครบ ฿${thb(bill.paid)}` : ""}</span></div>
      <div className="mt-4 rounded-[20px] bg-surface px-4 ring-1 ring-line">
        {bill.items.map((i, k) => (
          <div key={k} className="flex justify-between gap-3 border-t border-line py-3 first:border-t-0">
            <span>{i.label}{i.qty !== 1 && <span className="text-sm text-muted"> · {i.qty} × {thb(i.unitPrice)}</span>}</span>
            <span className="num">{thb(i.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[20px] bg-surface px-4 py-2 ring-1 ring-line">
        <p className="py-1 text-sm text-muted">ใบเสร็จ</p>
        <Payments bill={bill} />
        {!bill.paid && <p className="pb-2 text-sm text-muted">ยังไม่มีการจ่าย{bill.sentToLineAt ? " · ส่งทาง LINE แล้ว" : ""}</p>}
      </div>
      {canWrite && bill.status === "unpaid" && (
        <Btn kind="text" className="mt-4 w-full text-bad-ink" disabled={a.busy}
          onClick={() => { const reason = prompt(`ยกเลิกบิล ${bill.billNo} เพราะ`); if (reason !== null) a.run(async () => { await voidBill(property, bill, reason); setPanel({ name: "main" }); return "ยกเลิกบิลแล้ว"; }); }}>
          ยกเลิกบิลนี้
        </Btn>
      )}
      {a.view}
    </Sheet>
  );
}

// ───────────────────────── Receive money ─────────────────────────

function PayPanel({ bill, room, tenant, setPanel, onClose }: Common & { bill: Bill }) {
  const { property } = useProperty();
  const [amount, setAmount] = useState<number | "">(balance(bill));
  const [method, setMethod] = useState<Payment["method"]>("transfer");
  const [ref, setRef] = useState("");
  const a = useAction();
  return (
    <Sheet open tall={false} title={`รับเงิน ห้อง ${room.number}`} onClose={onClose} back={{ label: "บิล", onClick: () => setPanel({ name: "bill", billId: bill.id }) }}
      footer={<Btn className="w-full" disabled={a.busy || !amount} onClick={() => a.run(async () => {
        const no = await receivePayment(property, bill.id, Number(amount), method, ref);
        setPanel({ name: "main" });
        return `รับเงินแล้ว ฿${thb(Number(amount))} · ${no}`;
      })}>ได้รับเงิน ฿{thb(Number(amount) || 0)}</Btn>}>
      <p className="-mt-2 text-muted">{tenant?.fullName ?? bill.tenantName} · บิล {monthShort(bill.period)} ค้าง ฿{thb(balance(bill))}</p>
      <div className="mt-3"><NumField label="จำนวนเงิน" value={amount} onChange={setAmount} /></div>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="จ่ายด้วย">
        {(["transfer", "cash", "promptpay"] as Payment["method"][]).map((m) => (
          <button key={m} aria-pressed={method === m} onClick={() => setMethod(m)}
            className={`min-h-12 rounded-2xl font-semibold ring-1 ${method === m ? "bg-ink text-white ring-ink" : "bg-surface ring-line-2"}`}>{METHOD_TH[m] ?? m}</button>
        ))}
      </div>
      {method !== "cash" && <div className="mt-3"><Field label="เลขอ้างอิง (ไม่ใส่ก็ได้)" value={ref} onChange={(e) => setRef(e.target.value)} /></div>}
      {a.view}
    </Sheet>
  );
}

// ───────────────────────── Issue this month's bill (filled in for you) ─────────────────────────

function IssuePanel({ room, lease, tenant, setPanel, onClose, back, today, period }: Common & { lease: Lease }) {
  const { property } = useProperty();
  const { openBills, leases, bills } = useData();
  const readings = useLive<MeterReading>(query(collection(db(), "properties", property.id, "meterReadings"), where("roomId", "==", room.id)), `${property.id}/mr/${room.id}`);
  const { prev, saved } = readingsFor(readings, room.id, period);
  const [f, setF] = useState({ elec: "", water: "", prevE: "", prevW: "", discount: "", other: "" });
  const [more, setMore] = useState(false);
  const a = useAction();
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
  const elecCurr = num(f.elec || (saved ? String(saved.elec) : "")), waterCurr = num(f.water || (saved ? String(saved.water) : ""));
  const elecPrev = f.prevE !== "" ? num(f.prevE) : prev?.elec ?? NaN, waterPrev = f.prevW !== "" ? num(f.prevW) : prev?.water ?? NaN;
  const carry = carryOverBills(openBills, tenancyLeaseIds(leases, lease.id), period);
  const already = bills.find((b) => b.roomId === room.id && b.period === period && b.leaseId);
  let items: BillItem[] | null = null, error = "";
  if ([elecPrev, waterPrev, elecCurr, waterCurr].every(Number.isFinite)) {
    try {
      items = meterBill({ rent: lease.rent, elecPrev, elecCurr, elecRate: lease.elecRate, waterPrev, waterCurr, waterRate: lease.waterRate,
        ac: lease.acFee, internet: lease.internet, parking: lease.parking, prevBalance: carryAmount(carry), other: num(f.other) || 0, discount: num(f.discount) || 0 });
    } catch (e) { error = (e as Error).message; }
  }
  const needPrev = !prev && (f.prevE === "" || f.prevW === "");
  const units = (c: number, p: number) => (Number.isFinite(c) && Number.isFinite(p) && c >= p ? c - p : null);
  const eu = units(elecCurr, elecPrev), wu = units(waterCurr, waterPrev);

  if (already) return (
    <Sheet open tall={false} title={`บิล ${monthShort(period)} ออกแล้ว`} onClose={onClose} back={back}
      footer={<Btn className="w-full" onClick={() => setPanel({ name: "bill", billId: already.id })}>ดูบิล ฿{thb(already.total)}</Btn>}>
      <p className="text-muted">ห้องนี้ออกบิลเดือนนี้แล้ว ถ้าจะเก็บค่าอื่นเพิ่ม ใช้ “บิลอื่น” ในหน้าห้อง</p>
    </Sheet>
  );

  const box = "mt-1 block w-full min-h-14 rounded-2xl bg-surface px-4 text-[22px] font-bold ring-2 ring-ink outline-none focus:ring-brand";
  return (
    <Sheet open title={`ออกบิล ${monthShort(period)} · ห้อง ${room.number}`} onClose={onClose} back={back}
      footer={<Btn className="w-full" disabled={a.busy || !items} onClick={() => a.run(async () => {
        if (!items) return;
        const { start, end } = monthRange(period);
        const b = await issueBill(property, { room, tenantName: tenant?.fullName ?? "", tenantPhone: tenant?.phone ?? "", leaseId: lease.id, bookingId: null,
          periodStart: start, periodEnd: end, dueDate: dueDateAfterPeriod(period, lease.dueDay), items,
          meter: { readOn: saved?.readOn ?? today, elec: elecCurr, water: waterCurr, id: saved?.id }, carryFrom: carry });
        setPanel({ name: "done", billId: b.id });
      })}>{items ? `ออกบิล ฿${thb(total(items))}` : error || "ใส่เลขไฟกับน้ำ"}</Btn>}>
      <div className="grid grid-cols-2 gap-2">
        <label className="rounded-[20px] bg-surface p-3 text-sm text-muted ring-1 ring-line">ไฟ {prev ? `(เดิม ${thb(prev.elec)})` : ""}
          <input className={box} inputMode="decimal" placeholder="เลขวันนี้" autoFocus value={f.elec || (saved ? String(saved.elec) : "")} onChange={(e) => setF({ ...f, elec: e.target.value })} />
          <span className="mt-1 block font-semibold text-ink">{eu !== null ? `${thb(eu)} หน่วย ฿${thb(eu * lease.elecRate)}` : " "}</span>
        </label>
        <label className="rounded-[20px] bg-surface p-3 text-sm text-muted ring-1 ring-line">น้ำ {prev ? `(เดิม ${thb(prev.water)})` : ""}
          <input className={box} inputMode="decimal" placeholder="เลขวันนี้" value={f.water || (saved ? String(saved.water) : "")} onChange={(e) => setF({ ...f, water: e.target.value })} />
          <span className="mt-1 block font-semibold text-ink">{wu !== null ? `${thb(wu)} หน่วย ฿${thb(wu * lease.waterRate)}` : " "}</span>
        </label>
      </div>
      {needPrev && <p className="mt-2 rounded-2xl bg-warn-soft p-3 text-sm text-warn-ink">ห้องนี้ยังไม่มีเลขครั้งก่อน ใส่ที่ “เลขเดิม” ด้านล่าง</p>}
      <div className="mt-2 rounded-[20px] bg-surface px-4 ring-1 ring-line">
        <div className="flex justify-between border-line py-3"><span>ค่าเช่า</span><span className="num">{thb(lease.rent)}</span></div>
        {lease.acFee > 0 && <div className="flex justify-between border-t border-line py-3"><span>ค่าแอร์</span><span className="num">{thb(lease.acFee)}</span></div>}
        {lease.internet > 0 && <div className="flex justify-between border-t border-line py-3"><span>อินเทอร์เน็ต</span><span className="num">{thb(lease.internet)}</span></div>}
        {lease.parking > 0 && <div className="flex justify-between border-t border-line py-3"><span>ที่จอดรถ</span><span className="num">{thb(lease.parking)}</span></div>}
        {carry.length > 0 && <div className="flex justify-between border-t border-line py-3"><span>ค้างจาก {carry.map((b) => monthShort(b.period)).join(", ")}</span><span className="num">{thb(carryAmount(carry))}</span></div>}
      </div>
      <button onClick={() => setMore(!more)} className="mt-2 flex min-h-14 w-full items-center justify-between rounded-2xl bg-line px-4 font-medium">
        <span>ส่วนลด ค่าอื่นๆ แก้เลขเดิม</span><span>{more || needPrev ? "−" : "+"}</span>
      </button>
      {(more || needPrev) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="ส่วนลด" inputMode="decimal" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} />
          <Field label="ค่าอื่นๆ" inputMode="decimal" value={f.other} onChange={(e) => setF({ ...f, other: e.target.value })} />
          <Field label="ไฟ เลขเดิม" inputMode="decimal" value={f.prevE !== "" ? f.prevE : prev ? String(prev.elec) : ""} onChange={(e) => setF({ ...f, prevE: e.target.value })} />
          <Field label="น้ำ เลขเดิม" inputMode="decimal" value={f.prevW !== "" ? f.prevW : prev ? String(prev.water) : ""} onChange={(e) => setF({ ...f, prevW: e.target.value })} />
        </div>
      )}
      {a.view}
    </Sheet>
  );
}

function DonePanel({ bill, room, tenant, setPanel, onClose }: Common & { bill: Bill }) {
  const { property } = useProperty();
  const a = useAction();
  return (
    <Sheet open tall={false} title={`ออกบิลแล้ว ฿${thb(bill.total)}`} onClose={onClose}
      footer={
        <div className="space-y-2">
          <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => tenant?.lineUserId ? sendToLine(property.id, bill).catch(() => shareBill(bill)) : shareBill(bill))}>
            {tenant?.lineUserId ? "ส่งทาง LINE" : "ส่งลิงก์ให้ผู้เช่า"}
          </Btn>
          <div className="grid grid-cols-2 gap-2">
            <Btn kind="ghost" onClick={() => go(`/print/invoice/${bill.publicToken}`)}>พิมพ์</Btn>
            <Btn kind="ghost" onClick={() => setPanel({ name: "main" })}>เสร็จ</Btn>
          </div>
        </div>
      }>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      </div>
      <p className="mt-3 text-muted">ห้อง {room.number} · {tenant?.fullName ?? bill.tenantName} · จ่ายภายใน {isoTh(bill.dueDate)}</p>
      {a.view}
    </Sheet>
  );
}

// ───────────────────────── New tenant (3 fields; terms come from the room) ─────────────────────────

const digits = (s: string) => s.replace(/\D/g, "");

function NewTenantPanel({ room, setPanel, onClose, back, today }: Common) {
  const { property } = useProperty();
  const { tenants, leases } = useData();
  const [phone, setPhone] = useState(""), [name, setName] = useState(""), [start, setStart] = useState(today);
  const [special, setSpecial] = useState(false);
  const defaults = {
    elec: property.defaultElecRate ?? leases.find((l) => l.status === "active")?.elecRate ?? 8,
    water: property.defaultWaterRate ?? leases.find((l) => l.status === "active")?.waterRate ?? 20,
    due: property.defaultDueDay ?? 5,
  };
  const [t, setT] = useState({ rent: room.rentMonthly as number | "", deposit: room.deposit as number | "", elec: defaults.elec as number | "", water: defaults.water as number | "", ac: "" as number | "", due: defaults.due as number | "" });
  const a = useAction();
  const match = digits(phone).length >= 9 ? [...tenants.values()].find((x) => digits(x.phone) === digits(phone)) : undefined;
  const pastRoom = match ? leases.filter((l) => l.tenantId === match.id).sort((x, y) => (y.startDate ?? "").localeCompare(x.startDate ?? ""))[0] : undefined;
  const busyElsewhere = match && leases.some((l) => l.tenantId === match.id && l.status === "active");
  const who = name.trim() || match?.fullName || "";
  const n = (v: number | "") => (v === "" ? 0 : v);
  const reserve = start > today;
  return (
    <Sheet open title={`ผู้เช่าใหม่ · ห้อง ${room.number}`} onClose={onClose} back={back}
      footer={<Btn className="w-full" disabled={a.busy || !who} onClick={() => a.run(async () => {
        const lease = { startDate: start, endDate: addDays(start, 365), rent: n(t.rent), deposit: n(t.deposit), advance: 0, elecRate: n(t.elec), waterRate: n(t.water),
          acFee: n(t.ac), internet: 0, parking: 0, dueDay: n(t.due) || 5 };
        const person = match ? { id: match.id, fullName: who, phone: phone.trim() } : { fullName: who, nickname: "", phone: phone.trim(), lineUserId: null, emergency: "", note: "" };
        await moveIn(property.id, room, person, lease, reserve);
        setPanel({ name: "main" });
        return reserve ? `จองห้อง ${room.number} ให้${who}แล้ว` : `${who} เข้าอยู่ห้อง ${room.number} แล้ว`;
      })}>{!who ? "ใส่ชื่อผู้เช่า" : reserve ? `จองห้อง ${room.number}` : `ให้เข้าอยู่ห้อง ${room.number}`}</Btn>}>
      <Card className="space-y-3">
        <Field label="เบอร์โทร" type="tel" inputMode="tel" placeholder="08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
        {match && (
          <p className={`rounded-2xl p-3 text-sm ${busyElsewhere ? "bg-warn-soft text-warn-ink" : "bg-brand-soft text-brand-dark"}`}>
            {busyElsewhere ? "เบอร์นี้ยังเช่าอยู่อีกห้อง จะเป็นสัญญาเพิ่มของคนเดิม" : "เคยเช่ากับเรา"}: <b>{match.fullName}</b>{pastRoom ? ` (สัญญาล่าสุดเริ่ม ${isoTh(pastRoom.startDate)})` : ""} · ใช้ข้อมูลเดิม ไม่สร้างซ้ำ
          </p>
        )}
        <Field label="ชื่อ-นามสกุล" placeholder={match?.fullName ?? "ชื่อผู้เช่า"} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={reserve ? "วันเข้าอยู่ (จองล่วงหน้า)" : "วันเข้าอยู่"} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </Card>
      <div className="mt-3 rounded-[20px] bg-surface px-4 ring-1 ring-line">
        <p className="pt-3 pb-1 text-sm text-muted">ตามห้อง {room.number} และค่าตั้งต้นของตึก</p>
        {!special ? (
          <>
            <div className="flex justify-between border-t border-line py-3"><span>ค่าเช่า</span><span className="num">฿{thb(n(t.rent))}</span></div>
            <div className="flex justify-between border-t border-line py-3"><span>ประกัน</span><span className="num">฿{thb(n(t.deposit))}</span></div>
            <div className="flex justify-between border-t border-line py-3"><span>ไฟ / น้ำ</span><span>{n(t.elec)} / {n(t.water)} บาทต่อหน่วย</span></div>
            <div className="flex justify-between border-t border-line py-3"><span>จ่ายทุกวันที่</span><span>{n(t.due)}</span></div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 pb-3">
            <NumField label="ค่าเช่า" value={t.rent} onChange={(v) => setT({ ...t, rent: v })} />
            <NumField label="ประกัน" value={t.deposit} onChange={(v) => setT({ ...t, deposit: v })} />
            <NumField label="ไฟ/หน่วย" value={t.elec} onChange={(v) => setT({ ...t, elec: v })} />
            <NumField label="น้ำ/หน่วย" value={t.water} onChange={(v) => setT({ ...t, water: v })} />
            <NumField label="ค่าแอร์/เดือน" value={t.ac} onChange={(v) => setT({ ...t, ac: v })} />
            <NumField label="จ่ายทุกวันที่" value={t.due} onChange={(v) => setT({ ...t, due: v })} />
          </div>
        )}
      </div>
      {!special && <Btn kind="text" className="mt-1" onClick={() => setSpecial(true)}>ตกลงราคาพิเศษกับคนนี้</Btn>}
      {special && <p className="mt-2 text-sm text-muted">ใช้กับสัญญานี้เท่านั้น ราคาห้องยังเท่าเดิม</p>}
      {a.view}
    </Sheet>
  );
}
