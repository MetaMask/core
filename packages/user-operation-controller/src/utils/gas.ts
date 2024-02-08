import { hexToBN } from '@metamask/controller-utils';
import BN from 'bn.js';
import { addHexPrefix } from 'ethereumjs-util';

import { VALUE_ZERO } from '../constants';
import { Bundler } from '../helpers/Bundler';
import { createModuleLogger, projectLogger } from '../logger';
import type {
  PrepareUserOperationResponse,
  UserOperationMetadata,
} from '../types';

const log = createModuleLogger(projectLogger, 'gas');

/**
 * A multiplier to apply to all gas estimate values returned from the bundler.
 */
const GAS_ESTIMATE_MULTIPLIER = 1.5;

/**
 * Populates the gas properties for a user operation.
 * @param metadata - The metadata for the user operation.
 * @param prepareResponse - The prepare response from the smart contract account.
 * @param entrypoint - Address of the entrypoint contract.
 */
export async function updateGas(
  metadata: UserOperationMetadata,
  prepareResponse: PrepareUserOperationResponse,
  entrypoint: string,
) {
  const { userOperation } = metadata;

  if (prepareResponse.gas) {
    userOperation.callGasLimit = prepareResponse.gas.callGasLimit;
    userOperation.preVerificationGas = prepareResponse.gas.preVerificationGas;
    userOperation.verificationGasLimit =
      prepareResponse.gas.verificationGasLimit;

    log('Using gas values from smart contract account', {
      callGasLimit: userOperation.callGasLimit,
      preVerificationGas: userOperation.preVerificationGas,
      verificationGasLimit: userOperation.verificationGasLimit,
    });

    return;
  }

  const payload = {
    ...userOperation,
    maxFeePerGas: VALUE_ZERO,
    maxPriorityFeePerGas: VALUE_ZERO,
    callGasLimit: VALUE_ZERO,
    preVerificationGas: VALUE_ZERO,
    verificationGasLimit: '0xF4240',
  };

  const bundler = new Bundler(metadata.bundlerUrl as string);
  const estimate = await bundler.estimateUserOperationGas(payload, entrypoint);

  userOperation.callGasLimit = normalizeGasEstimate(estimate.callGasLimit);
  userOperation.preVerificationGas = normalizeGasEstimate(
    estimate.preVerificationGas,
  );
  userOperation.verificationGasLimit = normalizeGasEstimate(
    (estimate.verificationGasLimit ?? estimate.verificationGas) as
      | string
      | number,
  );

  log('Using buffered gas values from bundler estimate', {
    callGasLimit: userOperation.callGasLimit,
    preVerificationGas: userOperation.preVerificationGas,
    verificationGasLimit: userOperation.verificationGasLimit,
    multiplier: GAS_ESTIMATE_MULTIPLIER,
    estimate,
  });
}

/**
 * Normalizes a gas estimate value from the bundler.
 * @param rawValue - The raw value to normalize.
 * @returns The normalized value as a hexadecimal string.
 */
function normalizeGasEstimate(rawValue: string | number): string {
  const value =
    typeof rawValue === 'string' ? hexToBN(rawValue) : new BN(rawValue);

  const bufferedValue = value.muln(GAS_ESTIMATE_MULTIPLIER);

  return addHexPrefix(bufferedValue.toString(16));
}
