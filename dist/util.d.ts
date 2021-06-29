import { BN } from 'ethereumjs-util';
import { Transaction, FetchAllOptions } from './transaction/TransactionController';
import { MessageParams } from './message-manager/MessageManager';
import { PersonalMessageParams } from './message-manager/PersonalMessageManager';
import { TypedMessageParams } from './message-manager/TypedMessageManager';
import { Token } from './assets/TokenRatesController';
/**
 * Converts a BN object to a hex string with a '0x' prefix
 *
 * @param inputBn - BN instance to convert to a hex string
 * @returns - '0x'-prefixed hex string
 *
 */
export declare function BNToHex(inputBn: any): string;
/**
 * Used to multiply a BN by a fraction
 *
 * @param targetBN - Number to multiply by a fraction
 * @param numerator - Numerator of the fraction multiplier
 * @param denominator - Denominator of the fraction multiplier
 * @returns - Product of the multiplication
 */
export declare function fractionBN(targetBN: any, numerator: number | string, denominator: number | string): any;
/**
 * Used to convert a base-10 number from GWEI to WEI. Can handle numbers with decimal parts
 *
 * @param n - The base 10 number to convert to WEI
 * @returns - The number in WEI, as a BN
 */
export declare function gweiDecToWEIBN(n: number | string): any;
/**
 * Used to convert values from wei hex format to dec gwei format
 * @param hex - value in hex wei
 * @returns - value in dec gwei as string
 */
export declare function weiHexToGweiDec(hex: string): any;
/**
 * Return a URL that can be used to obtain ETH for a given network
 *
 * @param networkCode - Network code of desired network
 * @param address - Address to deposit obtained ETH
 * @param amount - How much ETH is desired
 * @returns - URL to buy ETH based on network
 */
export declare function getBuyURL(networkCode?: string, address?: string, amount?: number): string | undefined;
/**
 * Return a URL that can be used to fetch ETH transactions
 *
 * @param networkType - Network type of desired network
 * @param address - Address to get the transactions from
 * @param fromBlock? - Block from which transactions are needed
 * @returns - URL to fetch the transactions from
 */
export declare function getEtherscanApiUrl(networkType: string, address: string, action: string, fromBlock?: string, etherscanApiKey?: string): string;
/**
 * Handles the fetch of incoming transactions
 *
 * @param networkType - Network type of desired network
 * @param address - Address to get the transactions from
 * @param opt? - Object that can contain fromBlock and Etherscan service API key
 * @returns - Responses for both ETH and ERC20 token transactions
 */
export declare function handleTransactionFetch(networkType: string, address: string, opt?: FetchAllOptions): Promise<[{
    [result: string]: [];
}, {
    [result: string]: [];
}]>;
/**
 * Converts a hex string to a BN object
 *
 * @param inputHex - Number represented as a hex string
 * @returns - A BN instance
 *
 */
export declare function hexToBN(inputHex: string): BN;
/**
 * A helper function that converts hex data to human readable string
 *
 * @param hex - The hex string to convert to string
 * @returns - A human readable string conversion
 *
 */
export declare function hexToText(hex: string): string;
/**
 * Normalizes properties on a Transaction object
 *
 * @param transaction - Transaction object to normalize
 * @returns - Normalized Transaction object
 */
export declare function normalizeTransaction(transaction: Transaction): Transaction;
/**
 * Execute and return an asynchronous operation without throwing errors
 *
 * @param operation - Function returning a Promise
 * @param logError - Determines if the error should be logged
 * @param retry - Function called if an error is caught
 * @returns - Promise resolving to the result of the async operation
 */
export declare function safelyExecute(operation: () => Promise<any>, logError?: boolean, retry?: (error: Error) => void): Promise<any>;
/**
 * Execute and return an asynchronous operation with a timeout
 *
 * @param operation - Function returning a Promise
 * @param logError - Determines if the error should be logged
 * @param retry - Function called if an error is caught
 * @param timeout - Timeout to fail the operation
 * @returns - Promise resolving to the result of the async operation
 */
