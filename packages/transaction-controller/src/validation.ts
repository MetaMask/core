import { Interface } from '@ethersproject/abi';
import { ORIGIN_METAMASK, isValidHexAddress } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';

import type { TransactionParams } from './types';
import { isEIP1559Transaction } from './utils';

/**
 * Validates whether a transaction initiated by a specific 'from' address is permitted by the origin.
 *
 * @param permittedAddresses - The permitted accounts for the given origin.
 * @param selectedAddress - The currently selected Ethereum address in the wallet.
 * @param from - The address from which the transaction is initiated.
 * @param origin - The origin or source of the transaction.
 * @throws Throws an error if the transaction is not permitted.
 */
export async function validateTransactionOrigin(
  permittedAddresses: string[],
  selectedAddress: string,
  from: string,
  origin: string,
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
  validateParamFrom(txParams.from);
  validateParamRecipient(txParams);
  validateParamValue(txParams.value);
  validateParamData(txParams.data);
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
function validateParamValue(value?: string) {
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
function validateParamRecipient(txParams: TransactionParams) {
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
function validateParamFrom(from: string) {
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
function validateParamData(value?: string) {
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
