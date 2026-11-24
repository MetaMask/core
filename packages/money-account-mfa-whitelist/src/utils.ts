import { decode, encode } from '@metamask/abi-utils';
import { bytesToHex, hexToBytes, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { MfaRequirement, MfaWhitelistRule } from './types.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;

/**
 * Builds the result for a whitelisted request.
 *
 * @param rule - The rule the request matched.
 * @returns A result that doesn't require MFA.
 */
export function whitelisted(rule: MfaWhitelistRule): MfaRequirement {
  return { mfaRequired: false, rule };
}

/**
 * Builds the result for a request that isn't whitelisted.
 *
 * @param reason - Why the request isn't whitelisted.
 * @returns A result that requires MFA.
 */
export function requireMfa(reason: string): MfaRequirement {
  return { mfaRequired: true, reason };
}

/**
 * Checks that a value is a 20-byte hex address. The checksum is not
 * validated, because addresses are only ever compared case-insensitively.
 *
 * @param value - The value to check.
 * @returns Whether the value is an address.
 */
export function isAddress(value: unknown): value is Hex {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value);
}

/**
 * Compares two hex values case-insensitively.
 *
 * @param a - One hex value.
 * @param b - The other hex value.
 * @returns Whether the values are equal.
 */
export function isSameHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Checks whether a timestamp is within `maxAge` of `now`, in either
 * direction, to tolerate clock skew between client and backend.
 *
 * @param timestamp - The timestamp in milliseconds.
 * @param now - The current time in milliseconds.
 * @param maxAge - The maximum distance in milliseconds.
 * @returns Whether the timestamp is fresh.
 */
export function isFresh(
  timestamp: number,
  now: number,
  maxAge: number,
): boolean {
  return Math.abs(now - timestamp) <= maxAge;
}

/**
 * Decodes hex-encoded UTF-8.
 *
 * @param value - The hex value.
 * @returns The decoded string, or `undefined` if the value isn't strict hex
 * or isn't valid UTF-8.
 */
export function decodeUtf8(value: unknown): string | undefined {
  if (!isStrictHexString(value)) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(hexToBytes(value));
  } catch {
    return undefined;
  }
}

/**
 * Decodes ABI-encoded data and requires it to be in canonical form: encoding
 * the decoded values must reproduce the data exactly. This rules out
 * trailing bytes and other encodings that different decoders might read
 * differently.
 *
 * @param types - The ABI types.
 * @param data - The encoded data.
 * @returns The decoded values, or `undefined` if the data is malformed or not
 * canonical.
 */
export function decodeCanonical<Types extends readonly string[]>(
  types: Types,
  data: Hex,
): unknown[] | undefined {
  try {
    const values = decode(types, data) as unknown[];
    const reencoded = bytesToHex(encode(types, values as never));
    return isSameHex(reencoded, data) ? values : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Decodes the arguments of a contract call with the given selector.
 *
 * @param callData - The calldata.
 * @param selector - The expected 4-byte function selector.
 * @param types - The ABI types of the arguments.
 * @returns The decoded arguments, or `undefined` if the selector doesn't
 * match or the arguments are malformed or not canonical.
 */
export function decodeCall<Types extends readonly string[]>(
  callData: Hex,
  selector: Hex,
  types: Types,
): unknown[] | undefined {
  if (!callData.toLowerCase().startsWith(selector.toLowerCase())) {
    return undefined;
  }
  return decodeCanonical(types, `0x${callData.slice(selector.length)}`);
}
