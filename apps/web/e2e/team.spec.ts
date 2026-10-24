import { expect, test } from "@playwright/test";
import { nextSaturday, register } from "./helpers";

/* Staff accounts and importing data from another system. */

test("the owner invites a waiter, who joins with the link", async ({ page, browser }, testInfo) => {
  await register(page, "Trattoria Squadra");
  await page.getByRole("button", { name: /Trattoria/ }).click();
  await page.getByRole("button", { name: "Usa questo modello" }).click();
  await expect(page.getByRole("heading", { name: "Configurazione" })).toBeVisible();

  await page.getByRole("link", { name: "Personale" }).click();
  const email = `luca-${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Invita" }).click();
  const link = (await page.getByTestId("shared-link").textContent())!;
  await page.screenshot({ path: testInfo.outputPath("12-invito.png"), fullPage: true });
  await page.getByRole("button", { name: "Fatto" }).click();
  await expect(page.getByText("Inviti in attesa")).toBeVisible();

  // The waiter opens the link on their own phone.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const waiter = await phone.newPage();
  await waiter.goto(link);
  await expect(waiter.getByRole("heading", { name: "Unisciti a Trattoria Squadra" })).toBeVisible();
  await waiter.getByLabel("Il tuo nome").fill("Luca Cameriere");
  await waiter.getByLabel("Scegli una password").fill("password-di-luca");
  await waiter.getByRole("button", { name: "Accetta l'invito" }).click();
  await expect(waiter).toHaveURL(/\/prenotazioni/);
  await expect(waiter.getByRole("heading", { name: "Prenotazioni" })).toBeVisible();
  // Staff see the configuration but not the team.
  await waiter.goto("/configurazione");
  await expect(waiter.getByRole("link", { name: "Personale" })).toHaveCount(0);

  // Forgotten password: the owner hands over a one-time link.
  await page.reload();
  await expect(page.getByText("Luca Cameriere")).toBeVisible();
  await page.getByRole("button", { name: "Link password" }).click();
  const resetLink = (await page.getByTestId("shared-link").textContent())!;
  await waiter.goto(resetLink);
  await waiter.getByLabel("Nuova password").fill("nuova-password-luca");
  await waiter.getByLabel("Ripeti la password").fill("nuova-password-luca");
  await waiter.getByRole("button", { name: "Salva e accedi" }).click();
  await expect(waiter.getByRole("heading", { name: "Prenotazioni" })).toBeVisible();
  await phone.close();
});

test("imports guests and bookings from another system's CSV", async ({ page }, testInfo) => {
  await register(page, "Trattoria Import");
  await page.getByRole("button", { name: /Trattoria/ }).click();
  await page.getByRole("button", { name: "Usa questo modello" }).click();
  await expect(page.getByRole("heading", { name: "Configurazione" })).toBeVisible();
  await page.getByRole("link", { name: "Importa" }).click();

  const guests =
    "Nome;Cognome;Cellulare;E-mail;Tag;Note\nAnna;Neri;333 444 5555;anna@example.com;VIP;Celiaca\nBruno;Gialli;347 111 2222;;;\n;;333 999 0000;;;";
  await page
    .getByLabel("File CSV")
    .setInputFiles({ name: "clienti.csv", mimeType: "text/csv", buffer: Buffer.from(guests) });
  await expect(page.getByLabel("Colonna per Telefono")).toHaveValue("2");
  await expect(page.getByText("Riga 4: Nome mancante")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("13-importa.png"), fullPage: true });
  await page.getByRole("button", { name: "Importa 2 clienti" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Importazione completata" })).toContainText(
    "2 aggiunti",
  );

  const [y, m, d] = nextSaturday().split("-");
  const bookings = `Data,Ora,Coperti,Cliente,Telefono,Tavolo\n${d}/${m}/${y},20:30,4,Anna Neri,333 444 5555,T7`;
  await page.getByRole("button", { name: "Prenotazioni future" }).click();
  await page
    .getByLabel("File CSV")
    .setInputFiles({ name: "prenotazioni.csv", mimeType: "text/csv", buffer: Buffer.from(bookings) });
  await page.getByRole("button", { name: "Importa 1 prenotazioni" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Importazione completata" })).toContainText(
    "1 aggiunti",
  );

  await page.goto(`/prenotazioni?data=${nextSaturday()}`);
  const anna = page.getByRole("listitem").filter({ hasText: "Anna Neri" });
  await expect(anna).toContainText("Tavolo T7");
  await expect(anna).toContainText("VIP");
});
