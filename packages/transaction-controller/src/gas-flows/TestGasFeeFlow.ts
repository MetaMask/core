import { toHex } from '@metamask/controller-utils';

import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

const MULTIPLIER = 1e18;

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
        low: medium,
        medium,
        high: medium,
      },
    } as GasFeeFlowResponse;
  }
}
