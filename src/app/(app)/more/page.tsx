"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useProperty } from "@/components/property-provider";
import { PLANS } from "@/lib/plans";
import { daysLeftTs, dateTh } from "@/lib/dates";

export default function MorePage() {
  const { property } = useProperty();
  const router = useRouter();
  return (
    <>
      <h1 className="text-xl font-bold">เงิน &amp; อื่นๆ</h1>
      <section className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-black/10">
        <p className="text-sm text-muted">แพ็กเกจ</p>
        <p className="text-lg font-semibold">{PLANS[property.plan].name}</p>
        <p className="text-sm">
          {property.paidUntil
            ? `หมดอายุ ${dateTh(property.paidUntil)} (อีก ${daysLeftTs(property.paidUntil)} วัน)`
            : "ยังไม่ได้เปิดใช้งาน — เริ่มเดือนแรก 100 บาท"}
        </p>
      </section>
      <p className="mt-4 text-muted">ยังไม่ได้ทำ: สรุปรายเดือน, ค่าใช้จ่าย, งานซ่อม, ตั้งค่า, ต่ออายุด้วย QR PromptPay</p>
      <button className="mt-8 min-h-12 w-full rounded-xl ring-1 ring-black/15"
        onClick={async () => { await signOut(auth()); router.replace("/login"); }}>
        ออกจากระบบ
      </button>
    </>
  );
}
