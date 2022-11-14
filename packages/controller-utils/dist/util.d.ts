/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
import { Json } from '@metamask/base-controller';
/**
 * Converts a BN object to a hex string with a '0x' prefix.
 *
 * @param inputBn - BN instance to convert to a hex string.
 * @returns A '0x'-prefixed hex string.
 */
export declare function BNToHex(inputBn: any): string;
/**
 * Used to multiply a BN by a fraction.
 *
 * @param targetBN - Number to multiply by a fraction.
 * @param numerator - Numerator of the fraction multiplier.
 * @param denominator - Denominator of the fraction multiplier.
 * @returns Product of the multiplication.
 */
export declare function fractionBN(targetBN: any, numerator: number | string, denominator: number | string): any;
/**
 * Used to convert a base-10 number from GWEI to WEI. Can handle numbers with decimal parts.
 *
 * @param n - The base 10 number to convert to WEI.
 * @returns The number in WEI, as a BN.
 */
export declare function gweiDecToWEIBN(n: number | string): any;
/**
 * Used to convert values from wei hex format to dec gwei format.
 *
 * @param hex - The value in hex wei.
 * @returns The value in dec gwei as string.
 */
export declare function weiHexToGweiDec(hex: string): any;
/**
 * Return a URL that can be used to obtain ETH for a given network.
 *
 * @param networkCode - Network code of desired network.
 * @param address - Address to deposit obtained ETH.
 * @param amount - How much ETH is desired.
 * @returns URL to buy ETH based on network.
 */
export declare function getBuyURL(networkCode?: string, address?: string, amount?: number): string | undefined;
/**
 * Converts a hex string to a BN object.
 *
 * @param inputHex - Number represented as a hex string.
 * @returns A BN instance.
 */
export declare function hexToBN(inputHex: string): BN;
/**
 * A helper function that converts hex data to human readable string.
 *
 * @param hex - The hex string to convert to string.
 * @returns A human readable string conversion.
 */
export declare function hexToText(hex: string): string;
/**
 * Parses a hex string and converts it into a number that can be operated on in a bignum-safe,
 * base-10 way.
 *
 * @param value - A base-16 number encoded as a string.
 * @returns The number as a BN object in base-16 mode.
 */
export declare function fromHex(value: string | BN): BN;
/**
 * Converts an integer to a hexadecimal representation.
 *
 * @param value - An integer, an integer encoded as a base-10 string, or a BN.
 * @returns The integer encoded as a hex string.
 */
export declare function toHex(value: number | string | BN): string;
/**
 * Execute and return an asynchronous operation without throwing errors.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @returns Promise resolving to the result of the async operation.
 */
export declare function safelyExecute(operation: () => Promise<any>, logError?: boolean): Promise<any>;
/**
 * Execute and return an asynchronous operation with a timeout.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @param timeout - Timeout to fail the operation.
 * @returns Promise resolving to the result of the async operation.
 */
export declare function safelyExecuteWithTimeout(operation: () => Promise<any>, logError?: boolean, timeout?: number): Promise<any>;
/**
 * Convert an address to a checksummed hexidecimal address.
 *
 * @param address - The address to convert.
 * @returns A 0x-prefixed hexidecimal checksummed address.
 */
export declare function toChecksumHexAddress(address: string): string;
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
export declare function isValidHexAddress(possibleAddress: string, { allowNonPrefixed }?: {
    allowNonPrefixed?: boolean | undefined;
}): boolean;
/**
 * Returns whether the given code corresponds to a smart contract.
 *
 * @param code - The potential smart contract code.
 * @returns Whether the code was smart contract code or not.
 */
export declare function isSmartContractCode(code: string): boolean;
/**
 * Execute fetch and verify that the response was successful.
 *
 * @param request - Request information.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export declare function successfulFetch(request: string, options?: RequestInit): Promise<Response>;
/**
 * Execute fetch and return object response.
 *
 * @param request - The request information.
 * @param options - The fetch options.
 * @returns The fetch response JSON data.
 */
export declare function handleFetch(request: string, options?: RequestInit): Promise<any>;
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
export declare function fetchWithErrorHandling({ url, options, timeout, errorCodesToCatch, }: {
    url: string;
    options?: RequestInit;
    timeout?: number;
    errorCodesToCatch?: number[];
}): Promise<any>;
/**
 * Fetch that fails after timeout.
 *
 * @param url - Url to fetch.
 * @param options - Options to send with the request.
 * @param timeout - Timeout to fail request.
 * @returns Promise resolving the request.
 */
export declare function timeoutFetch(url: string, options?: RequestInit, timeout?: number): Promise<Response>;
/**
 * Normalizes the given ENS name.
 *
 * @param ensName - The ENS name.
 * @returns The normalized ENS name string.
 */
export declare function normalizeEnsName(ensName: string): string | null;
/**
 * Wrapper method to handle EthQuery requests.
 *
 * @param ethQuery - EthQuery object initialized with a provider.
 * @param method - Method to request.
 * @param args - Arguments to send.
 * @returns Promise resolving the request.
 */
export declare function query(ethQuery: any, method: string, args?: any[]): Promise<any>;
/**
 * Converts valid hex strings to decimal numbers, and handles unexpected arg types.
 *
 * @param value - a string that is either a hexadecimal with `0x` prefix or a decimal string.
 * @returns a decimal number.
 */
export declare const convertHexToDecimal: (value?: string | undefined) => number;
declare type PlainObject = Record<number | string | symbol, unknown>;
/**
 * Determines whether a value is a "plain" object.
 *
 * @param value - A value to check
 * @returns True if the passed value is a plain object
 */
export declare function isPlainObject(value: unknown): value is PlainObject;
export declare const hasProperty: (object: PlainObject, key: string | number | symbol) => boolean;
/**
 * Like {@link Array}, but always non-empty.
 *
 * @template T - The non-empty array member type.
 */
export declare type NonEmptyArray<T> = [T, ...T[]];
/**
 * Type guard for {@link NonEmptyArray}.
 *
 * @template T - The non-empty array member type.
 * @param value - The value to check.
 * @returns Whether the value is a non-empty array.
 */
export declare function isNonEmptyArray<T>(value: T[]): value is NonEmptyArray<T>;
/**
 * Type guard for {@link Json}.
 *
 * @param value - The value to check.
 * @returns Whether the value is valid JSON.
 */
export declare function isValidJson(value: unknown): value is Json;
export {};
