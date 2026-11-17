"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { ExpenseForm } from "@/components/quick-add";
import { Btn, Field, NumField, Select, useAction } from "@/components/ui";
import {
  addProperty, addRooms, approveJoin, createInvite, deleteExpense, moveIn, redeemInvite, removeMember, roomDefaults,
  saveReadings, shrinkImage, switchProperty, updateExpense, updateProperty,
} from "@/lib/ops";
import { IMPORT_EXAMPLE, IMPORT_HEADERS, parseImport, type ImportRow } from "@/lib/import";
import { PLANS } from "@/lib/plans";
import { isoTh, monthRange, monthTh, periodOf, todayBkk } from "@/lib/dates";
import { EXPENSE_CATEGORIES, thb, type Expense, type Maintenance } from "@/lib/model";

/** Inside the money menu each topic opens as its own page: then a Section is plain content (title shown by the page). */
export const FullPage = createContext(false);
export function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const full = useContext(FullPage);
  if (full) return <div className="space-y-3">{children}</div>;
  return (
    <details open={open} className="rounded-[20px] bg-surface ring-1 ring-line [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-14 cursor-pointer items-center justify-between px-4 font-semibold">{title}<span className="text-muted">›</span></summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

const linkRow = "flex min-h-12 items-center justify-between rounded-xl px-4 ring-1 ring-black/15";

export function ListsSection() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Link href="/bills" className={linkRow}>บิลทั้งหมด <span className="text-muted">›</span></Link>
      <Link href="/tenants" className={linkRow}>ผู้เช่า <span className="text-muted">›</span></Link>
    </div>
  );
}

// ───────────── Expenses (add / edit / delete) ─────────────

function ExpenseRow({ e }: { e: Expense }) {
  const { property, role } = useProperty();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ amount: e.amount as number | "", description: e.description, category: e.category, spentOn: e.spentOn });
  const a = useAction();
  if (!edit) return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <span>{isoTh(e.spentOn)} · {e.category} · {e.description}</span>
      <span className="flex items-center gap-2">−฿{thb(e.amount)}{role !== "viewer" && <button className="min-h-10 px-1 text-brand" onClick={() => setEdit(true)}>แก้</button>}</span>
    </li>
  );
  return (
    <li className="space-y-2 py-2">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="จำนวนเงิน" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        <Field label="วันที่" type="date" value={f.spentOn} onChange={(ev) => setF({ ...f, spentOn: ev.target.value })} />
      </div>
      <Field label="รายละเอียด" value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} />
      <Select label="หมวด" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={[...new Set([...EXPENSE_CATEGORIES, e.category])].map((c) => [c, c])} />
      <div className="grid grid-cols-3 gap-2">
        <Btn kind="danger" disabled={a.busy} onClick={() => confirm("ลบค่าใช้จ่ายนี้?") && a.run(async () => { await deleteExpense(property.id, e); return "ลบแล้ว"; })}>ลบ</Btn>
        <Btn kind="ghost" onClick={() => setEdit(false)}>ยกเลิก</Btn>
        <Btn disabled={a.busy} onClick={() => a.run(async () => {
          if (!(Number(f.amount) > 0) || !f.description.trim()) throw new Error("กรอกจำนวนเงินและรายละเอียด");
          await updateExpense(property.id, e, { amount: Number(f.amount), description: f.description.trim(), category: f.category, spentOn: f.spentOn });
          setEdit(false); return "บันทึกแล้ว";
        })}>บันทึก</Btn>
      </div>
      {a.view}
    </li>
  );
}

