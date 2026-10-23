import { memberships, users, type DatabaseHandle } from "@restourant/db";
import { createTestDatabase } from "@restourant/db/testing";
import type { Role } from "@restourant/shared";
import { buildApp, type App } from "../src/app.js";
import { createPasswordHasher } from "../src/lib/passwords.js";
import { createTokenService } from "../src/lib/tokens.js";

export type TestContext = { app: App; database: DatabaseHandle; close: () => Promise<void> };

export async function createTestApp(): Promise<TestContext> {
  const database = await createTestDatabase();
  const app = await buildApp({
    deps: {
      db: database.db,
      tokens: createTokenService("test-secret-test-secret-test-secret-42"),
      // Low cost keeps the suite fast; production uses the OWASP default.
      passwords: createPasswordHasher(2 ** 10),
    },
    rateLimit: false,
  });
  return {
    app,
    database,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export type Client = ReturnType<typeof client>;

/** Thin wrapper over `app.inject` that returns parsed JSON. */
export function client(app: App, token?: string) {
  const call = async (
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    payload?: unknown,
  ) => {
    const response = await app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests assert on loosely typed JSON
    const body: any = response.body ? response.json() : undefined;
    return { status: response.statusCode, body };
  };
  return {
    get: (url: string) => call("GET", url),
    post: (url: string, payload?: unknown) => call("POST", url, payload),
    patch: (url: string, payload?: unknown) => call("PATCH", url, payload),
    put: (url: string, payload?: unknown) => call("PUT", url, payload),
    delete: (url: string) => call("DELETE", url),
  };
}

let counter = 0;

/** Registers a new owner with their own restaurant. */
export async function registerOwner(app: App, restaurantName = "Trattoria Test") {
  counter += 1;
  const email = `owner${counter}-${Date.now()}@example.com`;
  const res = await client(app).post("/v1/auth/register", {
    email,
    password: "correct-horse-battery",
    fullName: `Owner ${counter}`,
    restaurantName,
  });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const { token, restaurantId, user } = res.body.data as {
    token: string;
    restaurantId: string;
    user: { id: string };
  };
  return {
    token,
    restaurantId,
    userId: user.id,
    email,
    api: client(app, token),
    base: `/v1/restaurants/${restaurantId}`,
  };
}

/** Adds a user with the given role to an existing restaurant and returns an authenticated client. */
export async function addMember(ctx: TestContext, restaurantId: string, role: Role) {
  counter += 1;
  const [user] = await ctx.database.db
    .insert(users)
    .values({ email: `${role}${counter}@example.com`, passwordHash: "x", fullName: `${role} ${counter}` })
    .returning();
  await ctx.database.db.insert(memberships).values({ userId: user!.id, restaurantId, role });
  const token = await ctx.app.deps.tokens.sign(user!.id);
  return client(ctx.app, token);
}
