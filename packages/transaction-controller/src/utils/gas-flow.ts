import { weiHexToGweiDec } from '@metamask/controller-utils';
import type {
  Eip1559GasFee,
  GasFeeEstimates,
  LegacyGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import {
  GAS_ESTIMATE_TYPES,
  type GasFeeState,
} from '@metamask/gas-fee-controller';

import {
  type GasFeeEstimates as TransactionGasFeeEstimates,
  type GasFeeFlow,
  type TransactionMeta,
  type GasFeeEstimatesForLevel,
  GasFeeEstimateLevel,
} from '../types';

/**
 * Returns the first gas fee flow that matches the transaction.
 *
 * @param transactionMeta - The transaction metadata to find a gas fee flow for.
 * @param gasFeeFlows - The gas fee flows to search.
 * @returns The first gas fee flow that matches the transaction, or undefined if none match.
 */
export function getGasFeeFlow(
  transactionMeta: TransactionMeta,
  gasFeeFlows: GasFeeFlow[],
): GasFeeFlow | undefined {
  return gasFeeFlows.find((gasFeeFlow) =>
    gasFeeFlow.matchesTransaction(transactionMeta),
  );
}

type FeeMarketMergeGasFeeEstimatesRequest = {
  gasFeeControllerEstimateType: 'fee-market';
  gasFeeControllerEstimates: GasFeeEstimates;
  transactionGasFeeEstimates: TransactionGasFeeEstimates;
};

type LegacyMergeGasFeeEstimatesRequest = {
  gasFeeControllerEstimateType: 'legacy';
  gasFeeControllerEstimates: LegacyGasPriceEstimate;
  transactionGasFeeEstimates: TransactionGasFeeEstimates;
};

/**
 * Merge the gas fee estimates from the gas fee controller with the gas fee estimates from a transaction.
 *
 * @param request - Data required to merge gas fee estimates.
 * @param request.gasFeeControllerEstimateType - Gas fee estimate type from the gas fee controller.
 * @param request.gasFeeControllerEstimates - Gas fee estimates from the GasFeeController.
 * @param request.transactionGasFeeEstimates - Gas fee estimates from the transaction.
 * @returns The merged gas fee estimates.
 */
export function mergeGasFeeEstimates({
  gasFeeControllerEstimateType,
  gasFeeControllerEstimates,
  transactionGasFeeEstimates,
}:
  | FeeMarketMergeGasFeeEstimatesRequest
  | LegacyMergeGasFeeEstimatesRequest): GasFeeState['gasFeeEstimates'] {
  if (gasFeeControllerEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
    return Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: mergeFeeMarketEstimate(
          gasFeeControllerEstimates[level],
          transactionGasFeeEstimates[level],
        ),
      }),
      { ...gasFeeControllerEstimates } as GasFeeEstimates,
    );
  }

  if (gasFeeControllerEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
    return Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: getLegacyEstimate(transactionGasFeeEstimates[level]),
      }),
      {} as LegacyGasPriceEstimate,
    );
  }

  return gasFeeControllerEstimates;
}

/**
 * Merge a specific priority level of EIP-1559 gas fee estimates.
 *
 * @param gasFeeControllerEstimate - The gas fee estimate from the gas fee controller.
 * @param transactionGasFeeEstimate - The gas fee estimate from the transaction.
 * @returns The merged gas fee estimate.
 */
function mergeFeeMarketEstimate(
  gasFeeControllerEstimate: Eip1559GasFee,
  transactionGasFeeEstimate: GasFeeEstimatesForLevel,
): Eip1559GasFee {
  return {
    ...gasFeeControllerEstimate,
    suggestedMaxFeePerGas: weiHexToGweiDec(
      transactionGasFeeEstimate.maxFeePerGas,
    ),
    suggestedMaxPriorityFeePerGas: weiHexToGweiDec(
      transactionGasFeeEstimate.maxPriorityFeePerGas,
    ),
  };
}

/**
 * Generate a specific priority level for a legacy gas fee estimate.
 *
 * @param transactionGasFeeEstimate - The gas fee estimate from the transaction.
 * @returns The legacy gas fee estimate.
 */
function getLegacyEstimate(
  transactionGasFeeEstimate: GasFeeEstimatesForLevel,
): string {
  return weiHexToGweiDec(transactionGasFeeEstimate.maxFeePerGas);
}
