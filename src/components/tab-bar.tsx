"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/rooms", label: "ห้อง" },
  { href: "/meters", label: "ออกบิล" },
  { href: "/more", label: "เงิน & อื่นๆ" },
] as const;

// Three tabs only (requirement: fewer screens, one-hand use)
export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-3xl">
        {tabs.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={active ? "page" : undefined}
                className={`flex min-h-14 items-center justify-center px-2 text-center text-sm font-semibold ${active ? "text-brand" : "text-muted"}`}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
