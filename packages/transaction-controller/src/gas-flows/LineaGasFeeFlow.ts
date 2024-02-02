import {
  ChainId,
  gweiDecToWEIBN,
  hexToBN,
  query,
  toHex,
} from '@metamask/controller-utils';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

const log = createModuleLogger(projectLogger, 'linea-gas-fee-flow');

const LINEA_CHAIN_IDS: Hex[] = [
  ChainId['linea-mainnet'],
  ChainId['linea-goerli'],
];

const BASE_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.35,
  high: 1.7,
};

export class LineaGasFeeFlow implements GasFeeFlow {
  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return LINEA_CHAIN_IDS.includes(transactionMeta.chainId);
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { ethQuery, getGasFeeControllerEstimates } = request;

    const lineaResponse = await query(ethQuery, 'linea_estimateGas', [
      {
        from: request.transactionMeta.txParams.from,
        to: request.transactionMeta.txParams.to,
        value: request.transactionMeta.txParams.value,
        input: request.transactionMeta.txParams.data,
      },
    ]);

    log('Got Linea response', lineaResponse);

    const baseFeeLowDecimal = hexToBN(lineaResponse.baseFeePerGas);

    const baseFeeMediumDecimal = baseFeeLowDecimal.muln(
      BASE_FEE_MULTIPLIERS.medium,
    );

    const baseFeeHighDecimal = baseFeeLowDecimal.muln(
      BASE_FEE_MULTIPLIERS.high,
    );

    const gasFeeEstimates = await getGasFeeControllerEstimates();

    log('Got estimates from gas fee controller', gasFeeEstimates);

    if (gasFeeEstimates.gasEstimateType !== GAS_ESTIMATE_TYPES.FEE_MARKET) {
      throw new Error('No gas fee estimates available');
    }

    const { low, medium, high } = gasFeeEstimates.gasFeeEstimates;

    const mediumPriorityIncrease = gweiDecToWEIBN(
      medium.suggestedMaxFeePerGas,
    ).sub(gweiDecToWEIBN(low.suggestedMaxPriorityFeePerGas));

    const highPriorityIncrease = gweiDecToWEIBN(high.suggestedMaxFeePerGas).sub(
      gweiDecToWEIBN(medium.suggestedMaxPriorityFeePerGas),
    );

    const priorityFeeLow = hexToBN(lineaResponse.priorityFeePerGas);
    const priorityFeeMedium = priorityFeeLow.add(mediumPriorityIncrease);
    const priorityFeeHigh = priorityFeeMedium.add(highPriorityIncrease);

    const maxFeeLow = baseFeeLowDecimal.add(priorityFeeLow);
    const maxFeeMedium = baseFeeMediumDecimal.add(priorityFeeMedium);
    const maxFeeHigh = baseFeeHighDecimal.add(priorityFeeHigh);

    return {
      low: {
        maxFeePerGas: toHex(maxFeeLow),
        maxPriorityFeePerGas: toHex(priorityFeeLow),
      },
      medium: {
        maxFeePerGas: toHex(maxFeeMedium),
        maxPriorityFeePerGas: toHex(priorityFeeMedium),
      },
      high: {
        maxFeePerGas: toHex(maxFeeHigh),
        maxPriorityFeePerGas: toHex(priorityFeeHigh),
      },
    };
  }
}
