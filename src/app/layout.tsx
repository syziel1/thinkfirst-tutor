import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ThinkFirst Tutor — Productive struggle before answers",
  description:
    "An AI math tutor that diagnoses misconceptions, provides graduated hints, and verifies independent transfer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
