"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Field, NumField, Select, useAction } from "@/components/ui";
import { cancelBooking, createBooking, issueBill, setBookingStatus, updateRoom } from "@/lib/ops";
import { nightlyBill, nights } from "@/lib/billing";
import { addDays, isoTh, todayBkk } from "@/lib/dates";
import { thb, type Booking, type Room } from "@/lib/model";

const SOURCE_TH = { direct: "จองตรง", airbnb: "Airbnb", other: "อื่นๆ" } as const;

function BookingRow({ room, b }: { room: Room; b: Booking }) {
  const { property } = useProperty();
  const { bills } = useData();
  const a = useAction();
  const bill = b.billId ? bills.find((x) => x.id === b.billId) : undefined;
  const pid = property.id;
  return (
    <li className="rounded-xl bg-surface p-3 ring-1 ring-black/10">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-semibold">{b.guestName}</p>
          <p className="text-sm text-muted">{isoTh(b.checkIn)} → {isoTh(b.checkOut)} · {nights(b.checkIn, b.checkOut)} คืน · {SOURCE_TH[b.source]}</p>
        </div>
        <p className="text-sm">{b.status === "checked_in" ? "เข้าพักอยู่" : b.status === "checked_out" ? "เช็คเอาท์แล้ว" : "ยืนยันแล้ว"}</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {b.status === "confirmed" && <Btn disabled={a.busy} onClick={() => a.run(async () => { await setBookingStatus(pid, b, "checked_in"); })}>เช็คอิน</Btn>}
        {b.status === "checked_in" && <Btn disabled={a.busy} onClick={() => a.run(async () => { await setBookingStatus(pid, b, "checked_out"); return "เช็คเอาท์แล้ว ห้องเปลี่ยนเป็นทำความสะอาด"; })}>เช็คเอาท์</Btn>}
        {!b.billId && b.source !== "airbnb" && (
          <Btn kind="ghost" disabled={a.busy} onClick={() => a.run(async () => {
            const x = await issueBill(property, { room, tenantName: b.guestName, leaseId: null, bookingId: b.id,
              periodStart: b.checkIn, periodEnd: b.checkOut, dueDate: b.checkIn,
              items: nightlyBill({ checkIn: b.checkIn, checkOut: b.checkOut, nightlyRate: b.nightlyRate }) });
            return `ออกบิล ${x.billNo} แล้ว`;
          })}>ออกบิล</Btn>
        )}
        {bill && <p className="self-center text-sm text-muted">บิล {bill.billNo} · {bill.status === "paid" ? "จ่ายแล้ว" : `ค้าง ฿${thb(bill.total - bill.paid)}`}</p>}
        {b.status === "confirmed" && (
          <Btn kind="danger" disabled={a.busy} onClick={() => confirm("ยกเลิกการจองนี้?") && a.run(async () => { await cancelBooking(pid, b); return "ยกเลิกแล้ว"; })}>ยกเลิกจอง</Btn>
        )}
      </div>
      {a.view}
    </li>
  );
}

export function BookingList({ room }: { room: Room }) {
  const { bookings } = useData();
  const list = bookings.filter((b) => b.roomId === room.id && b.status !== "checked_out");
  if (!list.length) return <p className="text-sm text-muted">ยังไม่มีการจอง</p>;
  return <ul className="space-y-2">{list.map((b) => <BookingRow key={b.id} room={room} b={b} />)}</ul>;
}

export function NewBooking({ room, onDone }: { room: Room; onDone: () => void }) {
  const { property } = useProperty();
  const today = todayBkk();
  const [f, setF] = useState({ guestName: "", guestPhone: "", checkIn: today, checkOut: addDays(today, 1), nightlyRate: room.priceNightly as number | "", source: "direct" });
  const a = useAction();
  const n = (() => { try { return nights(f.checkIn, f.checkOut); } catch { return 0; } })();
  return (
    <div className="space-y-3">
      <Field label="ชื่อผู้เข้าพัก *" value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
      <Field label="เบอร์โทร" type="tel" value={f.guestPhone} onChange={(e) => setF({ ...f, guestPhone: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="เช็คอิน" type="date" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} />
        <Field label="เช็คเอาท์" type="date" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} />
        <NumField label="ราคา/คืน" value={f.nightlyRate} onChange={(v) => setF({ ...f, nightlyRate: v })} />
        <Select label="ช่องทาง" value={f.source} onChange={(v) => setF({ ...f, source: v })} options={Object.entries(SOURCE_TH)} />
      </div>
      <p className="font-semibold">{n} คืน · รวม ฿{thb(n * (f.nightlyRate || 0))}</p>
      <Btn className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
        if (!f.guestName.trim()) throw new Error("กรุณากรอกชื่อผู้เข้าพัก");
        await createBooking(property.id, { roomId: room.id, guestName: f.guestName.trim(), guestPhone: f.guestPhone.trim(),
          checkIn: f.checkIn, checkOut: f.checkOut, nightlyRate: f.nightlyRate || 0, source: f.source as Booking["source"] });
        onDone();
      })}>บันทึกการจอง</Btn>
      {a.view}
    </div>
  );
}

/** Pull reservations from the room's Airbnb calendar (iCal link from Airbnb → Calendar → Export). */
export function IcalSync({ room }: { room: Room }) {
  const { property } = useProperty();
  const { bookings } = useData();
  const [url, setUrl] = useState(room.icalUrl ?? "");
  const a = useAction();
  return (
    <div className="space-y-2">
      <Field label="ลิงก์ปฏิทิน Airbnb (iCal)" placeholder="https://www.airbnb.com/calendar/ical/…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Btn kind="ghost" className="w-full" disabled={a.busy || !url} onClick={() => a.run(async () => {
        if (url !== room.icalUrl) await updateRoom(property.id, room.id, { icalUrl: url });
        const res = await fetch(`/api/ical?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "ดึงปฏิทินไม่สำเร็จ");
        const known = new Set(bookings.map((b) => b.externalUid).filter(Boolean));
        let added = 0, clash = 0;
        for (const ev of data.events as { uid: string; start: string; end: string; summary: string }[]) {
          if (known.has(ev.uid) || ev.end < todayBkk()) continue;
          try {
            await createBooking(property.id, { roomId: room.id, guestName: ev.summary || "Airbnb", guestPhone: "",
              checkIn: ev.start, checkOut: ev.end, nightlyRate: 0, source: "airbnb", externalUid: ev.uid });
            added++;
          } catch { clash++; }
        }
        return `ซิงก์แล้ว: เพิ่ม ${added} การจอง${clash ? ` · ชนกับการจองเดิม ${clash} รายการ` : ""}`;
      })}>ซิงก์ปฏิทิน Airbnb</Btn>
      {a.view}
    </div>
  );
}
