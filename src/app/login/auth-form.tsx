"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp, authError } from "@/lib/account";

const input = "mt-1 block w-full min-h-12 rounded-xl border border-black/15 bg-surface px-3 text-base";
const button = "mt-6 w-full min-h-12 rounded-xl bg-brand font-semibold text-white disabled:opacity-50";

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ first: "", last: "", phone: "", password: "", property: "", invite: "" });
  const [staff, setStaff] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        await signIn(f.phone, f.password);
      } else {
        if (!f.first.trim() || !f.last.trim()) throw new Error("กรุณากรอกชื่อและนามสกุล");
        if (f.password.length < 8) throw new Error("รหัสผ่านอย่างน้อย 8 ตัวอักษร");
        await signUp(staff ? f : { ...f, invite: "" });
      }
      router.push("/rooms");
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
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
            <label className="mt-3 flex min-h-12 items-center gap-2">
              <input type="checkbox" className="size-5" checked={staff} onChange={(e) => setStaff(e.target.checked)} />
              ฉันเป็นผู้ช่วย / พนักงาน มีรหัสเชิญจากเจ้าของ
            </label>
          )}
          {mode === "signup" && !staff && (
            <label className="mt-3 block">ชื่อหอพัก / โรงแรม
              <input className={input} value={f.property} onChange={set("property")} />
            </label>
          )}
          {mode === "signup" && staff && (
            <label className="mt-3 block">รหัสเชิญ 8 ตัว
              <input className={input} value={f.invite} onChange={set("invite")} autoCapitalize="characters" />
            </label>
          )}
      </>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <button className={button} disabled={busy}>
        {busy ? "กำลังดำเนินการ…" : mode === "signup" ? "สมัครใช้งาน" : "เข้าสู่ระบบ"}
      </button>
      {(
        <button type="button" className="mt-4 w-full min-h-12 text-brand"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? "ยังไม่มีบัญชี? สมัครใช้งาน" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
        </button>
      )}
    </form>
  );
}
