// Every morning 08:00 (Bangkok): W sends each owner who linked their LINE the same report the app reads out.
import { NextResponse } from "next/server";
import { adminDb, activeProperty } from "@/lib/server/admin";
import { lineConfigured, pushText } from "@/lib/line";
import { buildWorld } from "@/lib/world";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!lineConfigured()) return NextResponse.json({ skipped: "LINE not configured" });
  const db = adminDb();
  const today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 120 * 864e5).toISOString().slice(0, 10);
  const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  let sent = 0;
  for (const p of (await db.collection("properties").get()).docs) {
    if (!activeProperty(p.data())) continue;
    const owners = Object.entries((p.data().members ?? {}) as Record<string, string>).filter(([, r]) => r === "owner").map(([uid]) => uid);
    const lineIds = (await Promise.all(owners.map((u) => db.doc(`users/${u}`).get()))).map((d) => d.data()?.lineUserId as string | undefined).filter(Boolean) as string[];
    if (!lineIds.length) continue;
    const c = (n: string) => p.ref.collection(n);
    const [rooms, leases, tenants, recent, open, maint, exp, reads, books] = await Promise.all([
      c("rooms").get(), c("leases").get(), c("tenants").get(), c("bills").where("issueDate", ">=", since).get(),
      c("bills").where("status", "in", ["unpaid", "partial"]).get(), c("maintenance").where("status", "in", ["open", "in_progress"]).get(),
      c("expenses").where("spentOn", ">=", monthStart).get(), c("meterReadings").where("readOn", ">=", monthStart).get(),
      c("bookings").where("checkOut", ">=", today).get(),
    ]);
    const all = <T,>(s: FirebaseFirestore.QuerySnapshot) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
    const bills = new Map([...all<{ id: string }>(recent), ...all<{ id: string }>(open)].map((b) => [b.id, b]));
    const w = buildWorld({
      rooms: all(rooms), leases: all(leases), tenants: new Map(all<{ id: string; fullName: string; lineUserId: string | null }>(tenants).map((t) => [t.id, t])),
      bills: [...bills.values()] as never, maintenance: all(maint), bookings: all(books),
      expenses: all<{ amount: number }>(exp).reduce((s, e) => s + (e.amount || 0), 0),
      readRoomIds: new Set(all<{ roomId: string }>(reads).map((r) => r.roomId)), today,
      property: { name: p.data().name ?? "", address: p.data().address ?? "", phone: p.data().phone ?? "", lineId: p.data().lineId },
      owner: { callName: p.data().wCallName, buildingName: p.data().wBuildingName || p.data().name },
    });
    const text = `W · ${p.data().name}\n\n${w.brief.join("\n")}\n\n${w.drafts.length ? `ข้อความร่าง ${w.drafts.length} ข้อความรอคุณกดส่ง\n` : ""}เปิด W World: ${origin}/world`;
    for (const id of lineIds) { try { await pushText(id, text); sent++; } catch (e) { console.error("brief", e); } }
  }
  return NextResponse.json({ today, sent });
}
