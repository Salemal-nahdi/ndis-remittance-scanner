import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "NDIS Remittance Scanner" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
