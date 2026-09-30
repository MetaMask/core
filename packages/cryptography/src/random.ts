/**
 * Generate random bytes using the platform's cryptographically secure pseudo-random number generator (CSPRNG).
 *
 * @param length - The number of random bytes to generate.
 * @returns An `Uint8Array` of the provided length with random bytes.
 * @throws If `length` is not greater than 0.
 */
export function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (length <= 0) {
    throw new Error('Invalid length: Length must be greater than 0.');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
