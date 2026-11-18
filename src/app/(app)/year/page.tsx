"use client";

import { useState } from "react";
import Link from "next/link";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { todayBkk } from "@/lib/dates";
import { thb, type Bill, type Expense, type Payment } from "@/lib/model";

const M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const csv = (rows: (string | number)[][]) => "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

/** Whole-year results: money actually received (by payment date) minus expenses, month by month. */
export default function YearPage() {
  const { property } = useProperty();
  const [year, setYear] = useState(Number(todayBkk().slice(0, 4)));
  const [hover, setHover] = useState<number | null>(null);
  const c = (n: string) => collection(db(), "properties", property.id, n);
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const payments = useLive<Payment>(query(c("payments"), where("paidOn", ">=", from), where("paidOn", "<=", to)), `${property.id}/pay/y${year}`);
  const expenses = useLive<Expense>(query(c("expenses"), where("spentOn", ">=", from), where("spentOn", "<=", to)), `${property.id}/exp/y${year}`);
  const bills = useLive<Bill>(query(c("bills"), where("period", ">=", `${year}-01`), where("period", "<=", `${year}-12`)), `${property.id}/bills/y${year}`);

  const months = M.map((m, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const income = payments.filter((p) => p.paidOn.startsWith(key) && p.method !== "deposit").reduce((s, p) => s + p.amount, 0);
    const spent = expenses.filter((e) => e.spentOn.startsWith(key)).reduce((s, e) => s + e.amount, 0);
    const billed = bills.filter((b) => b.period === key && b.status !== "void")
      .reduce((s, b) => s + b.items.filter((x) => x.kind !== "prev_balance").reduce((t, x) => t + x.amount, 0), 0);
    return { m, key, income, spent, billed, profit: income - spent };
  });
  const tot = months.reduce((a, x) => ({ income: a.income + x.income, spent: a.spent + x.spent, billed: a.billed + x.billed }), { income: 0, spent: 0, billed: 0 });
  const max = Math.max(1, ...months.map((x) => Math.max(x.income, x.spent)));
  const byCat = [...expenses.reduce((m, e) => m.set(e.category || "อื่นๆ", (m.get(e.category || "อื่นๆ") ?? 0) + e.amount), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const rate = tot.billed ? Math.round((tot.income / tot.billed) * 100) : 0;
  const be = year + 543;

  function download() {
    const rows: (string | number)[][] = [["เดือน", "ออกบิล", "รับเงิน", "รายจ่าย", "กำไร"], ...months.map((x) => [`${x.m} ${be}`, x.billed, x.income, x.spent, x.profit]), ["รวม", tot.billed, tot.income, tot.spent, tot.income - tot.spent]];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }));
    a.download = `ผลประกอบการ-${be}.csv`;
    a.click();
  }

  return (
    <div className="space-y-3">
      <Link href="/more" className="inline-flex min-h-12 items-center font-semibold">‹ การเงิน</Link>
      <div className="-mt-2 flex items-center justify-between">
        <h1 className="text-[28px] font-bold tracking-tight">ผลประกอบการ</h1>
        <div className="flex items-center rounded-2xl bg-surface ring-1 ring-line">
          <button aria-label="ปีก่อน" className="min-h-12 px-3 text-lg" onClick={() => setYear(year - 1)}>‹</button>
          <span className="num px-1 font-semibold">ปี {be}</span>
          <button aria-label="ปีถัดไป" className="min-h-12 px-3 text-lg" onClick={() => setYear(year + 1)}>›</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line"><p className="text-sm text-muted">รับเงินทั้งปี</p><p className="num text-2xl font-bold">฿{thb(tot.income)}</p></div>
        <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line"><p className="text-sm text-muted">รายจ่ายทั้งปี</p><p className="num text-2xl font-bold">฿{thb(tot.spent)}</p></div>
        <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line"><p className="text-sm text-muted">กำไรทั้งปี</p><p className={`num text-2xl font-bold ${tot.income - tot.spent < 0 ? "text-bad-ink" : "text-brand"}`}>฿{thb(tot.income - tot.spent)}</p></div>
        <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line"><p className="text-sm text-muted">เก็บได้เทียบที่ออกบิล</p><p className="num text-2xl font-bold">{rate}%</p><p className="text-xs text-muted">ออกบิล ฿{thb(tot.billed)}</p></div>
      </div>

      <figure className="rounded-[20px] bg-surface p-4 ring-1 ring-line">
        <figcaption className="flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-mark" />รับเงิน</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-line-2" />รายจ่าย</span>
        </figcaption>
        <div className="relative mt-3 grid h-36 grid-cols-12 items-end gap-1" role="img" aria-label={`รับเงินและรายจ่ายรายเดือน ปี ${be} (ตัวเลขอยู่ในตารางด้านล่าง)`}>
          {months.map((x, i) => (
            <button key={x.key} onClick={() => setHover(hover === i ? null : i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className="relative flex h-full items-end justify-center gap-[2px]" aria-label={`${x.m} รับ ${thb(x.income)} จ่าย ${thb(x.spent)}`}>
              <span className="w-1/2 rounded-t-[3px] bg-mark" style={{ height: `${(x.income / max) * 100}%` }} />
              <span className="w-1/2 rounded-t-[3px] bg-line-2" style={{ height: `${(x.spent / max) * 100}%` }} />
              {hover === i && (
                <span className={`absolute bottom-full z-10 mb-1 w-36 rounded-xl bg-ink p-2 text-left text-xs text-white shadow-lg ${i > 8 ? "right-0" : i < 3 ? "left-0" : ""}`}>
                  <b>{x.m} {be}</b><br />รับ ฿{thb(x.income)}<br />จ่าย ฿{thb(x.spent)}<br />กำไร ฿{thb(x.profit)}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-12 gap-1 text-center text-[10px] text-muted">{months.map((x) => <span key={x.key}>{x.m}</span>)}</div>
      </figure>

      <div className="overflow-x-auto rounded-[20px] bg-surface ring-1 ring-line">
        <table className="num w-full text-right text-sm">
          <thead><tr className="text-muted"><th className="p-3 text-left font-medium">เดือน</th><th className="p-3 font-medium">รับเงิน</th><th className="p-3 font-medium">รายจ่าย</th><th className="p-3 font-medium">กำไร</th></tr></thead>
          <tbody>
            {months.map((x) => (
              <tr key={x.key} className="border-t border-line">
                <td className="p-3 text-left">{x.m}</td><td className="p-3">{thb(x.income)}</td><td className="p-3">{thb(x.spent)}</td>
                <td className={`p-3 font-semibold ${x.profit < 0 ? "text-bad-ink" : ""}`}>{thb(x.profit)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-2 font-bold"><td className="p-3 text-left">รวม</td><td className="p-3">{thb(tot.income)}</td><td className="p-3">{thb(tot.spent)}</td><td className="p-3">{thb(tot.income - tot.spent)}</td></tr>
          </tbody>
        </table>
      </div>

      {byCat.length > 0 && (
        <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line">
          <p className="mb-2 font-semibold">รายจ่ายแยกหมวด</p>
          {byCat.map(([cat, amt]) => (
            <div key={cat} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="w-28 shrink-0">{cat}</span>
              <span className="h-2 rounded-r bg-line-2" style={{ width: `${Math.max(2, (amt / byCat[0][1]) * 50)}%` }} />
              <span className="num ml-auto">฿{thb(amt)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="px-1 text-xs text-muted">รับเงินนับตามวันที่รับจริง ไม่นับเงินประกันที่หักตอนย้ายออก · กำไร = รับเงิน − รายจ่าย</p>
      <button onClick={download} className="min-h-12 w-full rounded-2xl bg-surface font-semibold ring-1 ring-line-2">ดาวน์โหลด Excel (CSV)</button>
    </div>
  );
}
