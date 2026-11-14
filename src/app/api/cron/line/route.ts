// Daily (Vercel Cron, see vercel.json): remind linked tenants 3 days before due, and 1 & 7 days after.
import { NextResponse } from "next/server";
import { adminDb, activeProperty } from "@/lib/server/admin";
import { billText, lineConfigured, pushText, reminderKind } from "@/lib/line";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!lineConfigured()) return NextResponse.json({ skipped: "LINE not configured" });
  const db = adminDb();
  const today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10); // Asia/Bangkok
  const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  let sent = 0, failed = 0;
  for (const p of (await db.collection("properties").get()).docs) {
    if (!activeProperty(p.data())) continue;
    const open = await p.ref.collection("bills").where("status", "in", ["unpaid", "partial"]).get();
    for (const doc of open.docs) {
      const b = doc.data();
      const kind = reminderKind(b.dueDate, today);
      if (!kind || !b.leaseId) continue;
      const lease = (await p.ref.collection("leases").doc(b.leaseId).get()).data();
      const tenant = lease ? (await p.ref.collection("tenants").doc(lease.tenantId).get()).data() : undefined;
      if (!tenant?.lineUserId) continue;
      try { await pushText(tenant.lineUserId, billText(b as never, p.data().name, origin, kind)); sent++; } catch { failed++; }
    }
  }
  return NextResponse.json({ today, sent, failed });
}
