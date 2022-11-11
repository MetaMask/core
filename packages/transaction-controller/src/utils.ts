import { addHexPrefix, isHexString } from 'ethereumjs-util';
import {
  MAINNET,
  convertHexToDecimal,
  handleFetch,
  isValidHexAddress,
} from '@metamask/controller-utils';
import {
  Transaction,
  FetchAllOptions,
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';

export const ESTIMATE_GAS_ERROR = 'eth_estimateGas rpc method error';

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
