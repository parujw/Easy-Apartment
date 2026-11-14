"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toE164 } from "@/lib/phone";

const input = "mt-1 block w-full min-h-12 rounded-xl border border-black/15 bg-surface px-3 text-base";
const button = "mt-6 w-full min-h-12 rounded-xl bg-brand font-semibold text-white disabled:opacity-50";

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ first: "", last: "", phone: "", password: "", property: "", otp: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function finishSignup() {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    const { error: e1 } = await sb.from("profiles").upsert({
      user_id: data.user.id, first_name: f.first.trim(), last_name: f.last.trim(), phone: toE164(f.phone),
    });
    if (e1) throw e1;
    const { error: e2 } = await sb.rpc("create_property", { p_name: f.property.trim() || "หอพักของฉัน" });
    if (e2) throw e2;
    router.push("/rooms");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const sb = supabaseBrowser();
      const phone = toE164(f.phone);
      if (step === "otp") {
        const { error } = await sb.auth.verifyOtp({ phone, token: f.otp, type: "sms" });
        if (error) throw error;
        await finishSignup();
      } else if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ phone, password: f.password });
        if (error) throw new Error("เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง");
        router.push("/rooms");
      } else {
        if (!f.first.trim() || !f.last.trim()) throw new Error("กรุณากรอกชื่อและนามสกุล");
        if (f.password.length < 8) throw new Error("รหัสผ่านอย่างน้อย 8 ตัวอักษร");
        const { data, error } = await sb.auth.signUp({ phone, password: f.password });
        if (error) throw error;
        if (data.session) await finishSignup();
        else setStep("otp"); // phone confirmation is on: verify the SMS code first
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
      {step === "otp" ? (
        <label className="block">รหัส OTP ที่ส่งไปทาง SMS
          <input className={input} inputMode="numeric" autoComplete="one-time-code" value={f.otp} onChange={set("otp")} />
        </label>
      ) : (
        <>
          {mode === "signup" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">ชื่อ<input className={input} value={f.first} onChange={set("first")} autoComplete="given-name" /></label>
              <label className="block">นามสกุล<input className={input} value={f.last} onChange={set("last")} autoComplete="family-name" /></label>
            </div>
          )}
          <label className="mt-3 block">เบอร์มือถือ
            <input className={input} type="tel" inputMode="tel" placeholder="08x-xxx-xxxx" value={f.phone} onChange={set("phone")} autoComplete="tel" />
          </label>
          <label className="mt-3 block">รหัสผ่าน
            <input className={input} type="password" value={f.password} onChange={set("password")}
              autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </label>
          {mode === "signup" && (
            <label className="mt-3 block">ชื่อหอพัก / โรงแรม
              <input className={input} value={f.property} onChange={set("property")} />
            </label>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <button className={button} disabled={busy}>
        {busy ? "กำลังดำเนินการ…" : step === "otp" ? "ยืนยัน" : mode === "signup" ? "สมัครใช้งาน" : "เข้าสู่ระบบ"}
      </button>
      {step === "form" && (
        <button type="button" className="mt-4 w-full min-h-12 text-brand"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? "ยังไม่มีบัญชี? สมัครใช้งาน" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
        </button>
      )}
    </form>
  );
}
