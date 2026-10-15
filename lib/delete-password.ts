import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

// Server-only. Hashing for the org's athlete-delete password
// (org_secrets, 0114). Stored as "scrypt$<salt hex>$<hash hex>".
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const MIN_DELETE_PASSWORD_LENGTH = 4;

export async function hashDeletePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyDeletePassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !password) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
