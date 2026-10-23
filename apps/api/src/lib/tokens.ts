import { SignJWT, jwtVerify } from "jose";

const ISSUER = "restourant-api";
const ACCESS_TOKEN_TTL = "12h";

export type TokenService = {
  sign: (userId: string) => Promise<string>;
  verify: (token: string) => Promise<{ userId: string } | null>;
};

export function createTokenService(secret: string): TokenService {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(ACCESS_TOKEN_TTL)
        .sign(key),
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ["HS256"] });
        return payload.sub ? { userId: payload.sub } : null;
      } catch {
        return null;
      }
    },
  };
}
