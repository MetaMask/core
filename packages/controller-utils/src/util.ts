import fetch from 'cross-fetch';
import {
  addHexPrefix,
  isValidAddress,
  isHexString,
  bufferToHex,
  BN,
  toChecksumAddress,
  stripHexPrefix,
} from 'ethereumjs-util';
import { fromWei, toWei } from 'ethjs-unit';
import ensNamehash from 'eth-ens-namehash';
import deepEqual from 'fast-deep-equal';
import { Json } from '@metamask/base-controller';
import { MAINNET } from './constants';

const TIMEOUT_ERROR = new Error('timeout');

const hexRe = /^[0-9A-Fa-f]+$/gu;

/**
 * Converts a BN object to a hex string with a '0x' prefix.
 *
 * @param inputBn - BN instance to convert to a hex string.
 * @returns A '0x'-prefixed hex string.
 */
export function BNToHex(inputBn: any) {
  return addHexPrefix(inputBn.toString(16));
}

/**
 * Used to multiply a BN by a fraction.
 *
 * @param targetBN - Number to multiply by a fraction.
 * @param numerator - Numerator of the fraction multiplier.
 * @param denominator - Denominator of the fraction multiplier.
 * @returns Product of the multiplication.
 */
export function fractionBN(
  targetBN: any,
  numerator: number | string,
  denominator: number | string,
) {
  const numBN = new BN(numerator);
  const denomBN = new BN(denominator);
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
  const hexWei = new BN(stripHexPrefix(hex), 16);
  return fromWei(hexWei, 'gwei').toString(10);
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
      return `https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=${amount}&address=${address}&crypto_currency=ETH`;
    case '3':
      return 'https://faucet.metamask.io/';
    case '4':
      return 'https://www.rinkeby.io/';
    case '5':
      return 'https://goerli-faucet.slock.it/';
    case '42':
      return 'https://github.com/kovan-testnet/faucet';
    default:
      return undefined;
  }
}

/**
 * Return a URL that can be used to fetch ETH transactions.
 *
 * @param networkType - Network type of desired network.
 * @param urlParams - The parameters used to construct the URL.
 * @returns URL to fetch the access the endpoint.
 */
export function getEtherscanApiUrl(
  networkType: string,
  urlParams: any,
): string {
  let etherscanSubdomain = 'api';
  if (networkType !== MAINNET) {
    etherscanSubdomain = `api-${networkType}`;
  }
  const apiUrl = `https://${etherscanSubdomain}.etherscan.io`;
  let url = `${apiUrl}/api?`;

  for (const paramKey in urlParams) {
    if (urlParams[paramKey]) {
      url += `${paramKey}=${urlParams[paramKey]}&`;
    }
  }
  url += 'tag=latest&page=1';
  return url;
}

/**
 * Converts a hex string to a BN object.
 *
 * @param inputHex - Number represented as a hex string.
 * @returns A BN instance.
 */
export function hexToBN(inputHex: string) {
  return new BN(stripHexPrefix(inputHex), 16);
}

/**
 * A helper function that converts hex data to human readable string.
 *
 * @param hex - The hex string to convert to string.
 * @returns A human readable string conversion.
 */
export function hexToText(hex: string) {
  try {
    const stripped = stripHexPrefix(hex);
    const buff = Buffer.from(stripped, 'hex');
    return buff.toString('utf8');
  } catch (e) {
    /* istanbul ignore next */
    return hex;
  }
}

/**
 * Parses a hex string and converts it into a number that can be operated on in a bignum-safe,
 * base-10 way.
 *
 * @param value - A base-16 number encoded as a string.
 * @returns The number as a BN object in base-16 mode.
 */
export function fromHex(value: string | BN): BN {
  if (BN.isBN(value)) {
    return value;
  }
  return new BN(hexToBN(value).toString(10));
}

/**
 * Converts an integer to a hexadecimal representation.
 *
 * @param value - An integer, an integer encoded as a base-10 string, or a BN.
 * @returns The integer encoded as a hex string.
 */
export function toHex(value: number | string | BN): string {
  if (typeof value === 'string' && isHexString(value)) {
    return value;
  }
  const hexString = BN.isBN(value)
    ? value.toString(16)
    : new BN(value.toString(), 10).toString(16);
  return `0x${hexString}`;
}

/**
 * Execute and return an asynchronous operation without throwing errors.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @returns Promise resolving to the result of the async operation.
 */
