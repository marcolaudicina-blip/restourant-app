/*
 * A restaurant can pick any brand color, light or dark. Pages and emails derive what they need from
 * it so that text stays readable: the color itself for buttons, a text color that contrasts with it,
 * a soft tint for backgrounds and a darker shade for links on white.
 */

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const mixed = channels(hex).map((c, i) => Math.round(c + (target[i]! - c) * amount));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export type BrandPalette = { brand: string; contrast: string; soft: string; strong: string };

export function brandPalette(hex: string): BrandPalette {
  const light = luminance(hex) > 0.45;
  return {
    brand: hex,
    contrast: light ? "#1d1b18" : "#ffffff",
    soft: mix(hex, [255, 255, 255], 0.9),
    strong: light ? mix(hex, [0, 0, 0], 0.55) : luminance(hex) > 0.25 ? mix(hex, [0, 0, 0], 0.25) : hex,
  };
}
