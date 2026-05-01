import type { AccessList, AuthorizationList } from '@ethereumjs/common';
import { toHex } from '@metamask/controller-utils';
import type { Hex, Json } from '@metamask/utils';
import {
  add0x,
  getKnownPropertyNames,
  isCaipChainId,
  isStrictHexString,
  parseCaipChainId,
} from '@metamask/utils';
import BN from 'bn.js';

import type {
  FeeMarketEIP1559Values,
  GasPriceValue,
  TransactionError,
  TransactionMeta,
  TransactionParams,
} from '../types';
import { TransactionEnvelopeType, TransactionStatus } from '../types';

export const ESTIMATE_GAS_ERROR = 'eth_estimateGas rpc method error';

// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NORMALIZERS: { [param in keyof TransactionParams]: any } = {
  accessList: (accessList?: AccessList) => accessList,
  authorizationList: (authorizationList?: AuthorizationList) =>
    authorizationList,
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
export function normalizeTransactionParams(
  txParams: TransactionParams,
): TransactionParams {
  const normalizedTxParams: TransactionParams = { from: '' };

  for (const key of getKnownPropertyNames(NORMALIZERS)) {
    if (txParams[key]) {
      normalizedTxParams[key] = NORMALIZERS[key](txParams[key]);
    }
  }

  normalizedTxParams.value ??= '0x0';

  if (normalizedTxParams.gasLimit && !normalizedTxParams.gas) {
    normalizedTxParams.gas = normalizedTxParams.gasLimit;
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
  const hasOwnProp = (obj: TransactionParams, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(obj, key);
  return (
    hasOwnProp(txParams, 'maxFeePerGas') &&
    hasOwnProp(txParams, 'maxPriorityFeePerGas')
  );
}

export const validateGasValues = (
  gasValues: GasPriceValue | FeeMarketEIP1559Values,
): void => {
  Object.keys(gasValues).forEach((key) => {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (gasValues as any)[key];
    if (typeof value !== 'string' || !isStrictHexString(value)) {
      throw new TypeError(
        `expected hex string for ${key} but received: ${value}`,
      );
    }
  });
};

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
): void {
  if (transactionMeta?.status !== TransactionStatus.unapproved) {
    throw new Error(
      `TransactionsController: Can only call ${fnName} on an unapproved transaction.\n      Current tx status: ${transactionMeta?.status}`,
    );
  }
}

/**
 * Validates that a transaction is unapproved or submitted.
 * Throws if the transaction is not unapproved or submitted.
 *
 * @param transactionMeta - The transaction metadata to check.
 * @param fnName - The name of the function calling this helper.
 */
export function validateIfTransactionUnapprovedOrSubmitted(
  transactionMeta: TransactionMeta | undefined,
  fnName: string,
): void {
  const allowedStatuses = [
    TransactionStatus.unapproved,
    TransactionStatus.submitted,
  ];
  if (!transactionMeta || !allowedStatuses.includes(transactionMeta.status)) {
    throw new Error(
      `TransactionsController: Can only call ${fnName} on an unapproved or submitted transaction.\n      Current tx status: ${transactionMeta?.status}`,
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
  const normalize = (value: any): string =>
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
 * @param hexValue - The hex string to ensure is even.
 * @returns The hex string with an even length.
 */
export function padHexToEvenLength(hexValue: string): string {
  const prefix = hexValue.toLowerCase().startsWith('0x')
    ? hexValue.slice(0, 2)
    : '';
  const data = prefix ? hexValue.slice(2) : hexValue;
  const evenData = data.length % 2 === 0 ? data : `0${data}`;

  return prefix + evenData;
}

/**
 * Create a BN from a hex string, accepting an optional 0x prefix.
 *
 * @param hexValue - Hex string with or without 0x prefix.
 * @returns BN parsed as base-16.
 */
export function bnFromHex(hexValue: string | Hex): BN {
  const str = typeof hexValue === 'string' ? hexValue : (hexValue as string);
  const withoutPrefix =
    str.startsWith('0x') || str.startsWith('0X') ? str.slice(2) : str;
  if (withoutPrefix.length === 0) {
    return new BN(0);
  }
  return new BN(withoutPrefix, 16);
}

/**
 * Convert various numeric-like values to a BN instance.
 * Accepts BN, ethers BigNumber, hex string, bigint, or number.
 *
 * @param value - The value to convert.
 * @returns BN representation of the input value.
 */
export function toBN(value: unknown): BN {
  if (value instanceof BN) {
    return value;
  }
  if (
    typeof (BN as unknown as { isBN?: (v: unknown) => boolean }).isBN ===
      'function' &&
    (BN as unknown as { isBN: (v: unknown) => boolean }).isBN(value)
  ) {
    return value as BN;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toHexString?: () => string }).toHexString === 'function'
  ) {
    return bnFromHex((value as { toHexString: () => string }).toHexString());
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { _hex?: string })._hex === 'string'
  ) {
    return bnFromHex((value as { _hex: string })._hex);
  }
  if (typeof value === 'string') {
    return bnFromHex(value);
  }
  if (typeof value === 'bigint') {
    return new BN(value.toString());
  }
  if (typeof value === 'number') {
    return new BN(value);
  }
  throw new Error('Unexpected value returned from oracle contract');
}

/**
 * Calculate the absolute percentage change between two values.
 *
 * @param originalValue - The first value.
 * @param newValue - The second value.
 * @returns The percentage change from the first value to the second value.
 * If the original value is zero and the new value is not, returns 100.
 */
export function getPercentageChange(originalValue: BN, newValue: BN): number {
  const precisionFactor = new BN(10).pow(new BN(18));
  const originalValuePrecision = originalValue.mul(precisionFactor);
  const newValuePrecision = newValue.mul(precisionFactor);

  const difference = newValuePrecision.sub(originalValuePrecision);

  if (difference.isZero()) {
    return 0;
  }

  if (originalValuePrecision.isZero() && !newValuePrecision.isZero()) {
    return 100;
  }

  return difference.muln(100).div(originalValuePrecision).abs().toNumber();
}

/**
 * Sets the envelope type for the given transaction parameters based on the
 * current network's EIP-1559 compatibility and the transaction parameters.
 *
 * @param txParams - The transaction parameters to set the envelope type for.
 * @param isEIP1559Compatible - Indicates if the current network supports EIP-1559.
 */
export function setEnvelopeType(
  txParams: TransactionParams,
  isEIP1559Compatible: boolean,
): void {
  if (txParams.accessList) {
    txParams.type = TransactionEnvelopeType.accessList;
  } else if (txParams.authorizationList) {
    txParams.type = TransactionEnvelopeType.setCode;
  } else {
    txParams.type = isEIP1559Compatible
      ? TransactionEnvelopeType.feeMarket
      : TransactionEnvelopeType.legacy;
  }
}

/**
 * Convert CAIP-2 chain ID to hex format.
 *
 * @param caip2ChainId - Chain ID in CAIP-2 format (e.g., 'eip155:1')
 * @returns Hex chain ID (e.g., '0x1') or undefined if invalid format
 */
export function caip2ToHex(caip2ChainId: string): Hex | undefined {
  if (!isCaipChainId(caip2ChainId)) {
    return undefined;
  }
  try {
    const { reference } = parseCaipChainId(caip2ChainId);
    return toHex(reference);
  } catch {
    return undefined;
  }
}
