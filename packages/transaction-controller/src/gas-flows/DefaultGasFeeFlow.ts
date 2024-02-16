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
  GasFeeEstimatesLevel,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

const log = createModuleLogger(projectLogger, 'default-gas-fee-flow');

type Level = keyof GasFeeEstimates;

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

    const response = await getGasFeeControllerEstimates({ networkClientId });

    if (response.gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      return this.#getFeeMarketGasFees(response.gasFeeEstimates);
    } else if (response.gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
      return this.#getLegacyGasFees(response.gasFeeEstimates);
    }

    throw new Error('No gas fee estimates available');
  }

  #getFeeMarketGasFees(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
  ): GasFeeFlowResponse {
    log('Using fee market estimates', gasFeeEstimates);

    return {
      estimates: {
        low: this.#getFeeMarketLevel(gasFeeEstimates, 'low'),
        medium: this.#getFeeMarketLevel(gasFeeEstimates, 'medium'),
        high: this.#getFeeMarketLevel(gasFeeEstimates, 'high'),
      },
    };
  }

  #getLegacyGasFees(
    gasFeeEstimates: LegacyGasPriceEstimate,
  ): GasFeeFlowResponse {
    log('Using legacy estimates', gasFeeEstimates);

    return {
      estimates: {
        low: this.#getLegacyLevel(gasFeeEstimates, 'low'),
        medium: this.#getLegacyLevel(gasFeeEstimates, 'medium'),
        high: this.#getLegacyLevel(gasFeeEstimates, 'high'),
      },
    };
  }

  #getFeeMarketLevel(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
    level: Level,
  ): GasFeeEstimatesLevel {
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
    level: Level,
  ): GasFeeEstimatesLevel {
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
