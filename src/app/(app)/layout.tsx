import PropertyProvider from "@/components/property-provider";
import DataProvider from "@/components/data-provider";
import ActiveGuard from "@/components/active-guard";
import Shell from "@/components/shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <PropertyProvider>
        <DataProvider>
          <Shell>
            <ActiveGuard />
            {children}
          </Shell>
        </DataProvider>
      </PropertyProvider>
    </main>
  );
}
