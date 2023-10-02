import {
  ORIGIN_METAMASK,
  convertHexToDecimal,
  isValidHexAddress,
} from '@metamask/controller-utils';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { addHexPrefix, isHexString } from 'ethereumjs-util';
import type { Transaction as NonceTrackerTransaction } from 'nonce-tracker/dist/NonceTracker';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';
import { TransactionStatus } from './types';
import type { TransactionParams, TransactionMeta } from './types';

export const ESTIMATE_GAS_ERROR = 'eth_estimateGas rpc method error';

const NORMALIZERS: { [param in keyof TransactionParams]: any } = {
  data: (data: string) => addHexPrefix(data),
  from: (from: string) => addHexPrefix(from).toLowerCase(),
  gas: (gas: string) => addHexPrefix(gas),
  gasLimit: (gas: string) => addHexPrefix(gas),
  gasPrice: (gasPrice: string) => addHexPrefix(gasPrice),
  nonce: (nonce: string) => addHexPrefix(nonce),
  to: (to: string) => addHexPrefix(to).toLowerCase(),
  value: (value: string) => addHexPrefix(value),
  maxFeePerGas: (maxFeePerGas: string) => addHexPrefix(maxFeePerGas),
  maxPriorityFeePerGas: (maxPriorityFeePerGas: string) =>
    addHexPrefix(maxPriorityFeePerGas),
  estimatedBaseFee: (maxPriorityFeePerGas: string) =>
    addHexPrefix(maxPriorityFeePerGas),
  type: (type: string) => (type === '0x0' ? '0x0' : undefined),
};

/**
 * Normalizes properties on transaction params.
 *
 * @param txParams - The transaction params to normalize.
 * @returns Normalized transaction params.
 */
export function normalizeTxParams(txParams: TransactionParams) {
  const normalizedTxParams: TransactionParams = { from: '' };
  let key: keyof TransactionParams;
  for (key in NORMALIZERS) {
    if (txParams[key as keyof TransactionParams]) {
      normalizedTxParams[key] = NORMALIZERS[key](txParams[key]) as never;
    }
  }
  return normalizedTxParams;
}

/**
 * Validates the transaction params for required properties and throws in
 * the event of any validation error.
 *
 * @param txParams - Transaction params object to validate.
 * @param isEIP1559Compatible - whether or not the current network supports EIP-1559 transactions.
 */
export function validateTxParams(
  txParams: TransactionParams,
  isEIP1559Compatible = true,
) {
  if (
    !txParams.from ||
    typeof txParams.from !== 'string' ||
    !isValidHexAddress(txParams.from)
  ) {
    throw rpcErrors.invalidParams(
      `Invalid "from" address: ${txParams.from} must be a valid string.`,
    );
  }

  if (isEIP1559Transaction(txParams) && !isEIP1559Compatible) {
    throw rpcErrors.invalidParams(
      'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
    );
  }

  if (txParams.to === '0x' || txParams.to === undefined) {
    if (txParams.data) {
      delete txParams.to;
    } else {
      throw rpcErrors.invalidParams(
        `Invalid "to" address: ${txParams.to} must be a valid string.`,
      );
    }
  } else if (txParams.to !== undefined && !isValidHexAddress(txParams.to)) {
    throw rpcErrors.invalidParams(
      `Invalid "to" address: ${txParams.to} must be a valid string.`,
    );
  }

  if (txParams.value !== undefined) {
    const value = txParams.value.toString();
    if (value.includes('-')) {
      throw rpcErrors.invalidParams(
        `Invalid "value": ${value} is not a positive number.`,
      );
    }

    if (value.includes('.')) {
      throw rpcErrors.invalidParams(
        `Invalid "value": ${value} number must be denominated in wei.`,
      );
    }
    const intValue = parseInt(txParams.value, 10);
    const isValid =
      Number.isFinite(intValue) &&
      !Number.isNaN(intValue) &&
      !isNaN(Number(value)) &&
      Number.isSafeInteger(intValue);
    if (!isValid) {
      throw rpcErrors.invalidParams(
        `Invalid "value": ${value} number must be a valid number.`,
      );
    }
  }
}

/**
 * Validates whether a transaction initiated by a specific 'from' address is permitted by the origin.
 *
 * @param permittedAddresses - The permitted accounts for the given origin.
 * @param from - The address from which the transaction is initiated.
 * @param selectedAddress - The currently selected Ethereum address in the wallet.
 * @param origin - The origin or source of the transaction.
 * @throws Throws an error if the transaction is not permitted.
 */
export async function validateTransactionOrigin(
  permittedAddresses: string[],
  from: string,
  selectedAddress: string,
  origin?: string,
) {
  if (origin === ORIGIN_METAMASK) {
    // Ensure the 'from' address matches the currently selected address
    if (from !== selectedAddress) {
      throw rpcErrors.internal({
        message: `Internally initiated transaction is using invalid account.`,
        data: {
          origin,
          fromAddress: from,
          selectedAddress,
        },
      });
    }
    return;
  }

  // Check if the origin has permissions to initiate transactions from the specified address
  if (!permittedAddresses.includes(from)) {
    throw providerErrors.unauthorized({ data: { origin } });
  }
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
      ({ status, txParams: { from } }) =>
        status === transactionStatus &&
        from.toLowerCase() === fromAddress.toLowerCase(),
    )
    .map(({ status, txParams: { from, gas, value, nonce } }) => {
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
      `Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${transactionMeta?.status}`,
    );
  }
}
