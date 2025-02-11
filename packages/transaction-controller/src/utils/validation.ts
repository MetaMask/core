import { Interface } from '@ethersproject/abi';
import { ORIGIN_METAMASK, isValidHexAddress } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { isStrictHexString, remove0x } from '@metamask/utils';

import { isEIP1559Transaction } from './utils';
import type { Authorization } from '../types';
import { TransactionEnvelopeType, type TransactionParams } from '../types';

const TRANSACTION_ENVELOPE_TYPES_FEE_MARKET = [
  TransactionEnvelopeType.feeMarket,
  TransactionEnvelopeType.setCode,
];

type GasFieldsToValidate =
  | 'gasPrice'
  | 'maxFeePerGas'
  | 'maxPriorityFeePerGas'
  | 'gas'
  | 'gasLimit';

/**
 * Validates whether a transaction initiated by a specific 'from' address is permitted by the origin.
 *
 * @param options - Options bag.
 * @param options.from - The address from which the transaction is initiated.
 * @param options.internalAccounts - The internal accounts added to the wallet.
 * @param options.origin - The origin or source of the transaction.
 * @param options.permittedAddresses - The permitted accounts for the given origin.
 * @param options.selectedAddress - The currently selected Ethereum address in the wallet.
 * @param options.txParams - The transaction parameters.
 * @throws Throws an error if the transaction is not permitted.
 */
export async function validateTransactionOrigin({
  from,
  internalAccounts,
  origin,
  permittedAddresses,
  selectedAddress,
  txParams,
}: {
  from: string;
  internalAccounts?: string[];
  origin?: string;
  permittedAddresses?: string[];
  selectedAddress?: string;
  txParams: TransactionParams;
}) {
  const isInternal = origin === ORIGIN_METAMASK;
  const isExternal = origin && origin !== ORIGIN_METAMASK;
  const { authorizationList, to, type } = txParams;

  if (isInternal && from !== selectedAddress) {
    throw rpcErrors.internal({
      message: `Internally initiated transaction is using invalid account.`,
      data: {
        origin,
        fromAddress: from,
        selectedAddress,
      },
    });
  }

  if (isExternal && permittedAddresses && !permittedAddresses.includes(from)) {
    throw providerErrors.unauthorized({ data: { origin } });
  }

  if (
    isExternal &&
    (authorizationList || type === TransactionEnvelopeType.setCode)
  ) {
    throw rpcErrors.invalidParams(
      'External EIP-7702 transactions are not supported',
    );
  }

  if (isExternal && internalAccounts?.includes(to as string)) {
    throw rpcErrors.invalidParams(
      'External transactions to internal accounts are not supported',
    );
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
  validateEnvelopeType(txParams.type);
  validateEIP1559Compatibility(txParams, isEIP1559Compatible);
  validateParamFrom(txParams.from);
  validateParamRecipient(txParams);
  validateParamValue(txParams.value);
  validateParamData(txParams.data);
  validateParamChainId(txParams.chainId);
  validateGasFeeParams(txParams);
  validateAuthorizationList(txParams);
}

/**
 * Validates the `type` property, ensuring that if it is specified, it is a valid transaction envelope type.
 *
 * @param type - The transaction envelope type to validate.
 * @throws Throws invalid params if the type is not a valid transaction envelope type.
 */
function validateEnvelopeType(type: string | undefined) {
  if (
    type &&
    !Object.values(TransactionEnvelopeType).includes(
      type as TransactionEnvelopeType,
    )
  ) {
    throw rpcErrors.invalidParams(
      `Invalid transaction envelope type: "${type}". Must be one of: ${Object.values(
        TransactionEnvelopeType,
      ).join(', ')}`,
    );
  }
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
        `Invalid transaction value "${value}": not a positive number.`,
      );
    }

    if (value.includes('.')) {
      throw rpcErrors.invalidParams(
        `Invalid transaction value "${value}": number must be in wei.`,
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
        `Invalid transaction value ${value}: number must be a valid number.`,
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
      throw rpcErrors.invalidParams(`Invalid "to" address.`);
    }
  } else if (txParams.to !== undefined && !isValidHexAddress(txParams.to)) {
    throw rpcErrors.invalidParams(`Invalid "to" address.`);
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
  if (!from || typeof from !== 'string') {
    throw rpcErrors.invalidParams(
      `Invalid "from" address ${from}: not a string.`,
    );
  }
  if (!isValidHexAddress(from)) {
    throw rpcErrors.invalidParams('Invalid "from" address.');
  }
}

