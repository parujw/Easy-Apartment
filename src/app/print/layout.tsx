import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@fontsource/sarabun/800.css";

// Printed documents use Sarabun like the V3 originals (self-hosted, no Google Fonts call).
export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return <div style={{ fontFamily: "Sarabun, sans-serif" }}>{children}</div>;
}
