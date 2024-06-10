import { convertHexToDecimal } from '@metamask/controller-utils';
import {
  add0x,
  getKnownPropertyNames,
  isStrictHexString,
} from '@metamask/utils';
import type { Json } from '@metamask/utils';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from '../TransactionController';
import { TransactionStatus } from '../types';
import type {
  TransactionParams,
  TransactionMeta,
  TransactionError,
} from '../types';

export const ESTIMATE_GAS_ERROR = 'eth_estimateGas rpc method error';

// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NORMALIZERS: { [param in keyof TransactionParams]: any } = {
  data: (data: string) => add0x(padHexToEvenLength(data)),
  from: (from: string) => add0x(from).toLowerCase(),
  gas: (gas: string) => add0x(gas),
  gasLimit: (gas: string) => add0x(gas),
  gasPrice: (gasPrice: string) => add0x(gasPrice),
  nonce: (nonce: string) => add0x(nonce),
  to: (to: string) => add0x(to).toLowerCase(),
  value: (value: string) => add0x(value),
  maxFeePerGas: (maxFeePerGas: string) => add0x(maxFeePerGas),
  maxPriorityFeePerGas: (maxPriorityFeePerGas: string) =>
    add0x(maxPriorityFeePerGas),
  estimatedBaseFee: (maxPriorityFeePerGas: string) =>
    add0x(maxPriorityFeePerGas),
  type: (type: string) => add0x(type),
};

/**
 * Normalizes properties on transaction params.
 *
 * @param txParams - The transaction params to normalize.
 * @returns Normalized transaction params.
 */
export function normalizeTransactionParams(txParams: TransactionParams) {
  const normalizedTxParams: TransactionParams = { from: '' };

  for (const key of getKnownPropertyNames(NORMALIZERS)) {
    if (txParams[key]) {
      normalizedTxParams[key] = NORMALIZERS[key](txParams[key]);
    }
  }

  if (!normalizedTxParams.value) {
    normalizedTxParams.value = '0x0';
  }

  return normalizedTxParams;
}

/**
 * Checks if a transaction is EIP-1559 by checking for the existence of
 * maxFeePerGas and maxPriorityFeePerGas within its parameters.
 *
 * @param txParams - Transaction params object to add.
 * @returns Boolean that is true if the transaction is EIP-1559 (has maxFeePerGas and maxPriorityFeePerGas), otherwise returns false.
 */
export function isEIP1559Transaction(txParams: TransactionParams): boolean {
  const hasOwnProp = (obj: TransactionParams, key: string) =>
    Object.prototype.hasOwnProperty.call(obj, key);
  return (
    hasOwnProp(txParams, 'maxFeePerGas') &&
    hasOwnProp(txParams, 'maxPriorityFeePerGas')
  );
}

export const validateGasValues = (
  gasValues: GasPriceValue | FeeMarketEIP1559Values,
) => {
  Object.keys(gasValues).forEach((key) => {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (gasValues as any)[key];
    if (typeof value !== 'string' || !isStrictHexString(value)) {
      throw new TypeError(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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
  add0x(`${parseInt(`${value * rate}`, 10).toString(16)}`);

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
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  const errorMsg = `The proposed value: ${proposedDecimal} should meet or exceed the minimum value: ${minDecimal}`;
  throw new Error(errorMsg);
}

/**
 * Validates that a transaction is unapproved.
 * Throws if the transaction is not unapproved.
 *
 * @param transactionMeta - The transaction metadata to check.
 * @param fnName - The name of the function calling this helper.
 */
export function validateIfTransactionUnapproved(
  transactionMeta: TransactionMeta | undefined,
  fnName: string,
) {
  if (transactionMeta?.status !== TransactionStatus.unapproved) {
    throw new Error(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `TransactionsController: Can only call ${fnName} on an unapproved transaction.\n      Current tx status: ${transactionMeta?.status}`,
    );
  }
}

/**
 * Normalizes properties on transaction params.
 *
 * @param error - The error to be normalize.
 * @returns Normalized transaction error.
 */
export function normalizeTxError(
  error: Error & { code?: string; value?: unknown },
): TransactionError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    rpc: isJsonCompatible(error.value) ? error.value : undefined,
  };
}

/**
 * Normalize an object containing gas fee values.
 *
 * @param gasFeeValues - An object containing gas fee values.
 * @returns An object containing normalized gas fee values.
 */
export function normalizeGasFeeValues(
  gasFeeValues: GasPriceValue | FeeMarketEIP1559Values,
): GasPriceValue | FeeMarketEIP1559Values {
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalize = (value: any) =>
    typeof value === 'string' ? add0x(value) : value;

  if ('gasPrice' in gasFeeValues) {
    return {
      gasPrice: normalize(gasFeeValues.gasPrice),
    };
  }

  return {
    maxFeePerGas: normalize(gasFeeValues.maxFeePerGas),
    maxPriorityFeePerGas: normalize(gasFeeValues.maxPriorityFeePerGas),
  };
}

/**
 * Determines whether the given value can be encoded as JSON.
 *
 * @param value - The value.
 * @returns True if the value is JSON-encodable, false if not.
 */
function isJsonCompatible(value: unknown): value is Json {
  try {
    JSON.parse(JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a hex string is of even length by adding a leading 0 if necessary.
 * Any existing `0x` prefix is preserved but is not added if missing.
 *
 * @param hex - The hex string to ensure is even.
 * @returns The hex string with an even length.
 */
export function padHexToEvenLength(hex: string) {
  const prefix = hex.toLowerCase().startsWith('0x') ? hex.slice(0, 2) : '';
  const data = prefix ? hex.slice(2) : hex;
  const evenData = data.length % 2 === 0 ? data : `0${data}`;

  return prefix + evenData;
}
