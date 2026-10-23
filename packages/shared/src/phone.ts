/**
 * Phone numbers as typed by staff ("333 123 4567", "+39 333-1234567", "0039 3331234567") reduced to
 * one canonical form, so the same guest is recognized however the number was written.
 * Numbers without an international prefix are assumed to be Italian.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountryCode = "39"): string | null {
  if (!raw) return null;
  let value = raw.trim().replace(/[\s().\-/]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (!/^\+?\d+$/.test(value)) return null;
  if (!value.startsWith("+")) value = `+${defaultCountryCode}${value}`;
  const digits = value.length - 1;
  return digits >= 8 && digits <= 15 ? value : null;
}
