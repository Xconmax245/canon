import type { Metadata } from "next";
import { AosInit } from "@/components/AosInit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canon — Story to Image",
  description:
    "Paste your script and receive a coherent visual storyboard in seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-dvh antialiased">
        <AosInit />
        {children}
      </body>
    </html>
  );
}
