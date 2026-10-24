/** Languages of the pages guests see (booking page, widget, their own booking). */
export type GuestLocale = "it" | "en";
export const GUEST_LOCALES: readonly GuestLocale[] = ["it", "en"];

/**
 * The language for a guest: `?lang=` first, then a fallback (e.g. the booking's language), then the
 * browser's preferred language: Italian for Italian browsers, English for everyone else.
 */
export function pickGuestLocale(
  lang: string | undefined,
  acceptLanguage: string | null,
  fallback?: GuestLocale,
): GuestLocale {
  if (lang === "it" || lang === "en") return lang;
  if (fallback) return fallback;
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  return first === "" || first === "*" || first.startsWith("it") ? "it" : "en";
}
