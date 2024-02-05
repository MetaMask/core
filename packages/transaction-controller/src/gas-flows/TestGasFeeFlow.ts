import { hexToBN, toHex } from '@metamask/controller-utils';

import { BN } from 'ethereumjs-util';
import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { CHAIN_IDS } from '../constants';

const LEVELS = ['low', 'medium', 'high'] as const;

const LEVEL_MULTIPLIERS = {
  low: 0,
  medium: 1,
  high: 2,
};

export class TestGasFeeFlow implements GasFeeFlow {
  #increment = 0;

  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return transactionMeta.chainId === `${parseInt(CHAIN_IDS.SEPOLIA, 16)}`;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { transactionMeta } = request;

    this.#increment += 1;

    const gasRaw = transactionMeta.transaction?.gas as any;
    const gasBigNumber = BN.isBN(gasRaw) ? gasRaw : hexToBN(gasRaw as string);
    const gas = gasBigNumber.toNumber();

    return LEVELS.reduce((result, level) => {
      const maxFeePerGas = Math.floor(
        ((this.#increment + LEVEL_MULTIPLIERS[level]) * 10e17) / gas,
      );

      const maxPriorityFeePerGas = Math.floor(maxFeePerGas * 0.2);

      return {
        ...result,
        [level]: {
          maxFeePerGas: toHex(maxFeePerGas),
          maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
          gasPrice: toHex(maxFeePerGas),
        },
      };
    }, {}) as GasFeeFlowResponse;
  }
}
