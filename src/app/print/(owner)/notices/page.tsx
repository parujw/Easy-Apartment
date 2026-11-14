import { Suspense } from "react";
import Notices from "./notices";
import "../../slips.css";
import "../../notices.css";

export const metadata = { title: "ใบเตือนค้างชำระ" };

export default function NoticesPage() {
  return <Suspense fallback={<p style={{ padding: 24 }}>กำลังโหลด…</p>}><Notices /></Suspense>;
}
