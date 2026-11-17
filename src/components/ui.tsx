"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/toast";

// Big touch targets (≥48px), 16px text, one-hand friendly bottom sheets.

/**
 * Bottom sheet. Header: back (optional) + title + close. Footer: the one primary action, always at the bottom,
 * so nothing shifts under the finger while the content above loads.
 */
export function Sheet({ open, onClose, title, children, back, footer, tall = true }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
  back?: { label: string; onClick: () => void }; footer?: React.ReactNode; tall?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Freeze the page behind the sheet; otherwise iOS scrolls the page instead of the sheet and it feels stuck.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`ea-rise flex w-full max-w-xl flex-col rounded-t-[28px] bg-background ${tall ? "h-[94dvh]" : "max-h-[94dvh]"}`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
          {back
            ? <button className="min-h-12 pr-3 font-semibold" onClick={back.onClick}>‹ {back.label}</button>
            : <span />}
          <button className="flex h-11 w-11 items-center justify-center rounded-full bg-line" onClick={onClose} aria-label="ปิด">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <h2 className="mb-3 text-[26px] font-bold leading-tight tracking-tight">{title}</h2>
          {children}
        </div>
        {footer && <div className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

const inputCls = "mt-1 block w-full min-h-14 rounded-2xl border-0 bg-surface px-4 text-lg text-ink ring-1 ring-line-2 focus:ring-2 focus:ring-brand outline-none";

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <input className={inputCls} {...props} />
    </label>
  );
}

/** Number box that keeps what the person typed (empty, "8.", ",") and reports a number or "" */
export function NumField({ label, value, onChange, ...props }:
  { label: string; value: number | ""; onChange: (v: number | "") => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(value === "" ? "" : String(value));
  const shown = value === "" ? text : Number(text.replace(/,/g, "")) === value ? text : String(value);
  return (
    <Field label={label} inputMode="decimal" value={shown}
      onChange={(e) => { const t = e.target.value; setText(t); const n = Number(t.replace(/,/g, "")); onChange(t.trim() === "" || !Number.isFinite(n) ? "" : n); }} {...props} />
  );
}

export function Select({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block text-sm text-muted">
      <span>{label}</span>
      <select className={inputCls} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

/** Three kinds only: primary (one per screen, bottom), secondary (white, grey line), text (links). danger = secondary in red. */
export function Btn({ kind = "primary", className = "", ...props }: { kind?: "primary" | "ghost" | "danger" | "text" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const k = kind === "primary" ? "min-h-14 bg-brand text-white text-[17px] font-bold active:bg-brand-dark"
    : kind === "danger" ? "min-h-12 bg-surface text-bad-ink ring-1 ring-line-2 font-semibold"
    : kind === "text" ? "min-h-12 text-brand font-semibold"
    : "min-h-12 bg-surface text-ink ring-1 ring-line-2 font-semibold";
  return <button className={`rounded-2xl px-4 disabled:opacity-45 ${k} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[20px] bg-surface p-4 ring-1 ring-line ${className}`}>{children}</section>;
}

/** List row inside a Card: label left, value right, chevron. */
export function Row({ label, value, onClick, tone }: { label: React.ReactNode; value?: React.ReactNode; onClick?: () => void; tone?: "bad" | "warn" | "ok" }) {
  const c = tone === "bad" ? "text-bad-ink" : tone === "warn" ? "text-warn-ink" : tone === "ok" ? "text-brand" : "text-muted";
  return (
    <button onClick={onClick} className="flex min-h-14 w-full items-center justify-between gap-3 border-t border-line px-4 text-left first:border-t-0">
      <span className="font-medium">{label}</span>
      <span className={`flex items-center gap-2 ${c}`}>{value}{onClick && <span className="text-line-2">›</span>}</span>
    </button>
  );
}

/** Status pill in the shared status colours. */
export function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const c = tone === "ok" ? "bg-brand-soft text-brand-dark" : tone === "warn" ? "bg-warn-soft text-warn-ink" : tone === "bad" ? "bg-bad-soft text-bad-ink" : "bg-line text-ink-2";
  return <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${c}`}>{children}</span>;
}

/** Runs an async action with a busy flag and an error/success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    const work = fn();
    // On a weak signal a save can wait for the server for a long time. The change is already on screen
    // (Firestore applies it locally), so free the buttons after a few seconds and finish in the background.
    let slow = false;
    const timer = setTimeout(() => {
      slow = true;
      setBusy(false);
      setMsg({ ok: true, text: "สัญญาณช้า กำลังส่งข้อมูลขึ้นระบบ… ใช้งานต่อได้เลย" });
    }, 6000);
    try {
      const text = await work;
      if (slow) setMsg(null);
      if (text) { setMsg({ ok: true, text }); toast(text); } else if (slow) toast("บันทึกขึ้นระบบแล้ว");
      return true;
    } catch (e) {
      const text = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
      setMsg({ ok: false, text });
      if (slow) toast(`บันทึกไม่สำเร็จ: ${text}`);
      return false;
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }
  const view = msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-brand" : "text-bad-ink"}`}>{msg.text}</p>;
  return { busy, run, view, setMsg };
}
