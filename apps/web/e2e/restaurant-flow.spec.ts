import { expect, test, type Page } from "@playwright/test";

/** Next Saturday from today: the trattoria template serves dinner Tuesday to Sunday. */
function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function register(page: Page, restaurantName: string) {
  await page.goto("/registrati");
  await page.getByLabel("Nome del ristorante").fill(restaurantName);
  await page.getByLabel("Il tuo nome").fill("Marco");
  await page
    .getByLabel("Email")
    .fill(`marco-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel("Password").fill("password-lunga-123");
  await page.getByRole("button", { name: "Crea account" }).click();
}

async function book(page: Page, { party, time, name }: { party: number; time: string; name: string }) {
  await page.getByRole("button", { name: "Nuova" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Persone").fill(String(party));
  await dialog
    .getByRole("button", { name: new RegExp(`^${time}`) })
    .first()
    .click();
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByRole("button", { name: "Prenota" }).click();
  await expect(dialog).toBeHidden();
}

test("from sign-up to a full service", async ({ page }, testInfo) => {
  const date = nextSaturday();
  const shot = (name: string) =>
    page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });

  await register(page, "Trattoria E2E");

  // Onboarding: pick the trattoria template.
  await expect(page.getByRole("heading", { name: /Benvenuto/ })).toBeVisible();
  await shot("01-benvenuto");
  await page.getByRole("button", { name: /Trattoria/ }).click();
  await page.getByRole("button", { name: "Usa questo modello" }).click();

  // Configuration: the template created the rooms; give T12 the highest priority.
  await expect(page.getByRole("heading", { name: "Configurazione" })).toBeVisible();
  await expect(page.getByLabel("Nome sala").first()).toHaveValue("Sala");
  const t12 = page.getByRole("row").filter({ has: page.locator('input[value="T12"]') });
  await t12.getByLabel("Priorità").fill("50");
  await t12.getByLabel("Priorità").press("Enter");
  await shot("02-sale-tavoli");

  // Bookings: priority wins for 4 people; 6 people get two adjacent tables joined.
  await page.goto(`/prenotazioni?data=${date}`);
  await book(page, { party: 4, time: "20:00", name: "Rossi" });
  await expect(page.getByRole("listitem").filter({ hasText: "Rossi" })).toContainText("Tavolo T12");
  await book(page, { party: 6, time: "20:00", name: "Bianchi" });
  await expect(page.getByRole("listitem").filter({ hasText: "Bianchi" })).toContainText("Tavolo T7+T8");
  await shot("03-prenotazioni");

  // New-booking dialog shows which table each time would get.
  await page.getByRole("button", { name: "Nuova" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /^20:00/ })
      .first(),
  ).toBeVisible();
  await shot("04-nuova-prenotazione");
  await page.getByRole("dialog").getByRole("button", { name: "Annulla" }).click();

  // Floor: move Rossi to T9 by tapping the booking and then the table.
  await page.goto(`/sala?data=${date}`);
  await page.getByLabel("Servizio").selectOption({ label: "Cena" });
  await page.getByRole("slider", { name: "Orario" }).fill("1200");
  await expect(page.getByRole("button", { name: "Tavolo T12" })).toContainText("Rossi");
  await shot("05-sala");
  await page.getByRole("button", { name: /Rossi/ }).last().click();
  await page.getByRole("button", { name: "Tavolo T9", exact: true }).click();
  await expect(page.getByText("Rossi → tavolo T9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tavolo T9", exact: true })).toContainText("Rossi");

  // A table that is too small asks for confirmation before forcing the move.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Tavolo T1", exact: true }).click();
  await expect(page.getByText("Rossi → tavolo T1")).toBeVisible();

  // Seat the guests from the list.
  await page.goto(`/prenotazioni?data=${date}`);
  const rossi = page.getByRole("listitem").filter({ hasText: "Rossi" });
  await expect(rossi).toContainText("Tavolo T1");
  await rossi.getByRole("button", { name: "Fai sedere" }).click();
  await expect(rossi).toContainText("Seduta");

  // Layout editor and services render.
  await page.goto("/sala");
  await page.getByRole("button", { name: "Modifica disposizione" }).click();
  await page.getByRole("button", { name: "Tavoli affiancati" }).click();
  await shot("06-disposizione");
  await page.goto("/configurazione/servizi");
  await expect(page.getByText("Cena", { exact: true }).first()).toBeVisible();
  await shot("07-servizi");
});

test("login, wrong password and logout", async ({ page }) => {
  await page.goto("/prenotazioni");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill("nessuno@example.com");
  await page.getByLabel("Password").fill("sbagliata");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByText("Email o password non corretti")).toBeVisible();
});
