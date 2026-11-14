import { Suspense } from "react";
import Slips from "./slips";
import "../../slips.css";

export const metadata = { title: "ใบจดมิเตอร์" };

export default function SlipsPage() {
  return <Suspense fallback={<p style={{ padding: 24 }}>กำลังโหลด…</p>}><Slips /></Suspense>;
}
