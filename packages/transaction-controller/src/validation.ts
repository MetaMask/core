import { Interface } from '@ethersproject/abi';
import { isValidHexAddress } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { rpcErrors } from '@metamask/rpc-errors';

import type { TransactionParams } from './types';
import { isEIP1559Transaction } from './utils';

/**
 * Validates EIP-1559 compatibility for transaction creation.
 *
 * @param txParams - The transaction parameters to validate.
 * @param isEIP1559Compatible - Indicates if the current network supports EIP-1559.
 * @throws Throws invalid params if the transaction specifies EIP-1559 but the network does not support it.
 */
export function validateEIP1559Compatibility(
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
 * Validates value property, ensuring it is a valid positive integer number
 * denominated in wei.
 *
 * @param value - The value to validate, expressed as a string.
 * @throws Throws an error if the value is not a valid positive integer
 * number denominated in wei.
 * - If the value contains a hyphen (-), it is considered invalid.
 * - If the value contains a decimal point (.), it is considered invalid.
 * - If the value is not a finite number, is NaN, or is not a safe integer, it is considered invalid.
 */
export function validateParamValue(value?: string) {
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
export function validateParamRecipient(txParams: TransactionParams) {
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
 * @param from - The from property to validate.
 * @throws Throws an error if the recipient address is invalid:
 * - If the recipient address is an empty string ('0x') or undefined and the transaction contains data,
 * the "to" field is removed from the transaction parameters.
 * - If the recipient address is not a valid hexadecimal Ethereum address, an error is thrown.
 */
export function validateParamFrom(from: string) {
  if (!from || typeof from !== 'string' || !isValidHexAddress(from)) {
    throw new Error(`Invalid "from" address: ${from} must be a valid string.`);
  }
}

/**
 * Validates input data for transactions.
 *
 * @param value - The input data to validate.
 * @throws Throws invalid params if the input data is invalid.
 */
export function validateParamData(value?: string) {
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
