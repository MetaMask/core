import { gweiDecToWEIBN, toHex } from '@metamask/controller-utils';
import type {
  LegacyGasPriceEstimate,
  GasFeeEstimates as FeeMarketGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
  FeeMarketGasFeeEstimateForLevel,
} from '../types';
import { GasFeeEstimateLevel } from '../types';

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
    const { getGasFeeControllerEstimates } = request;

    const { gasEstimateType, gasFeeEstimates } =
      await getGasFeeControllerEstimates();

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
  }: FeeMarketGetEstimateLevelRequest | LegacyGetEstimateLevelRequest): {
    maxFeePerGas: Hex;
    maxPriorityFeePerGas: Hex;
  } {
    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      return this.#getFeeMarketLevel(gasFeeEstimates, level);
    }

    return this.#getLegacyLevel(gasFeeEstimates, level);
  }

  #getFeeMarketLevel(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
    level: GasFeeEstimateLevel,
  ): FeeMarketGasFeeEstimateForLevel {
    const maxFeePerGas = this.#gweiDecimalToWeiHex(
      gasFeeEstimates[level].suggestedMaxFeePerGas,
    );

    const maxPriorityFeePerGas = this.#gweiDecimalToWeiHex(
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
  ): { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex } {
    const gasPrice = this.#gweiDecimalToWeiHex(gasFeeEstimates[level]);

    return {
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: gasPrice,
    };
  }

  #gweiDecimalToWeiHex(gweiDecimal: string): Hex {
    return toHex(gweiDecToWEIBN(gweiDecimal));
  }
}
