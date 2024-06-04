import { weiHexToGweiDec } from '@metamask/controller-utils';
import type {
  Eip1559GasFee,
  EthGasPriceEstimate,
  GasFeeEstimates,
  LegacyGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { type GasFeeState } from '@metamask/gas-fee-controller';

import type {
  FeeMarketGasFeeEstimates,
  GasPriceGasFeeEstimates,
  LegacyGasFeeEstimates,
} from '../types';
import {
  type GasFeeFlow,
  type TransactionMeta,
  type FeeMarketGasFeeEstimateForLevel,
  GasFeeEstimateLevel,
  GasFeeEstimateType,
} from '../types';

type MergeGasFeeEstimatesRequest = {
  gasFeeControllerEstimates:
    | GasFeeEstimates
    | LegacyGasPriceEstimate
    | EthGasPriceEstimate;
  transactionGasFeeEstimates:
    | FeeMarketGasFeeEstimates
    | LegacyGasFeeEstimates
    | GasPriceGasFeeEstimates;
};

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
 * @param request - Data required to merge gas fee estimates.
 * @param request.gasFeeControllerEstimates - Gas fee estimates from the GasFeeController.
 * @param request.transactionGasFeeEstimates - Gas fee estimates from the transaction.
 * @returns The merged gas fee estimates.
 */
export function mergeGasFeeEstimates({
  gasFeeControllerEstimates,
  transactionGasFeeEstimates,
}: MergeGasFeeEstimatesRequest): GasFeeState['gasFeeEstimates'] {
  const transactionEstimateType = transactionGasFeeEstimates.type;

  if (transactionEstimateType === GasFeeEstimateType.FeeMarket) {
    return Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: mergeFeeMarketEstimate(
          (gasFeeControllerEstimates as GasFeeEstimates)?.[level],
          transactionGasFeeEstimates[level],
        ),
      }),
      { ...gasFeeControllerEstimates } as GasFeeEstimates,
    );
  }

  if (transactionEstimateType === GasFeeEstimateType.Legacy) {
    return Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: getLegacyEstimate(transactionGasFeeEstimates, level),
      }),
      {} as LegacyGasPriceEstimate,
    );
  }

  if (transactionEstimateType === GasFeeEstimateType.GasPrice) {
    return {
      gasPrice: getGasPriceEstimate(transactionGasFeeEstimates),
    };
  }

  return gasFeeControllerEstimates;
}

/**
 * Merge a specific priority level of EIP-1559 gas fee estimates.
 * @param gasFeeControllerEstimate - The gas fee estimate from the gas fee controller.
 * @param transactionGasFeeEstimate - The gas fee estimate from the transaction.
 * @returns The merged gas fee estimate.
 */
function mergeFeeMarketEstimate(
  gasFeeControllerEstimate: Eip1559GasFee | undefined,
  transactionGasFeeEstimate: FeeMarketGasFeeEstimateForLevel,
): Eip1559GasFee {
  return {
    ...gasFeeControllerEstimate,
    suggestedMaxFeePerGas: weiHexToGweiDec(
      transactionGasFeeEstimate.maxFeePerGas,
    ),
    suggestedMaxPriorityFeePerGas: weiHexToGweiDec(
      transactionGasFeeEstimate.maxPriorityFeePerGas,
    ),
  } as Eip1559GasFee;
}

/**
 * Generate a specific priority level for a legacy gas fee estimate.
 * @param transactionGasFeeEstimate - The gas fee estimate from the transaction.
 * @param level - The gas fee estimate level.
 * @returns The legacy gas fee estimate.
 */
function getLegacyEstimate(
  transactionGasFeeEstimate: LegacyGasFeeEstimates,
  level: GasFeeEstimateLevel,
): string {
  return weiHexToGweiDec(transactionGasFeeEstimate[level]);
}

/**
 * Generate the value for a gas price gas fee estimate.
 * @param transactionGasFeeEstimate - The gas fee estimate from the transaction.
 * @returns The legacy gas fee estimate.
 */
function getGasPriceEstimate(
  transactionGasFeeEstimate: GasPriceGasFeeEstimates,
): string {
  return weiHexToGweiDec(transactionGasFeeEstimate.gasPrice);
}
