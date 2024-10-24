import { isValidAddress, toChecksumAddress } from '@ethereumjs/util';
import type EthQuery from '@metamask/eth-query';
import { fromWei, toWei } from '@metamask/ethjs-unit';
import type { Hex, Json } from '@metamask/utils';
import {
  isStrictHexString,
  add0x,
  isHexString,
  remove0x,
} from '@metamask/utils';
import type { BigNumber } from 'bignumber.js';
import BN from 'bn.js';
import BN4 from 'bnjs4';
import ensNamehash from 'eth-ens-namehash';
import deepEqual from 'fast-deep-equal';

import { MAX_SAFE_CHAIN_ID } from './constants';

export type { BigNumber };

const TIMEOUT_ERROR = new Error('timeout');

export const PROTOTYPE_POLLUTION_BLOCKLIST = [
  '__proto__',
  'constructor',
  'prototype',
] as const;

/**
 * Checks whether a dynamic property key could be used in
 * a [prototype pollution attack](https://portswigger.net/web-security/prototype-pollution).
 *
 * @param key - The dynamic key to validate.
 * @returns Whether the given dynamic key is safe to use.
 */
export function isSafeDynamicKey(key: string): boolean {
  return (
    typeof key === 'string' &&
    !PROTOTYPE_POLLUTION_BLOCKLIST.some((blockedKey) => key === blockedKey)
  );
}

/**
 * Checks whether the given number primitive chain ID is safe.
 * Because some cryptographic libraries we use expect the chain ID to be a
 * number primitive, it must not exceed a certain size.
 *
 * @param chainId - The chain ID to check for safety.
 * @returns Whether the given chain ID is safe.
 */
export function isSafeChainId(chainId: Hex): boolean {
  if (!isHexString(chainId)) {
    return false;
  }
  const decimalChainId = Number.parseInt(
    chainId,
    isStrictHexString(chainId) ? 16 : 10,
  );
  return (
    Number.isSafeInteger(decimalChainId) &&
    decimalChainId > 0 &&
    decimalChainId <= MAX_SAFE_CHAIN_ID
  );
}
/**
 * Converts a BN or BigNumber object to a hex string with a '0x' prefix.
 *
 * @param inputBn - BN|BigNumber instance to convert to a hex string.
 * @returns A '0x'-prefixed hex string.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export function BNToHex(inputBn: BN | BN4 | BigNumber): string {
  return add0x(inputBn.toString(16));
}

function getBNImplementation(targetBN: BN4): typeof BN4;
function getBNImplementation(targetBN: BN): typeof BN;
/**
 * Return the bn.js library responsible for the BN in question
 * @param targetBN - A BN instance
 * @returns A bn.js instance
 */
function getBNImplementation(targetBN: BN | BN4): typeof BN4 | typeof BN {
  return Object.keys(targetBN).includes('_strip') ? BN4 : BN;
}

export function fractionBN(
  targetBN: BN,
  numerator: number | string,
  denominator: number | string,
): BN;
export function fractionBN(
  targetBN: BN4,
  numerator: number | string,
  denominator: number | string,
): BN4;
/**
 * Used to multiply a BN by a fraction.
 *
 * @param targetBN - Number to multiply by a fraction.
 * @param numerator - Numerator of the fraction multiplier.
 * @param denominator - Denominator of the fraction multiplier.
 * @returns Product of the multiplication.
 */
export function fractionBN(
  targetBN: BN | BN4,
  numerator: number | string,
  denominator: number | string,
): BN | BN4 {
  // @ts-expect-error - Signature overload confusion
  const BNImplementation = getBNImplementation(targetBN);

  const numBN = new BNImplementation(numerator);
  const denomBN = new BNImplementation(denominator);
  // @ts-expect-error - BNImplementation gets unexpected typed
  return targetBN.mul(numBN).div(denomBN);
}

/**
 * Used to convert a base-10 number from GWEI to WEI. Can handle numbers with decimal parts.
 *
 * @param n - The base 10 number to convert to WEI.
 * @returns The number in WEI, as a BN.
 */
