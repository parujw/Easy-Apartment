"use client";

import Link from "next/link";

/** Floating bar on print pages; hidden when printing (.print-bar in the print CSS). Always has a way back. */
export default function PrintBar({ backHref }: { backHref: string }) {
  return (
    <div className="print-bar">
      <Link href={backHref} className="back">‹ กลับ</Link>
      <button type="button" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
    </div>
  );
}
