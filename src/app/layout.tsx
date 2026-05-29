import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Space Shooter",
  description: "A browser-based space shooter prototype."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