/**
 * Validates the recipient address in a transaction's parameters.
 *
 * @param to - The to property to validate.
 * @throws Throws an error if the recipient address is invalid.
 */
export function validateParamTo(to?: string) {
  if (!to || typeof to !== 'string') {
    throw rpcErrors.invalidParams(`Invalid "to" address`);
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Validates chainId type.
 *
 * @param chainId - The chainId to validate.
 */
function validateParamChainId(chainId: number | string | undefined) {
  if (
    chainId !== undefined &&
    typeof chainId !== 'number' &&
    typeof chainId !== 'string'
  ) {
    throw rpcErrors.invalidParams(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Invalid transaction params: chainId is not a Number or hex string. got: (${chainId})`,
    );
  }
}

/**
 * Validates gas values.
 *
 * @param txParams - The transaction parameters to validate.
 */
function validateGasFeeParams(txParams: TransactionParams) {
  if (txParams.gasPrice) {
    ensureProperTransactionEnvelopeTypeProvided(txParams, 'gasPrice');
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'gasPrice',
      'maxFeePerGas',
    );
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'gasPrice',
      'maxPriorityFeePerGas',
    );
    ensureFieldIsValidHex(txParams, 'gasPrice');
  }

  if (txParams.maxFeePerGas) {
    ensureProperTransactionEnvelopeTypeProvided(txParams, 'maxFeePerGas');
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'maxFeePerGas',
      'gasPrice',
    );
    ensureFieldIsValidHex(txParams, 'maxFeePerGas');
  }

  if (txParams.maxPriorityFeePerGas) {
    ensureProperTransactionEnvelopeTypeProvided(
      txParams,
      'maxPriorityFeePerGas',
    );
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'maxPriorityFeePerGas',
      'gasPrice',
    );
    ensureFieldIsValidHex(txParams, 'maxPriorityFeePerGas');
  }

  if (txParams.gasLimit) {
    ensureFieldIsValidHex(txParams, 'gasLimit');
  }

  if (txParams.gas) {
    ensureFieldIsValidHex(txParams, 'gas');
  }
}

/**
 * Ensures that the provided txParams has the proper 'type' specified for the
 * given field, if it is provided. If types do not match throws an
 * invalidParams error.
 *
 * @param txParams - The transaction parameters object
 * @param field - The current field being validated
 * @throws {ethErrors.rpc.invalidParams} Throws if type does not match the
 * expectations for provided field.
 */
function ensureProperTransactionEnvelopeTypeProvided(
  txParams: TransactionParams,
  field: keyof TransactionParams,
) {
  const type = txParams.type as TransactionEnvelopeType | undefined;

  switch (field) {
    case 'authorizationList':
      if (type && type !== TransactionEnvelopeType.setCode) {
        throw rpcErrors.invalidParams(
          `Invalid transaction envelope type: specified type "${type}" but including authorizationList requires type: "${TransactionEnvelopeType.setCode}"`,
        );
      }
      break;
    case 'maxFeePerGas':
    case 'maxPriorityFeePerGas':
      if (
        type &&
        !TRANSACTION_ENVELOPE_TYPES_FEE_MARKET.includes(
          type as TransactionEnvelopeType,
        )
      ) {
        throw rpcErrors.invalidParams(
          `Invalid transaction envelope type: specified type "${type}" but including maxFeePerGas and maxPriorityFeePerGas requires type: "${TRANSACTION_ENVELOPE_TYPES_FEE_MARKET.join(', ')}"`,
        );
      }
      break;
    case 'gasPrice':
    default:
      if (
        type &&
        TRANSACTION_ENVELOPE_TYPES_FEE_MARKET.includes(
          type as TransactionEnvelopeType,
        )
      ) {
        throw rpcErrors.invalidParams(
          `Invalid transaction envelope type: specified type "${type}" but included a gasPrice instead of maxFeePerGas and maxPriorityFeePerGas`,
        );
      }
  }
}

/**
 * Given two fields, ensure that the second field is not included in txParams,
 * and if it is throw an invalidParams error.
 *
 * @param txParams - The transaction parameters object
 * @param fieldBeingValidated - The current field being validated
 * @param mutuallyExclusiveField - The field to ensure is not provided
 * @throws {ethErrors.rpc.invalidParams} Throws if mutuallyExclusiveField is
 * present in txParams.
 */
function ensureMutuallyExclusiveFieldsNotProvided(
  txParams: TransactionParams,
  fieldBeingValidated: GasFieldsToValidate,
  mutuallyExclusiveField: GasFieldsToValidate,
) {
  if (typeof txParams[mutuallyExclusiveField] !== 'undefined') {
    throw rpcErrors.invalidParams(
      `Invalid transaction params: specified ${fieldBeingValidated} but also included ${mutuallyExclusiveField}, these cannot be mixed`,
    );
  }
}

/**
 * Ensures that the provided value for field is a valid hexadecimal.
 * Throws an invalidParams error if field is not a valid hexadecimal.
 *
 * @param data - The object containing the field
 * @param field - The current field being validated
 * @throws {rpcErrors.invalidParams} Throws if field is not a valid hexadecimal
 */
function ensureFieldIsValidHex<T>(data: T, field: keyof T) {
  const value = data[field];
  if (typeof value !== 'string' || !isStrictHexString(value)) {
    throw rpcErrors.invalidParams(
      `Invalid transaction params: ${String(field)} is not a valid hexadecimal string. got: (${String(
        value,
      )})`,
    );
  }
}

/**
 * Validate the authorization list property in the transaction parameters.
 *
 * @param txParams - The transaction parameters containing the authorization list to validate.
 */
function validateAuthorizationList(txParams: TransactionParams) {
  const { authorizationList } = txParams;

  if (!authorizationList) {
    return;
  }

  ensureProperTransactionEnvelopeTypeProvided(txParams, 'authorizationList');

  if (!Array.isArray(authorizationList)) {
    throw rpcErrors.invalidParams(
      `Invalid transaction params: authorizationList must be an array`,
    );
  }

  for (const authorization of authorizationList) {
    validateAuthorization(authorization);
  }
}

/**
 * Validate an authorization object.
 *
 * @param authorization - The authorization object to validate.
 */
function validateAuthorization(authorization: Authorization) {
  ensureFieldIsValidHex(authorization, 'address');
  validateHexLength(authorization.address, 20, 'address');

  for (const field of ['chainId', 'nonce', 'r', 's'] as const) {
    if (authorization[field]) {
      ensureFieldIsValidHex(authorization, field);
    }
  }

  const { yParity } = authorization;

  if (yParity && !['0x', '0x1'].includes(yParity)) {
    throw rpcErrors.invalidParams(
      `Invalid transaction params: yParity must be '0x' or '0x1'. got: ${yParity}`,
    );
  }
}

/**
 * Validate the number of bytes in a hex string.
 *
 * @param value - The hex string to validate.
 * @param lengthBytes  - The expected length in bytes.
 * @param fieldName - The name of the field being validated.
 */
function validateHexLength(
  value: string,
  lengthBytes: number,
  fieldName: string,
) {
  const actualLengthBytes = remove0x(value).length / 2;

  if (actualLengthBytes !== lengthBytes) {
    throw rpcErrors.invalidParams(
      `Invalid transaction params: ${fieldName} must be ${lengthBytes} bytes. got: ${actualLengthBytes} bytes`,
    );
  }
}
