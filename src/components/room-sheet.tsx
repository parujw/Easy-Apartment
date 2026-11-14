"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { Btn, Sheet, useAction } from "@/components/ui";
import BillRow from "@/components/bill-row";
import { MoveInForm, TenantCard } from "@/components/tenant-forms";
import ManualBill from "@/components/manual-bill";
import { BookingList, IcalSync, NewBooking } from "@/components/bookings";
import RoomEdit from "@/components/room-edit";
import { updateRoom } from "@/lib/ops";
import { CYCLE_TH, KIND_TH, STATUS_TH, type Room } from "@/lib/model";

type Panel = "main" | "movein" | "bill" | "booking" | "edit";

/** Everything about one room in one sheet; the main action changes with the room's state. */
export default function RoomSheet({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const [panel, setPanel] = useState<Panel>("main");
  const close = () => { setPanel("main"); onClose(); };
  if (!room) return null;
  return (
    <Sheet open title={`ห้อง ${room.number} · ${KIND_TH[room.kind]}`} onClose={close}>
      <Body room={room} panel={panel} setPanel={setPanel} close={close} />
    </Sheet>
  );
}

function Body({ room, panel, setPanel, close }: { room: Room; panel: Panel; setPanel: (p: Panel) => void; close: () => void }) {
  const { property } = useProperty();
  const { activeLease, tenants, bills, leases } = useData();
  const a = useAction();
  const lease = activeLease.get(room.id);
  const tenant = lease ? tenants.get(lease.tenantId) : undefined;
  const roomBills = bills.filter((b) => b.roomId === room.id);
  const open = roomBills.filter((b) => b.status === "unpaid" || b.status === "partial");
  const history = roomBills.filter((b) => b.status === "paid" || b.status === "carried").slice(0, 3);
  const nightly = room.kind !== "monthly";
  const back = <button className="mb-3 min-h-10 text-brand" onClick={() => setPanel("main")}>‹ กลับ</button>;

  if (panel === "movein") return <>{back}<MoveInForm room={room} onDone={() => setPanel("main")} /></>;
  if (panel === "bill") return <>{back}<ManualBill room={room} lease={lease} tenantName={tenant?.fullName ?? ""} onDone={() => setPanel("main")} /></>;
  if (panel === "booking") return <>{back}<NewBooking room={room} onDone={() => setPanel("main")} /></>;
  if (panel === "edit") return <>{back}<RoomEdit room={room} canDelete={!leases.some((l) => l.roomId === room.id) && !roomBills.length} onDeleted={close} /></>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-black/5 px-3 py-1">{nightly && room.status === "occupied" ? "เข้าพักอยู่" : STATUS_TH[room.status]}</span>
        <span className="text-muted">บิล{CYCLE_TH[room.billingCycle]}</span>
        {room.status === "cleaning" && (
          <Btn kind="ghost" className="ml-auto" disabled={a.busy}
            onClick={() => a.run(async () => { await updateRoom(property.id, room.id, { status: lease ? "occupied" : "vacant" }); })}>
            ทำความสะอาดเสร็จ
          </Btn>
        )}
      </div>
      {a.view}

      {open.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">บิลที่ยังไม่จ่าย</h3>
          <ul className="space-y-2">{open.map((b) => <BillRow key={b.id} bill={b} />)}</ul>
        </section>
      )}

      {nightly ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">การจอง</h3>
            <Btn onClick={() => setPanel("booking")}>+ จองใหม่</Btn>
          </div>
          <BookingList room={room} />
          {room.kind === "airbnb" && <IcalSync room={room} />}
        </section>
      ) : lease ? (
        <section className="space-y-2">
          <h3 className="font-semibold">ผู้เช่า</h3>
          <TenantCard key={lease.id} room={room} tenant={tenant} lease={lease} />
        </section>
      ) : (
        <Btn className="w-full" onClick={() => setPanel("movein")}>+ เพิ่มผู้เช่า</Btn>
      )}

      {history.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">บิลก่อนหน้า</h3>
          <ul className="space-y-2">{history.map((b) => <BillRow key={b.id} bill={b} />)}</ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(lease || nightly) && <Btn kind="ghost" onClick={() => setPanel("bill")}>ออกบิลเอง</Btn>}
        <Btn kind="ghost" onClick={() => setPanel("edit")}>แก้ไขห้อง</Btn>
      </div>
      {!nightly && lease && (
        <>
          <a href={`/print/slips?room=${encodeURIComponent(room.number)}`} target="_blank" className="flex min-h-12 items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-black/15">พิมพ์ใบจดมิเตอร์ห้องนี้</a>
          <p className="text-xs text-muted">บิลรายเดือนพร้อมค่าน้ำค่าไฟ ออกได้ที่แท็บ “ออกบิล”</p>
        </>
      )}
    </div>
  );
}
