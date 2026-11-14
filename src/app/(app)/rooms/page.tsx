import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { currentProperty } from "@/lib/property";

type Room = { id: string; number: string; floor: string; kind: string; status: string };
type Bill = { room_id: string; status: string; due_date: string; total: number; paid: number };

const thb = (n: number) => n.toLocaleString("th-TH");

// Money state of each room drives its colour (green paid · amber waiting · red overdue · grey vacant)
function tone(room: Room, bill: Bill | undefined, today: string) {
  if (room.status === "vacant") return { label: "ว่าง", cls: "bg-black/5 text-muted" };
  if (!bill) return { label: "ยังไม่ออกบิล", cls: "bg-surface ring-1 ring-black/10" };
  if (bill.status === "paid") return { label: "จ่ายแล้ว", cls: "bg-emerald-100 text-emerald-900" };
  if (bill.due_date < today) return { label: "เกินกำหนด", cls: "bg-red-100 text-red-900" };
  return { label: "รอจ่าย", cls: "bg-amber-100 text-amber-900" };
}

export default async function RoomsPage() {
  const property = await currentProperty();
  if (!property) {
    return <p>ไม่พบข้อมูลหอพัก <Link className="text-brand underline" href="/login?mode=signup">สมัครใช้งาน</Link></p>;
  }
  const sb = await supabaseServer();
  const [{ data: rooms }, { data: bills }] = await Promise.all([
    sb.from("rooms").select("id, number, floor, kind, status").order("number"),
    sb.from("bills").select("room_id, status, due_date, total, paid, issue_date").neq("status", "void").order("issue_date", { ascending: false }),
  ]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const latest = new Map<string, Bill>();
  for (const b of (bills ?? []) as Bill[]) if (!latest.has(b.room_id)) latest.set(b.room_id, b);
  const open = [...latest.values()].filter((b) => b.status !== "paid");
  const due = open.reduce((s, b) => s + Number(b.total) - Number(b.paid), 0);
  const floors = Map.groupBy((rooms ?? []) as Room[], (r) => r.floor || "-");

  return (
    <>
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{property.name}</h1>
        <span className={`text-sm ${property.daysLeft <= 3 ? "text-red-600" : "text-muted"}`}>
          {property.paid_until ? `ใช้ได้อีก ${property.daysLeft} วัน` : "ยังไม่ได้เปิดใช้งาน"}
        </span>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/10">
          <p className="text-sm text-muted">ค้างรับ</p>
          <p className="text-2xl font-bold">฿{thb(due)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/10">
          <p className="text-sm text-muted">บิลที่ยังไม่จ่าย</p>
          <p className="text-2xl font-bold">{open.length}</p>
        </div>
      </section>

      {(rooms ?? []).length === 0 && (
        <p className="mt-8 text-muted">ยังไม่มีห้อง — เพิ่มห้องได้ที่แท็บ “เงิน &amp; อื่นๆ” → ตั้งค่า</p>
      )}

      {[...floors].map(([floor, list]) => (
        <section key={floor} className="mt-6">
          <h2 className="text-sm font-semibold text-muted">ชั้น {floor}</h2>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {list.map((r) => {
              const t = tone(r, latest.get(r.id), today);
              return (
                <li key={r.id}>
                  <div className={`flex min-h-20 flex-col justify-center rounded-xl p-2 text-center ${t.cls}`}>
                    <span className="text-lg font-bold">{r.number}</span>
                    <span className="text-xs">{t.label}</span>
                    {r.kind !== "monthly" && <span className="text-[11px] opacity-70">{r.kind === "daily" ? "รายวัน" : "Airbnb"}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
