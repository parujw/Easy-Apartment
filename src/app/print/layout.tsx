import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@fontsource/sarabun/800.css";

// Printed documents use Sarabun like the V3 originals (self-hosted, no Google Fonts call).
// Screen-only background/padding live on this wrapper, not on <body>: Next keeps a left page in the
// DOM (hidden), and body-level rules would then leak into the app after pressing back.
export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return <div className="print-screen min-h-dvh" style={{ fontFamily: "Sarabun, sans-serif" }}>{children}</div>;
}
