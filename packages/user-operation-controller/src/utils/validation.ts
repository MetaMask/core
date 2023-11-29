import { isHexString } from '@metamask/utils';
import {
  any,
  assert,
  define,
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

  assert(request, ValidRequest, 'Invalid request to add user operation');
}

/**
 * Validate the options when adding a user operation.
 * @param options - The options to validate.
 */
export function validateAddUserOperatioOptions(options: any) {
  const Hex = defineHex();

  const ValidOptions = object({
    chainId: Hex,
    smartContractAccount: any(),
  });

  assert(options, ValidOptions, 'Invalid options to add user operation');
}

/**
 * Validate the response from a smart contract account when preparing the user operation.
 * @param response - The response to validate.
 */
export function validatePrepareUserOperationResponse(
  response: PrepareUserOperationResponse,
) {
  const Hex = defineHex();

  const ValidResponse = refine(
    object({
      bundler: string(),
      callData: Hex,
      callGasLimit: optional(Hex),
      dummyPaymasterAndData: optional(Hex),
      dummySignature: optional(Hex),
      gas: optional(
        object({
          callGasLimit: Hex,
          preVerificationGas: Hex,
          verificationGasLimit: Hex,
        }),
      ),
      initCode: optional(Hex),
      nonce: Hex,
      preVerificationGas: optional(Hex),
      sender: Hex,
      verificationGasLimit: optional(Hex),
    }),
    'ValidPrepareUserOperationResponse',
    ({ gas, dummySignature }) => {
      if (!gas && !dummySignature) {
        return 'Must specify dummySignature if not specifying gas';
      }

      return true;
    },
  );

  assert(
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
  const Hex = defineHex();

  const ValidResponse = object({
    paymasterAndData: optional(Hex),
  });

  assert(
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

  assert(
    response,
    ValidResponse,
    'Invalid response when signing user operation',
  );
}

/**
 * Define the Hex type used by superstruct.
 * @returns The Hex superstruct type.
 */
function defineHex() {
  return define<string>('Hex', (value) => isHexString(value));
}

/**
 * Define the HexOrEmptyBytes type used by superstruct.
 * @returns The HexOrEmptyBytes superstruct type.
 */
function defineHexOrEmptyBytes() {
  return define<string>(
    'HexOrEmptyBytes',
    (value) => isHexString(value) || value === EMPTY_BYTES,
  );
}
