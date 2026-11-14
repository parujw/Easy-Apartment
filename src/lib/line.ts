// LINE Messaging API helpers shared by the server routes. Pure parts are unit tested.
import { createHmac, timingSafeEqual } from "node:crypto";

/** x-line-signature = base64(HMAC-SHA256(channelSecret, raw body)). */
export function validLineSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export const LINK_CODE = /^[A-Z2-9]{6}$/;

type BillMsg = { roomNumber: string; period: string; total: number; paid: number; dueDate: string; publicToken: string };
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const dateTh = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][m - 1]} ${(y + 543) % 100}`;
};

export function billText(b: BillMsg, propertyName: string, origin: string, kind: "new" | "due_soon" | "overdue" = "new"): string {
  const owe = Math.round((b.total - b.paid) * 100) / 100;
  const head = kind === "new" ? "📄 บิลค่าเช่ามาแล้ว" : kind === "due_soon" ? "⏰ ใกล้ครบกำหนดชำระ" : "❗ เลยกำหนดชำระแล้ว";
  return [
    `${head} — ${propertyName}`,
    `ห้อง ${b.roomNumber} รอบ ${b.period}`,
    `ยอดชำระ ${baht(owe)} บาท`,
    `ครบกำหนด ${dateTh(b.dueDate)}`,
    `ดูบิล / สแกน QR จ่าย: ${origin}/b/${b.publicToken}`,
    "โอนแล้วส่งรูปสลิปในแชทนี้ได้เลย",
  ].join("\n");
}

/** Which reminder (if any) an open bill gets today: 3 days before due, on day 1 and day 7 after. */
export function reminderKind(dueDate: string, today: string): "due_soon" | "overdue" | null {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 864e5);
  if (days === -3) return "due_soon";
  if (days === 1 || days === 7) return "overdue";
  return null;
}

export async function lineApi(path: string, body: unknown) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE ยังไม่ได้ตั้งค่า");
  const res = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`LINE ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
export const pushText = (to: string, text: string) => lineApi("push", { to, messages: [{ type: "text", text }] });
export const replyText = (replyToken: string, text: string) => lineApi("reply", { replyToken, messages: [{ type: "text", text }] });
export const lineConfigured = () => !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET && process.env.FIREBASE_SERVICE_ACCOUNT);
