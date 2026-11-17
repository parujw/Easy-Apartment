"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { useProperty } from "@/components/property-provider";
import { useData } from "@/components/data-provider";
import { useShell } from "@/components/shell";
import PixelWorld from "@/components/pixel-world";
import { toast } from "@/components/toast";
import { addMaintenance, createOwnerLineLink, receivePayment, updateProperty } from "@/lib/ops";
import { buildWorld, morningGreeting, parseCommand, type AgentId, type Draft, type Intent } from "@/lib/world";
import { monthRange, periodOf, todayBkk } from "@/lib/dates";
import { balance, thb, type Expense, type Maintenance, type MeterReading } from "@/lib/model";

// W World — futuristic by design (space blue, neon, glass), the only screen that uses these colours.

const glass = "rounded-[20px] bg-white/[.06] ring-1 ring-white/15 backdrop-blur-md";
const mono = "font-mono text-[12px] tracking-[.12em]";

/** W's voice: a warm female Thai voice — server voice when set up, else the phone's own Thai voice. */
function useVoice() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = () => { audio.current?.pause(); try { window.speechSynthesis?.cancel(); } catch { /* none */ } };
  const device = (text: string) => new Promise<void>((done) => {
    const synth = window.speechSynthesis;
    const voices = synth?.getVoices().filter((v) => /^th/i.test(v.lang)) ?? [];
    if (!synth || !voices.length) { setTimeout(done, 2200 + text.length * 45); return; } // no Thai voice: captions only
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "th-TH"; u.voice = voices.find((v) => /premwadee|achara|kanya|narisa|female|หญิง/i.test(v.name)) ?? voices[0];
    u.rate = 0.95; u.pitch = 1.08; u.onend = () => done(); u.onerror = () => done();
    synth.speak(u);
  });
  const say = async (text: string) => {
    try {
      const token = await auth().currentUser?.getIdToken();
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error("no server voice");
      const url = URL.createObjectURL(await res.blob());
      await new Promise<void>((done) => { const a = new Audio(url); audio.current = a; a.onended = () => done(); a.onerror = () => done(); a.play().catch(() => done()); });
    } catch { await device(text); }
  };
  return { say, stop };
}

type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onerror: () => void; onend: () => void; start: () => void; stop: () => void };

