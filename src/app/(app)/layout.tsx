import TabBar from "@/components/tab-bar";
import PropertyProvider from "@/components/property-provider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24">
        <PropertyProvider>{children}</PropertyProvider>
      </main>
      <TabBar />
    </>
  );
}
