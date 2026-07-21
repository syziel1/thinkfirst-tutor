import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

const themeBootstrap = `
(() => {
  try {
    const stored = localStorage.getItem("thinkfirst-theme");
    const preference = ["light", "dark", "system"].includes(stored)
      ? stored
      : "light";
    const theme = preference === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.themePreference = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();`;

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
    <html
      lang="en"
      data-theme="light"
      data-theme-preference="light"
      suppressHydrationWarning
    >
      <head>
        <script
          id="theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