export default function WorldPage() {
  const router = useRouter();
  const { property, role } = useProperty();
  const { rooms, bills, leases, tenants, bookings, openBills } = useData();
  const { openRoom } = useShell();
  const today = todayBkk(), period = periodOf(today), { start, end } = monthRange(period);
  const c = (n: string) => collection(db(), "properties", property.id, n);
  const maint = useLive<Maintenance>(query(c("maintenance"), where("status", "in", ["open", "in_progress"])), `${property.id}/maint/open`);
  const expenses = useLive<Expense>(query(c("expenses"), where("spentOn", ">=", start), where("spentOn", "<=", end)), `${property.id}/exp/${period}`);
  const reads = useLive<MeterReading>(query(c("meterReadings"), where("readOn", ">=", start)), `${property.id}/mr/${start}`);
  const w = buildWorld({ rooms, bills, leases, tenants, bookings, maintenance: maint, expenses: expenses.reduce((s, e) => s + e.amount, 0),
    readRoomIds: new Set(reads.map((r) => r.roomId)), today, property: { name: property.name, address: property.address, phone: property.phone, lineId: property.lineId },
    owner: { callName: property.wCallName, buildingName: property.wBuildingName || property.name } });

  const [agent, setAgent] = useState<AgentId>(w.late.length ? "collect" : "head");
  const [line, setLine] = useState<number | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [voice, setVoice] = useState<null | "listen" | "heard">(null);
  const [heard, setHeard] = useState<{ said: string; reply: string; ok?: { label: string; run: () => Promise<string | void> } } | null>(null);
  const [typed, setTyped] = useState("");
  const [ownerCode, setOwnerCode] = useState("");
  const [names, setNames] = useState({ call: property.wCallName ?? "", building: property.wBuildingName ?? property.name });
  const playing = useRef(0);
  const rec = useRef<SR | null>(null);
  const { say, stop } = useVoice();
  useEffect(() => () => { stop(); rec.current?.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }));
  const hello = hour < 11 ? "อรุณสวัสดิ์ค่ะ" : hour < 17 ? "สวัสดีค่ะ" : "สวัสดีตอนเย็นค่ะ";
  const cur = w.agents.find((a) => a.id === agent) ?? w.agents[0];
  w.brief[0] = w.brief[0].replace("อรุณสวัสดิ์ค่ะ", hello); // the 08:00 LINE report says good morning; in the app, greet for the time of day

  async function play() {
    const id = ++playing.current;
    for (let i = 0; i < w.brief.length; i++) {
      if (playing.current !== id) return;
      setLine(i);
      await say(w.brief[i]);
    }
    if (playing.current === id) setLine(null);
  }
  const stopBrief = () => { playing.current++; stop(); setLine(null); };

  const copy = async (d: Draft) => { await navigator.clipboard.writeText(edit[d.id] ?? d.text).catch(() => {}); toast("คัดลอกแล้ว"); };
  async function send(d: Draft) {
    const text = edit[d.id] ?? d.text;
    const t = d.tenantId ? tenants.get(d.tenantId) : undefined;
    if (t?.lineUserId) {
      const token = await auth().currentUser?.getIdToken();
      const res = await fetch("/api/line/message", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ propertyId: property.id, tenantId: t.id, text }) });
      if (res.ok) return toast(`ส่งให้${t.fullName}แล้ว`);
    }
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
    await copy(d);
  }

  // ── voice commands ──
  const roomByNo = (n: string) => rooms.find((r) => r.number === n);
  function answer(said: string, intent: Intent) {
    let reply = "", ok: { label: string; run: () => Promise<string | void> } | undefined;
    const r = "room" in intent && intent.room ? roomByNo(intent.room) : undefined;
    if ("room" in intent && intent.room && !r) reply = `ไม่พบห้อง ${intent.room}`;
    else switch (intent.kind) {
      case "brief": reply = w.brief.join("\n"); break;
      case "owed": {
        const list = rooms.map((x) => ({ x, s: w.st.get(x.id)! })).filter((y) => y.s.owed > 0).sort((a, b) => b.s.lateDays - a.s.lateDays);
        reply = list.length ? `ยังไม่จ่าย ${list.length} ห้อง\n${list.slice(0, 6).map((y) => `${y.x.number} ฿${thb(y.s.owed)}${y.s.lateDays ? ` เลย ${y.s.lateDays} วัน` : ""}`).join("\n")}` : "จ่ายครบทุกห้องแล้วค่ะ";
        break;
      }
      case "profit": reply = `เดือนนี้เก็บได้ ${thb(w.collected)} บาท\nรายจ่าย ${thb(expenses.reduce((s, e) => s + e.amount, 0))} บาท\nกำไร ${thb(w.collected - expenses.reduce((s, e) => s + e.amount, 0))} บาท`; break;
      case "vacant": reply = w.vacant.length ? `ว่าง ${w.vacant.length} ห้อง: ${w.vacant.map((x) => x.number).join(", ")}` : "เต็มทุกห้องค่ะ"; break;
      case "pay": {
        const b = openBills.filter((x) => x.roomId === r!.id).sort((a, z) => a.dueDate.localeCompare(z.dueDate))[0];
        if (!b) { reply = `ห้อง ${r!.number} ไม่มียอดค้างค่ะ`; break; }
        const amt = intent.amount ?? balance(b);
        reply = `รับเงินห้อง ${r!.number}\n฿${thb(amt)} · ${intent.method === "cash" ? "เงินสด" : "โอน"} · วันนี้\nบันทึกเลยไหมคะ`;
        ok = { label: "บันทึกรับเงิน", run: async () => { const no = await receivePayment(property, b.id, amt, intent.method, ""); return `รับเงินห้อง ${r!.number} แล้ว · ${no}`; } };
        break;
      }
      case "bill": reply = `เปิดหน้าออกบิลห้อง ${r!.number} ให้แล้วค่ะ ใส่เลขไฟกับน้ำได้เลย`; setTimeout(() => openRoom(r!.id, { name: "issue" }), 600); break;
      case "remind": {
        const d = w.drafts.find((x) => x.kind === "remind" && x.roomId === r!.id);
        if (!d) { reply = `ห้อง ${r!.number} ไม่มียอดเลยกำหนดค่ะ`; break; }
        reply = `จะส่งถึง${d.tenantId ? tenants.get(d.tenantId)?.fullName ?? "ผู้เช่า" : "ผู้เช่า"}\n“${edit[d.id] ?? d.text}”`;
        ok = { label: "ส่งข้อความ", run: async () => { await send(d); } };
        break;
      }
      case "repair":
        reply = `แจ้งซ่อม${r ? `ห้อง ${r.number}` : "ส่วนกลาง"}\n${intent.problem}\nส่งให้ FIXY เลยไหมคะ`;
        ok = { label: "แจ้งซ่อม", run: async () => { await addMaintenance(property.id, { room: r ?? null, problem: intent.problem, category: "อื่นๆ", priority: "normal" }); return "แจ้งซ่อมแล้ว"; } };
        break;
      default: reply = "ยังไม่เข้าใจค่ะ ลองพูดว่า “รับเงินห้อง 103” หรือ “ห้องไหนยังไม่จ่าย”";
    }
    if (role === "viewer") ok = undefined;
    setHeard({ said, reply, ok }); setVoice("heard");
    void say(reply.split("\n")[0]);
  }
  function listen() {
    stopBrief();
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
    setVoice("listen"); setHeard(null);
    if (!Ctor) return; // no microphone API here (e.g. inside LINE): the typing box below still works
    const r = new Ctor(); rec.current = r;
    r.lang = "th-TH"; r.interimResults = false;
    r.onresult = (e) => { const said = e.results[0][0].transcript; answer(said, parseCommand(said)); };
    r.onerror = () => setVoice((v) => (v === "listen" ? null : v));
    r.onend = () => setVoice((v) => (v === "listen" ? null : v));
    try { r.start(); } catch { /* already started */ }
  }
  const run = (text: string) => { if (text.trim()) answer(text.trim(), parseCommand(text)); setTyped(""); };

  return (
    <div className="fixed inset-0 z-[45] overflow-y-auto text-[#e8ecff]" style={{ background: "radial-gradient(120% 70% at 50% 0%,#1d2a7a 0%,#0a0f2e 45%,#03040c 100%)" }}>
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(120,140,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(120,140,255,.07) 1px,transparent 1px)", backgroundSize: "28px 28px", maskImage: "linear-gradient(#000,transparent 55%)" }} />
      <div className="relative mx-auto max-w-xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-48">
        <div className="flex items-center justify-between">
          <span className={`${mono} text-[#8fa2ff]`}>W WORLD · {new Date().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}</span>
          <button aria-label="ปิด W World" onClick={() => { stopBrief(); router.push("/rooms"); }} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[.06] ring-1 ring-white/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8ecff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="relative mx-auto mt-4 h-[150px] w-[150px]" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border border-[rgba(124,240,255,.5)]" style={{ animation: "ea-halo 2.6s ease-out infinite" }} />
          <div className="absolute inset-0 rounded-full border border-[rgba(160,120,255,.45)]" style={{ animation: "ea-halo 2.6s ease-out 1.3s infinite" }} />
          <div className="absolute inset-3 rounded-full border border-dashed border-[rgba(143,162,255,.45)]" style={{ animation: "ea-spin 18s linear infinite" }} />
          <div className="absolute inset-[30px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%,#e6fdff 0%,#6ee7ff 22%,#4c63ff 55%,#7a2bff 80%,#2a0b6e 100%)", boxShadow: "0 0 40px rgba(110,231,255,.55),0 0 90px rgba(122,43,255,.45)", animation: `ea-orb ${line !== null || voice ? "1.1s" : "3.2s"} ease-in-out infinite` }} />
        </div>
        <h1 className="mt-4 text-center text-[26px] font-semibold">{hello} {w.work ? `วันนี้มี ${w.work} เรื่อง` : "วันนี้เรียบร้อยดี"}</h1>
        <p className="mt-1 text-center text-[15px] text-[#9aa6d6]">{w.drafts.length ? "ร่างข้อความไว้ให้แล้วค่ะ แก้ได้ก่อนส่ง" : "ไม่มีข้อความรอส่ง"}</p>

        {line === null ? (
          <button onClick={play} className="mx-auto mt-4 flex min-h-[52px] items-center gap-2.5 rounded-full bg-[rgba(110,231,255,.10)] py-0 pr-5 pl-2 font-semibold ring-1 ring-[rgba(110,231,255,.45)] shadow-[0_0_22px_rgba(110,231,255,.2)]">
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-gradient-to-br from-[#6ee7ff] to-[#8a6bff]"><svg width="16" height="16" viewBox="0 0 24 24" fill="#070a1c" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg></span>
            ฟัง Morning Brief
          </button>
        ) : (
          <div role="status" aria-live="polite" className={`mt-4 p-3.5 ring-[rgba(110,231,255,.45)] ${glass}`}>
            <div className="flex items-center justify-between">
              <span className="flex h-5 items-center gap-1" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} className="h-5 w-[5px] rounded bg-gradient-to-b from-[#6ee7ff] to-[#8a6bff]" style={{ animation: `ea-eq ${0.6 + (i % 4) * 0.15}s ease-in-out ${i * 0.07}s infinite` }} />)}</span>
              <span className={`${mono} text-[#8fa2ff]`}>BRIEF {line + 1}/{w.brief.length}</span>
            </div>
            <p className="mt-2.5 min-h-14 text-lg leading-relaxed">{w.brief[line]}</p>
            <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/10"><div className="h-1 bg-gradient-to-r from-[#6ee7ff] to-[#8a6bff] transition-all" style={{ width: `${((line + 1) / w.brief.length) * 100}%` }} /></div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button onClick={() => { stopBrief(); void play(); }} className="min-h-12 rounded-2xl font-semibold ring-1 ring-white/20">ฟังใหม่</button>
              <button onClick={stopBrief} className="min-h-12 rounded-2xl font-semibold ring-1 ring-white/20">หยุด</button>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-baseline justify-between"><span className={`${mono} text-[#8fa2ff]`}>PIXEL WORLD</span><span className="text-[13px] text-[#9aa6d6]">พนักงาน 9 คน · ว่าง {w.agents.filter((a) => a.status === "idle").length} คน</span></div>
        <div className="mt-2"><PixelWorld agents={w.agents} selected={agent} onSelect={setAgent} /></div>
        <div className={`mt-2.5 p-3.5 ring-[rgba(110,231,255,.35)] ${glass}`}>
          <div className="flex items-center justify-between gap-2">
            <span><span className={`${mono} text-[#6ee7ff]`}>{cur.name}</span> <span className="font-semibold">{cur.role}</span></span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold text-[#060a24] ${{ idle: "bg-[#5dd39e]", waiting: "bg-[#8fa3ff]", busy: "bg-[#ffd166]", alert: "bg-[#ff5a5a]" }[cur.status]}`}>{{ idle: "ว่าง", waiting: "รอเวลา", busy: "กำลังทำ", alert: "ด่วน" }[cur.status]}</span>
          </div>
          <p className="mt-1.5">{cur.summary}</p>
          <p className="mt-1 text-[13px] text-[#9aa6d6]">ทำเอง: {cur.auto}</p>
          {(cur.id === "meter" || cur.id === "billing") && cur.count > 0 && <button onClick={() => router.push("/meters")} className="mt-2.5 min-h-12 w-full rounded-2xl bg-gradient-to-r from-[#6ee7ff] to-[#8a6bff] font-bold text-[#070a1c]">ไปจดมิเตอร์และออกบิล</button>}
          {cur.id === "repair" && cur.count > 0 && <button onClick={() => router.push("/more")} className="mt-2.5 min-h-12 w-full rounded-2xl bg-gradient-to-r from-[#6ee7ff] to-[#8a6bff] font-bold text-[#070a1c]">ดูงานซ่อม</button>}
        </div>

        {w.drafts.length > 0 && <p className={`${mono} mt-6 text-[#8fa2ff]`}>รอคุณกดส่ง</p>}
        <div className="mt-2 space-y-2.5">
          {w.drafts.map((d) => (
            <div key={d.id} className={`p-3.5 ${glass} ${d.urgent ? "ring-[rgba(255,120,120,.35)]" : ""}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{d.title}</span><span className={`${mono} text-[11px] ${d.urgent ? "text-[#ff9b95]" : "text-[#8fa2ff]"}`}>{d.tag}</span></div>
              <textarea aria-label={`ข้อความ ${d.title}`} value={edit[d.id] ?? d.text} onChange={(e) => setEdit({ ...edit, [d.id]: e.target.value })} rows={d.kind === "vacancy" ? 4 : 3}
                className="mt-2 w-full resize-none rounded-2xl bg-black/35 p-3 text-[15px] leading-relaxed text-[#d7ddff] outline-none focus:ring-1 focus:ring-[#6ee7ff]" />
              <div className="mt-2 grid grid-cols-[1fr_2fr] gap-2">
                <button onClick={() => copy(d)} className="min-h-12 rounded-2xl font-semibold ring-1 ring-white/20">คัดลอก</button>
                <button onClick={() => send(d)} disabled={role === "viewer"} className="min-h-12 rounded-2xl bg-gradient-to-r from-[#6ee7ff] to-[#8a6bff] font-bold text-[#070a1c] disabled:opacity-40">
                  {d.kind === "vacancy" ? "แชร์ไปโพสต์" : d.tenantId && tenants.get(d.tenantId)?.lineUserId ? "ส่งทาง LINE" : "ส่ง"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {role === "owner" && (
          <div className={`mt-4 space-y-2 p-3.5 ${glass}`}>
            <p className="font-semibold">W เรียกคุณว่า</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[13px] text-[#9aa6d6]">ชื่อคุณ
                <input value={names.call} onChange={(e) => setNames({ ...names, call: e.target.value })} placeholder="คุณวสันต์" className="mt-1 block min-h-12 w-full rounded-2xl bg-black/35 px-3 text-[16px] text-[#e8ecff] outline-none focus:ring-1 focus:ring-[#6ee7ff]" />
              </label>
              <label className="text-[13px] text-[#9aa6d6]">ชื่อหอที่ W พูด
                <input value={names.building} onChange={(e) => setNames({ ...names, building: e.target.value })} className="mt-1 block min-h-12 w-full rounded-2xl bg-black/35 px-3 text-[16px] text-[#e8ecff] outline-none focus:ring-1 focus:ring-[#6ee7ff]" />
              </label>
            </div>
            <p className="text-[13px] text-[#9aa6d6]">“{morningGreeting(names.call, names.building || property.name, today)}”</p>
            <button onClick={async () => { await updateProperty(property.id, { wCallName: names.call.trim(), wBuildingName: names.building.trim() }); toast("บันทึกแล้วค่ะ"); }}
              className="min-h-12 w-full rounded-2xl font-semibold ring-1 ring-[rgba(110,231,255,.5)]">บันทึก</button>
          </div>
        )}
        {role === "owner" && (
          <div className={`mt-3 p-3.5 ${glass}`}>
            <p className="font-semibold">ส่งสรุปเข้า LINE ทุกเช้า 08:00</p>
            {ownerCode
              ? <p className="mt-1 text-[15px] text-[#cfd6ff]">เพิ่มเพื่อน LINE ของ Easy Apartment แล้วพิมพ์รหัส <b className="font-mono text-lg tracking-widest text-[#6ee7ff]">{ownerCode}</b> (ใช้ได้ 7 วัน)</p>
              : <button onClick={async () => setOwnerCode(await createOwnerLineLink(property.id))} className="mt-2 min-h-12 w-full rounded-2xl font-semibold ring-1 ring-[rgba(110,231,255,.5)]">ผูก LINE ของฉัน</button>}
          </div>
        )}
      </div>

      {/* voice bar */}
      {!voice && (
        <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#03040c] from-60% to-transparent px-4 pt-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-xl">
            <div className="flex gap-1.5 overflow-x-auto pb-2.5">
              {["ห้องไหนยังไม่จ่าย", "รับเงินห้อง …", "ออกบิลห้อง …", "ทวงห้อง …", "เดือนนี้กำไรเท่าไหร่", "แจ้งซ่อม แอร์ห้อง …"].map((x) => (
                <button key={x} onClick={() => (x.includes("…") ? setTyped(x.replace("…", "").trim() + " ") : run(x))} className="min-h-10 shrink-0 rounded-full bg-white/[.06] px-3.5 text-sm whitespace-nowrap text-[#cfd6ff] ring-1 ring-white/20">“{x}”</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run(typed); }} className="flex gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์คำสั่ง หรือแตะไมค์แล้วพูด" aria-label="คำสั่งถึง W"
                className="min-h-14 flex-1 rounded-full bg-white/[.07] px-5 text-[16px] text-[#e8ecff] ring-1 ring-white/20 outline-none placeholder:text-[#8f99c8] focus:ring-[#6ee7ff]" />
              <button type="button" onClick={listen} aria-label="พูดกับ W" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-[0_0_24px_rgba(110,231,255,.35)]" style={{ background: "radial-gradient(circle at 35% 30%,#e6fdff 0%,#6ee7ff 35%,#5a5cff 75%)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#070a1c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></svg>
              </button>
            </form>
          </div>
        </div>
      )}
      {voice && (
        <div className="fixed inset-0 z-20 flex flex-col justify-end bg-[rgba(3,4,12,.9)] px-4 pt-4 pb-[calc(1.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto w-full max-w-xl">
            {voice === "listen" && (
              <div className="flex flex-col items-center gap-4 pb-10">
                <div className="relative h-[170px] w-[170px]" aria-hidden="true">
                  <div className="absolute inset-0 rounded-full border border-[rgba(124,240,255,.55)]" style={{ animation: "ea-halo 1.4s ease-out infinite" }} />
                  <div className="absolute inset-[34px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%,#e6fdff 0%,#6ee7ff 22%,#4c63ff 55%,#7a2bff 80%,#2a0b6e 100%)", boxShadow: "0 0 50px rgba(110,231,255,.6)", animation: "ea-orb 1.2s ease-in-out infinite" }} />
                </div>
                <p className="text-xl font-semibold">กำลังฟัง…</p>
                <p className="text-center text-[15px] text-[#9aa6d6]">พูดได้เลย เช่น “รับเงินห้อง 103” · ถ้าเครื่องนี้ใช้ไมค์ไม่ได้ ปิดแล้วพิมพ์แทน</p>
                <button onClick={() => { rec.current?.stop(); setVoice(null); }} className="min-h-12 rounded-full px-6 ring-1 ring-white/20">ยกเลิก</button>
              </div>
            )}
            {voice === "heard" && heard && (
              <div className="flex flex-col gap-2.5 ea-rise">
                <div className="max-w-[85%] self-end rounded-[20px_20px_6px_20px] bg-[#1e2a6e] px-3.5 py-3">“{heard.said}”</div>
                <div className="flex max-w-[92%] items-end gap-2 self-start">
                  <span className="h-[34px] w-[34px] shrink-0 rounded-full shadow-[0_0_14px_rgba(110,231,255,.5)]" style={{ background: "radial-gradient(circle at 35% 30%,#e6fdff 0%,#6ee7ff 30%,#5a5cff 70%,#7a2bff 100%)" }} />
                  <div className="rounded-[20px_20px_20px_6px] bg-white/[.08] px-3.5 py-3 leading-relaxed whitespace-pre-line ring-1 ring-[rgba(110,231,255,.3)]">{heard.reply}</div>
                </div>
                {heard.ok ? (
                  <div className="mt-1.5 grid grid-cols-[1fr_2fr] gap-2">
                    <button onClick={() => setVoice(null)} className="min-h-[58px] rounded-2xl font-semibold ring-1 ring-white/20">ไม่ใช่</button>
                    <button onClick={async () => { const ok = heard.ok!; setVoice(null); try { const m = await ok.run(); if (m) toast(m); } catch (e) { toast((e as Error).message); } }}
                      className="min-h-[58px] rounded-2xl bg-gradient-to-r from-[#6ee7ff] to-[#8a6bff] text-[17px] font-bold text-[#070a1c]">{heard.ok.label}</button>
                  </div>
                ) : <button onClick={listen} className="mt-1.5 min-h-[58px] rounded-2xl font-semibold ring-1 ring-[rgba(110,231,255,.5)]">พูดอีกครั้ง</button>}
                <button onClick={() => setVoice(null)} className="min-h-11 text-[#9aa6d6]">ปิด</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
