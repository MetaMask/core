import { gweiDecToWEIBN, toHex } from '@metamask/controller-utils';
import type {
  GasFeeEstimates,
  LegacyGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

const log = createModuleLogger(projectLogger, 'default-gas-fee-flow');

export class DefaultGasFeeFlow implements GasFeeFlow {
  matchesTransaction(_transactionMeta: TransactionMeta): boolean {
    return true;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { getGasFeeControllerEstimates } = request;
    const response = await getGasFeeControllerEstimates();

    if (response.gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      return this.#getFeeMarketGasFees(response.gasFeeEstimates);
    } else if (response.gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
      return this.#getLegacyGasFees(response.gasFeeEstimates);
    }

    throw new Error('No gas fee estimates available');
  }

  #getFeeMarketGasFees(gasFeeEstimates: GasFeeEstimates): GasFeeFlowResponse {
    log('Using fee market estimates', gasFeeEstimates);

    return (['low', 'medium', 'high'] as const).reduce(
      (result, level) => ({
        ...result,
        [level]: {
          maxFeePerGas: toHex(
            this.#gweiDecimalToWeiHex(
              gasFeeEstimates[level].suggestedMaxFeePerGas,
            ),
          ),
          maxPriorityFeePerGas: toHex(
            this.#gweiDecimalToWeiHex(
              gasFeeEstimates[level].suggestedMaxPriorityFeePerGas,
            ),
          ),
        },
      }),
      {},
    ) as GasFeeFlowResponse;
  }

  #getLegacyGasFees(
    gasFeeEstimates: LegacyGasPriceEstimate,
  ): GasFeeFlowResponse {
    log('Using legacy estimates', gasFeeEstimates);

    return (['low', 'medium', 'high'] as const).reduce(
      (result, level) => ({
        ...result,
        [level]: {
          gasPrice: this.#gweiDecimalToWeiHex(gasFeeEstimates[level]),
        },
      }),
      {},
    ) as GasFeeFlowResponse;
  }

  #gweiDecimalToWeiHex(value: string) {
    return toHex(gweiDecToWEIBN(value));
  }
}
