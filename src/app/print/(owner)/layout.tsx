import PropertyProvider from "@/components/property-provider";
import DataProvider from "@/components/data-provider";

// Owner-only print pages: signed in, with the property's live data, but no tab bar.
export default function OwnerPrintLayout({ children }: LayoutProps<"/print">) {
  return (
    <PropertyProvider>
      <DataProvider>{children}</DataProvider>
    </PropertyProvider>
  );
}
