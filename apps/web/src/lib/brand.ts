import { brandPalette } from "@restourant/shared";
import type { CSSProperties } from "react";

/** CSS variables for a subtree: `bg-[var(--brand)]`, `text-[var(--brand-strong)]`... */
export function brandStyle(hex: string): CSSProperties {
  const p = brandPalette(hex);
  return {
    "--brand": p.brand,
    "--brand-contrast": p.contrast,
    "--brand-soft": p.soft,
    "--brand-strong": p.strong,
  } as CSSProperties;
}

/** Ready-made colors offered in the settings, besides any custom one. */
export const BRAND_PRESETS = [
  { name: "Salvia", color: "#1f7466" },
  { name: "Bosco", color: "#2f5d3a" },
  { name: "Mare", color: "#1d4e89" },
  { name: "Notte", color: "#22263a" },
  { name: "Bordeaux", color: "#7a1f2b" },
  { name: "Terracotta", color: "#b5532f" },
  { name: "Senape", color: "#c9962b" },
  { name: "Nero", color: "#1d1b18" },
] as const;