export function ExpensesSection() {
  const { property, role } = useProperty();
  const [period, setPeriod] = useState(periodOf(todayBkk()));
  const [adding, setAdding] = useState(false);
  const { start, end } = monthRange(period);
  const list = useLive<Expense>(query(collection(db(), "properties", property.id, "expenses"), where("spentOn", ">=", start), where("spentOn", "<=", end)), `${property.id}/exp/${period}`);
  const sorted = [...list].sort((a, b) => b.spentOn.localeCompare(a.spentOn));
  return (
    <Section title={`ค่าใช้จ่าย ${monthTh(period)} · ฿${thb(list.reduce((s, e) => s + e.amount, 0))}`}>
      <div className="flex gap-2">
        <input type="month" aria-label="เดือน" className="min-h-12 flex-1 rounded-xl border border-black/15 bg-surface px-2" value={period} onChange={(e) => setPeriod(e.target.value)} />
        {role !== "viewer" && <Btn kind="ghost" onClick={() => setAdding(!adding)}>{adding ? "ปิด" : "+ เพิ่ม"}</Btn>}
      </div>
      {adding && <div className="mt-3"><ExpenseForm onDone={() => setAdding(false)} /></div>}
      <ul className="mt-2 divide-y divide-black/5">{sorted.map((e) => <ExpenseRow key={e.id} e={e} />)}</ul>
      {!list.length && <p className="mt-2 text-sm text-muted">ไม่มีค่าใช้จ่ายเดือนนี้</p>}
    </Section>
  );
}

export function MaintenanceHistory() {
  const { property } = useProperty();
  const done = useLive<Maintenance>(query(collection(db(), "properties", property.id, "maintenance"), where("status", "in", ["done", "cancelled"])), `${property.id}/maint/done`);
  const sorted = [...done].sort((a, b) => (b.closedOn ?? b.createdOn).localeCompare(a.closedOn ?? a.createdOn)).slice(0, 50);
  return (
    <Section title={`ประวัติงานซ่อม (${done.length})`}>
      <ul className="divide-y divide-black/5 text-sm">
        {sorted.map((m) => (
          <li key={m.id} className="py-2">
            <p>ห้อง {m.roomNumber} · {m.problem}</p>
            <p className="text-xs text-muted">{m.no} · แจ้ง {isoTh(m.createdOn)}{m.closedOn && ` · ${m.status === "done" ? "เสร็จ" : "ยกเลิก"} ${isoTh(m.closedOn)}`}{m.cost > 0 && ` · ค่าซ่อม ฿${thb(m.cost)}`}</p>
          </li>
        ))}
      </ul>
      {!done.length && <p className="text-sm text-muted">ยังไม่มีงานซ่อมที่ปิดแล้ว</p>}
    </Section>
  );
}

// ───────────── Building: photo, utility cost, switch / add / join ─────────────

