"use client";

import { useState } from "react";
import Link from "next/link";
import { useData } from "@/components/data-provider";
import { TenantPhoto } from "@/components/tenant-forms";
import { isoTh } from "@/lib/dates";
import { thb } from "@/lib/model";

/** Current and past tenants with their rooms over time (V3 tenants page). */
export default function TenantsPage() {
  const { tenants, leases, rooms } = useData();
  const [show, setShow] = useState<"current" | "past">("current");
  const [q, setQ] = useState("");
  const roomNo = (id: string) => rooms.find((r) => r.id === id)?.number ?? "?";
  const rows = [...tenants.values()].map((t) => {
    const ls = leases.filter((l) => l.tenantId === t.id).sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
    const current = ls.find((l) => l.status === "active" || l.status === "reserved");
    return { t, ls, current };
  })
    .filter((r) => (show === "current" ? !!r.current : !r.current))
    .filter((r) => !q || `${r.t.fullName} ${r.t.nickname} ${r.t.phone} ${r.ls.map((l) => roomNo(l.roomId)).join(" ")}`.includes(q.trim()))
    .sort((a, b) => roomNo(a.current?.roomId ?? a.ls[0]?.roomId ?? "").localeCompare(roomNo(b.current?.roomId ?? b.ls[0]?.roomId ?? ""), "th", { numeric: true }));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold"><Link href="/more" className="text-brand" aria-label="กลับ">‹</Link> ผู้เช่า</h1>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="แสดง">
        {([["current", "ผู้เช่าปัจจุบัน"], ["past", "ย้ายออกแล้ว"]] as const).map(([k, label]) => (
          <button key={k} aria-pressed={show === k} onClick={() => setShow(k)}
            className={`min-h-12 rounded-xl font-semibold ring-1 ${show === k ? "bg-brand text-white ring-brand" : "ring-black/15"}`}>{label}</button>
        ))}
      </div>
      <input aria-label="ค้นหา" placeholder="ค้นหาชื่อ เบอร์ หรือเลขห้อง" className="min-h-12 w-full rounded-xl border border-black/15 bg-surface px-3" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="space-y-2">
        {rows.map(({ t, ls, current }) => (
          <li key={t.id} className="rounded-xl bg-surface p-3 ring-1 ring-black/10">
            <div className="flex items-center gap-3">
              <TenantPhoto tenant={t} size={48} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.fullName}{t.nickname && ` (${t.nickname})`}</p>
                <p className="text-sm text-muted">
                  {current ? `ห้อง ${roomNo(current.roomId)}${current.status === "reserved" ? " (จอง)" : ""}` : "ย้ายออกแล้ว"}
                  {t.phone && <> · <a className="text-brand" href={`tel:${t.phone}`}>{t.phone}</a></>}
                  {t.lineUserId && " · LINE ✓"}
                </p>
              </div>
            </div>
            {ls.length > 0 && (
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer text-muted">ประวัติการเช่า ({ls.length})</summary>
                <ul className="mt-1 space-y-1">
                  {ls.map((l) => (
                    <li key={l.id}>
                      ห้อง {roomNo(l.roomId)} · {l.startDate ? isoTh(l.startDate) : "?"} – {l.endDate && l.status === "ended" ? isoTh(l.endDate) : "ปัจจุบัน"} · ฿{thb(l.rent)}/เดือน
                      {l.transferredTo && " · ย้ายห้อง"}{l.endedReason && ` · ${l.endedReason}`}
                      {l.depositRefund && ` · คืนประกัน ฿${thb(l.depositRefund.amount)} (หัก ฿${thb(l.depositRefund.deducted)})`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      {!rows.length && <p className="text-muted">ไม่พบผู้เช่า</p>}
    </div>
  );
}
