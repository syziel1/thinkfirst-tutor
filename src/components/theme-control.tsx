"use client";

import { useEffect, useRef } from "react";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "thinkfirst-theme";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolvedTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
) {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

function applyTheme(preference: ThemePreference, systemPrefersDark: boolean) {
  const theme = resolvedTheme(preference, systemPrefersDark);
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = theme;
}

export function ThemeControl() {
  const controlRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialPreference = isThemePreference(stored) ? stored : "light";

    if (controlRef.current) controlRef.current.value = initialPreference;
    applyTheme(initialPreference, media?.matches ?? false);

    const handleSystemChange = (event: MediaQueryListEvent) => {
      const current = document.documentElement.dataset.themePreference;
      if (current === "system") applyTheme("system", event.matches);
    };

    media?.addEventListener("change", handleSystemChange);
    return () => media?.removeEventListener("change", handleSystemChange);
  }, []);

  function chooseTheme(nextPreference: ThemePreference) {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    applyTheme(nextPreference, media?.matches ?? false);
  }

  return (
    <label className="tf-theme-control flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-2 text-xs sm:px-3">
      <span aria-hidden="true">◐</span>
      <span className="sr-only sm:not-sr-only">Appearance</span>
      <select
        ref={controlRef}
        aria-label="Appearance"
        defaultValue="light"
        onChange={(event) =>
          chooseTheme(event.target.value as ThemePreference)
        }
        className="cursor-pointer bg-transparent font-semibold outline-none"
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
