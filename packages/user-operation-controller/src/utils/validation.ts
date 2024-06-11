import { TransactionType } from '@metamask/transaction-controller';
import { isStrictHexString } from '@metamask/utils';
import type { Struct, StructError } from 'superstruct';
import {
  assert,
  boolean,
  define,
  enums,
  func,
  number,
  object,
  optional,
  refine,
  string,
} from 'superstruct';

import { EMPTY_BYTES } from '../constants';
import type {
  PrepareUserOperationResponse,
  SignUserOperationResponse,
  UpdateUserOperationResponse,
} from '../types';
import type {
  AddUserOperationOptions,
  AddUserOperationRequest,
} from '../UserOperationController';

/**
 * Validate a request to add a user operation.
 * @param request - The request to validate.
 */
export function validateAddUserOperationRequest(
  request: AddUserOperationRequest,
) {
  const Hex = defineHex();
  const HexOrEmptyBytes = defineHexOrEmptyBytes();

  const ValidRequest = object({
    data: optional(HexOrEmptyBytes),
    from: Hex,
    maxFeePerGas: optional(Hex),
    maxPriorityFeePerGas: optional(Hex),
    to: optional(Hex),
    value: optional(Hex),
  });

  validate(request, ValidRequest, 'Invalid request to add user operation');
}

/**
 * Validate the options when adding a user operation.
 * @param options - The options to validate.
 */
export function validateAddUserOperationOptions(
  options: AddUserOperationOptions,
) {
  const ValidOptions = object({
    networkClientId: string(),
    origin: string(),
    requireApproval: optional(boolean()),
    smartContractAccount: optional(
      object({
        prepareUserOperation: func(),
        updateUserOperation: func(),
        signUserOperation: func(),
      }),
    ),
    swaps: optional(
      object({
        approvalTxId: optional(string()),
        destinationTokenAddress: optional(string()),
        destinationTokenDecimals: optional(number()),
        destinationTokenSymbol: optional(string()),
        estimatedBaseFee: optional(string()),
        sourceTokenSymbol: optional(string()),
        swapMetaData: optional(object()),
        swapTokenValue: optional(string()),
        destinationTokenAmount: optional(string()),
        sourceTokenAddress: optional(string()),
        sourceTokenAmount: optional(string()),
        sourceTokenDecimals: optional(number()),
        swapAndSendRecipient: optional(string()),
      }),
    ),
    type: optional(enums(Object.values(TransactionType))),
  });

  validate(options, ValidOptions, 'Invalid options to add user operation');
}

/**
 * Validate the response from a smart contract account when preparing the user operation.
 * @param response - The response to validate.
 */
export function validatePrepareUserOperationResponse(
  response: PrepareUserOperationResponse,
) {
  const Hex = defineHex();
  const HexOrEmptyBytes = defineHexOrEmptyBytes();

  const ValidResponse = refine(
    object({
      bundler: string(),
      callData: Hex,
      dummyPaymasterAndData: optional(HexOrEmptyBytes),
      dummySignature: optional(HexOrEmptyBytes),
      gas: optional(
        object({
          callGasLimit: Hex,
          preVerificationGas: Hex,
          verificationGasLimit: Hex,
        }),
      ),
      initCode: optional(HexOrEmptyBytes),
      nonce: Hex,
      sender: Hex,
    }),
    'ValidPrepareUserOperationResponse',
    ({ gas, dummySignature }) => {
      if (!gas && (!dummySignature || dummySignature === EMPTY_BYTES)) {
        return 'Must specify dummySignature if not specifying gas';
      }

      /* istanbul ignore next */
      return true;
    },
  );

  validate(
    response,
    ValidResponse,
    'Invalid response when preparing user operation',
  );
}

/**
 * Validate the response from a smart contract account when updating the user operation.
 * @param response - The response to validate.
 */
export function validateUpdateUserOperationResponse(
  response: UpdateUserOperationResponse,
) {
  const ValidResponse = optional(
    object({
      paymasterAndData: optional(defineHexOrEmptyBytes()),
      callGasLimit: optional(defineHexOrEmptyBytes()),
      preVerificationGas: optional(defineHexOrEmptyBytes()),
      verificationGasLimit: optional(defineHexOrEmptyBytes()),
    }),
  );

  validate(
    response,
    ValidResponse,
    'Invalid response when updating user operation',
  );
}

/**
 * Validate the response from a smart contract account when signing the user operation.
 * @param response - The response to validate.
 */
export function validateSignUserOperationResponse(
  response: SignUserOperationResponse,
) {
  const Hex = defineHex();

  const ValidResponse = object({
    signature: Hex,
  });

  validate(
    response,
    ValidResponse,
    'Invalid response when signing user operation',
  );
}

/**
 * Validate data against a struct.
 * @param data - The data to validate.
 * @param struct - The struct to validate against.
 * @param message - The message to throw if validation fails.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
function validate<T>(data: unknown, struct: Struct<T>, message: string) {
  try {
    assert(data, struct, message);
  } catch (error) {
    const causes = (error as StructError)
      .failures()
      .map((failure) => {
        if (!failure.path.length) {
          return failure.message;
        }

        return `${failure.path.join('.')} - ${failure.message}`;
      })
      .join('\n');

    const finalMessage = `${message}\n${causes}`;

    throw new Error(finalMessage);
  }
}

/**
 * Define the Hex type used by superstruct.
 * @returns The Hex superstruct type.
 */
function defineHex() {
  return define<string>('Hexadecimal String', (value) =>
    isStrictHexString(value),
  );
}

/**
 * Define the HexOrEmptyBytes type used by superstruct.
 * @returns The HexOrEmptyBytes superstruct type.
 */
function defineHexOrEmptyBytes() {
  return define<string>(
    'Hexadecimal String or 0x',
    (value) => isStrictHexString(value) || value === EMPTY_BYTES,
  );
}
