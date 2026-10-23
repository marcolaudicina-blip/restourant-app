import type { Database } from "@restourant/db";
import type { Permission, Role } from "@restourant/shared";
import type { PasswordHasher } from "./lib/passwords.js";
import type { TokenService } from "./lib/tokens.js";

export type AppDeps = {
  db: Database;
  tokens: TokenService;
  passwords: PasswordHasher;
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
