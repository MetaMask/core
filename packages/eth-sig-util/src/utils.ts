import {
  bytesToInt,
  ecrecover,
  fromRpcSig,
  fromSigned,
  isHexString,
  toBytes,
  toUnsigned,
} from '@ethereumjs/util';
import type { ToBytesInputTypes } from '@ethereumjs/util';
import {
  numberToHex,
  remove0x,
  add0x,
  bytesToHex,
  numberToBytes,
  stringToBytes,
  Hex,
} from '@metamask/utils';

/**
 * Pads the front of the given hex string with zeroes until it reaches the
 * target length. If the input string is already longer than or equal to the
 * target length, it is returned unmodified.
 *
 * If the input string is "0x"-prefixed or not a hex string, an error will be
 * thrown.
 *
 * @param hexString - The hexadecimal string to pad with zeroes.
 * @param targetLength - The target length of the hexadecimal string.
 * @returns The input string front-padded with zeroes, or the original string
 * if it was already greater than or equal to to the target length.
 */
export function padWithZeroes(hexString: string, targetLength: number): string {
  if (hexString !== '' && !/^[a-f0-9]+$/iu.test(hexString)) {
    throw new Error(
      `Expected an unprefixed hex string. Received: ${hexString}`,
    );
  }

  if (targetLength < 0) {
    throw new Error(
      `Expected a non-negative integer target length. Received: ${targetLength}`,
    );
  }

  return String.prototype.padStart.call(hexString, targetLength, '0');
}

/**
 * Returns `true` if the given value is nullish.
 *
 * @param value - The value being checked.
 * @returns Whether the value is nullish.
 */
export function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Convert a value to bytes. This function should be equivalent to the `toBuffer` function in
 * `ethereumjs-util@5.2.1`.
 *
 * @param value - The value to convert to bytes.
 * @returns The given value as a `Uint8Array`.
 */
export function legacyToBuffer(value: ToBytesInputTypes): Uint8Array {
  return typeof value === 'string' && !isHexString(value)
    ? stringToBytes(value)
    : toBytes(value);
}

/**
 * Concatenate an extended ECDSA signature into a single '0x'-prefixed hex string.
 *
 * @param v - The 'v' portion of the signature.
 * @param r - The 'r' portion of the signature.
 * @param s - The 's' portion of the signature.
 * @returns The concatenated ECDSA signature as a '0x'-prefixed string.
 */
export function concatSig(v: Uint8Array, r: Uint8Array, s: Uint8Array): string {
  const rSig = fromSigned(r);
  const sSig = fromSigned(s);
  const vSig = bytesToInt(v);
  const rStr = padWithZeroes(remove0x(bytesToHex(toUnsigned(rSig))), 64);
  const sStr = padWithZeroes(remove0x(bytesToHex(toUnsigned(sSig))), 64);
  const vStr = remove0x(numberToHex(vSig));
  return add0x(rStr.concat(sStr, vStr));
}

/**
 * Recover the public key from the given signature and message hash.
 *
 * @param messageHash - The hash of the signed message.
 * @param signature - The signature.
 * @returns The public key of the signer.
 */
export function recoverPublicKey(
  messageHash: Uint8Array,
  signature: string,
): Uint8Array {
  const sigParams = fromRpcSig(signature as Hex);
  return ecrecover(messageHash, sigParams.v, sigParams.r, sigParams.s);
}

/**
 * Normalize the input to a lower-cased '0x'-prefixed hex string.
 *
 * @param input - The value to normalize.
 * @returns The normalized value.
 */
export function normalize(input: number | string): string | undefined {
  if (isNullish(input)) {
    return undefined;
  }

  if (typeof input === 'number') {
    if (input < 0) {
      return '0x';
    }
    const buffer = numberToBytes(input);
    input = bytesToHex(buffer);
  }

  if (typeof input !== 'string') {
    throw new Error(
      `eth-sig-util.normalize() requires hex string or integer input. received ${typeof input}: ${input as any as string}`,
    );
  }

  return add0x(input.toLowerCase());
}
