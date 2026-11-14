import type { Metadata, Viewport } from "next";
import "./globals.css";
import Toaster from "@/components/toast";

export const metadata: Metadata = {
  title: "Easy Apartment",
  description: "แอปบริหารห้องเช่า โรงแรม และ Airbnb",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}<Toaster /></body>
    </html>
  );
}
