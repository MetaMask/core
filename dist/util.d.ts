/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
import { Transaction, FetchAllOptions, GasPriceValue, FeeMarketEIP1559Values } from './transaction/TransactionController';
import { MessageParams } from './message-manager/MessageManager';
import { PersonalMessageParams } from './message-manager/PersonalMessageManager';
import { TypedMessageParams } from './message-manager/TypedMessageManager';
import { Token } from './assets/TokenRatesController';
import { Json } from './BaseControllerV2';
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
 * Return a URL that can be used to fetch ETH transactions.
 *
 * @param networkType - Network type of desired network.
 * @param urlParams - The parameters used to construct the URL.
 * @returns URL to fetch the access the endpoint.
 */
export declare function getEtherscanApiUrl(networkType: string, urlParams: any): string;
/**
 * Handles the fetch of incoming transactions.
 *
 * @param networkType - Network type of desired network.
 * @param address - Address to get the transactions from.
 * @param txHistoryLimit - The maximum number of transactions to fetch.
 * @param opt - Object that can contain fromBlock and Etherscan service API key.
 * @returns Responses for both ETH and ERC20 token transactions.
 */
export declare function handleTransactionFetch(networkType: string, address: string, txHistoryLimit: number, opt?: FetchAllOptions): Promise<[{
    [result: string]: [];
}, {
    [result: string]: [];
}]>;
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
 * Normalizes properties on a Transaction object.
 *
 * @param transaction - Transaction object to normalize.
 * @returns Normalized Transaction object.
 */
export declare function normalizeTransaction(transaction: Transaction): Transaction;
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
 * Validates a Transaction object for required properties and throws in
 * the event of any validation error.
 *
 * @param transaction - Transaction object to validate.
 */
export declare function validateTransaction(transaction: Transaction): void;
/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
export declare function normalizeMessageData(data: string): string;
/**
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
export declare function validateSignMessageData(messageData: PersonalMessageParams | MessageParams): void;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
export declare function validateTypedSignMessageDataV1(messageData: TypedMessageParams): void;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V3.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
export declare function validateTypedSignMessageDataV3(messageData: TypedMessageParams): void;
/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate.
 */
export declare function validateTokenToWatch(token: Token): void;
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
 * Checks if a transaction is EIP-1559 by checking for the existence of
 * maxFeePerGas and maxPriorityFeePerGas within its parameters.
 *
 * @param transaction - Transaction object to add.
 * @returns Boolean that is true if the transaction is EIP-1559 (has maxFeePerGas and maxPriorityFeePerGas), otherwise returns false.
 */
export declare const isEIP1559Transaction: (transaction: Transaction) => boolean;
/**
 * Converts valid hex strings to decimal numbers, and handles unexpected arg types.
 *
 * @param value - a string that is either a hexadecimal with `0x` prefix or a decimal string.
 * @returns a decimal number.
 */
export declare const convertHexToDecimal: (value?: string | undefined) => number;
export declare const getIncreasedPriceHex: (value: number, rate: number) => string;
export declare const getIncreasedPriceFromExisting: (value: string | undefined, rate: number) => string;
export declare const validateGasValues: (gasValues: GasPriceValue | FeeMarketEIP1559Values) => void;
export declare const isFeeMarketEIP1559Values: (gasValues?: GasPriceValue | FeeMarketEIP1559Values | undefined) => gasValues is FeeMarketEIP1559Values;
export declare const isGasPriceValue: (gasValues?: GasPriceValue | FeeMarketEIP1559Values | undefined) => gasValues is GasPriceValue;
/**
 * Validates that the proposed value is greater than or equal to the minimum value.
 *
 * @param proposed - The proposed value.
 * @param min - The minimum value.
 * @returns The proposed value.
 * @throws Will throw if the proposed value is too low.
 */
export declare function validateMinimumIncrease(proposed: string, min: string): string;
/**
 * Removes IPFS protocol prefix from input string.
 *
 * @param ipfsUrl - An IPFS url (e.g. ipfs://{content id})
 * @returns IPFS content identifier and (possibly) path in a string
 * @throws Will throw if the url passed is not IPFS.
 */
export declare function removeIpfsProtocolPrefix(ipfsUrl: string): string;
/**
 * Extracts content identifier and path from an input string.
 *
 * @param ipfsUrl - An IPFS URL minus the IPFS protocol prefix
 * @returns IFPS content identifier (cid) and sub path as string.
 * @throws Will throw if the url passed is not ipfs.
 */
export declare function getIpfsCIDv1AndPath(ipfsUrl: string): {
    cid: string;
    path?: string;
};
/**
 * Adds URL protocol prefix to input URL string if missing.
 *
 * @param urlString - An IPFS URL.
 * @returns A URL with a https:// prepended.
 */
export declare function addUrlProtocolPrefix(urlString: string): string;
/**
 * Formats URL correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - The users preferred IPFS gateway (full URL or just host).
 * @param ipfsUrl - The IFPS URL pointed at the asset.
 * @param subdomainSupported - Boolean indicating whether the URL should be formatted with subdomains or not.
 * @returns A formatted URL, with the user's preferred IPFS gateway and format (subdomain or not), pointing to an asset hosted on IPFS.
 */
export declare function getFormattedIpfsUrl(ipfsGateway: string, ipfsUrl: string, subdomainSupported: boolean): string;
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
/**
 * Networks where token detection is supported - Values are in decimal format
 */
export declare enum SupportedTokenDetectionNetworks {
    mainnet = "1",
    bsc = "56",
    polygon = "137",
    avax = "43114"
}
/**
 * Check if token detection is enabled for certain networks.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
export declare function isTokenDetectionSupportedForNetwork(chainId: string): boolean;
/**
 * Check if token list polling is enabled for a given network.
 * Currently this method is used to support e2e testing for consumers of this package.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports tokenlists
 */
export declare function isTokenListSupportedForNetwork(chainId: string): boolean;
export {};
