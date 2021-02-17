import { addHexPrefix, isValidAddress, bufferToHex } from 'ethereumjs-util';
import { ethErrors } from 'eth-rpc-errors';
import { TYPED_MESSAGE_SCHEMA, typedSignatureHash } from 'eth-sig-util';
import { Transaction, FetchAllOptions } from './transaction/TransactionController';
import { MessageParams } from './message-manager/MessageManager';
import { PersonalMessageParams } from './message-manager/PersonalMessageManager';
import { TypedMessageParams } from './message-manager/TypedMessageManager';
import { Token } from './assets/TokenRatesController';

const jsonschema = require('jsonschema');
const { BN, stripHexPrefix } = require('ethereumjs-util');
const ensNamehash = require('eth-ens-namehash');

const hexRe = /^[0-9A-Fa-f]+$/gu;

const NORMALIZERS: { [param in keyof Transaction]: any } = {
  data: (data: string) => addHexPrefix(data),
  from: (from: string) => addHexPrefix(from).toLowerCase(),
  gas: (gas: string) => addHexPrefix(gas),
  gasPrice: (gasPrice: string) => addHexPrefix(gasPrice),
  nonce: (nonce: string) => addHexPrefix(nonce),
  to: (to: string) => addHexPrefix(to).toLowerCase(),
  value: (value: string) => addHexPrefix(value),
};

/**
 * Converts a BN object to a hex string with a '0x' prefix
 *
 * @param inputBn - BN instance to convert to a hex string
 * @returns - '0x'-prefixed hex string
 *
 */
export function BNToHex(inputBn: any) {
  return addHexPrefix(inputBn.toString(16));
}

/**
 * Used to multiply a BN by a fraction
 *
 * @param targetBN - Number to multiply by a fraction
 * @param numerator - Numerator of the fraction multiplier
 * @param denominator - Denominator of the fraction multiplier
 * @returns - Product of the multiplication
 */
export function fractionBN(targetBN: any, numerator: number | string, denominator: number | string) {
  const numBN = new BN(numerator);
  const denomBN = new BN(denominator);
  return targetBN.mul(numBN).div(denomBN);
}

/**
 * Return a URL that can be used to obtain ETH for a given network
 *
 * @param networkCode - Network code of desired network
 * @param address - Address to deposit obtained ETH
 * @param amount - How much ETH is desired
 * @returns - URL to buy ETH based on network
 */
export function getBuyURL(networkCode = '1', address?: string, amount = 5) {
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
  }
}

/**
 * Return a URL that can be used to fetch ETH transactions
 *
 * @param networkType - Network type of desired network
 * @param address - Address to get the transactions from
 * @param fromBlock? - Block from which transactions are needed
 * @returns - URL to fetch the transactions from
 */
export function getEtherscanApiUrl(
  networkType: string,
  address: string,
  action: string,
  fromBlock?: string,
  etherscanApiKey?: string,
): string {
  let etherscanSubdomain = 'api';
  /* istanbul ignore next */
  if (networkType !== 'mainnet') {
    etherscanSubdomain = `api-${networkType}`;
  }
  const apiUrl = `https://${etherscanSubdomain}.etherscan.io`;
  let url = `${apiUrl}/api?module=account&action=${action}&address=${address}&tag=latest&page=1`;
  if (fromBlock) {
    url += `&startBlock=${fromBlock}`;
  }
  /* istanbul ignore next */
  if (etherscanApiKey) {
    url += `&apikey=${etherscanApiKey}`;
  }
  return url;
}

/**
 * Handles the fetch of incoming transactions
 *
 * @param networkType - Network type of desired network
 * @param address - Address to get the transactions from
 * @param opt? - Object that can contain fromBlock and Alethio service API key
 * @returns - Responses for both ETH and ERC20 token transactions
 */
export async function handleTransactionFetch(
  networkType: string,
  address: string,
  opt?: FetchAllOptions,
): Promise<[{ [result: string]: [] }, { [result: string]: [] }]> {
  // transactions
  const etherscanTxUrl = getEtherscanApiUrl(
    networkType,
    address,
    'txlist',
    opt && opt.fromBlock,
    opt && opt.etherscanApiKey,
  );
  const etherscanTxResponsePromise = handleFetch(etherscanTxUrl);

  // tokens
  const etherscanTokenUrl = getEtherscanApiUrl(
    networkType,
    address,
    'tokentx',
    opt && opt.fromBlock,
    opt && opt.etherscanApiKey,
  );
  const etherscanTokenResponsePromise = handleFetch(etherscanTokenUrl);

  let [etherscanTxResponse, etherscanTokenResponse] = await Promise.all([
    etherscanTxResponsePromise,
    etherscanTokenResponsePromise,
  ]);
  /* istanbul ignore next */
  if (etherscanTxResponse?.status === '0' || etherscanTxResponse?.result.length <= 0) {
    etherscanTxResponse = { result: [] };
  }
  /* istanbul ignore next */
  if (etherscanTokenResponse?.status === '0' || etherscanTokenResponse?.result.length <= 0) {
    etherscanTokenResponse = { result: [] };
  }

  return [etherscanTxResponse, etherscanTokenResponse];
}

