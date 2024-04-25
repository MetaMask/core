import { toHex } from '@metamask/controller-utils';

import {
  GasFeeEstimateType,
  type GasFeeFlow,
  type GasFeeFlowRequest,
  type GasFeeFlowResponse,
  type TransactionMeta,
} from '../types';

const MULTIPLIER = 1e15;

export class TestGasFeeFlow implements GasFeeFlow {
  #count = 1;

  matchesTransaction(_transactionMeta: TransactionMeta): boolean {
    return true;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { transactionMeta } = request;
    const { txParams } = transactionMeta;
    const { gas } = txParams;

    const totalTarget = (this.#count + 1) * MULTIPLIER;
    const priorityTarget = this.#count * MULTIPLIER;

    const maxFeePerGasDecimal = Math.ceil(
      totalTarget / parseInt(gas as string, 16),
    );

    const maxPriorityFeePerGasDecimal = Math.ceil(
      priorityTarget / parseInt(gas as string, 16),
    );

    const maxFeePerGas = toHex(maxFeePerGasDecimal);
    const maxPriorityFeePerGas = toHex(maxPriorityFeePerGasDecimal);

    const medium = {
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    this.#count += 1;

    return {
      estimates: {
        type: GasFeeEstimateType.FeeMarket,
        low: medium,
        medium,
        high: medium,
      },
    };
  }
}
