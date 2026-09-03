import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function deriveKey(password: string, salt: Buffer, length: number, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, KEY_LENGTH, COST, BLOCK_SIZE, PARALLELIZATION);

  return ["scrypt", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = storedHash.split("$");
  if (algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !saltValue || !hashValue) return false;

  try {
    const expected = Buffer.from(hashValue, "base64url");
    const actual = await deriveKey(password, Buffer.from(saltValue, "base64url"), expected.length, Number(cost), Number(blockSize), Number(parallelization));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
