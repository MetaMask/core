import {
  gweiDecToWEIBN,
  ORIGIN_METAMASK,
  query,
  toHex,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import {
  GAS_ESTIMATE_TYPES,
  type GasFeeState,
} from '@metamask/gas-fee-controller';
import type { Provider } from '@metamask/network-controller';
import type { TransactionParams } from '@metamask/transaction-controller';
import { UserFeeLevel } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';

import { EMPTY_BYTES } from '../constants';
import { createModuleLogger, projectLogger } from '../logger';
import type { UserOperation, UserOperationMetadata } from '../types';
import type { AddUserOperationRequest } from '../UserOperationController';

const log = createModuleLogger(projectLogger, 'gas-fees');

export type UpdateGasFeesRequest = {
  getGasFeeEstimates: () => Promise<GasFeeState>;
  metadata: UserOperationMetadata;
  originalRequest: AddUserOperationRequest;
  provider: Provider;
  transaction?: TransactionParams;
};

type SuggestedGasFees = {
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

/**
 * Populates the gas fee properties for a user operation.
 * @param request - The request to update the gas fees.
 * @param request.getGasFeeEstimates - A callback to get gas fee estimates.
 * @param request.metadata - The metadata for the user operation.
 * @param request.originalRequest - The original request to add the user operation.
 * @param request.provider - A provider to query the network.
 * @param request.transaction - The transaction that created the user operation.
 */
export async function updateGasFees(request: UpdateGasFeesRequest) {
  const { metadata, originalRequest, transaction } = request;
  const { userOperation } = metadata;
  let suggestedGasFees: SuggestedGasFees | undefined;

  const getGasFeeEstimates = async () => {
    if (!suggestedGasFees) {
      suggestedGasFees = await getSuggestedGasFees(request);
    }

    return suggestedGasFees;
  };

  userOperation.maxFeePerGas = await getMaxFeePerGas(
    originalRequest,
    getGasFeeEstimates,
    transaction,
  );

  userOperation.maxPriorityFeePerGas = await getMaxPriorityFeePerGas(
    originalRequest,
    getGasFeeEstimates,
    userOperation,
    transaction,
  );

  metadata.userFeeLevel = getUserFeeLevel(
    metadata,
    originalRequest,
    suggestedGasFees,
    transaction,
  );
}

/**
 * Gets the maxFeePerGas for a user operation.
 * @param originalRequest - The original request to add the user operation.
 * @param getGetFasEstimates - A callback to get gas fee estimates.
 * @param transaction - The transaction that created the user operation.
 * @returns The maxFeePerGas for the user operation.
 */
async function getMaxFeePerGas(
  originalRequest: AddUserOperationRequest,
  getGetFasEstimates: () => Promise<SuggestedGasFees>,
  transaction?: TransactionParams,
) {
  const { maxFeePerGas, maxPriorityFeePerGas } = originalRequest;
  const { gasPrice } = transaction ?? {};

  if (!isGasFeeEmpty(maxFeePerGas)) {
    log('Using maxFeePerGas from request', maxFeePerGas);
    return maxFeePerGas as string;
  }

  if (isGasFeeEmpty(maxPriorityFeePerGas) && gasPrice) {
    log('Setting maxFeePerGas to transaction gasPrice', gasPrice);
    return gasPrice;
  }

  const { maxFeePerGas: suggestedMaxFeePerGas } = await getGetFasEstimates();

  if (!suggestedMaxFeePerGas) {
    throw new Error('Failed to get gas fee estimate for maxFeePerGas');
  }

  log('Using maxFeePerGas from estimate', suggestedMaxFeePerGas);

  return suggestedMaxFeePerGas;
}

/**
 * Gets the maxPriorityFeePerGas for a user operation.
 * @param originalRequest - The original request to add the user operation.
 * @param getGetFasEstimates - A callback to get gas fee estimates.
 * @param userOperation - The user operation being updated.
 * @param transaction - The transaction that created the user operation.
 * @returns The maxPriorityFeePerGas for the user operation.
 */
async function getMaxPriorityFeePerGas(
  originalRequest: AddUserOperationRequest,
  getGetFasEstimates: () => Promise<SuggestedGasFees>,
  userOperation: UserOperation,
  transaction?: TransactionParams,
) {
  const { maxFeePerGas, maxPriorityFeePerGas } = originalRequest;
  const { gasPrice } = transaction ?? {};
  const { maxFeePerGas: updatedMaxFeePerGas } = userOperation;

  if (!isGasFeeEmpty(maxPriorityFeePerGas)) {
    log('Using maxPriorityFeePerGas from request', maxPriorityFeePerGas);
    return maxPriorityFeePerGas as string;
  }

  if (isGasFeeEmpty(maxFeePerGas) && gasPrice) {
    log('Setting maxPriorityFeePerGas to transaction gasPrice', gasPrice);
    return gasPrice;
  }

  const { maxPriorityFeePerGas: suggestedMaxPriorityFeePerGas } =
    await getGetFasEstimates();

  if (suggestedMaxPriorityFeePerGas) {
    log(
      'Using maxPriorityFeePerGas from estimate',
      suggestedMaxPriorityFeePerGas,
    );
    return suggestedMaxPriorityFeePerGas;
  }

  log('Setting maxPriorityFeePerGas to maxFeePerGas', updatedMaxFeePerGas);

  return updatedMaxFeePerGas;
}

/**
 * Gets the userFeeLevel for a user operation.
 * @param metadata - The metadata for the user operation.
 * @param originalRequest - The original request to add the user operation.
 * @param suggestedGasFees - The suggested gas fees, if any.
 * @param transaction - The transaction that created the user operation.
 * @returns The userFeeLevel for the user operation.
 */
function getUserFeeLevel(
  metadata: UserOperationMetadata,
  originalRequest: AddUserOperationRequest,
  suggestedGasFees?: SuggestedGasFees,
  transaction?: TransactionParams,
): UserFeeLevel {
  const { origin } = metadata;
  const { maxFeePerGas, maxPriorityFeePerGas } = originalRequest;

  const {
    maxFeePerGas: suggestedMaxFeePerGas,
    maxPriorityFeePerGas: suggestedMaxPriorityFeePerGas,
  } = suggestedGasFees || {};

  if (
    isGasFeeEmpty(maxFeePerGas) &&
    isGasFeeEmpty(maxPriorityFeePerGas) &&
    transaction?.gasPrice
  ) {
    return origin === ORIGIN_METAMASK
      ? UserFeeLevel.CUSTOM
      : UserFeeLevel.DAPP_SUGGESTED;
  }

  if (
    isGasFeeEmpty(maxFeePerGas) &&
    isGasFeeEmpty(maxPriorityFeePerGas) &&
    suggestedMaxFeePerGas &&
    suggestedMaxPriorityFeePerGas
  ) {
    return UserFeeLevel.MEDIUM;
  }

  if (origin === ORIGIN_METAMASK) {
    return UserFeeLevel.CUSTOM;
  }

  return UserFeeLevel.DAPP_SUGGESTED;
}

/**
 * Gets suggested gas fees.
 * @param request - The request to update the gas fees.
 * @param request.getGasFeeEstimates - A callback to get gas fee estimates.
 * @param request.provider - A provider to query the network.
 * @returns The suggested gas fees.
 */
async function getSuggestedGasFees(
  request: UpdateGasFeesRequest,
): Promise<{ maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex }> {
  const { getGasFeeEstimates, provider } = request;

  try {
    const { gasFeeEstimates, gasEstimateType } = await getGasFeeEstimates();

    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      /* istanbul ignore next */
      const {
        medium: { suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas } = {},
      } = gasFeeEstimates;

      if (suggestedMaxPriorityFeePerGas && suggestedMaxFeePerGas) {
        const values = {
          maxFeePerGas: gweiDecimalToWeiHex(suggestedMaxFeePerGas),
          maxPriorityFeePerGas: gweiDecimalToWeiHex(
            suggestedMaxPriorityFeePerGas,
          ),
        };

        log('Using medium values from fee market estimate', values);

        return values;
      }
    }

    if (gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
      const maxFeePerGas = gweiDecimalToWeiHex(gasFeeEstimates.medium);

      log('Using medium value from legacy estimate', maxFeePerGas);

      return {
        maxFeePerGas,
      };
    }

    if (gasEstimateType === GAS_ESTIMATE_TYPES.ETH_GASPRICE) {
      const maxFeePerGas = gweiDecimalToWeiHex(gasFeeEstimates.gasPrice);

      log('Using gasPrice from estimate', maxFeePerGas);

      return {
        maxFeePerGas,
      };
    }
  } catch (error) {
    log('Failed to get estimate', error);
  }

  const gasPriceDecimal = (await query(new EthQuery(provider), 'gasPrice')) as
    | number
    | undefined;

  if (!gasPriceDecimal) {
    return {};
  }

  const maxFeePerGas = add0x(gasPriceDecimal.toString(16)) as Hex;

  log('Using gasPrice from network as fallback', maxFeePerGas);

  return { maxFeePerGas };
}

/**
 * Converts a GWEI decimal string to a WEI hexadecimal string.
 * @param value - The GWEI decimal string to convert.
 * @returns The WEI hexadecimal string.
 */
function gweiDecimalToWeiHex(value: string) {
  return toHex(gweiDecToWEIBN(value));
}

/**
 * Checks if a gas fee property is empty.
 * @param value - The gas fee value to check.
 * @returns Whether the gas fee property is empty.
 */
function isGasFeeEmpty(value?: string): boolean {
  return !value || value === EMPTY_BYTES;
}
