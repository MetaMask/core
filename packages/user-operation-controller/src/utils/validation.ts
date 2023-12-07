import { isStrictHexString } from '@metamask/utils';
import type { Struct, StructError } from 'superstruct';
import {
  assert,
  define,
  func,
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

/**
 * Validate a request to add a user operation.
 * @param request - The request to validate.
 */
export function validateAddUserOperationRequest(request: any) {
  const Hex = defineHex();
  const HexOrEmptyBytes = defineHexOrEmptyBytes();

  const ValidRequest = object({
    data: optional(HexOrEmptyBytes),
    maxFeePerGas: Hex,
    maxPriorityFeePerGas: Hex,
    to: optional(Hex),
    value: optional(Hex),
  });

  validate(request, ValidRequest, 'Invalid request to add user operation');
}

/**
 * Validate the options when adding a user operation.
 * @param options - The options to validate.
 */
export function validateAddUserOperationOptions(options: any) {
  const Hex = defineHex();

  const ValidOptions = object({
    chainId: Hex,
    smartContractAccount: object({
      prepareUserOperation: func(),
      updateUserOperation: func(),
      signUserOperation: func(),
    }),
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
  const HexOrEmptyBytes = defineHex();

  const ValidResponse = optional(
    object({
      paymasterAndData: optional(HexOrEmptyBytes),
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
function validate(data: any, struct: Struct<any>, message: string) {
  try {
    assert(data, struct, message);
  } catch (error: any) {
    const causes = error
      .failures()
      .map((failure: StructError) => {
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
