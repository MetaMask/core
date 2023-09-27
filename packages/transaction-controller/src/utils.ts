import { Interface } from '@ethersproject/abi';
import {
  convertHexToDecimal,
  isValidHexAddress,
} from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { rpcErrors } from '@metamask/rpc-errors';
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
  validateEIP1559Compatibility(txParams, isEIP1559Compatible);
  validateFrom(txParams);
  validateRecipient(txParams);
  validateInputValue(txParams.value);
  validateInputData(txParams.data);
}

/**
 * Validates EIP-1559 compatibility for transaction creation.
 *
 * @param txParams - The transaction parameters to validate.
 * @param isEIP1559Compatible - Indicates if the current network supports EIP-1559.
 * @throws Throws invalid params if the transaction specifies EIP-1559 but the network does not support it.
 */
function validateEIP1559Compatibility(
  txParams: TransactionParams,
  isEIP1559Compatible: boolean,
) {
  if (isEIP1559Transaction(txParams) && !isEIP1559Compatible) {
    throw rpcErrors.invalidParams(
      'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
    );
  }
}

/**
 * Validates input data for transactions.
 *
 * @param value - The input data to validate.
 * @throws Throws invalid params if the input data is invalid.
 */
function validateInputData(value?: string) {
  if (value) {
    const ERC20Interface = new Interface(abiERC20);
    try {
      ERC20Interface.parseTransaction({ data: value });
    } catch (error: any) {
      if (error.message.match(/BUFFER_OVERRUN/u)) {
        throw rpcErrors.invalidParams(
          'Invalid transaction params: data out-of-bounds, BUFFER_OVERRUN.',
        );
      }
    }
  }
}

/**
 * Validates an input value, ensuring it is a valid positive integer number
 * denominated in wei.
 *
 * @param value - The input value to validate, expressed as a string.
 * @throws Throws an error if the input value is not a valid positive integer
 * number denominated in wei.
 * - If the input value contains a hyphen (-), it is considered invalid.
 * - If the input value contains a decimal point (.), it is considered invalid.
 * - If the input value is not a finite number, is NaN, or is not a safe integer, it is considered invalid.
 */
function validateInputValue(value?: string) {
  if (value !== undefined) {
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
    const intValue = parseInt(value, 10);
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
 * Validates the recipient address in a transaction's parameters.
 *
 * @param txParams - The transaction parameters object to validate.
 * @throws Throws an error if the recipient address is invalid:
 * - If the recipient address is an empty string ('0x') or undefined and the transaction contains data,
 * the "to" field is removed from the transaction parameters.
 * - If the recipient address is not a valid hexadecimal Ethereum address, an error is thrown.
 */
function validateRecipient(txParams: TransactionParams) {
  if (txParams.to === '0x' || txParams.to === undefined) {
    if (txParams.data) {
      delete txParams.to;
    } else {
      throw new Error(
        `Invalid "to" address: ${txParams.to} must be a valid string.`,
      );
    }
  } else if (txParams.to !== undefined && !isValidHexAddress(txParams.to)) {
    throw new Error(
      `Invalid "to" address: ${txParams.to} must be a valid string.`,
    );
  }
}
/**
 * Validates the recipient address in a transaction's parameters.
 *
 * @param txParams - The transaction parameters object to validate.
 * @throws Throws an error if the recipient address is invalid:
 * - If the recipient address is an empty string ('0x') or undefined and the transaction contains data,
 * the "to" field is removed from the transaction parameters.
 * - If the recipient address is not a valid hexadecimal Ethereum address, an error is thrown.
 */
function validateFrom(txParams: TransactionParams) {
  if (
    !txParams.from ||
    typeof txParams.from !== 'string' ||
    !isValidHexAddress(txParams.from)
  ) {
    throw new Error(
      `Invalid "from" address: ${txParams.from} must be a valid string.`,
    );
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
