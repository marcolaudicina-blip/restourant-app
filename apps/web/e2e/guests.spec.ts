import { expect, test } from "@playwright/test";
import { bookingToken, reviewToken, nextSaturday, register, lastSaturday, longDate } from "./helpers";

/* What guests do from the booking page and their emails: change, cancel, waiting list, rating. */

test("a guest moves and cancels their booking from the email link", async ({ page, browser }, testInfo) => {
  await register(page, "Trattoria Ospite");
  await page.getByRole("button", { name: /Trattoria/ }).click();
  await page.getByRole("button", { name: "Usa questo modello" }).click();
  await expect(page.getByRole("heading", { name: "Configurazione" })).toBeVisible();

  // Between 19:00 and 20:00 groups of up to 2 only, online.
  await page.goto("/configurazione/regole");
  await page.getByRole("button", { name: "Aggiungi fascia" }).click();
  await page.getByLabel("Max persone online").fill("2");
  await page.getByRole("button", { name: "Salva regole" }).click();
  await expect(page.getByText("Regole salvate")).toBeVisible();

  // A booking from the public page, as a guest would make it.
  const date = nextSaturday();
  const me = (await (await page.request.get("/api/v1/auth/me")).json()).data;
  const restaurantId = me.memberships[0].restaurantId as string;
  const { slug } = (await (await page.request.get(`/api/v1/restaurants/${restaurantId}/booking-page`)).json())
    .data;
  const created = await page.request.post(`/api/v1/public/restaurants/${slug}/reservations`, {
    data: {
      date,
      time: "20:00",
      partySize: 2,
      guestName: "Lucia Verdi",
      guestPhone: "347 111 2222",
      guestEmail: "lucia@example.com",
      guestNote: null,
      privacyAccepted: true,
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;

  // Staff keep the day open: they will hear about the guest's changes.
  await page.goto(`/prenotazioni?data=${date}`);
  await expect(page.getByRole("listitem").filter({ hasText: "Lucia Verdi" })).toContainText("20:00");

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  // The public page in English, then back to Italian with the switch.
  await guest.goto(`/prenota/${slug}?lang=en`);
  await expect(guest.getByRole("heading", { name: "Book a table" })).toBeVisible();
  await expect(guest.getByText("How many people?")).toBeVisible();
  await guest.screenshot({ path: testInfo.outputPath("13b-pagina-inglese.png"), fullPage: true });
  await guest.getByRole("link", { name: "it", exact: true }).first().click();
  await expect(guest.getByRole("heading", { name: "Prenota un tavolo" })).toBeVisible();

  await guest.goto(`/prenotazione/${bookingToken(id)}`);
  await expect(guest.getByRole("heading", { name: "Ciao Lucia" })).toBeVisible();
  await expect(guest.getByText("Confermata")).toBeVisible();

  await guest.getByRole("button", { name: "Modifica" }).click();
  await guest.getByRole("button", { name: "4", exact: true }).click();
  await guest.getByRole("button", { name: longDate(date), exact: true }).click();
  await expect(guest.getByRole("button", { name: "21:00", exact: true })).toBeVisible();
  await expect(guest.getByRole("button", { name: "19:30", exact: true })).toHaveCount(0);
  await guest.getByRole("button", { name: "21:00", exact: true }).click();
  await guest.getByRole("button", { name: /^Conferma:/ }).click();
  await expect(guest.getByText(/^Prenotazione modificata\./)).toBeVisible();
  await expect(guest.getByText("4 persone")).toBeVisible();
  await guest.screenshot({ path: testInfo.outputPath("14-gestisci-prenotazione.png"), fullPage: true });

  await guest.getByRole("button", { name: "Disdici" }).click();
  await guest.getByRole("button", { name: "Sì, disdici" }).click();
  await expect(guest.getByText(/^Prenotazione cancellata\./)).toBeVisible();
  await expect(guest.getByRole("link", { name: "Prenota di nuovo" })).toBeVisible();
  await guestContext.close();

  const alert = page.getByRole("status").filter({ hasText: "Prenotazione disdetta dal cliente" });
  await expect(alert).toContainText("Lucia Verdi", { timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath("15-avviso-disdetta.png") });
});

test("a guest joins the waiting list of a full day, and staff book them", async ({
  page,
  browser,
}, testInfo) => {
  await register(page, "Trattoria Piena");
  await page.getByRole("button", { name: /Trattoria/ }).click();
  await page.getByRole("button", { name: "Usa questo modello" }).click();
  await expect(page.getByRole("heading", { name: "Configurazione" })).toBeVisible();

  // Online, only one person per table all day: the booking page has no free time for three.
  const me = (await (await page.request.get("/api/v1/auth/me")).json()).data;
  const base = `/api/v1/restaurants/${me.memberships[0].restaurantId}`;
  const rule = { daysOfWeek: [1, 2, 3, 4, 5, 6, 7], from: "00:00", to: "23:59", maxParty: 1 };
  expect(
    (await page.request.patch(`${base}/booking-policy`, { data: { onlinePartyLimits: [rule] } })).ok(),
  ).toBe(true);
  const { slug } = (await (await page.request.get(`${base}/booking-page`)).json()).data;
  const date = nextSaturday();
  await page.goto(`/prenotazioni?data=${date}`);

  // The link in the waiting list emails opens the right day and party size.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/prenota/${slug}?data=${date}&persone=3`);
  await expect(guest.getByRole("button", { name: longDate(date), exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(guest.getByRole("button", { name: "3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await guest.getByRole("button", { name: "Mettiti in lista d'attesa" }).click();
  await guest.getByLabel("Nome e cognome").fill("Anna Neri");
  await guest.getByLabel("Telefono").fill("347 555 6666");
  await guest.getByLabel("Email").fill("anna@example.com");
  // The privacy notice the restaurant gets ready-made.
  await expect(guest.getByRole("link", { name: "informativa sulla privacy" })).toHaveAttribute(
    "href",
    `/prenota/${slug}/privacy?lang=it`,
  );
  await guest.getByRole("checkbox").check();
  await guest.getByRole("button", { name: "Mettimi in lista" }).click();
  await expect(guest.getByRole("heading", { name: "Sei in lista d'attesa" })).toBeVisible();
  await guest.screenshot({ path: testInfo.outputPath("15b-lista-attesa-cliente.png"), fullPage: true });
  await guestContext.close();

  // Staff see the request (alert and panel) and book the guest, who leaves the list.
  await expect(
    page.getByRole("status").filter({ hasText: "Nuova richiesta in lista d'attesa" }),
  ).toContainText("Anna Neri", { timeout: 15_000 });
  const entry = page.getByRole("listitem").filter({ hasText: "Anna Neri" });
  await expect(entry).toContainText("3 pers. · qualsiasi orario");
  await page.screenshot({ path: testInfo.outputPath("15c-lista-attesa-staff.png"), fullPage: true });
  await entry.getByRole("button", { name: "Prenota" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Nome")).toHaveValue("Anna Neri");
  await expect(dialog.getByLabel("Persone")).toHaveValue("3");
  await dialog
    .getByRole("button", { name: /^20:00/ })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Prenota" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Lista d'attesa" })).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Anna Neri" })).toContainText("20:00");
});

test("a guest rates the dinner from the email, and staff read it", async ({ page }, testInfo) => {
  await register(page, "Trattoria Stelle");
  await page.getByRole("button", { name: /Trattoria/ }).click();
  await page.getByRole("button", { name: "Usa questo modello" }).click();
  await expect(page.getByRole("heading", { name: "Configurazione" })).toBeVisible();

  await page.goto("/configurazione/regole");
  await page.getByRole("switch", { name: "Chiedi un giudizio il giorno dopo" }).click();
  await page.getByLabel("Link per le recensioni").fill("https://g.page/r/trattoria-stelle/review");
  await page.getByRole("button", { name: "Salva regole" }).click();
  await expect(page.getByText("Regole salvate")).toBeVisible();

  const me = (await (await page.request.get("/api/v1/auth/me")).json()).data;
  const base = `/api/v1/restaurants/${me.memberships[0].restaurantId}`;
  const created = await page.request.post(`${base}/reservations`, {
    data: { date: lastSaturday(), time: "20:00", partySize: 2, guestName: "Lucia Verdi" },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;

  // Five stars, clicked in the email: saved at once, and an invitation to review publicly.
  const guest = await page.context().browser()!.newPage();
  await guest.goto(`/recensione/${reviewToken(id)}?voto=5`);
  await expect(guest.getByText("Grazie per il tuo giudizio!")).toBeVisible();
  await expect(guest.getByRole("link", { name: "Scrivi una recensione" })).toHaveAttribute(
    "href",
    "https://g.page/r/trattoria-stelle/review",
  );
  await guest.screenshot({ path: testInfo.outputPath("16-recensione-cliente.png"), fullPage: true });

  // Second thoughts: two stars and a private comment.
  await guest.getByRole("button", { name: "2 su 5" }).click();
  await expect(guest.getByText("Ci dispiace")).toBeVisible();
  await expect(guest.getByRole("link", { name: "Scrivi una recensione" })).toHaveCount(0);
  await guest.getByLabel("Cosa possiamo migliorare?").fill("Attesa lunga tra le portate");
  await guest.getByRole("button", { name: "Invia" }).click();
  await expect(guest.getByText("Grazie, il ristorante leggerà il tuo messaggio.")).toBeVisible();
  await guest.close();

  await page.goto("/clienti");
  await page.getByRole("link", { name: "Recensioni" }).click();
  await expect(page.getByRole("heading", { name: "Recensioni" })).toBeVisible();
  await expect(page.getByText("Attesa lunga tra le portate")).toBeVisible();
  await expect(page.getByText("1 giudizio", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("17-recensioni-staff.png"), fullPage: true });
});
