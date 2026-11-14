import TabBar from "@/components/tab-bar";
import PropertyProvider from "@/components/property-provider";
import DataProvider from "@/components/data-provider";
import QuickAdd from "@/components/quick-add";
import ActiveGuard from "@/components/active-guard";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-28">
        <PropertyProvider>
          <DataProvider>
            <ActiveGuard />
            {children}
            <QuickAdd />
          </DataProvider>
        </PropertyProvider>
      </main>
      <TabBar />
    </>
  );
}
