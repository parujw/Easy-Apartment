import { Suspense } from "react";
import InvoicePrint from "./invoice-print";
import "../../print.css";

export const metadata = { title: "ใบแจ้งหนี้", robots: { index: false, follow: false } };

export default function InvoicePrintPage({ params }: PageProps<"/print/invoice/[token]">) {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>กำลังโหลด…</p>}>
      <InvoicePrint params={params} />
    </Suspense>
  );
}
