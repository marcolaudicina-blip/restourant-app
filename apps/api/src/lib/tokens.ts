import { SignJWT, jwtVerify } from "jose";

const ISSUER = "restourant-api";
const ACCESS_TOKEN_TTL = "12h";

export type TokenService = {
  /** `version` is the user's session version: bumping it signs out every older session. */
  sign: (userId: string, version?: number) => Promise<string>;
  verify: (token: string) => Promise<{ userId: string; version: number } | null>;
};

export function createTokenService(secret: string): TokenService {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (userId, version = 0) =>
      new SignJWT({ ver: version })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(ACCESS_TOKEN_TTL)
        .sign(key),
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ["HS256"] });
        const version = typeof payload.ver === "number" ? payload.ver : 0;
        return payload.sub ? { userId: payload.sub, version } : null;
      } catch {
        return null;
      }
    },
  };
}
