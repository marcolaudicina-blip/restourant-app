import { createHash, randomBytes } from "node:crypto";

/*
 * Tokens for invitation and password links. The link carries the token; the database keeps only its
 * SHA-256, so a leaked database can't be used to accept invitations or take over accounts.
 */

export function newOneTimeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashOneTimeToken(token) };
}

export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
