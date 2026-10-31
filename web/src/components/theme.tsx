"use client";

import { SunMoon } from "lucide-react";
import { THEME_KEY } from "@/lib/theme";

export function flipTheme() {
  const el = document.documentElement;
  const next = el.dataset.theme === "light" ? "dark" : "light";
  el.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // sem armazenamento: o tema vale só para esta página
  }
}

export function ThemeButton({ className = "icon-btn desktop-only" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={flipTheme} aria-label="Mudar entre tema claro e escuro" title="Tema claro/escuro">
      <SunMoon className="ico" aria-hidden />
    </button>
  );
}
