import { fractionBN, hexToBN } from '@metamask/controller-utils';
import { add0x } from '@metamask/utils';
import BN from 'bn.js';

import { VALUE_ZERO } from '../constants.js';
import { Bundler } from '../helpers/Bundler.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import type {
  PrepareUserOperationResponse,
  UserOperationMetadata,
} from '../types.js';

const log = createModuleLogger(projectLogger, 'gas');

/**
 * A multiplier to apply to all gas estimate values returned from the bundler.
 */
const GAS_ESTIMATE_MULTIPLIER = 1.5;

/**
 * Precision used to convert `GAS_ESTIMATE_MULTIPLIER` into an integer
 * numerator/denominator pair for `fractionBN`. `BN.muln` cannot be used
 * directly with a fractional multiplier: it silently truncates to the
 * integer part on a per-26-bit-word basis instead of throwing, so
 * `value.muln(1.5)` can return a wrong, under-computed result once the gas
 * estimate needs more than one 26-bit word (values at or above ~67.1M, i.e.
 * 2^26, are susceptible, though not every value above that boundary is
 * actually affected).
 */
const GAS_ESTIMATE_MULTIPLIER_PRECISION = 100;

/**
 * Populates the gas properties for a user operation.
 *
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
 *
 * @param rawValue - The raw value to normalize.
 * @returns The normalized value as a hexadecimal string.
 */
function normalizeGasEstimate(rawValue: string | number): string {
  const value =
    typeof rawValue === 'string' ? hexToBN(rawValue) : new BN(rawValue);

  const bufferedValue = fractionBN(
    value,
    Math.round(GAS_ESTIMATE_MULTIPLIER * GAS_ESTIMATE_MULTIPLIER_PRECISION),
    GAS_ESTIMATE_MULTIPLIER_PRECISION,
  );

  return add0x(bufferedValue.toString(16));
}
