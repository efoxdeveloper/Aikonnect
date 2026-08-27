import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_COST}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, cost, salt, expectedKey] = encodedHash.split("$");
  if (algorithm !== "scrypt" || Number(cost) !== SCRYPT_COST || !salt || !expectedKey) {
    return false;
  }

  const actual = await deriveKey(password, salt);
  const expected = Buffer.from(expectedKey, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
