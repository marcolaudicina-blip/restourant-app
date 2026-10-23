import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

/** OWASP-recommended scrypt cost (N=2^17, r=8, p=1). Tests use a lower cost to stay fast. */
export const DEFAULT_SCRYPT_COST = 2 ** 17;

export type PasswordHasher = {
  hash: (password: string) => Promise<string>;
  verify: (password: string, stored: string) => Promise<boolean>;
  /** Verify against this when the account does not exist, so timing doesn't reveal it. */
  dummyHash: string;
};

/** Hash format: scrypt$N$r$p$salt$hash (base64). Parameters are stored so they can be raised later. */
export function createPasswordHasher(cost = DEFAULT_SCRYPT_COST): PasswordHasher {
  const params = { N: cost, r: 8, p: 1, maxmem: MAX_MEMORY };

  return {
    hash: async (password) => {
      const salt = randomBytes(16);
      const key = await scrypt(password, salt, KEY_LENGTH, params);
      return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), key.toString("base64")].join(
        "$",
      );
    },
    verify: async (password, stored) => {
      const [algo, n, r, p, salt, hash] = stored.split("$");
      if (algo !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
      const expected = Buffer.from(hash, "base64");
      const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: MAX_MEMORY,
      });
      return timingSafeEqual(key, expected);
    },
    dummyHash: [
      "scrypt",
      params.N,
      params.r,
      params.p,
      Buffer.alloc(16).toString("base64"),
      Buffer.alloc(KEY_LENGTH).toString("base64"),
    ].join("$"),
  };
}