export function gweiDecToWEIBN(n: number | string) {
  if (Number.isNaN(n)) {
    return new BN(0);
  }

  const parts = n.toString().split('.');
  const wholePart = parts[0] || '0';
  let decimalPart = parts[1] || '';

  if (!decimalPart) {
    return toWei(wholePart, 'gwei');
  }

  if (decimalPart.length <= 9) {
    return toWei(`${wholePart}.${decimalPart}`, 'gwei');
  }

  const decimalPartToRemove = decimalPart.slice(9);
  const decimalRoundingDigit = decimalPartToRemove[0];

  decimalPart = decimalPart.slice(0, 9);
  let wei = toWei(`${wholePart}.${decimalPart}`, 'gwei');

  if (Number(decimalRoundingDigit) >= 5) {
    wei = wei.add(new BN(1));
  }

  return wei;
}

/**
 * Used to convert values from wei hex format to dec gwei format.
 *
 * @param hex - The value in hex wei.
 * @returns The value in dec gwei as string.
 */
export function weiHexToGweiDec(hex: string) {
  const hexWei = new BN(remove0x(hex), 16);
  return fromWei(hexWei, 'gwei');
}

/**
 * Return a URL that can be used to obtain ETH for a given network.
 *
 * @param networkCode - Network code of desired network.
 * @param address - Address to deposit obtained ETH.
 * @param amount - How much ETH is desired.
 * @returns URL to buy ETH based on network.
 */
export function getBuyURL(
  networkCode = '1',
  address?: string,
  amount = 5,
): string | undefined {
  switch (networkCode) {
    case '1':
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return `https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=${amount}&address=${address}&crypto_currency=ETH`;
    case '5':
      return 'https://goerli-faucet.slock.it/';
    case '11155111':
      return 'https://sepoliafaucet.net/';
    default:
      return undefined;
  }
}

/**
 * Converts a hex string to a BN object.
 *
 * @param inputHex - Number represented as a hex string.
 * @returns A BN instance.
 */
export function hexToBN(inputHex: string) {
  return inputHex ? new BN(remove0x(inputHex), 16) : new BN(0);
}

/**
 * A helper function that converts hex data to human readable string.
 *
 * @param hex - The hex string to convert to string.
 * @returns A human readable string conversion.
 */
export function hexToText(hex: string) {
  try {
    const stripped = remove0x(hex);
    const buff = Buffer.from(stripped, 'hex');
    return buff.toString('utf8');
  } catch (e) {
    /* istanbul ignore next */
    return hex;
  }
}

export function fromHex(value: string | BN): BN;
export function fromHex(value: BN4): BN4;
/**
 * Parses a hex string and converts it into a number that can be operated on in a bignum-safe,
 * base-10 way.
 *
 * @param value - A base-16 number encoded as a string.
 * @returns The number as a BN object in base-16 mode.
 */
export function fromHex(value: string | BN | BN4): BN | BN4 {
  if (BN.isBN(value)) {
    return value;
  }
  return new BN(hexToBN(value as string).toString(10), 10);
}

/**
 * Converts an integer to a hexadecimal representation.
 *
 * @param value - An integer, an integer encoded as a base-10 string, or a BN.
 * @returns The integer encoded as a hex string.
 */
export function toHex(value: number | bigint | string | BN | BN4): Hex {
  if (typeof value === 'string' && isStrictHexString(value)) {
    return value;
  }
  const hexString =
    BN.isBN(value) || typeof value === 'bigint'
      ? value.toString(16)
      : new BN(value.toString(10), 10).toString(16);
  return `0x${hexString}`;
}

/**
 * Execute and return an asynchronous operation without throwing errors.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @template Result - Type of the result of the async operation
 * @returns Promise resolving to the result of the async operation.
 */
export async function safelyExecute<Result>(
  operation: () => Promise<Result>,
  logError = false,
): Promise<Result | undefined> {
  try {
    return await operation();
  } catch (error) {
    /* istanbul ignore next */
    if (logError) {
      console.error(error);
    }
    return undefined;
  }
}

/**
 * Execute and return an asynchronous operation with a timeout.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @param timeout - Timeout to fail the operation.
 * @template Result - Type of the result of the async operation
 * @returns Promise resolving to the result of the async operation.
 */
export async function safelyExecuteWithTimeout<Result>(
  operation: () => Promise<Result>,
  logError = false,
  timeout = 500,
): Promise<Result | undefined> {
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(TIMEOUT_ERROR);
        }, timeout),
      ),
    ]);
  } catch (error) {
    /* istanbul ignore next */
    if (logError) {
      console.error(error);
    }
    return undefined;
  }
}

/**
 * Convert an address to a checksummed hexadecimal address.
 *
 * @param address - The address to convert.
 * @returns The address in 0x-prefixed hexadecimal checksummed form if it is valid.
 */
