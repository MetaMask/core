import { ChainId, hexToBN, toHex } from '@metamask/controller-utils';

import type {
  GasFeeEstimatesLevel,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

const MULTIPLIER = 10e17;

const LEVEL_INCREMENTS = {
  low: 0,
  medium: 1,
  high: 2,
};

type Level = keyof typeof LEVEL_INCREMENTS;

export class TestGasFeeFlow implements GasFeeFlow {
  #increment = 0;

  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return transactionMeta.chainId === ChainId.sepolia;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { transactionMeta } = request;

    this.#increment += 1;

    const gas = hexToBN(transactionMeta.txParams.gas as string).toNumber();

    return {
      estimates: {
        low: this.#getFeeLevel('low', gas),
        medium: this.#getFeeLevel('medium', gas),
        high: this.#getFeeLevel('high', gas),
      },
    };
  }

  #getFeeLevel(level: Level, gas: number): GasFeeEstimatesLevel {
    const maxFeePerGas = Math.floor(
      ((this.#increment + LEVEL_INCREMENTS[level]) * MULTIPLIER) / gas,
    );

    const maxPriorityFeePerGas = Math.floor(maxFeePerGas * 0.2);

    return {
      maxFeePerGas: toHex(maxFeePerGas),
      maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    };
  }
}