/**
 * Converts a hex string to a BN object
 *
 * @param inputHex - Number represented as a hex string
 * @returns - A BN instance
 *
 */
export function hexToBN(inputHex: string) {
  return new BN(stripHexPrefix(inputHex), 16);
}

/**
 * A helper function that converts hex data to human readable string
 *
 * @param hex - The hex string to convert to string
 * @returns - A human readable string conversion
 *
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
 * Normalizes properties on a Transaction object
 *
 * @param transaction - Transaction object to normalize
 * @returns - Normalized Transaction object
 */
export function normalizeTransaction(transaction: Transaction) {
  const normalizedTransaction: Transaction = { from: '' };
  let key: keyof Transaction;
  for (key in NORMALIZERS) {
    if (transaction[key as keyof Transaction]) {
      normalizedTransaction[key] = NORMALIZERS[key](transaction[key]) as never;
    }
  }
  return normalizedTransaction;
}

/**
 * Execute and return an asynchronous operation without throwing errors
 *
 * @param operation - Function returning a Promise
 * @param logError - Determines if the error should be logged
 * @param retry - Function called if an error is caught
 * @returns - Promise resolving to the result of the async operation
 */
export async function safelyExecute(operation: () => Promise<any>, logError = false, retry?: (error: Error) => void) {
  try {
    return await operation();
  } catch (error) {
    /* istanbul ignore next */
    if (logError) {
      console.error(error);
    }
    retry && retry(error);
  }
}

/**
 * Execute and return an asynchronous operation with a timeout
 *
 * @param operation - Function returning a Promise
 * @param logError - Determines if the error should be logged
 * @param retry - Function called if an error is caught
 * @param timeout - Timeout to fail the operation
 * @returns - Promise resolving to the result of the async operation
 */
export async function safelyExecuteWithTimeout(operation: () => Promise<any>, logError = false, timeout = 500) {
  try {
    return await Promise.race([
      operation(),
      new Promise<void>((_, reject) =>
        setTimeout(() => {
          reject(new Error('timeout'));
        }, timeout),
      ),
    ]);
  } catch (error) {
    /* istanbul ignore next */
    if (logError) {
      console.error(error);
    }
  }
}

/**
 * Validates a Transaction object for required properties and throws in
 * the event of any validation error.
 *
 * @param transaction - Transaction object to validate
 */
export function validateTransaction(transaction: Transaction) {
  if (!transaction.from || typeof transaction.from !== 'string' || !isValidAddress(transaction.from)) {
    throw new Error(`Invalid "from" address: ${transaction.from} must be a valid string.`);
  }
  if (transaction.to === '0x' || transaction.to === undefined) {
    if (transaction.data) {
      delete transaction.to;
    } else {
      throw new Error(`Invalid "to" address: ${transaction.to} must be a valid string.`);
    }
  } else if (transaction.to !== undefined && !isValidAddress(transaction.to)) {
    throw new Error(`Invalid "to" address: ${transaction.to} must be a valid string.`);
  }
  if (transaction.value !== undefined) {
    const value = transaction.value.toString();
    if (value.includes('-')) {
      throw new Error(`Invalid "value": ${value} is not a positive number.`);
    }
    if (value.includes('.')) {
      throw new Error(`Invalid "value": ${value} number must be denominated in wei.`);
    }
    const intValue = parseInt(transaction.value, 10);
    const isValid =
      Number.isFinite(intValue) && !Number.isNaN(intValue) && !isNaN(Number(value)) && Number.isSafeInteger(intValue);
    if (!isValid) {
      throw new Error(`Invalid "value": ${value} number must be a valid number.`);
    }
  }
}

/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex
 * @returns - A hex string conversion of the buffer data
 *
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
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate
 */
export function validateSignMessageData(messageData: PersonalMessageParams | MessageParams) {
  if (!messageData.from || typeof messageData.from !== 'string' || !isValidAddress(messageData.from)) {
    throw new Error(`Invalid "from" address: ${messageData.from} must be a valid string.`);
  }
  if (!messageData.data || typeof messageData.data !== 'string') {
    throw new Error(`Invalid message "data": ${messageData.data} must be a valid string.`);
  }
}

/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate
 * @param activeChainId - Active chain id
 */
export function validateTypedSignMessageDataV1(messageData: TypedMessageParams) {
  if (!messageData.from || typeof messageData.from !== 'string' || !isValidAddress(messageData.from)) {
    throw new Error(`Invalid "from" address: ${messageData.from} must be a valid string.`);
  }
  if (!messageData.data || !Array.isArray(messageData.data)) {
    throw new Error(`Invalid message "data": ${messageData.data} must be a valid array.`);
  }
  try {
    // typedSignatureHash will throw if the data is invalid.
    typedSignatureHash(messageData.data as any);
  } catch (e) {
    throw new Error(`Expected EIP712 typed data.`);
  }
}

