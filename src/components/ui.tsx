"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/toast";

// Big touch targets (≥48px), 16px text, one-hand friendly bottom sheets.

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="min-h-12 min-w-12 text-muted" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "mt-1 block w-full min-h-12 rounded-xl border border-black/15 bg-surface px-3 text-base";

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      {label}
      <input className={inputCls} {...props} />
    </label>
  );
}

export function NumField({ label, value, onChange, ...props }:
  { label: string; value: number | ""; onChange: (v: number | "") => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Field label={label} type="number" inputMode="decimal" value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} {...props} />
  );
}

export function Select({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block text-sm">
      <span>{label}</span>
      <select className={inputCls} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

export function Btn({ kind = "primary", className = "", ...props }: { kind?: "primary" | "ghost" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const k = kind === "primary" ? "bg-brand text-white" : kind === "danger" ? "text-red-600 ring-1 ring-red-300" : "ring-1 ring-black/15";
  return <button className={`min-h-12 rounded-xl px-4 font-semibold disabled:opacity-50 ${k} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-4 ring-1 ring-black/10 ${className}`}>{children}</section>;
}

/** Runs an async action with a busy flag and an error/success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) { setMsg({ ok: true, text }); toast(text); }
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const view = msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>;
  return { busy, run, view, setMsg };
}
