import { expect, test } from "@playwright/test";
import { register } from "./helpers";

/* Platform admin, legal pages and signing in. */

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
