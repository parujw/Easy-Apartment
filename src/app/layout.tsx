import type { Metadata, Viewport } from "next";
import "@fontsource/anuphan/400.css";
import "@fontsource/anuphan/500.css";
import "@fontsource/anuphan/600.css";
import "@fontsource/anuphan/700.css";
import "./globals.css";
import Toaster from "@/components/toast";
import StayFresh from "@/components/stay-fresh";

export const metadata: Metadata = {
  title: "Easy Apartment",
  description: "แอปบริหารห้องเช่า โรงแรม และ Airbnb",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f2f4f7" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}<Toaster /><StayFresh /></body>
    </html>
  );
}