export function toChecksumHexAddress(address: string): string;

/**
 * Convert an address to a checksummed hexadecimal address.
 *
 * Note that this particular overload does nothing.
 *
 * @param address - A value that is not a string (e.g. `undefined` or `null`).
 * @returns The `address` untouched.
 * @deprecated This overload is designed to gracefully handle an invalid input
 * and is only present for backward compatibility. It may be removed in a future
 * major version. Please pass a string to `toChecksumHexAddress` instead.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export function toChecksumHexAddress<T>(address: T): T;

// Tools only see JSDocs for overloads and ignore them for the implementation.
// eslint-disable-next-line jsdoc/require-jsdoc
export function toChecksumHexAddress(address: unknown) {
  if (typeof address !== 'string') {
    // Mimic behavior of `addHexPrefix` from `ethereumjs-util` (which this
    // function was previously using) for backward compatibility.
    return address;
  }

  const hexPrefixed = add0x(address);

  if (!isHexString(hexPrefixed)) {
    // Version 5.1 of ethereumjs-util would have returned '0xY' for input 'y'
    // but we shouldn't waste effort trying to change case on a clearly invalid
    // string. Instead just return the hex prefixed original string which most
    // closely mimics the original behavior.
    return hexPrefixed;
  }

  return toChecksumAddress(hexPrefixed);
}

/**
 * Validates that the input is a hex address. This utility method is a thin
 * wrapper around @metamask/utils.isValidHexAddress, with the exception that it
 * by default will return true for hex strings that are otherwise valid
 * hex addresses, but are not prefixed with `0x`.
 *
 * @param possibleAddress - Input parameter to check against.
 * @param options - The validation options.
 * @param options.allowNonPrefixed - If true will allow addresses without `0x` prefix.`
 * @returns Whether or not the input is a valid hex address.
 */
export function isValidHexAddress(
  possibleAddress: string,
  { allowNonPrefixed = true } = {},
): boolean {
  const addressToCheck = allowNonPrefixed
    ? add0x(possibleAddress)
    : possibleAddress;
  if (!isStrictHexString(addressToCheck)) {
    return false;
  }

  return isValidAddress(addressToCheck);
}

/**
 * Returns whether the given code corresponds to a smart contract.
 *
 * @param code - The potential smart contract code.
 * @returns Whether the code was smart contract code or not.
 */
export function isSmartContractCode(code: string) {
  /* istanbul ignore if */
  if (!code) {
    return false;
  }
  // Geth will return '0x', and ganache-core v2.2.1 will return '0x0'
  const smartContractCode = code !== '0x' && code !== '0x0';
  return smartContractCode;
}

/**
 * Execute fetch and verify that the response was successful.
 *
 * @param request - Request information.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export async function successfulFetch(
  request: URL | RequestInfo,
  options?: RequestInit,
) {
  const response = await fetch(request, options);
  if (!response.ok) {
    throw new Error(
      `Fetch failed with status '${response.status}' for request '${String(
        request,
      )}'`,
    );
  }
  return response;
}

/**
 * Execute fetch and return object response.
 *
 * @param request - The request information.
 * @param options - The fetch options.
 * @returns The fetch response JSON data.
 */
export async function handleFetch(
  request: URL | RequestInfo,
  options?: RequestInit,
) {
  const response = await successfulFetch(request, options);
  const object = await response.json();
  return object;
}

/**
 * Execute fetch and return object response, log if known error thrown, otherwise rethrow error.
 *
 * @param request - the request options object
 * @param request.url - The request url to query.
 * @param request.options - The fetch options.
 * @param request.timeout - Timeout to fail request
 * @param request.errorCodesToCatch - array of error codes for errors we want to catch in a particular context
 * @returns The fetch response JSON data or undefined (if error occurs).
 */
export async function fetchWithErrorHandling({
  url,
  options,
  timeout,
  errorCodesToCatch,
}: {
  url: string;
  options?: RequestInit;
  timeout?: number;
  errorCodesToCatch?: number[];
}) {
  let result;
  try {
    if (timeout) {
      result = Promise.race([
        await handleFetch(url, options),
        new Promise<Response>((_, reject) =>
          setTimeout(() => {
            reject(TIMEOUT_ERROR);
          }, timeout),
        ),
      ]);
    } else {
      result = await handleFetch(url, options);
    }
  } catch (e) {
    logOrRethrowError(e, errorCodesToCatch);
  }
  return result;
}

