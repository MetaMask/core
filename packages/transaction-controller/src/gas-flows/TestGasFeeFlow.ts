import { ChainId, hexToBN, toHex } from '@metamask/controller-utils';

import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

const LEVEL_MULTIPLIERS = {
  low: 0,
  medium: 1,
  high: 2,
};

export class TestGasFeeFlow implements GasFeeFlow {
  #increment = 0;

  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return transactionMeta.chainId === ChainId.sepolia;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { transactionMeta } = request;

    this.#increment += 1;

    const gas = hexToBN(transactionMeta.txParams.gas as string).toNumber();

    return (['low', 'medium', 'high'] as const).reduce((result, level) => {
      const maxFeePerGas = Math.floor(
        ((this.#increment + LEVEL_MULTIPLIERS[level]) * 10e10) / gas,
      );

      const maxPriorityFeePerGas = Math.floor(maxFeePerGas * 0.2);

      return {
        ...result,
        [level]: {
          maxFeePerGas: toHex(maxFeePerGas),
          maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        },
      };
    }, {}) as GasFeeFlowResponse;
  }
}
