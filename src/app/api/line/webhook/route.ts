// Central LINE OA webhook: tenants link with a 6-character code, ask for their bill, or send a slip.
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/admin";
import { LINK_CODE, billText, replyText, validLineSignature } from "@/lib/line";

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string; id?: string } };

export async function POST(req: Request) {
  const body = await req.text();
  if (!validLineSignature(body, req.headers.get("x-line-signature"), process.env.LINE_CHANNEL_SECRET ?? ""))
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const { events = [] } = JSON.parse(body) as { events?: LineEvent[] };
  const origin = new URL(req.url).origin;
  await Promise.all(events.map((e) => handle(e, origin).catch((err) => console.error("line event", err))));
  return NextResponse.json({ ok: true });
}

async function handle(e: LineEvent, origin: string) {
  const userId = e.source?.userId;
  if (e.type !== "message" || !userId || !e.replyToken) return;
  const db = adminDb();
  const link = (await db.doc(`lineUsers/${userId}`).get()).data() as { propertyId: string; tenantId: string; roomNumber: string } | undefined;
  const text = (e.message?.text ?? "").trim();

  if (e.message?.type === "text" && LINK_CODE.test(text.toUpperCase())) {
    const ref = db.doc(`lineLinks/${text.toUpperCase()}`);
    const res = await db.runTransaction(async (tx) => {
      const c = (await tx.get(ref)).data();
      if (!c || c.usedAt || c.expiresAt.toMillis() < Date.now()) return null;
      tx.update(ref, { usedAt: FieldValue.serverTimestamp(), lineUserId: userId });
      tx.update(db.doc(`properties/${c.propertyId}/tenants/${c.tenantId}`), { lineUserId: userId });
      tx.set(db.doc(`lineUsers/${userId}`), { propertyId: c.propertyId, tenantId: c.tenantId, roomNumber: c.roomNumber, linkedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection(`properties/${c.propertyId}/auditLogs`).doc(), { action: "line.link", targetType: "tenant", targetId: c.tenantId,
        summary: `${c.tenantName} ห้อง ${c.roomNumber} เชื่อม LINE แล้ว`, actorUid: "line", actorName: "LINE", at: FieldValue.serverTimestamp() });
      return c;
    });
    return replyText(e.replyToken, res ? `เชื่อม LINE กับห้อง ${res.roomNumber} เรียบร้อย ✅\nบิลและการแจ้งเตือนจะส่งมาที่แชทนี้\nพิมพ์ “บิล” เพื่อดูยอดค้าง` : "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากเจ้าของหอ");
  }
  if (/^myid$/i.test(text)) return replyText(e.replyToken, `LINE user id ของคุณ: ${userId}`);
  if (!link) return replyText(e.replyToken, "สวัสดีค่ะ 🙏 กรุณาพิมพ์รหัส 6 ตัวที่ได้จากเจ้าของหอ เพื่อเชื่อมกับห้องของคุณ");

  const prop = db.doc(`properties/${link.propertyId}`);
  if (e.message?.type === "image") {
    await prop.collection("auditLogs").add({ action: "line.slip", targetType: "tenant", targetId: link.tenantId,
      summary: `ห้อง ${link.roomNumber} ส่งรูปสลิปทาง LINE (ข้อความ ${e.message.id})`, actorUid: "line", actorName: "LINE", at: FieldValue.serverTimestamp() });
    return replyText(e.replyToken, "ได้รับสลิปแล้ว ขอบคุณค่ะ 🙏 เจ้าของหอจะตรวจสอบและออกใบเสร็จให้");
  }
  if (/บิล|ยอด|ค้าง|bill/i.test(text)) {
    const leases = await prop.collection("leases").where("tenantId", "==", link.tenantId).get();
    const ids = leases.docs.map((d) => d.id);
    const bills = ids.length ? (await prop.collection("bills").where("leaseId", "in", ids.slice(0, 30)).get()).docs.map((d) => d.data()).filter((b) => b.status === "unpaid" || b.status === "partial") : [];
    if (!bills.length) return replyText(e.replyToken, "ไม่มียอดค้างชำระค่ะ ✅");
    const name = (await prop.get()).data()?.name ?? "";
    return replyText(e.replyToken, bills.map((b) => billText(b as never, name, origin, "new")).join("\n\n"));
  }
  return replyText(e.replyToken, "พิมพ์ “บิล” เพื่อดูยอดค้าง หรือส่งรูปสลิปหลังโอนเงินได้เลยค่ะ");
}
