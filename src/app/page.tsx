import Link from "next/link";
import { PLANS, INTRO_PRICE, type PlanId } from "@/lib/plans";

const order: PlanId[] = ["starter", "pro", "business"];
const thb = (n: number) => n.toLocaleString("th-TH");

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">Easy Apartment</h1>
      <p className="mt-2 text-muted">จัดการห้องเช่ารายเดือน ห้องรายวัน และ Airbnb จบในหน้าเดียว ส่งบิลทาง LINE ได้ทันที</p>

      <div className="mt-6 rounded-2xl bg-brand/10 p-5">
        <p className="text-lg font-semibold">
          เดือนแรก <span className="text-muted line-through">{thb(PLANS.pro.month)}</span>{" "}
          <span className="text-brand">{INTRO_PRICE} บาท</span> ใช้ Pro ได้ครบทุกฟีเจอร์ 30 วัน
        </p>
        <Link href="/login?mode=signup" className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-brand px-6 font-semibold text-white">
          สมัครใช้งาน
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {order.map((id) => {
          const p = PLANS[id];
          const featured = id === "pro";
          return (
            <div key={id} className={`rounded-2xl bg-surface p-5 ${featured ? "ring-2 ring-brand" : "ring-1 ring-black/10"}`}>
              {featured && <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">ขายดี</span>}
              <h2 className="mt-2 text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-3xl font-bold">{thb(p.month)}<span className="text-base font-normal text-muted"> /30 วัน</span></p>
              <p className="text-sm text-muted">ตกวันละ {Math.round(p.month / 30)} บาท · รายปี {thb(p.year)} (ฟรี 1 เดือน)</p>
              <ul className="mt-4 space-y-1 text-sm">
                <li>สูงสุด {p.maxRooms} ห้อง</li>
                <li>{p.dailyRooms ? "ห้องรายเดือน + รายวัน + Airbnb" : "ห้องรายเดือนเท่านั้น"}</li>
                <li>ส่งบิลทาง LINE {thb(p.lineQuota)} ข้อความ/เดือน</li>
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-muted">มีบัญชีแล้ว? <Link href="/login" className="text-brand underline">เข้าสู่ระบบ</Link></p>
    </main>
  );
}