export declare function safelyExecuteWithTimeout(operation: () => Promise<any>, logError?: boolean, timeout?: number): Promise<any>;
export declare function toChecksumHexAddress(address: string): string;
/**
 * Validates that the input is a hex address. This utility method is a thin
 * wrapper around ethereumjs-util.isValidAddress, with the exception that it
 * does not throw an error when provided values that are not hex strings. In
 * addition, and by default, this method will return true for hex strings that
 * meet the length requirement of a hex address, but are not prefixed with `0x`
 * Finally, if the mixedCaseUseChecksum flag is true and a mixed case string is
 * provided this method will validate it has the proper checksum formatting.
 * @param {string} possibleAddress - Input parameter to check against
 * @param {Object} [options] - options bag
 * @param {boolean} [options.allowNonPrefixed] - If true will first ensure '0x'
 *  is prepended to the string
 * @returns {boolean} whether or not the input is a valid hex address
 */
export declare function isValidHexAddress(possibleAddress: string, { allowNonPrefixed }?: {
    allowNonPrefixed?: boolean | undefined;
}): boolean;
/**
 * Validates a Transaction object for required properties and throws in
 * the event of any validation error.
 *
 * @param transaction - Transaction object to validate
 */
export declare function validateTransaction(transaction: Transaction): void;
/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex
 * @returns - A hex string conversion of the buffer data
 *
 */
export declare function normalizeMessageData(data: string): string;
/**
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate
 */
export declare function validateSignMessageData(messageData: PersonalMessageParams | MessageParams): void;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate
 * @param activeChainId - Active chain id
 */
export declare function validateTypedSignMessageDataV1(messageData: TypedMessageParams): void;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V3.
 *
 * @param messageData - TypedMessageParams object to validate
 */
export declare function validateTypedSignMessageDataV3(messageData: TypedMessageParams): void;
/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate
 */
export declare function validateTokenToWatch(token: Token): void;
/**
 * Returns wether the given code corresponds to a smart contract
 *
 * @returns {string} - Corresponding code to review
 */
export declare function isSmartContractCode(code: string): boolean;
/**
 * Execute fetch and verify that the response was successful
 *
 * @param request - Request information
 * @param options - Options
 * @returns - Promise resolving to the fetch response
 */
export declare function successfulFetch(request: string, options?: RequestInit): Promise<Response>;
/**
 * Execute fetch and return object response
 *
 * @param request - Request information
 * @param options - Options
 * @returns - Promise resolving to the result object of fetch
 */
export declare function handleFetch(request: string, options?: RequestInit): Promise<any>;
/**
 * Fetch that fails after timeout
 *
 * @param url - Url to fetch
 * @param options - Options to send with the request
 * @param timeout - Timeout to fail request
 *
 * @returns - Promise resolving the request
 */
export declare function timeoutFetch(url: string, options?: RequestInit, timeout?: number): Promise<Response>;
/**
 * Normalizes the given ENS name.
 *
 * @param {string} ensName - The ENS name
 *
 * @returns - the normalized ENS name string
 */
export declare function normalizeEnsName(ensName: string): string | null;
/**
 * Wrapper method to handle EthQuery requests
 *
 * @param ethQuery - EthQuery object initialized with a provider
 * @param method - Method to request
 * @param args - Arguments to send
 *
 * @returns - Promise resolving the request
 */
export declare function query(ethQuery: any, method: string, args?: any[]): Promise<any>;
declare const _default: {
    BNToHex: typeof BNToHex;
    fractionBN: typeof fractionBN;
    query: typeof query;
    getBuyURL: typeof getBuyURL;
    handleFetch: typeof handleFetch;
    hexToBN: typeof hexToBN;
    hexToText: typeof hexToText;
    isSmartContractCode: typeof isSmartContractCode;
    normalizeTransaction: typeof normalizeTransaction;
    safelyExecute: typeof safelyExecute;
    safelyExecuteWithTimeout: typeof safelyExecuteWithTimeout;
    successfulFetch: typeof successfulFetch;
    timeoutFetch: typeof timeoutFetch;
    validateTokenToWatch: typeof validateTokenToWatch;
    validateTransaction: typeof validateTransaction;
    validateTypedSignMessageDataV1: typeof validateTypedSignMessageDataV1;
    validateTypedSignMessageDataV3: typeof validateTypedSignMessageDataV3;
};
export default _default;
