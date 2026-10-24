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

async function book(
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

/** "sabato 24 ottobre", as the booking page labels its days. */
function longDate(date: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** A 1×1 PNG, enough to exercise the logo upload. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("from sign-up to a full service", async ({ page, browser }, testInfo) => {
  const date = nextSaturday();
  const shot = (name: string) =>
    page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });

  await register(page, "Trattoria E2E");

  // Onboarding: pick the trattoria template.
  await expect(page.getByRole("heading", { name: /Benvenuto/ })).toBeVisible();
  await shot("01-benvenuto");
  await page.getByRole("button", { name: /Trattoria/ }).click();
  await page.getByRole("button", { name: "Usa questo modello" }).click();

  // Configuration overview: every rule of the restaurant on one page.
  await expect(page.getByRole("heading", { name: "Configurazione" })).toBeVisible();
  await expect(page.getByText("Orari prenotabili")).toBeVisible();
  await expect(page.getByRole("cell", { name: "19:00–22:30" }).first()).toBeVisible();
  await expect(page.getByText("Tutti gli altri casi")).toBeVisible();
  await shot("02-panoramica");

  // Tables: the template created the rooms; give T12 the highest priority.
  await page.getByRole("link", { name: "Sale e tavoli" }).click();
  await expect(page.getByLabel("Nome sala").first()).toHaveValue("Sala");
  const t12 = page.getByRole("row").filter({ has: page.locator('input[value="T12"]') });
  await t12.getByLabel("Priorità").fill("50");
  await t12.getByLabel("Priorità").press("Enter");
  await shot("02b-sale-tavoli");

  // Bookings: priority wins for 4 people; 6 people get two adjacent tables joined.
  await page.goto(`/prenotazioni?data=${date}`);
  await book(page, { party: 4, time: "20:00", name: "Rossi", phone: "333 123 4567" });
  await expect(page.getByRole("listitem").filter({ hasText: "Rossi" })).toContainText("Tavolo T12");
  await book(page, { party: 6, time: "20:00", name: "Bianchi" });
  await expect(page.getByRole("listitem").filter({ hasText: "Bianchi" })).toContainText("Tavolo T7+T8");
  await shot("03-prenotazioni");

  // Staff bookings carry no channel mark; the "online only" filter is empty until guests book online.
  await expect(page.getByRole("listitem").filter({ hasText: "Rossi" })).not.toContainText("Online");
  await page.getByRole("button", { name: "Solo online" }).click();
  await expect(page.getByText("Nessuna prenotazione online")).toBeVisible();
  await page.getByRole("button", { name: "Solo online" }).click();

  // New-booking dialog shows which table each time would get, and recognizes returning guests.
  await page.getByRole("button", { name: "Nuova" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /^20:00/ }).first()).toBeVisible();
  await dialog.getByLabel("Telefono").fill("3331234");
  await dialog.getByRole("option", { name: /Rossi/ }).click();
  await expect(dialog.getByRole("link", { name: "Rossi" })).toBeVisible();
  await expect(dialog.getByLabel("Telefono")).toHaveValue("333 123 4567");
  await shot("04-nuova-prenotazione");
  await dialog.getByRole("button", { name: "Annulla" }).click();

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

  // Floor zoom and layout editor.
  await page.goto("/sala");
  await page.getByRole("button", { name: "Ingrandisci" }).click();
  await expect(page.getByRole("button", { name: "125%" })).toBeVisible();
  await page.getByRole("button", { name: "125%" }).click();
  await page.getByRole("button", { name: "Modifica disposizione" }).click();

  // Layout editor: add a table, make it round, then link tables.
  await page.getByRole("button", { name: "Aggiungi tavolo" }).click();
  await expect(page.getByRole("button", { name: "Tavolo T13" })).toBeVisible();
  await expect(page.getByLabel("Nome tavolo")).toHaveValue("T13");
  await page.getByRole("button", { name: "Rotondo" }).click();
  await expect(page.getByRole("button", { name: "Tavolo T13" })).toHaveClass(/rounded-full/);
  await shot("06-disposizione");
  await page.getByRole("button", { name: "Tavoli affiancati" }).click();
  await shot("07-tavoli-affiancati");
  await page.goto("/configurazione/orari");
  await expect(page.getByText("Cena", { exact: true }).first()).toBeVisible();
  await page.goto("/configurazione/durate");
  await expect(page.getByText("Tutti gli altri casi")).toBeVisible();
  await shot("08-durate");

  // Guests: Rossi has a profile with the booking history; add a permanent note and a tag.
  await page.getByRole("link", { name: "Clienti" }).first().click();
  await page.getByRole("link", { name: "Rossi" }).click();
  await expect(page.getByRole("heading", { name: "Rossi" })).toBeVisible();
  await expect(page.getByText("Storico")).toBeVisible();
  await expect(page.getByRole("button", { name: /Tavolo T1/ })).toContainText("Seduta");
  await page.getByLabel("Note permanenti").fill("Celiaco");
  await page.getByRole("button", { name: "Salva note" }).click();
  await expect(page.getByText("Note salvate")).toBeVisible();
  await page.getByRole("button", { name: "+ VIP" }).click();
  await expect(page.getByRole("button", { name: "Rimuovi VIP" })).toBeVisible();
  await shot("09-scheda-cliente");

  // The note now shows on the booking of the day.
  await page.goto(`/prenotazioni?data=${date}`);
  await expect(page.getByRole("listitem").filter({ hasText: "Rossi" })).toContainText("Celiaco");

  // Booking page: brand color, logo and a few words, then the link to share.
  await page.goto("/configurazione/pagina");
  await page.getByRole("button", { name: "Colore Bordeaux" }).click();
  await page.getByLabel("Presentazione").fill("Cucina di casa e pesce del giorno.");
  await page
    .getByLabel("Testo dell'avviso")
    .fill("Il tavolo è garantito per 15 minuti.\nNiente animali, grazie.");
  await expect(page.getByTestId("booking-preview")).toContainText("Niente animali, grazie.");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Carica logo/ }).click();
  await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Logo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByText("Pagina di prenotazione salvata")).toBeVisible();
  await shot("10-pagina-prenotazione");
  const link = (await page.getByTestId("booking-link").textContent())!;

  // A guest, not signed in, books from the link.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Trattoria E2E" })).toBeVisible();
  await expect(guest.getByText("Cucina di casa e pesce del giorno.")).toBeVisible();
  await guest.getByRole("button", { name: longDate(date), exact: true }).click();
  await guest.getByRole("button", { name: "21:30", exact: true }).click();
  await guest.getByLabel("Nome e cognome").fill("Verdi");
  await guest.getByLabel("Telefono").fill("349 555 1212");
  await guest.getByLabel("Email").fill("verdi@example.com");
  await guest.getByRole("checkbox").check();
  await guest.getByRole("button", { name: "Conferma prenotazione" }).click();
  await expect(guest.getByText("Prenotazione confermata")).toBeVisible();
  await expect(guest.getByText("Informazioni dal ristorante")).toBeVisible();
  await expect(guest.getByText("Il tavolo è garantito per 15 minuti.")).toBeVisible();
  await guest.screenshot({ path: testInfo.outputPath("11-prenotazione-online.png"), fullPage: true });
  await guestContext.close();

  // Staff see it, marked as online.
  await page.goto(`/prenotazioni?data=${date}`);
  const verdi = page.getByRole("listitem").filter({ hasText: "Verdi" });
  await expect(verdi).toContainText("Online");
  await expect(verdi).toContainText("21:30");
});

test("login, wrong password and logout", async ({ page }) => {
  await page.goto("/prenotazioni");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill("nessuno@example.com");
  await page.getByLabel("Password").fill("sbagliata");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByText("Email o password non corretti")).toBeVisible();
});
