import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <span data-speed-insights="enabled" />,
}));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("renders Speed Insights exactly once", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>ThinkFirst Tutor</main>
      </RootLayout>,
    );

    expect(markup.match(/data-speed-insights="enabled"/g)).toHaveLength(1);
  });

  it("defaults to System and embeds the theme bootstrap in the document head", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>ThinkFirst Tutor</main>
      </RootLayout>,
    );

    expect(markup).toContain('data-theme="light"');
    expect(markup).toContain('data-theme-preference="system"');
    expect(markup).toContain('id="theme-bootstrap"');
    expect(markup.indexOf('id="theme-bootstrap"')).toBeLessThan(
      markup.indexOf("<body>"),
    );
    expect(markup).toContain('localStorage.getItem("thinkfirst-theme")');
  });
});
