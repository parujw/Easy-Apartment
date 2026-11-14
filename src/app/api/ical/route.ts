// Fetches a reservation calendar feed for the browser (which can't fetch it directly because of CORS)
// and returns the events as JSON. Only https URLs on known booking-platform domains are fetched.
import { NextResponse, type NextRequest } from "next/server";
import { allowedCalendarUrl, parseIcal } from "@/lib/ical";

export async function GET(req: NextRequest) {
  const url = allowedCalendarUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!url) return NextResponse.json({ error: "รองรับเฉพาะลิงก์ปฏิทิน https จาก Airbnb, Booking.com หรือ Agoda" }, { status: 400 });
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "ดึงปฏิทินไม่สำเร็จ ตรวจสอบลิงก์อีกครั้ง" }, { status: 502 });
  const text = (await res.text()).slice(0, 2_000_000);
  return NextResponse.json({ events: parseIcal(text) });
}
