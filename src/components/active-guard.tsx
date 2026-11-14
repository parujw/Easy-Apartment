"use client";

import { useState } from "react";
import { useProperty } from "@/components/property-provider";
import { daysLeftTs } from "@/lib/dates";

/** Read-only banner: writes are blocked by the rules once paidUntil + 3 days has passed. */
export default function ActiveGuard() {
  const { property } = useProperty();
  const until = property.paidUntil?.toMillis() ?? 0;
  const graceEnd = until + 4 * 86_400_000;
  const [now] = useState(() => Date.now());
  if (property.paidUntil && now < until) {
    const left = daysLeftTs(property.paidUntil);
    if (left > 7) return null;
    return <p className="mb-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">แพ็กเกจจะหมดใน {left} วัน — ต่ออายุได้ที่แท็บ “เงิน &amp; อื่นๆ”</p>;
  }
  if (property.paidUntil && now < graceEnd) {
    return <p className="mb-3 rounded-xl bg-red-100 p-3 text-sm text-red-900">แพ็กเกจหมดอายุแล้ว ใช้งานต่อได้อีกไม่เกิน 3 วัน กรุณาต่ออายุ</p>;
  }
  return (
    <p className="mb-3 rounded-xl bg-red-100 p-3 text-sm text-red-900">
      {property.paidUntil ? "แพ็กเกจหมดอายุ" : "ยังไม่ได้เปิดใช้งาน"} — ดูข้อมูลได้อย่างเดียว เพิ่มหรือแก้ไขไม่ได้จนกว่าจะต่ออายุ
    </p>
  );
}
