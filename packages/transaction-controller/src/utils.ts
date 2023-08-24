import {
  convertHexToDecimal,
  isValidHexAddress,
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { ethErrors } from 'eth-rpc-errors';
import { addHexPrefix, isHexString } from 'ethereumjs-util';
import type { Transaction as NonceTrackerTransaction } from 'nonce-tracker/dist/NonceTracker';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';
import { TransactionStatus } from './types';
import type { Transaction, TransactionMeta } from './types';

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
 * Normalizes gasUsed property if not string.
 *
 * @param gasUsed - gasUsed property.
 * @returns String of gasUsed.
 */
export function normalizeTxReceiptGasUsed(gasUsed) {
  return typeof gasUsed === 'string' ? gasUsed : gasUsed.toString(16);
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

/**
 * Helper function to filter and format transactions for the nonce tracker.
 *
 * @param fromAddress - Address of the account from which the transactions to filter from are sent.
 * @param transactionStatus - Status of the transactions for which to filter.
 * @param transactions - Array of transactionMeta objects that have been prefiltered.
 * @returns Array of transactions formatted for the nonce tracker.
 */
export function getAndFormatTransactionsForNonceTracker(
  fromAddress: string,
  transactionStatus: TransactionStatus,
  transactions: TransactionMeta[],
): NonceTrackerTransaction[] {
  return transactions
    .filter(
      ({ status, transaction: { from } }) =>
        status === transactionStatus &&
        from.toLowerCase() === fromAddress.toLowerCase(),
    )
    .map(({ status, transaction: { from, gas, value, nonce } }) => {
      // the only value we care about is the nonce
      // but we need to return the other values to satisfy the type
      // TODO: refactor nonceTracker to not require this
      return {
        status,
        history: [{}],
        txParams: {
          from: from ?? '',
          gas: gas ?? '',
          value: value ?? '',
          nonce: nonce ?? '',
        },
      };
    });
}

/**
 * Checks whether a given transaction matches the specified network or chain ID.
 * This function is used to determine if a transaction is relevant to the current network or chain.
 *
 * @param transaction - The transaction metadata to check.
 * @param chainId - The chain ID of the current network.
 * @param networkId - The network ID of the current network.
 * @returns A boolean value indicating whether the transaction matches the current network or chain ID.
 */
export function transactionMatchesNetwork(
  transaction: TransactionMeta,
  chainId: Hex,
  networkId: string | null,
) {
  if (transaction.chainId) {
    return transaction.chainId === chainId;
  }
  if (transaction.networkID) {
    return transaction.networkID === networkId;
  }
  return false;
}

/**
 * Checks whether the provided address is strictly equal to the address for
 * the default swaps token of the provided chain.
 *
 * @param address - The string to compare to the default token address
 * @param chainId - The hex encoded chain ID of the default swaps token to check
 * @returns A boolean whether the address is the provided chain's default token address
 */
export function isSwapsDefaultTokenAddress(address?: string, chainId?: Hex) {
  if (!address || !chainId) {
    return false;
  }
  return address === SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId]?.address;
}

/**
 * Validates the external provided transaction meta.
 *
 * @param transactionMeta - The transaction meta to validate.
 * @param confirmedTxs - The confirmed transactions in controller state.
 * @param pendingTxs - The submitted transactions in controller state.
 */
export function validateConfirmedExternalTransaction(
  transactionMeta: TransactionMeta,
  confirmedTxs: TransactionMeta[],
  pendingTxs: TransactionMeta[],
) {
  if (!transactionMeta || !transactionMeta.transaction) {
    throw ethErrors.rpc.invalidParams(
      '"transactionMeta" or "transactionMeta.transaction" is missing',
    );
  }

  if (transactionMeta.status !== TransactionStatus.confirmed) {
    throw ethErrors.rpc.invalidParams(
      'External transaction status should be "confirmed"',
    );
  }

  const externalTxNonce = transactionMeta.transaction.nonce;
  if (pendingTxs && pendingTxs.length > 0) {
    const foundPendingTxByNonce = pendingTxs.find(
      (tx) => tx.transaction?.nonce === externalTxNonce,
    );
    if (foundPendingTxByNonce) {
      throw ethErrors.rpc.invalidParams(
        'External transaction nonce should not be in pending txs',
      );
    }
  }

  if (confirmedTxs && confirmedTxs.length > 0) {
    const foundConfirmedTxByNonce = confirmedTxs.find(
      (tx) => tx.txParams?.nonce === externalTxNonce,
    );
    if (foundConfirmedTxByNonce) {
      throw ethErrors.rpc.invalidParams(
        'External transaction nonce should not be in confirmed txs',
      );
    }
  }
}
