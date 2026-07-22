// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  THEME_STORAGE_KEY,
  ThemeControl,
  isThemePreference,
  resolvedTheme,
} from "./theme-control";

function colorSchemeMedia(initialMatches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  const media = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(
      (_type: string, nextListener: (event: MediaQueryListEvent) => void) => {
        listener = nextListener;
      },
    ),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  return {
    media,
    change(matches: boolean) {
      media.matches = matches;
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.dataset.themePreference = "light";
  document.documentElement.style.colorScheme = "";
  vi.unstubAllGlobals();
});

describe("ThemeControl", () => {
  it("uses System by default and persists an explicit choice", async () => {
    const { media } = colorSchemeMedia(false);
    vi.stubGlobal("matchMedia", vi.fn(() => media));

    render(<ThemeControl />);
    const control = screen.getByRole("combobox", { name: "Appearance" });

    await waitFor(() => expect(control).toHaveProperty("value", "system"));
    expect(screen.getByText("Appearance").classList.contains("sr-only")).toBe(
      false,
    );
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.change(control, { target: { value: "dark" } });

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("restores a stored choice and ignores invalid values", async () => {
    const { media } = colorSchemeMedia(false);
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    const { unmount } = render(<ThemeControl />);
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLSelectElement>("combobox", { name: "Appearance" })
          .value,
      ).toBe("dark"),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");

    unmount();
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    render(<ThemeControl />);
    await waitFor(() =>
      expect(document.documentElement.dataset.themePreference).toBe("system"),
    );
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("follows system changes only while System is selected", async () => {
    const scheme = colorSchemeMedia(false);
    vi.stubGlobal("matchMedia", vi.fn(() => scheme.media));

    render(<ThemeControl />);
    const control = screen.getByRole("combobox", { name: "Appearance" });
    await waitFor(() => expect(control).toHaveProperty("value", "system"));
    expect(document.documentElement.dataset.theme).toBe("light");

    scheme.change(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.change(control, { target: { value: "light" } });
    scheme.change(false);
    scheme.change(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("theme validation", () => {
  it("validates preferences and resolves System", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
    expect(resolvedTheme("system", true)).toBe("dark");
    expect(resolvedTheme("system", false)).toBe("light");
  });
});