/**
 * Fetch that fails after timeout.
 *
 * @param url - Url to fetch.
 * @param options - Options to send with the request.
 * @param timeout - Timeout to fail request.
 * @returns Promise resolving the request.
 */
export async function timeoutFetch(
  url: string,
  options?: RequestInit,
  timeout = 500,
): Promise<Response> {
  return Promise.race([
    successfulFetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => {
        reject(TIMEOUT_ERROR);
      }, timeout),
    ),
  ]);
}

/**
 * Normalizes the given ENS name.
 *
 * @param ensName - The ENS name.
 * @returns The normalized ENS name string.
 */
export function normalizeEnsName(ensName: string): string | null {
  // `.` refers to the registry root contract
  if (ensName === '.') {
    return ensName;
  }
  if (ensName && typeof ensName === 'string') {
    try {
      const normalized = ensNamehash.normalize(ensName.trim());
      // this regex is only sufficient with the above call to ensNamehash.normalize
      // TODO: change 7 in regex to 3 when shorter ENS domains are live
      if (normalized.match(/^(([\w\d-]+)\.)*[\w\d-]{7,}\.(eth|test)$/u)) {
        return normalized;
      }
    } catch (_) {
      // do nothing
    }
  }
  return null;
}

/**
 * Wrapper method to handle EthQuery requests.
 *
 * @param ethQuery - EthQuery object initialized with a provider.
 * @param method - Method to request.
 * @param args - Arguments to send.
 * @returns Promise resolving the request.
 */
export function query(
  ethQuery: EthQuery,
  method: string,
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[] = [],
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return new Promise((resolve, reject) => {
    const cb = (error: unknown, result: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    // Using `in` rather than `hasProperty` so that we look up the prototype
    // chain for the method.
    if (method in ethQuery && typeof ethQuery[method] === 'function') {
      ethQuery[method](...args, cb);
    } else {
      ethQuery.sendAsync({ method, params: args }, cb);
    }
  });
}

/**
 * Converts valid hex strings to decimal numbers, and handles unexpected arg types.
 *
 * @param value - a string that is either a hexadecimal with `0x` prefix or a decimal string.
 * @returns a decimal number.
 */
export const convertHexToDecimal = (
  value: string | undefined = '0x0',
): number => {
  if (isStrictHexString(value)) {
    return parseInt(value, 16);
  }

  return Number(value) ? Number(value) : 0;
};

type PlainObject = Record<number | string | symbol, unknown>;

/**
 * Determines whether a value is a "plain" object.
 *
 * @param value - A value to check
 * @returns True if the passed value is a plain object
 */
export function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Like {@link Array}, but always non-empty.
 *
 * @template T - The non-empty array member type.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Type guard for {@link NonEmptyArray}.
 *
 * @template T - The non-empty array member type.
 * @param value - The value to check.
 * @returns Whether the value is a non-empty array.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export function isNonEmptyArray<T>(value: T[]): value is NonEmptyArray<T> {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Type guard for {@link Json}.
 *
 * @param value - The value to check.
 * @returns Whether the value is valid JSON.
 */
export function isValidJson(value: unknown): value is Json {
  try {
    return deepEqual(value, JSON.parse(JSON.stringify(value)));
  } catch (_) {
    return false;
  }
}

/**
 * Utility method to log if error is a common fetch error and otherwise rethrow it.
 *
 * @param error - Caught error that we should either rethrow or log to console
 * @param codesToCatch - array of error codes for errors we want to catch and log in a particular context
 */
function logOrRethrowError(error: unknown, codesToCatch: number[] = []) {
  if (!error) {
    return;
  }

  if (error instanceof Error) {
    const includesErrorCodeToCatch = codesToCatch.some((code) =>
      error.message.includes(`Fetch failed with status '${code}'`),
    );

    if (
      includesErrorCodeToCatch ||
      error.message.includes('Failed to fetch') ||
      error === TIMEOUT_ERROR
    ) {
      console.error(error);
    } else {
      throw error;
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw error;
  }
}

/**
 * Checks if two strings are equal, ignoring case.
 *
 * @param value1 - The first string to compare.
 * @param value2 - The second string to compare.
 * @returns `true` if the strings are equal, ignoring case; otherwise, `false`.
 */
export function isEqualCaseInsensitive(
  value1: string,
  value2: string,
): boolean {
  if (typeof value1 !== 'string' || typeof value2 !== 'string') {
    return false;
  }
  return value1.toLowerCase() === value2.toLowerCase();
}
