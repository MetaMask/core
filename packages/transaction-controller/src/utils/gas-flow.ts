import { weiHexToGweiDec } from '@metamask/controller-utils';
import type {
  Eip1559GasFee,
  GasFeeEstimates,
} from '@metamask/gas-fee-controller';
import {
  GAS_ESTIMATE_TYPES,
  type GasFeeState,
} from '@metamask/gas-fee-controller';

import type {
  GasFeeEstimates as TransactionGasFeeEstimates,
  GasFeeFlow,
  TransactionMeta,
  GasFeeEstimatesLevel,
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

/**
 * Merge the gas fee estimates from the gas fee controller with the gas fee estimates from a transaction.
 *
 * @param gasFeeControllerEstimateType - The gas fee estimate type from the gas fee controller.
 * @param gasFeeControllerEstimates - The gas fee estimates from the GasFeeController.
 * @param transactionGasFeeEstimates - The gas fee estimates from the transaction.
 * @returns The merged gas fee estimates.
 */
export function mergeGasFeeControllerAndTransactionGasFeeEstimates(
  gasFeeControllerEstimateType: GasFeeState['gasEstimateType'],
  gasFeeControllerEstimates: GasFeeState['gasFeeEstimates'],
  transactionGasFeeEstimates: TransactionGasFeeEstimates,
): GasFeeState['gasFeeEstimates'] {
  if (gasFeeControllerEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
    const gasFeeControllerFeeMarketEstimates =
      gasFeeControllerEstimates as GasFeeEstimates;

    return {
      ...gasFeeControllerFeeMarketEstimates,
      low: mergeFeeMarketEstimate(
        gasFeeControllerFeeMarketEstimates.low,
        transactionGasFeeEstimates.low,
      ),
      medium: mergeFeeMarketEstimate(
        gasFeeControllerFeeMarketEstimates.medium,
        transactionGasFeeEstimates.medium,
      ),
      high: mergeFeeMarketEstimate(
        gasFeeControllerFeeMarketEstimates.high,
        transactionGasFeeEstimates.high,
      ),
    };
  }

  if (gasFeeControllerEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
    return {
      low: getLegacyEstimate(transactionGasFeeEstimates.low),
      medium: getLegacyEstimate(transactionGasFeeEstimates.medium),
      high: getLegacyEstimate(transactionGasFeeEstimates.high),
    };
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
  transactionGasFeeEstimate: GasFeeEstimatesLevel,
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
  transactionGasFeeEstimate: GasFeeEstimatesLevel,
): string {
  return weiHexToGweiDec(transactionGasFeeEstimate.maxFeePerGas);
}
