import { hexToBN } from '@metamask/controller-utils';
import { BN, addHexPrefix } from 'ethereumjs-util';

import { ENTRYPOINT } from '../constants';
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
 */
export async function updateGas(
  metadata: UserOperationMetadata,
  prepareResponse: PrepareUserOperationResponse,
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
    callGasLimit: '0x1',
    preVerificationGas: '0x1',
    verificationGasLimit: '0x1',
  };

  const bundler = new Bundler(metadata.bundlerUrl as string);
  const estimate = await bundler.estimateUserOperationGas(payload, ENTRYPOINT);

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
