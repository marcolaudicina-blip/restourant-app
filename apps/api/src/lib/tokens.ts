import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "restourant-api";
const ACCESS_TOKEN_TTL = "12h";

export type TokenService = {
  /** `version` is the user's session version: bumping it signs out every older session. */
  sign: (userId: string, version?: number) => Promise<string>;
  verify: (token: string) => Promise<{ userId: string; version: number } | null>;
  /**
   * The key in a guest's "manage your booking" link: the reservation id and a signature, so the link
   * needs nothing stored and cannot be guessed. It stays valid; the booking's own rules decide what
   * the guest may still do.
   */
  signBooking: (reservationId: string) => string;
  /** The reservation id, or null when the link was altered. */
  verifyBooking: (token: string) => string | null;
  /** Same, for the "how was it?" link the day after (it can't be used to manage the booking). */
  signReview: (reservationId: string) => string;
  verifyReview: (token: string) => string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createTokenService(secret: string): TokenService {
  const key = new TextEncoder().encode(secret);
  const signature = (purpose: "booking" | "review", id: string) =>
    createHmac("sha256", secret).update(`${purpose}:${id}`).digest("base64url").slice(0, 22);
  const verify = (purpose: "booking" | "review", token: string) => {
    const [id = "", given = ""] = token.split(".");
    if (!UUID.test(id)) return null;
    const expected = Buffer.from(signature(purpose, id));
    const actual = Buffer.from(given);
    return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
  };
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
    signBooking: (id) => `${id}.${signature("booking", id)}`,
    verifyBooking: (token) => verify("booking", token),
    signReview: (id) => `${id}.${signature("review", id)}`,
    verifyReview: (token) => verify("review", token),
  };
}
