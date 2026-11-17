// W World "ส่งทาง LINE": the owner checked the draft and pressed send → push it to that tenant.
import { NextResponse } from "next/server";
import { adminDb, activeProperty, memberRole } from "@/lib/server/admin";
import { lineConfigured, pushText } from "@/lib/line";

export async function POST(req: Request) {
  if (!lineConfigured()) return NextResponse.json({ error: "ระบบ LINE ยังไม่เปิด ใช้คัดลอกแทนไปก่อน" }, { status: 503 });
  const { propertyId, tenantId, text } = (await req.json().catch(() => ({}))) as { propertyId?: string; tenantId?: string; text?: string };
  if (!propertyId || !tenantId || !text?.trim() || text.length > 2000) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  const who = await memberRole(req, propertyId);
  if (!who || who.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  const p = await adminDb().doc(`properties/${propertyId}`).get();
  if (!activeProperty(p.data())) return NextResponse.json({ error: "แพ็กเกจหมดอายุ" }, { status: 402 });
  const t = (await adminDb().doc(`properties/${propertyId}/tenants/${tenantId}`).get()).data();
  if (!t?.lineUserId) return NextResponse.json({ error: "ผู้เช่ายังไม่ได้เชื่อม LINE" }, { status: 400 });
  await pushText(t.lineUserId, text.trim());
  return NextResponse.json({ ok: true });
}
