import type { Database } from "@restourant/db";
import type { Permission, Role } from "@restourant/shared";
import type { Mailer } from "./lib/mailer.js";
import type { PasswordHasher } from "./lib/passwords.js";
import type { TokenService } from "./lib/tokens.js";

export type AppDeps = {
  db: Database;
  tokens: TokenService;
  passwords: PasswordHasher;
  /** Injected so tests can freeze time. */
  now: () => Date;
  mailer: Mailer;
  /** Public address of the web app, for links and pictures in emails; null when unknown. */
  publicUrl: string | null;
  /** Shared with the scheduler that runs internal jobs (reminders); null disables them. */
  cronSecret: string | null;
};

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDeps;
  }

  interface FastifyRequest {
    auth: { userId: string } | null;
    membership: { restaurantId: string; role: Role } | null;
  }

  interface FastifyContextConfig {
    /** Required permission inside a restaurant scope. Defaults to config.read for GET, config.write otherwise. */
    permission?: Permission;
  }
}