export function BuildingSection() {
  const { property, role, propertyIds } = useProperty();
  const [names, setNames] = useState<Record<string, string>>({});
  const [cost, setCost] = useState({ elec: (property.elecCostPerUnit ?? "") as number | "", water: (property.waterCostPerUnit ?? "") as number | "" });
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const a = useAction();

  useEffect(() => {
    let alive = true;
    Promise.all(propertyIds.map(async (id) => {
      try { const s = await getDoc(doc(db(), "properties", id)); return [id, (s.data()?.name as string) ?? id] as const; }
      catch { return [id, "รออนุมัติ"] as const; }
    })).then((rows) => alive && setNames(Object.fromEntries(rows)));
    return () => { alive = false; };
  }, [propertyIds]);

  return (
    <Section title="อาคาร">
      <div className="space-y-3">
        {role === "owner" && (
          <>
            <div className="flex items-center gap-3">
              {property.photo
                // eslint-disable-next-line @next/next/no-img-element -- small data-URL photo stored on the property
                ? <img src={property.photo} alt={`รูป ${property.name}`} className="size-20 rounded-xl object-cover" />
                : <div className="flex size-20 items-center justify-center rounded-xl bg-black/5 text-xs text-muted">ไม่มีรูป</div>}
              <label className="flex min-h-12 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold ring-1 ring-black/15">
                เปลี่ยนรูปอาคาร
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) a.run(async () => { await updateProperty(property.id, { photo: await shrinkImage(file, 640, 0.75) }); return "บันทึกรูปแล้ว"; });
                }} />
              </label>
            </div>
            <p className="text-sm font-semibold">ต้นทุนที่หอจ่ายจริง (ใช้คำนวณกำไรค่าน้ำค่าไฟ)</p>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="ไฟ บาท/หน่วย" value={cost.elec} onChange={(v) => setCost({ ...cost, elec: v })} />
              <NumField label="น้ำ บาท/หน่วย" value={cost.water} onChange={(v) => setCost({ ...cost, water: v })} />
            </div>
            <Btn kind="ghost" className="w-full" disabled={a.busy} onClick={() => a.run(async () => {
              await updateProperty(property.id, { elecCostPerUnit: Number(cost.elec) || 0, waterCostPerUnit: Number(cost.water) || 0 });
              return "บันทึกต้นทุนแล้ว";
            })}>บันทึกต้นทุน</Btn>
          </>
        )}

        {propertyIds.length > 1 && (
          <>
            <p className="pt-2 text-sm font-semibold">สลับอาคาร</p>
            <ul className="grid gap-2">
              {propertyIds.map((id) => (
                <li key={id}>
                  <button disabled={id === property.id || a.busy} onClick={() => a.run(async () => { await switchProperty(id); })}
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl px-4 ring-1 ${id === property.id ? "bg-brand/10 ring-brand" : "ring-black/15"}`}>
                    {names[id] ?? "…"}{id === property.id && <span className="text-sm text-brand">กำลังใช้</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="pt-2 text-sm font-semibold">เพิ่มอาคารใหม่ (คิดแพ็กเกจแยกต่ออาคาร)</p>
        <div className="flex gap-2">
          <div className="flex-1"><Field label="ชื่ออาคาร" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
          <Btn className="self-end" disabled={a.busy || !newName.trim()} onClick={() => a.run(async () => { await addProperty(newName, property.phone); setNewName(""); return "เพิ่มอาคารแล้ว"; })}>เพิ่ม</Btn>
        </div>
        <p className="pt-2 text-sm font-semibold">เข้าร่วมอาคารของคนอื่นด้วยรหัสเชิญ</p>
        <div className="flex gap-2">
          <div className="flex-1"><Field label="รหัสเชิญ" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <Btn kind="ghost" className="self-end" disabled={a.busy || code.length < 8} onClick={() => a.run(async () => { await redeemInvite(code, ""); setCode(""); })}>ส่งคำขอ</Btn>
        </div>
      </div>
      {a.view}
    </Section>
  );
}

// ───────────── Team: invite assistants / viewers, approve requests ─────────────

type JoinReq = { id: string; uid: string; role: string; name: string };
const ROLE_TH: Record<string, string> = { owner: "เจ้าของ", assistant: "ผู้ช่วย (ออกบิล รับเงิน)", viewer: "ดูอย่างเดียว" };

export function TeamSection() {
  const { property, uid } = useProperty();
  const reqs = useLive<JoinReq>(query(collection(db(), "joinRequests"), where("propertyId", "==", property.id)), `join/${property.id}`);
  const [role, setRole] = useState<"assistant" | "viewer">("assistant");
  const [invite, setInvite] = useState("");
  const a = useAction();
  const names = (property as { memberNames?: Record<string, string> }).memberNames ?? {};
  return (
    <Section title={`ทีมงาน${reqs.length ? ` · คำขอใหม่ ${reqs.length}` : ""}`}>
      <div className="space-y-3">
        {reqs.map((r) => (
          <div key={r.id} className="rounded-xl bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-300">
            <p className="font-semibold">{r.name || "ผู้ใช้ใหม่"} ขอเข้าร่วมเป็น{ROLE_TH[r.role]}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Btn kind="ghost" disabled={a.busy} onClick={() => a.run(async () => {
                const { deleteDoc } = await import("firebase/firestore");
                await deleteDoc(doc(db(), "joinRequests", r.id)); return "ปฏิเสธแล้ว";
              })}>ปฏิเสธ</Btn>
              <Btn disabled={a.busy} onClick={() => a.run(async () => { await approveJoin(property.id, r); return "อนุมัติแล้ว"; })}>อนุมัติ</Btn>
            </div>
          </div>
        ))}
        <ul className="divide-y divide-black/5 text-sm">
          {Object.entries(property.members ?? {}).map(([id, r]) => (
            <li key={id} className="flex items-center justify-between py-2">
              <span>{id === uid ? "คุณ" : names[id] || `ผู้ใช้ ${id.slice(0, 6)}`} · {ROLE_TH[r]}</span>
              {r !== "owner" && <button className="min-h-10 px-2 text-red-600" disabled={a.busy}
                onClick={() => confirm("นำผู้ใช้นี้ออกจากอาคาร?") && a.run(async () => { await removeMember(property.id, id); return "นำออกแล้ว"; })}>นำออก</button>}
            </li>
          ))}
        </ul>
        <Select label="สิทธิ์ของคนที่จะเชิญ" value={role} onChange={(v) => setRole(v as typeof role)} options={[["assistant", ROLE_TH.assistant], ["viewer", ROLE_TH.viewer]]} />
        <Btn kind="ghost" className="w-full" disabled={a.busy} onClick={() => a.run(async () => { setInvite(await createInvite(property.id, role)); })}>สร้างรหัสเชิญ (ใช้ได้ 7 วัน)</Btn>
        {invite && (
          <div className="rounded-xl bg-brand/10 p-3 text-center">
            <p className="text-2xl font-bold tracking-widest">{invite}</p>
            <p className="text-sm text-muted">ให้ผู้ช่วยสมัครที่ {typeof window !== "undefined" ? window.location.host : ""} → ติ๊ก “ฉันเป็นผู้ช่วย” แล้วใส่รหัสนี้ จากนั้นกดอนุมัติที่นี่</p>
          </div>
        )}
      </div>
      {a.view}
    </Section>
  );
}

// ───────────── Excel import ─────────────

async function downloadTemplate() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ห้องและผู้เช่า");
  ws.addRow([...IMPORT_HEADERS]);
  for (const r of IMPORT_EXAMPLE) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 16; });
  ws.getColumn(1).numFmt = "@";
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = "easy-apartment-template.xlsx";
  a.click();
}

export function ImportSection() {
  const { property } = useProperty();
  const { rooms } = useData();
  const [parsed, setParsed] = useState<{ rows: ImportRow[]; errors: string[] } | null>(null);
  const a = useAction();
  const max = PLANS[property.plan].maxRooms;

  async function read(file: File) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => { if (n > 1) rows.push((row.values as unknown[]).slice(1)); });
    setParsed(parseImport(rows, rooms.map((r) => r.number)));
  }

  async function apply(rows: ImportRow[]) {
    if (rooms.length + rows.length > max) throw new Error(`แพ็กเกจนี้ได้ ${max} ห้อง (มีอยู่ ${rooms.length}) อัปเกรดก่อนนำเข้า`);
    for (let i = 0; i < rows.length; i += 200) {
      await addRooms(property.id, rows.slice(i, i + 200).map((r) => ({ ...roomDefaults(r.number, r.floor, r.kind, r.rentMonthly), priceNightly: r.priceNightly, deposit: r.deposit })));
    }
    // New room ids come from the live listener; read them back by number.
    const { getDocs } = await import("firebase/firestore");
    const snap = await getDocs(collection(db(), "properties", property.id, "rooms"));
    const byNo = new Map(snap.docs.map((d) => [d.data().number as string, { id: d.id, ...d.data() } as never]));
    let tenants = 0;
    const today = todayBkk();
    for (const r of rows.filter((x) => x.tenant)) {
      const t = r.tenant!;
      await moveIn(property.id, byNo.get(r.number)!, { fullName: t.fullName, nickname: "", phone: t.phone, lineUserId: null, emergency: "", note: "นำเข้าจาก Excel" },
        { startDate: t.startDate || today, endDate: null, rent: r.rentMonthly, deposit: r.deposit, advance: 0, elecRate: t.elecRate, waterRate: t.waterRate,
          internet: 0, acFee: 0, parking: 0, dueDay: t.dueDay });
      tenants++;
    }
    const meters = rows.filter((x) => x.meter);
    if (meters.length) {
      const prev = new Date(Date.parse(`${today}T00:00:00Z`) - 31 * 864e5).toISOString().slice(0, 7);
      await saveReadings(property.id, meters.map((r) => ({ room: { id: (byNo.get(r.number) as unknown as { id: string }).id, number: r.number }, period: prev, readOn: monthRange(prev).end, elec: r.meter!.elec, water: r.meter!.water })));
    }
    setParsed(null);
    return `นำเข้าแล้ว ${rows.length} ห้อง · ผู้เช่า ${tenants} คน · เลขมิเตอร์ ${meters.length} ห้อง`;
  }

  return (
    <Section title="นำเข้าห้อง/ผู้เช่าจาก Excel">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>ดาวน์โหลดแม่แบบ กรอก 1 แถวต่อ 1 ห้อง (ห้องว่างไม่ต้องใส่ชื่อผู้เช่า)</li>
        <li>เลขมิเตอร์ล่าสุดจะใช้เป็น “เลขก่อน” ของบิลเดือนนี้</li>
        <li>อัปโหลดไฟล์ ตรวจรายการ แล้วกดนำเข้า</li>
      </ol>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn kind="ghost" onClick={() => a.run(async () => { await downloadTemplate(); })}>ดาวน์โหลดแม่แบบ</Btn>
        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-black/15">
          เลือกไฟล์ .xlsx
          <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) a.run(async () => { await read(f); }); e.target.value = ""; }} />
        </label>
      </div>
      {parsed && (
        <div className="mt-3 space-y-2 text-sm">
          {parsed.errors.length > 0 && (
            <ul className="rounded-xl bg-red-50 p-3 text-red-900">{parsed.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          <p>พร้อมนำเข้า {parsed.rows.length} ห้อง · ผู้เช่า {parsed.rows.filter((r) => r.tenant).length} คน</p>
          <ul className="max-h-48 overflow-auto rounded-xl ring-1 ring-black/10">
            {parsed.rows.map((r) => <li key={r.line} className="border-b border-black/5 px-3 py-1">ห้อง {r.number} · ฿{thb(r.kind === "monthly" ? r.rentMonthly : r.priceNightly)}{r.tenant && ` · ${r.tenant.fullName}`}</li>)}
          </ul>
          <Btn className="w-full" disabled={a.busy || !parsed.rows.length} onClick={() => a.run(() => apply(parsed.rows))}>นำเข้า {parsed.rows.length} ห้อง</Btn>
        </div>
      )}
      {a.view}
    </Section>
  );
}

// ───────────── LINE ─────────────

export function LineSection() {
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  useEffect(() => { fetch("/api/line/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false })); }, []);
  return (
    <Section title="LINE แจ้งบิลอัตโนมัติ">
      <div className="space-y-2 text-sm">
        <p>สถานะ: {status === null ? "กำลังตรวจ…" : status.configured ? <b className="text-emerald-700">เปิดใช้งานแล้ว</b> : <b className="text-amber-700">ยังไม่เปิด (ผู้ดูแลระบบกำลังตั้งค่า)</b>}</p>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>แตะห้อง → ผู้เช่า → “รหัสเชื่อม LINE” ได้รหัส 6 ตัว</li>
          <li>ผู้เช่าเพิ่มเพื่อน LINE ของ Easy Apartment แล้วพิมพ์รหัสนั้น</li>
          <li>จากนั้นกด “ส่งเข้า LINE” ที่บิล หรือระบบส่งเตือนก่อนครบกำหนดให้เอง</li>
        </ol>
      </div>
    </Section>
  );
}
