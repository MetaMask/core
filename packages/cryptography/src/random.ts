/**
 * Generate random bytes using the platform's cryptographically secure pseudo-random number generator (CSPRNG).
 *
 * @param length - The number of random bytes to generate.
 * @returns An `Uint8Array` of the provided length with random bytes.
 */
export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  return globalThis.crypto.getRandomValues(bytes);
}
