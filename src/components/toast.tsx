"use client";

import { useEffect, useState } from "react";

/** Show a short confirmation that survives the component re-rendering or closing. */
export function toast(text: string) {
  window.dispatchEvent(new CustomEvent("ea-toast", { detail: text }));
}

export default function Toaster() {
  const [text, setText] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      setText((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setText(""), 3500);
    };
    window.addEventListener("ea-toast", on);
    return () => { window.removeEventListener("ea-toast", on); clearTimeout(timer); };
  }, []);
  if (!text) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-4 top-4 z-[60] mx-auto max-w-md rounded-2xl bg-emerald-700 p-4 text-center font-semibold text-white shadow-lg">
      {text}
    </div>
  );
}
