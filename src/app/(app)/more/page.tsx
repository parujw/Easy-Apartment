import { currentProperty } from "@/lib/property";
import { PLANS } from "@/lib/plans";

export default async function MorePage() {
  const property = await currentProperty();
  return (
    <>
      <h1 className="text-xl font-bold">เงิน &amp; อื่นๆ</h1>
      {property && (
        <section className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-black/10">
          <p className="text-sm text-muted">แพ็กเกจ</p>
          <p className="text-lg font-semibold">{PLANS[property.plan as keyof typeof PLANS].name}</p>
          <p className="text-sm">{property.paid_until ? `หมดอายุ ${property.paid_until} (อีก ${property.daysLeft} วัน)` : "ยังไม่ได้เปิดใช้งาน"}</p>
        </section>
      )}
      <p className="mt-4 text-muted">ยังไม่ได้ทำ: สรุปรายเดือน, ค่าใช้จ่าย, งานซ่อม, ตั้งค่า, ต่ออายุด้วย QR PromptPay</p>
    </>
  );
}