/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V3.
 *
 * @param messageData - TypedMessageParams object to validate
 */
export function validateTypedSignMessageDataV3(messageData: TypedMessageParams) {
  if (!messageData.from || typeof messageData.from !== 'string' || !isValidAddress(messageData.from)) {
    throw new Error(`Invalid "from" address: ${messageData.from} must be a valid string.`);
  }
  if (!messageData.data || typeof messageData.data !== 'string') {
    throw new Error(`Invalid message "data": ${messageData.data} must be a valid array.`);
  }
  let data;
  try {
    data = JSON.parse(messageData.data);
  } catch (e) {
    throw new Error('Data must be passed as a valid JSON string.');
  }
  const validation = jsonschema.validate(data, TYPED_MESSAGE_SCHEMA);
  if (validation.errors.length > 0) {
    throw new Error('Data must conform to EIP-712 schema. See https://git.io/fNtcx.');
  }
}

/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate
 */
export function validateTokenToWatch(token: Token) {
  const { address, symbol, decimals } = token;
  if (!address || !symbol || typeof decimals === 'undefined') {
    throw ethErrors.rpc.invalidParams(`Must specify address, symbol, and decimals.`);
  }
  if (typeof symbol !== 'string') {
    throw ethErrors.rpc.invalidParams(`Invalid symbol: not a string.`);
  }
  if (symbol.length > 6) {
    throw ethErrors.rpc.invalidParams(`Invalid symbol "${symbol}": longer than 6 characters.`);
  }
  const numDecimals = parseInt((decimals as unknown) as string, 10);
  if (isNaN(numDecimals) || numDecimals > 36 || numDecimals < 0) {
    throw ethErrors.rpc.invalidParams(`Invalid decimals "${decimals}": must be 0 <= 36.`);
  }
  if (!isValidAddress(address)) {
    throw ethErrors.rpc.invalidParams(`Invalid address "${address}".`);
  }
}

/**
 * Returns wether the given code corresponds to a smart contract
 *
 * @returns {string} - Corresponding code to review
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
 * Execute fetch and verify that the response was successful
 *
 * @param request - Request information
 * @param options - Options
 * @returns - Promise resolving to the fetch response
 */
export async function successfulFetch(request: string, options?: RequestInit) {
  const response = await fetch(request, options);
  if (!response.ok) {
    throw new Error(`Fetch failed with status '${response.status}' for request '${request}'`);
  }
  return response;
}

/**
 * Execute fetch and return object response
 *
 * @param request - Request information
 * @param options - Options
 * @returns - Promise resolving to the result object of fetch
 */
export async function handleFetch(request: string, options?: RequestInit) {
  const response = await successfulFetch(request, options);
  const object = await response.json();
  return object;
}

/**
 * Fetch that fails after timeout
 *
 * @param url - Url to fetch
 * @param options - Options to send with the request
 * @param timeout - Timeout to fail request
 *
 * @returns - Promise resolving the request
 */
export async function timeoutFetch(url: string, options?: RequestInit, timeout = 500): Promise<Response> {
  return Promise.race([
    successfulFetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => {
        reject(new Error('timeout'));
      }, timeout),
    ),
  ]);
}

/**
 * Normalizes the given ENS name.
 *
 * @param {string} ensName - The ENS name
 *
 * @returns - the normalized ENS name string
 */
export function normalizeEnsName(ensName: string): string | null {
  if (ensName && typeof ensName === 'string') {
    try {
      const normalized = ensNamehash.normalize(ensName.trim());
      // this regex is only sufficient with the above call to ensNamehash.normalize
      // TODO: change 7 in regex to 3 when shorter ENS domains are live
      // eslint-disable-next-line require-unicode-regexp
      if (normalized.match(/^(([\w\d\-]+)\.)*[\w\d\-]{7,}\.(eth|test)$/)) {
        return normalized;
      }
    } catch (_) {
      // do nothing
    }
  }
  return null;
}

/**
 * Wrapper method to handle EthQuery requests
 *
 * @param ethQuery - EthQuery object initialized with a provider
 * @param method - Method to request
 * @param args - Arguments to send
 *
 * @returns - Promise resolving the request
 */
export function query(ethQuery: any, method: string, args: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    ethQuery[method](...args, (error: Error, result: any) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

export default {
  BNToHex,
  fractionBN,
  query,
  getBuyURL,
  handleFetch,
  hexToBN,
  hexToText,
  isSmartContractCode,
  normalizeTransaction,
  safelyExecute,
  safelyExecuteWithTimeout,
  successfulFetch,
  timeoutFetch,
  validateTokenToWatch,
  validateTransaction,
  validateTypedSignMessageDataV1,
  validateTypedSignMessageDataV3,
};
