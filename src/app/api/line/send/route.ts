// Owner/assistant presses "ส่งเข้า LINE" on a bill → push it to the linked tenant from the central OA.
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, activeProperty, memberRole } from "@/lib/server/admin";
import { billText, lineConfigured, pushText } from "@/lib/line";

export async function POST(req: Request) {
  if (!lineConfigured()) return NextResponse.json({ error: "ระบบ LINE ยังไม่เปิดใช้งาน ใช้ปุ่ม “ส่งบิล” แทนไปก่อน" }, { status: 503 });
  const { propertyId, billId, origin } = (await req.json().catch(() => ({}))) as { propertyId?: string; billId?: string; origin?: string };
  if (!propertyId || !billId) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  const who = await memberRole(req, propertyId);
  if (!who || who.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  const db = adminDb();
  const p = await db.doc(`properties/${propertyId}`).get();
  if (!activeProperty(p.data())) return NextResponse.json({ error: "แพ็กเกจหมดอายุ" }, { status: 402 });
  const billRef = db.doc(`properties/${propertyId}/bills/${billId}`);
  const bill = (await billRef.get()).data();
  if (!bill) return NextResponse.json({ error: "ไม่พบบิล" }, { status: 404 });
  if (!bill.leaseId) return NextResponse.json({ error: "บิลนี้ไม่มีผู้เช่ารายเดือน" }, { status: 400 });
  const lease = (await db.doc(`properties/${propertyId}/leases/${bill.leaseId}`).get()).data();
  const tenant = lease ? (await db.doc(`properties/${propertyId}/tenants/${lease.tenantId}`).get()).data() : undefined;
  if (!tenant?.lineUserId) return NextResponse.json({ error: "ผู้เช่ายังไม่ได้เชื่อม LINE — สร้างรหัสเชื่อมที่หน้าผู้เช่า" }, { status: 400 });
  const base = /^https:\/\/[\w.-]+$/.test(origin ?? "") ? origin! : new URL(req.url).origin;
  await pushText(tenant.lineUserId, billText(bill as never, p.data()!.name, base));
  await billRef.update({ sentToLineAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}
