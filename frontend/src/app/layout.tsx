import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Site Spono",
  description: "Static site upload and CNAME publishing dashboard"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
