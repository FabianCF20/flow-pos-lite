import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
const KEY = "erp-theme";

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as ThemeMode | null;
    const initial: ThemeMode = stored === "dark" || stored === "light" ? stored : "light";
    setTheme(initial);
    apply(initial);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next);
      apply(next);
      return next;
    });
  }

  return { theme, toggle };
}
