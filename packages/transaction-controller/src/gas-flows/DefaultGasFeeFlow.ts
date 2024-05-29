import type {
  LegacyGasPriceEstimate,
  GasFeeEstimates as FeeMarketGasPriceEstimate,
  EthGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  FeeMarketGasFeeEstimateForLevel,
  FeeMarketGasFeeEstimates,
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  GasPriceGasFeeEstimates,
  LegacyGasFeeEstimates,
  TransactionMeta,
} from '../types';
import { GasFeeEstimateLevel, GasFeeEstimateType } from '../types';
import { gweiDecimalToWeiHex } from '../utils/gas-fees';

const log = createModuleLogger(projectLogger, 'default-gas-fee-flow');

/**
 * The standard implementation of a gas fee flow that obtains gas fee estimates using only the GasFeeController.
 */
export class DefaultGasFeeFlow implements GasFeeFlow {
  matchesTransaction(_transactionMeta: TransactionMeta): boolean {
    return true;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { gasFeeControllerData } = request;
    const { gasEstimateType, gasFeeEstimates } = gasFeeControllerData;

    let response: GasFeeEstimates;

    switch (gasEstimateType) {
      case GAS_ESTIMATE_TYPES.FEE_MARKET:
        log('Using fee market estimates', gasFeeEstimates);
        response = this.#getFeeMarkEstimates(gasFeeEstimates);
        break;
      case GAS_ESTIMATE_TYPES.LEGACY:
        log('Using legacy estimates', gasFeeEstimates);
        response = this.#getLegacyEstimates(
          gasFeeEstimates as LegacyGasPriceEstimate,
        );
        break;
      case GAS_ESTIMATE_TYPES.ETH_GASPRICE:
        log('Using eth_gasPrice estimates', gasFeeEstimates);
        response = this.#getGasPriceEstimates(
          gasFeeEstimates as EthGasPriceEstimate,
        );
        break;
      default:
        throw new Error(`Unsupported gas estimate type: ${gasEstimateType}`);
    }

    return {
      estimates: response,
    };
  }

  #getFeeMarkEstimates(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
  ): FeeMarketGasFeeEstimates {
    const levels = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: this.#getFeeMarketLevel(gasFeeEstimates, level),
      }),
      {} as Omit<FeeMarketGasFeeEstimates, 'type'>,
    );

    return {
      type: GasFeeEstimateType.FeeMarket,
      ...levels,
    };
  }

  #getLegacyEstimates(
    gasFeeEstimates: LegacyGasPriceEstimate,
  ): LegacyGasFeeEstimates {
    const levels = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: this.#getLegacyLevel(gasFeeEstimates, level),
      }),
      {} as Omit<LegacyGasFeeEstimates, 'type'>,
    );

    return {
      type: GasFeeEstimateType.Legacy,
      ...levels,
    };
  }

  #getGasPriceEstimates(
    gasFeeEstimates: EthGasPriceEstimate,
  ): GasPriceGasFeeEstimates {
    return {
      type: GasFeeEstimateType.GasPrice,
      gasPrice: gweiDecimalToWeiHex(gasFeeEstimates.gasPrice),
    };
  }

  #getFeeMarketLevel(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
    level: GasFeeEstimateLevel,
  ): FeeMarketGasFeeEstimateForLevel {
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
  ): Hex {
    return gweiDecimalToWeiHex(gasFeeEstimates[level]);
  }
}
