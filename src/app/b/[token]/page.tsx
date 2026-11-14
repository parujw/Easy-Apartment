import { Suspense } from "react";
import PublicBill from "./public-bill";

export const metadata = { title: "บิลค่าเช่า", robots: { index: false, follow: false } };

export default function BillPage({ params }: PageProps<"/b/[token]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">กำลังโหลด…</p>}>
      <PublicBill params={params} />
    </Suspense>
  );
}
