import { crypto } from 'crypto';

export function generateDeterministicRandomNumber(seed: string): number {
  // Use a cryptographically secure pseudo-random number generator (CSPRNG)
  const hash = crypto.createHash('sha256');
  hash.update(seed);
  const randomBytes = hash.digest();
  const randomNumber = randomBytes.readUInt32LE(0) / 0xffffffff;
  return randomNumber;
}