export async function safelyExecute(
  operation: () => Promise<any>,
  logError = false,
) {
  try {
    return await operation();
  } catch (error: any) {
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
 * @returns Promise resolving to the result of the async operation.
 */
export async function safelyExecuteWithTimeout(
  operation: () => Promise<any>,
  logError = false,
  timeout = 500,
) {
  try {
    return await Promise.race([
      operation(),
      new Promise<void>((_, reject) =>
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
 * Convert an address to a checksummed hexidecimal address.
 *
 * @param address - The address to convert.
 * @returns A 0x-prefixed hexidecimal checksummed address.
 */
export function toChecksumHexAddress(address: string) {
  const hexPrefixed = addHexPrefix(address);
  if (!isHexString(hexPrefixed)) {
    // Version 5.1 of ethereumjs-utils would have returned '0xY' for input 'y'
    // but we shouldn't waste effort trying to change case on a clearly invalid
    // string. Instead just return the hex prefixed original string which most
    // closely mimics the original behavior.
    return hexPrefixed;
  }
  return toChecksumAddress(hexPrefixed);
}

/**
 * Validates that the input is a hex address. This utility method is a thin
 * wrapper around ethereumjs-util.isValidAddress, with the exception that it
 * does not throw an error when provided values that are not hex strings. In
 * addition, and by default, this method will return true for hex strings that
 * meet the length requirement of a hex address, but are not prefixed with `0x`
 * Finally, if the mixedCaseUseChecksum flag is true and a mixed case string is
 * provided this method will validate it has the proper checksum formatting.
 *
 * @param possibleAddress - Input parameter to check against.
 * @param options - The validation options.
 * @param options.allowNonPrefixed - If true will first ensure '0x' is prepended to the string.
 * @returns Whether or not the input is a valid hex address.
 */
export function isValidHexAddress(
  possibleAddress: string,
  { allowNonPrefixed = true } = {},
) {
  const addressToCheck = allowNonPrefixed
    ? addHexPrefix(possibleAddress)
    : possibleAddress;
  if (!isHexString(addressToCheck)) {
    return false;
  }

  return isValidAddress(addressToCheck);
}

/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
export function normalizeMessageData(data: string) {
  try {
    const stripped = stripHexPrefix(data);
    if (stripped.match(hexRe)) {
      return addHexPrefix(stripped);
    }
  } catch (e) {
    /* istanbul ignore next */
  }
  return bufferToHex(Buffer.from(data, 'utf8'));
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
export async function successfulFetch(request: string, options?: RequestInit) {
  const response = await fetch(request, options);
  if (!response.ok) {
    throw new Error(
      `Fetch failed with status '${response.status}' for request '${request}'`,
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
export async function handleFetch(request: string, options?: RequestInit) {
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
  ethQuery: any,
  method: string,
  args: any[] = [],
): Promise<any> {
  return new Promise((resolve, reject) => {
    const cb = (error: Error, result: any) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    if (typeof ethQuery[method] === 'function') {
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
  if (isHexString(value)) {
    return parseInt(value, 16);
  }

  return Number(value) ? Number(value) : 0;
};

export const getIncreasedPriceHex = (value: number, rate: number): string =>
  addHexPrefix(`${parseInt(`${value * rate}`, 10).toString(16)}`);

export const getIncreasedPriceFromExisting = (
  value: string | undefined,
  rate: number,
): string => {
  return getIncreasedPriceHex(convertHexToDecimal(value), rate);
};

/**
 * Validates that the proposed value is greater than or equal to the minimum value.
 *
 * @param proposed - The proposed value.
 * @param min - The minimum value.
 * @returns The proposed value.
 * @throws Will throw if the proposed value is too low.
 */
export function validateMinimumIncrease(proposed: string, min: string) {
  const proposedDecimal = convertHexToDecimal(proposed);
  const minDecimal = convertHexToDecimal(min);
  if (proposedDecimal >= minDecimal) {
    return proposed;
  }
  const errorMsg = `The proposed value: ${proposedDecimal} should meet or exceed the minimum value: ${minDecimal}`;
  throw new Error(errorMsg);
}

/**
 * Adds URL protocol prefix to input URL string if missing.
 *
 * @param urlString - An IPFS URL.
 * @returns A URL with a https:// prepended.
 */
export function addUrlProtocolPrefix(urlString: string): string {
  if (!urlString.match(/(^http:\/\/)|(^https:\/\/)/u)) {
    return `https://${urlString}`;
  }
  return urlString;
}

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

export const hasProperty = (
  object: PlainObject,
  key: string | number | symbol,
) => Reflect.hasOwnProperty.call(object, key);

/**
 * Like {@link Array}, but always non-empty.
 *
 * @template T - The non-empty array member type.
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Type guard for {@link NonEmptyArray}.
 *
 * @template T - The non-empty array member type.
 * @param value - The value to check.
 * @returns Whether the value is a non-empty array.
 */
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
function logOrRethrowError(error: any, codesToCatch: number[] = []) {
  if (!error) {
    return;
  }

  const includesErrorCodeToCatch = codesToCatch.some((code) =>
    error.message?.includes(`Fetch failed with status '${code}'`),
  );

  if (
    error instanceof Error &&
    (includesErrorCodeToCatch ||
      error.message?.includes('Failed to fetch') ||
      error === TIMEOUT_ERROR)
  ) {
    console.error(error);
  } else {
    throw error;
  }
}
