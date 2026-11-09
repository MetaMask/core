import { hmac as nobleHmac } from '@noble/hashes/hmac';
import { ripemd160 as nobleRipemd160 } from '@noble/hashes/legacy';
import { keccak_256 as nobleKeccak256 } from '@noble/hashes/sha3';

/**
 * Compute the Keccak-256 of the given data synchronously.
 *
 * Right now this is just a wrapper around `keccak256` from the `@noble/hashes`
 * package, but it's here in case we want to change the implementation in the
 * future to allow for asynchronous hashing.
 *
 * @param data - The data to hash.
 * @returns The Keccak-256 of the data.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  return nobleKeccak256(data);
}

/**
 * Compute the RIPEMD-160 of the given data.
 *
 * Right now this is just a wrapper around `ripemd160` from the `@noble/hashes`
 * package, but it's here in case we want to change the implementation in the
 * future to allow for asynchronous hashing.
 *
 * @param data - The data to hash.
 * @returns The RIPEMD-160 of the data.
 */
export function ripemd160(data: Uint8Array): Uint8Array {
  return nobleRipemd160(data);
}
