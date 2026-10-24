import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/** Same as playwright.config.ts: signs the guest's link like the API does (TokenService.signBooking). */
const JWT_SECRET = "e2e-secret-e2e-secret-e2e-secret-e2e";
const signed = (purpose: "booking" | "review") => (id: string) =>
  `${id}.${createHmac("sha256", JWT_SECRET).update(`${purpose}:${id}`).digest("base64url").slice(0, 22)}`;
const bookingToken = signed("booking");
/** The link behind the stars of the "how was it?" email. */
const reviewToken = signed("review");

/** Next Saturday from today: the trattoria template serves dinner Tuesday to Sunday. */
function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function register(page: Page, restaurantName: string) {
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

/** Last Saturday before today: a dinner that already happened. */
function lastSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  // The whole journey of a restaurant, step by step: longer than a usual test.
  test.setTimeout(90_000);
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

  // Grid view: drag Bianchi one hour later; an empty slot opens a new booking on that table.
  await page.getByRole("button", { name: "Griglia" }).click();
  const timeline = page.getByTestId("timeline");
  await expect(timeline.getByRole("button", { name: /^Rossi, 4 persone/ })).toBeVisible();
  await shot("03b-griglia");
  // Joined tables: one bar across the two rows, not one per table.
  const bianchi = timeline.getByRole("button", { name: /^Bianchi, 6 persone/ });
  await expect(bianchi).toHaveCount(1);
  await expect(bianchi).toContainText("Tavoli T7+T8");
  const box = (await bianchi.boundingBox())!;
  expect(box.height).toBeGreaterThan(70);
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 12 + 28 * 4, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("Bianchi: 21:00")).toBeVisible();
  const lane = (await timeline.getByLabel("Tavolo T3", { exact: true }).boundingBox())!;
  const visible = (await timeline.boundingBox())!;
  await page.mouse.click(visible.x + visible.width / 2, lane.y + lane.height / 2);
  await expect(page.getByRole("dialog", { name: "Nuova prenotazione" })).toContainText("T3");
  await page.getByRole("dialog").getByRole("button", { name: "Annulla" }).click();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Bianchi" })).toContainText("21:00");

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

  // The service sheet to print: the note is there too.
  await page.getByRole("link", { name: "Stampa il foglio del servizio" }).click();
  const sheet = page.getByRole("row").filter({ hasText: "Rossi" });
  await expect(sheet).toContainText("T1");
  await expect(sheet).toContainText("Celiaco");
  await page.emulateMedia({ media: "print" });
  await shot("09b-foglio-servizio");
  await page.emulateMedia({ media: "screen" });

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
  await expect(page.getByTestId("booking-qr").locator("svg")).toBeVisible();
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

  // The staff device, left open on another screen, announces it within a few seconds.
  const alert = page.getByRole("status").filter({ hasText: "Nuova prenotazione online" });
  await expect(alert).toContainText("Verdi", { timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath("12-avviso.png") });
  await alert.getByRole("link", { name: "Apri la giornata" }).click();

  // Staff see it, marked as online.
  await expect(page).toHaveURL(new RegExp(`data=${date}`));
  const verdi = page.getByRole("listitem").filter({ hasText: "Verdi" });
  await expect(verdi).toContainText("Online");
  await expect(verdi).toContainText("21:30");
});

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

test("the platform admin sees every restaurant and helps one as support", async ({
  page,
  browser,
}, testInfo) => {
  // A customer's restaurant.
  const name = `Osteria Cliente ${Date.now()}`;
  const customer = await browser.newPage();
  await register(customer, name);
  await expect(customer.getByRole("button", { name: /Trattoria/ })).toBeVisible();
  await customer.close();

  // One admin per viewport, listed in PLATFORM_ADMIN_EMAILS (playwright.config.ts): the two runs
  // go in parallel and must not leave each other's support access.
  const account = {
    email: `admin-${testInfo.project.name}@twentyreserve.test`,
    password: "password-lunga-123",
  };
  // Its own client address, so the sign-ups of the other tests don't hit its rate limit.
  const headers = { "x-forwarded-for": `10.20.${testInfo.project.name.length}.${Date.now() % 250}` };
  const signUp = await page.request.post("/api/session", {
    headers,
    data: {
      mode: "register",
      ...account,
      fullName: "Marco Admin",
      restaurantName: "TwentyReserve HQ",
      acceptTerms: true,
    },
  });
  if (!signUp.ok()) {
    const login = await page.request.post("/api/session", { headers, data: { mode: "login", ...account } });
    expect(login.ok()).toBe(true);
  }
  await page.goto("/prenotazioni");
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin TwentyReserve" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Prova: 30 gg");
  await row.getByRole("button", { name: "Dettagli" }).click();
  await page.getByRole("button", { name: "Entra come assistenza" }).click();
  await expect(page.getByText("come assistenza TwentyReserve")).toContainText(name);
  await page.getByRole("button", { name: "Esci dall'assistenza" }).click();
  await expect(page.getByRole("heading", { name: "Admin TwentyReserve" })).toBeVisible();
  await expect(page.getByText("come assistenza TwentyReserve")).toHaveCount(0);
});

test("legal pages and the restaurant's privacy notice are public", async ({ page }) => {
  for (const [path, title] of [
    ["/privacy", "Informativa sulla privacy e sui cookie"],
    ["/termini", "Termini di servizio"],
    ["/trattamento-dati", "Accordo sul trattamento dei dati (art. 28 GDPR)"],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
  await register(page, "Trattoria Riservata");
  await expect(page.getByRole("button", { name: /Trattoria/ })).toBeVisible();
  const me = (await (await page.request.get("/api/v1/auth/me")).json()).data;
  const base = `/api/v1/restaurants/${me.memberships[0].restaurantId}`;
  const { slug } = (await (await page.request.get(`${base}/booking-page`)).json()).data;
  await page.goto(`/prenota/${slug}/privacy?lang=en`);
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
  await expect(page.getByText("Data controller")).toBeVisible();
  await expect(page.getByText(/anonymized 24 months after your last booking/)).toBeVisible();
});

test("login, wrong password and logout", async ({ page }) => {
  await page.goto("/prenotazioni");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill("nessuno@example.com");
  await page.getByLabel("Password").fill("sbagliata");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByText("Email o password non corretti")).toBeVisible();
});
