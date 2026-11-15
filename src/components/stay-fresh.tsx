"use client";

import { useEffect } from "react";

const BUILT = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const CHUNK_ERROR = /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i;

// An app left open on a phone keeps running the version it was opened with. After we publish a new
// version its old code files are gone, so taps that need them silently do nothing ("the app is stuck").
// When the app comes back to the screen we check the live version and reload if it changed, and we
// reload whenever a code file fails to load. Data comes back instantly from the on-phone copy.
export default function StayFresh() {
  useEffect(() => {
    let hiddenAt = 0;
    const reload = () => {
      try {
        const last = Number(sessionStorage.getItem("ea-reload") ?? 0);
        if (Date.now() - last < 30_000) return; // never loop
        sessionStorage.setItem("ea-reload", String(Date.now()));
      } catch { /* storage blocked: still reload once */ }
      window.location.reload();
    };
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = (await res.json()) as { version: string };
        if (version && version !== BUILT) reload();
      } catch { /* offline: keep going with what we have */ }
    };
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      if (away > 6 * 3600_000) reload(); // away for hours: start clean
      else if (away > 20_000) check();
    };
    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = "reason" in e ? String((e.reason as Error)?.message ?? e.reason) : e.message;
      if (CHUNK_ERROR.test(msg)) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", (e) => { if (e.persisted) check(); }); // restored from back/forward cache
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    const timer = setInterval(() => { if (document.visibilityState === "visible") check(); }, 15 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onError);
      clearInterval(timer);
    };
  }, []);
  return null;
}
