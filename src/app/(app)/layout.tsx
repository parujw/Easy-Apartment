import { Suspense } from "react";
import TabBar from "@/components/tab-bar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24">
        <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>{children}</Suspense>
      </main>
      <TabBar />
    </>
  );
}
