import type {
  LegacyGasPriceEstimate,
  GasFeeEstimates as FeeMarketGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  GasFeeEstimates,
  GasFeeEstimatesForLevel,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { GasFeeEstimateLevel } from '../types';
import { gweiDecimalToWeiHex } from '../utils/gas-fees';

const log = createModuleLogger(projectLogger, 'default-gas-fee-flow');

type FeeMarketGetEstimateLevelRequest = {
  gasEstimateType: 'fee-market';
  gasFeeEstimates: FeeMarketGasPriceEstimate;
  level: GasFeeEstimateLevel;
};

type LegacyGetEstimateLevelRequest = {
  gasEstimateType: 'legacy';
  gasFeeEstimates: LegacyGasPriceEstimate;
  level: GasFeeEstimateLevel;
};

/**
 * The standard implementation of a gas fee flow that obtains gas fee estimates using only the GasFeeController.
 */
export class DefaultGasFeeFlow implements GasFeeFlow {
  matchesTransaction(_transactionMeta: TransactionMeta): boolean {
    return true;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { getGasFeeControllerEstimates, transactionMeta } = request;
    const { networkClientId } = transactionMeta;

    const { gasEstimateType, gasFeeEstimates } =
      await getGasFeeControllerEstimates({ networkClientId });

    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      log('Using fee market estimates', gasFeeEstimates);
    } else if (gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
      log('Using legacy estimates', gasFeeEstimates);
    } else {
      throw new Error(`'No gas fee estimates available`);
    }

    const estimates = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: this.#getEstimateLevel({
          gasEstimateType,
          gasFeeEstimates,
          level,
        } as FeeMarketGetEstimateLevelRequest | LegacyGetEstimateLevelRequest),
      }),
      {} as GasFeeEstimates,
    );

    return { estimates };
  }

  #getEstimateLevel({
    gasEstimateType,
    gasFeeEstimates,
    level,
  }:
    | FeeMarketGetEstimateLevelRequest
    | LegacyGetEstimateLevelRequest): GasFeeEstimatesForLevel {
    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      return this.#getFeeMarketLevel(gasFeeEstimates, level);
    }

    return this.#getLegacyLevel(gasFeeEstimates, level);
  }

  #getFeeMarketLevel(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
    level: GasFeeEstimateLevel,
  ): GasFeeEstimatesForLevel {
    const maxFeePerGas = gweiDecimalToWeiHex(
      gasFeeEstimates[level].suggestedMaxFeePerGas,
    );

    const maxPriorityFeePerGas = gweiDecimalToWeiHex(
      gasFeeEstimates[level].suggestedMaxPriorityFeePerGas,
    );

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  #getLegacyLevel(
    gasFeeEstimates: LegacyGasPriceEstimate,
    level: GasFeeEstimateLevel,
  ): GasFeeEstimatesForLevel {
    const gasPrice = gweiDecimalToWeiHex(gasFeeEstimates[level]);

    return {
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: gasPrice,
    };
  }
}
