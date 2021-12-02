import {
  addHexPrefix,
  isValidAddress,
  isHexString,
  bufferToHex,
  BN,
  toChecksumAddress,
} from 'ethereumjs-util';
import { stripHexPrefix } from 'ethjs-util';
import { fromWei, toWei } from 'ethjs-unit';
import { ethErrors } from 'eth-rpc-errors';
import ensNamehash from 'eth-ens-namehash';
import { TYPED_MESSAGE_SCHEMA, typedSignatureHash } from 'eth-sig-util';
import { validate } from 'jsonschema';
import { CID } from 'multiformats/cid';
import {
  Transaction,
  FetchAllOptions,
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './transaction/TransactionController';
import { MessageParams } from './message-manager/MessageManager';
import { PersonalMessageParams } from './message-manager/PersonalMessageManager';
import { TypedMessageParams } from './message-manager/TypedMessageManager';
import { Token } from './assets/TokenRatesController';
import { MAINNET } from './constants';

const hexRe = /^[0-9A-Fa-f]+$/gu;

const NORMALIZERS: { [param in keyof Transaction]: any } = {
  data: (data: string) => addHexPrefix(data),
  from: (from: string) => addHexPrefix(from).toLowerCase(),
  gas: (gas: string) => addHexPrefix(gas),
  gasPrice: (gasPrice: string) => addHexPrefix(gasPrice),
  nonce: (nonce: string) => addHexPrefix(nonce),
  to: (to: string) => addHexPrefix(to).toLowerCase(),
  value: (value: string) => addHexPrefix(value),
  maxFeePerGas: (maxFeePerGas: string) => addHexPrefix(maxFeePerGas),
  maxPriorityFeePerGas: (maxPriorityFeePerGas: string) =>
    addHexPrefix(maxPriorityFeePerGas),
  estimatedBaseFee: (maxPriorityFeePerGas: string) =>
    addHexPrefix(maxPriorityFeePerGas),
};

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
 * Handles the fetch of incoming transactions.
 *
 * @param networkType - Network type of desired network.
 * @param address - Address to get the transactions from.
 * @param txHistoryLimit - The maximum number of transactions to fetch.
 * @param opt - Object that can contain fromBlock and Etherscan service API key.
 * @returns Responses for both ETH and ERC20 token transactions.
 */
export async function handleTransactionFetch(
  networkType: string,
  address: string,
  txHistoryLimit: number,
  opt?: FetchAllOptions,
): Promise<[{ [result: string]: [] }, { [result: string]: [] }]> {
  // transactions
  const urlParams = {
    module: 'account',
    address,
    startBlock: opt?.fromBlock,
    apikey: opt?.etherscanApiKey,
    offset: txHistoryLimit.toString(),
    order: 'desc',
  };
  const etherscanTxUrl = getEtherscanApiUrl(networkType, {
    ...urlParams,
    action: 'txlist',
  });
  const etherscanTxResponsePromise = handleFetch(etherscanTxUrl);

  // tokens
  const etherscanTokenUrl = getEtherscanApiUrl(networkType, {
    ...urlParams,
    action: 'tokentx',
  });
  const etherscanTokenResponsePromise = handleFetch(etherscanTokenUrl);

  let [etherscanTxResponse, etherscanTokenResponse] = await Promise.all([
    etherscanTxResponsePromise,
    etherscanTokenResponsePromise,
  ]);

  if (
    etherscanTxResponse.status === '0' ||
    etherscanTxResponse.result.length <= 0
  ) {
    etherscanTxResponse = { status: etherscanTxResponse.status, result: [] };
  }

  if (
    etherscanTokenResponse.status === '0' ||
    etherscanTokenResponse.result.length <= 0
  ) {
    etherscanTokenResponse = {
      status: etherscanTokenResponse.status,
      result: [],
    };
  }

  return [etherscanTxResponse, etherscanTokenResponse];
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
 * Normalizes properties on a Transaction object.
 *
 * @param transaction - Transaction object to normalize.
 * @returns Normalized Transaction object.
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
 * Execute and return an asynchronous operation without throwing errors.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @param retry - Function called if an error is caught.
 * @returns Promise resolving to the result of the async operation.
 */
export async function safelyExecute(
  operation: () => Promise<any>,
  logError = false,
  retry?: (error: Error) => void,
) {
  try {
    return await operation();
  } catch (error) {
    /* istanbul ignore next */
    if (logError) {
      console.error(error);
    }
    retry?.(error);
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
          reject(new Error('timeout'));
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
 * Validates a Transaction object for required properties and throws in
 * the event of any validation error.
 *
 * @param transaction - Transaction object to validate.
 */
export function validateTransaction(transaction: Transaction) {
  if (
    !transaction.from ||
    typeof transaction.from !== 'string' ||
    !isValidHexAddress(transaction.from)
  ) {
    throw new Error(
      `Invalid "from" address: ${transaction.from} must be a valid string.`,
    );
  }

  if (transaction.to === '0x' || transaction.to === undefined) {
    if (transaction.data) {
      delete transaction.to;
    } else {
      throw new Error(
        `Invalid "to" address: ${transaction.to} must be a valid string.`,
      );
    }
  } else if (
    transaction.to !== undefined &&
    !isValidHexAddress(transaction.to)
  ) {
    throw new Error(
      `Invalid "to" address: ${transaction.to} must be a valid string.`,
    );
  }

  if (transaction.value !== undefined) {
    const value = transaction.value.toString();
    if (value.includes('-')) {
      throw new Error(`Invalid "value": ${value} is not a positive number.`);
    }

    if (value.includes('.')) {
      throw new Error(
        `Invalid "value": ${value} number must be denominated in wei.`,
      );
    }
    const intValue = parseInt(transaction.value, 10);
    const isValid =
      Number.isFinite(intValue) &&
      !Number.isNaN(intValue) &&
      !isNaN(Number(value)) &&
      Number.isSafeInteger(intValue);
    if (!isValid) {
      throw new Error(
        `Invalid "value": ${value} number must be a valid number.`,
      );
    }
  }
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
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
export function validateSignMessageData(
  messageData: PersonalMessageParams | MessageParams,
) {
  const { from, data } = messageData;
  if (!from || typeof from !== 'string' || !isValidHexAddress(from)) {
    throw new Error(`Invalid "from" address: ${from} must be a valid string.`);
  }

  if (!data || typeof data !== 'string') {
    throw new Error(`Invalid message "data": ${data} must be a valid string.`);
  }
}

/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
export function validateTypedSignMessageDataV1(
  messageData: TypedMessageParams,
) {
  if (
    !messageData.from ||
    typeof messageData.from !== 'string' ||
    !isValidHexAddress(messageData.from)
  ) {
    throw new Error(
      `Invalid "from" address: ${messageData.from} must be a valid string.`,
    );
  }

  if (!messageData.data || !Array.isArray(messageData.data)) {
    throw new Error(
      `Invalid message "data": ${messageData.data} must be a valid array.`,
    );
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
 * @param messageData - TypedMessageParams object to validate.
 */
export function validateTypedSignMessageDataV3(
  messageData: TypedMessageParams,
) {
  if (
    !messageData.from ||
    typeof messageData.from !== 'string' ||
    !isValidHexAddress(messageData.from)
  ) {
    throw new Error(
      `Invalid "from" address: ${messageData.from} must be a valid string.`,
    );
  }

  if (!messageData.data || typeof messageData.data !== 'string') {
    throw new Error(
      `Invalid message "data": ${messageData.data} must be a valid array.`,
    );
  }
  let data;
  try {
    data = JSON.parse(messageData.data);
  } catch (e) {
    throw new Error('Data must be passed as a valid JSON string.');
  }
  const validation = validate(data, TYPED_MESSAGE_SCHEMA);
  if (validation.errors.length > 0) {
    throw new Error(
      'Data must conform to EIP-712 schema. See https://git.io/fNtcx.',
    );
  }
}

/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate.
 */
export function validateTokenToWatch(token: Token) {
  const { address, symbol, decimals } = token;
  if (!address || !symbol || typeof decimals === 'undefined') {
    throw ethErrors.rpc.invalidParams(
      `Must specify address, symbol, and decimals.`,
    );
  }

  if (typeof symbol !== 'string') {
    throw ethErrors.rpc.invalidParams(`Invalid symbol: not a string.`);
  }

  if (symbol.length > 11) {
    throw ethErrors.rpc.invalidParams(
      `Invalid symbol "${symbol}": longer than 11 characters.`,
    );
  }
  const numDecimals = parseInt((decimals as unknown) as string, 10);
  if (isNaN(numDecimals) || numDecimals > 36 || numDecimals < 0) {
    throw ethErrors.rpc.invalidParams(
      `Invalid decimals "${decimals}": must be 0 <= 36.`,
    );
  }

  if (!isValidHexAddress(address)) {
    throw ethErrors.rpc.invalidParams(`Invalid address "${address}".`);
  }
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
        reject(new Error('timeout'));
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
    ethQuery[method](...args, (error: Error, result: any) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Checks if a transaction is EIP-1559 by checking for the existence of
 * maxFeePerGas and maxPriorityFeePerGas within its parameters.
 *
 * @param transaction - Transaction object to add.
 * @returns Boolean that is true if the transaction is EIP-1559 (has maxFeePerGas and maxPriorityFeePerGas), otherwise returns false.
 */
export const isEIP1559Transaction = (transaction: Transaction): boolean => {
  const hasOwnProp = (obj: Transaction, key: string) =>
    Object.prototype.hasOwnProperty.call(obj, key);
  return (
    hasOwnProp(transaction, 'maxFeePerGas') &&
    hasOwnProp(transaction, 'maxPriorityFeePerGas')
  );
};

export const convertPriceToDecimal = (value: string | undefined): number =>
  parseInt(value === undefined ? '0x0' : value, 16);

export const getIncreasedPriceHex = (value: number, rate: number): string =>
  addHexPrefix(`${parseInt(`${value * rate}`, 10).toString(16)}`);

export const getIncreasedPriceFromExisting = (
  value: string | undefined,
  rate: number,
): string => {
  return getIncreasedPriceHex(convertPriceToDecimal(value), rate);
};

export const validateGasValues = (
  gasValues: GasPriceValue | FeeMarketEIP1559Values,
) => {
  Object.keys(gasValues).forEach((key) => {
    const value = (gasValues as any)[key];
    if (typeof value !== 'string' || !isHexString(value)) {
      throw new TypeError(
        `expected hex string for ${key} but received: ${value}`,
      );
    }
  });
};

export const isFeeMarketEIP1559Values = (
  gasValues?: GasPriceValue | FeeMarketEIP1559Values,
): gasValues is FeeMarketEIP1559Values =>
  (gasValues as FeeMarketEIP1559Values)?.maxFeePerGas !== undefined ||
  (gasValues as FeeMarketEIP1559Values)?.maxPriorityFeePerGas !== undefined;

export const isGasPriceValue = (
  gasValues?: GasPriceValue | FeeMarketEIP1559Values,
): gasValues is GasPriceValue =>
  (gasValues as GasPriceValue)?.gasPrice !== undefined;

/**
 * Validates that the proposed value is greater than or equal to the minimum value.
 *
 * @param proposed - The proposed value.
 * @param min - The minimum value.
 * @returns The proposed value.
 * @throws Will throw if the proposed value is too low.
 */
export function validateMinimumIncrease(proposed: string, min: string) {
  const proposedDecimal = convertPriceToDecimal(proposed);
  const minDecimal = convertPriceToDecimal(min);
  if (proposedDecimal >= minDecimal) {
    return proposed;
  }
  const errorMsg = `The proposed value: ${proposedDecimal} should meet or exceed the minimum value: ${minDecimal}`;
  throw new Error(errorMsg);
}

export function removeIpfsProtocolPrefix(ipfsUrl: string) {
  if (ipfsUrl.startsWith('ipfs://ipfs/')) {
    return ipfsUrl.replace('ipfs://ipfs/', '');
  } else if (ipfsUrl.startsWith('ipfs://')) {
    return ipfsUrl.replace('ipfs://', '');
  } else {
    // this method should not be used with non-ipfs urls (i.e. startsWith('ipfs://') === true)
    throw new Error('this method should not be used with non ipfs urls');
  }
}

/**
 * Extracts content identifier from ipfs url.
 *
 * @param ipfsUrl - ipfs url
 * @returns Ipfs content identifier as string and path as string.
 * @throws Will throw if the url passed is not ipfs.
 */
export function getIpfsCIDv1AndPath(
  ipfsUrl: string,
): { cid: string; path?: string } {
  const url = removeIpfsProtocolPrefix(ipfsUrl);

  // check if there is a path
  // (CID is everything preceding first forward slash, path is everything after)
  const index = url.indexOf('/');
  const cid = index !== -1 ? url.substring(0, index) : url;
  const path = index !== -1 ? url.substring(index) : '';

  // we want to ensure that the CID is v1 (https://docs.ipfs.io/concepts/content-addressing/#identifier-formats)
  return {
    cid: CID.parse(cid).toV1().toString(),
    path,
  };
}

/**
 * Adds URL protocol prefix to url string if missing.
 *
 * @param urlString - Ipfs url.
 * @returns string.
 */
export function addUrlProtocolPrefix(urlString: string): string {
  if (!urlString.match(/(^http:\/\/)|(^https:\/\/)/u)) {
    return `https://${urlString}`;
  }
  return urlString;
}

/**
 * Formats url correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - the user preferred ipfsGateway.
 * @param contentIdentifier - the asset's cid.
 * @param path - optional sub path
 * @returns string.
 */
// export function getFormattedIpfsURL(
//   ipfsGateway: string,
//   contentIdentifier: string,
//   path?: string,
// ) {
//   const gatewayHost = new URL(addUrlProtocolPrefix(ipfsGateway));
//   return `https://${contentIdentifier}.ipfs.${gatewayHost.host}${path ?? ''}`;
// }

/**
 * Formats url correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - the user preferred ipfsGateway.
 * @param ipfsUrl - the ipfs url pointed at the asset.
 * @param subdomainSupported - boolean indicating whether the url should be formatted with subdomains or not
 * @returns string.
 */
export function getFormattedIpfsUrl(
  ipfsGateway: string,
  ipfsUrl: string,
  subdomainSupported: boolean,
): string {
  if (subdomainSupported) {
    const gatewayHost = new URL(addUrlProtocolPrefix(ipfsGateway))?.host;
    const { cid, path } = getIpfsCIDv1AndPath(ipfsUrl);
    return `https://${cid}.ipfs.${gatewayHost}${path ?? ''}`;
  } else {
    const cidAndPath = removeIpfsProtocolPrefix(ipfsUrl);
    const gateway = ipfsGateway.endsWith('/ipfs/')
      ? ipfsGateway
      : `${ipfsGateway}/ipfs/`;
    return `${gateway}${cidAndPath}`;
  }
}
