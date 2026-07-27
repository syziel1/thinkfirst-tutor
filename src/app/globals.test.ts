import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function composite(
  foreground: Rgb,
  opacity: number,
  background: Rgb,
): Rgb {
  return foreground.map((channel, index) =>
    Math.round(channel * opacity + background[index] * (1 - opacity)),
  ) as Rgb;
}

function relativeLuminance(color: Rgb) {
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: Rgb, background: Rgb) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );

  return (lighter + 0.05) / (darker + 0.05);
}

describe("light theme color overrides", () => {
  it("maps lime success text to an AA-contrast foreground", () => {
    const stylesheet = readFileSync(
      new URL("./globals.css", import.meta.url),
      "utf8",
    );

    expect(stylesheet).toMatch(
      /html\[data-theme="light"\] \.tf-app-shell \.text-lime-100,\s*html\[data-theme="light"\] \.tf-app-shell \.text-lime-200 \{\s*color: #3f6212;\s*\}/,
    );

    const lightSuccessSurface = composite(
      hexToRgb("#bef264"),
      0.07,
      hexToRgb("#ffffff"),
    );
    expect(
      contrastRatio(hexToRgb("#3f6212"), lightSuccessSurface),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
