"use client";

import { useState, useSyncExternalStore } from "react";

// In-app browsers (LINE, Facebook, Instagram) ignore window.print(). LINE can hand the page to the
// phone's real browser with ?openExternalBrowser=1; the others need the user to do it from their menu.
const inLine = (ua: string) => /\bLine\//i.test(ua);
const inOtherApp = (ua: string) => /FBAN|FBAV|Instagram|KAKAOTALK|; wv\)/i.test(ua);
const useUA = () => useSyncExternalStore(() => () => {}, () => navigator.userAgent, () => "");

/** Top bar on print pages, styled like the app; hidden when printing (.print-bar is display:none in print CSS). */
export default function PrintBar({ backHref }: { backHref: string }) {
  const ua = useUA();
  const [hint, setHint] = useState("");

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
    if (inOtherApp(ua)) {
      setHint("แอปนี้พิมพ์ไม่ได้ กดเมนู ⋯ แล้วเลือก “เปิดในเบราว์เซอร์” (Safari / Chrome) แล้วกดพิมพ์อีกครั้ง");
      return;
    }
    window.print();
  }

  return (
    <div className="print-bar fixed inset-x-0 top-0 z-10 border-b border-black/10 bg-background/95 backdrop-blur" style={{ fontFamily: "var(--app-font)" }}>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
        <button type="button" onClick={back} className="min-h-12 rounded-xl bg-surface px-4 font-semibold text-foreground ring-1 ring-black/15">‹ กลับ</button>
        <button type="button" onClick={print} className="min-h-12 rounded-xl bg-[var(--app-brand)] px-5 font-semibold text-white">
          {inLine(ua) ? "เปิดในเบราว์เซอร์เพื่อพิมพ์" : "พิมพ์ / บันทึก PDF"}
        </button>
      </div>
      {hint && <p role="status" className="mx-auto max-w-3xl px-4 pb-2 text-sm text-foreground">{hint}</p>}
    </div>
  );
}
