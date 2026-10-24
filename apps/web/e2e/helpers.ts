import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/* Helpers shared by the end-to-end tests. */

/** Same as playwright.config.ts: signs the guest's link like the API does (TokenService.signBooking). */
const JWT_SECRET = "e2e-secret-e2e-secret-e2e-secret-e2e";
const signed = (purpose: "booking" | "review") => (id: string) =>
  `${id}.${createHmac("sha256", JWT_SECRET).update(`${purpose}:${id}`).digest("base64url").slice(0, 22)}`;
export const bookingToken = signed("booking");
/** The link behind the stars of the "how was it?" email. */
export const reviewToken = signed("review");

/** Next Saturday from today: the trattoria template serves dinner Tuesday to Sunday. */
export function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function register(page: Page, restaurantName: string) {
  // A client address of its own: sign-ups are rate limited per address, and tests run in parallel.
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.30.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  });
  await page.goto("/registrati");
  await page.getByLabel("Nome del ristorante").fill(restaurantName);
  await page.getByLabel("Il tuo nome").fill("Marco");
  await page
    .getByLabel("Email")
    .fill(`marco-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel("Password").fill("password-lunga-123");
  await page.getByRole("checkbox", { name: /Accetto i Termini di servizio/ }).check();
  await page.getByRole("button", { name: "Crea account" }).click();
}

export async function book(
  page: Page,
  { party, time, name, phone }: { party: number; time: string; name: string; phone?: string },
) {
  await page.getByRole("button", { name: "Nuova" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Persone").fill(String(party));
  await dialog
    .getByRole("button", { name: new RegExp(`^${time}`) })
    .first()
    .click();
  await dialog.getByLabel("Nome").fill(name);
  if (phone) await dialog.getByLabel("Telefono").fill(phone);
  await dialog.getByRole("button", { name: "Prenota" }).click();
  await expect(dialog).toBeHidden();
}

/** Last Saturday before today: a dinner that already happened. */
export function lastSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "sabato 24 ottobre", as the booking page labels its days. */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** A 1×1 PNG, enough to exercise the logo upload. */
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
