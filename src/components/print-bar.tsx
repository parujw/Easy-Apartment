"use client";

import { useState, useSyncExternalStore } from "react";

// Browsers inside apps (LINE, Facebook, Messenger, Instagram, …) silently ignore window.print().
// LINE can hand the page to the phone's real browser with ?openExternalBrowser=1. For any other
// in-app browser we can't rely on the user agent, so we call print() and watch for the browser's
// "beforeprint" event: if no print dialog started, we show ways to open the page in Safari/Chrome.
const inLine = (ua: string) => /\bLine\//i.test(ua);
const isIOS = (ua: string) => /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
const isAndroid = (ua: string) => /Android/i.test(ua);
const useUA = () => useSyncExternalStore(() => () => {}, () => navigator.userAgent, () => "");

/** Top bar on print pages, styled like the app; hidden when printing (.print-bar is display:none in print CSS). */
export default function PrintBar({ backHref }: { backHref: string }) {
  const ua = useUA();
  const [stuck, setStuck] = useState(false);
  const [copied, setCopied] = useState(false);

  function back() {
    // Return to where the user came from (keeps their place); a shared link opened directly goes to backHref.
    if (document.referrer.startsWith(window.location.origin) && window.history.length > 1) window.history.back();
    else window.location.href = backHref;
  }

  function print() {
    if (inLine(ua)) {
      const url = new URL(window.location.href);
      url.searchParams.set("openExternalBrowser", "1");
      window.location.href = url.toString();
      return;
    }
    let started = false;
    const mark = () => { started = true; };
    window.addEventListener("beforeprint", mark, { once: true });
    window.print();
    setTimeout(() => {
      window.removeEventListener("beforeprint", mark);
      if (!started) setStuck(true);
    }, 1200);
  }

  function openInBrowser() {
    const { host, pathname, search } = window.location;
    window.location.href = isAndroid(ua)
      ? `intent://${host}${pathname}${search}#Intent;scheme=https;end`
      : `x-safari-https://${host}${pathname}${search}`; // iOS 17+: opens the page in Safari
  }

  async function copy() {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
  }

  return (
    <div className="print-bar fixed inset-x-0 top-0 z-10 border-b border-black/10 bg-background/95 backdrop-blur" style={{ fontFamily: "var(--app-font)" }}>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
        <button type="button" onClick={back} className="min-h-12 rounded-xl bg-surface px-4 font-semibold text-foreground ring-1 ring-black/15">‹ กลับ</button>
        <button type="button" onClick={print} className="min-h-12 rounded-xl bg-[var(--app-brand)] px-5 font-semibold text-white">
          {inLine(ua) ? "เปิดในเบราว์เซอร์เพื่อพิมพ์" : "พิมพ์ / บันทึก PDF"}
        </button>
      </div>
      {stuck && (
        <div role="alert" className="mx-auto max-w-3xl space-y-2 px-4 pb-3 text-sm text-foreground">
          <p className="font-semibold">หน้านี้เปิดอยู่ในแอป ซึ่งสั่งพิมพ์ไม่ได้</p>
          <p>เปิดใน{isAndroid(ua) ? " Chrome" : " Safari"} แล้วกดพิมพ์อีกครั้ง{isIOS(ua) ? " (หรือกดปุ่มเข็มทิศ 🧭 / เมนู ⋯ → “เปิดใน Safari”)" : " (หรือกดเมนู ⋮ → “เปิดในเบราว์เซอร์”)"}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={openInBrowser} className="min-h-12 rounded-xl bg-[var(--app-brand)] px-3 font-semibold text-white">
              เปิดใน{isAndroid(ua) ? " Chrome" : " Safari"}
            </button>
            <button type="button" onClick={copy} className="min-h-12 rounded-xl bg-surface px-3 font-semibold ring-1 ring-black/15">
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
            </button>
          </div>
          <button type="button" onClick={() => setStuck(false)} className="min-h-10 text-muted underline">ปิด</button>
        </div>
      )}
    </div>
  );
}
