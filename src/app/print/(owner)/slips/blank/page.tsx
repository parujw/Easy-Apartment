import { Suspense } from "react";
import BlankSlips from "./blank-slips";
import "../../../slips.css";

export const metadata = { title: "ใบจดมิเตอร์เปล่า" };

export default function BlankSlipsPage() {
  return <Suspense fallback={<p style={{ padding: 24 }}>กำลังโหลด…</p>}><BlankSlips /></Suspense>;
}
