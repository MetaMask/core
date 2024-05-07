import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import {
  GasFeeEstimateType,
  type GasFeeFlow,
  type GasFeeFlowRequest,
  type GasFeeFlowResponse,
  type TransactionMeta,
} from '../types';

const INCREMENT = 1e15; // 0.001 ETH
const LEVEL_DIFFERENCE = 0.5;

/**
 * A gas fee flow to facilitate testing in the clients.
 * Increments the total gas fee by a fixed amount each time it is called.
 * Relies on the transaction's gas value to generate a distinct total fee in the UI.
 */
export class TestGasFeeFlow implements GasFeeFlow {
  #counter = 1;

  matchesTransaction(_transactionMeta: TransactionMeta): boolean {
    return true;
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    const { transactionMeta } = request;
    const { txParams } = transactionMeta;
    const { gas: gasHex } = txParams;

    if (!gasHex) {
      throw new Error('Cannot estimate fee without gas value');
    }

    const gasDecimal = parseInt(gasHex, 16);
    const difference = INCREMENT * LEVEL_DIFFERENCE;

    const mediumMaxTarget = (this.#counter + 1) * INCREMENT;
    const mediumPriorityTarget = this.#counter * INCREMENT;

    const lowMaxTarget = mediumMaxTarget - difference;
    const lowPriorityTarget = mediumPriorityTarget - difference;

    const highMaxTarget = mediumMaxTarget + difference;
    const highPriorityTarget = mediumPriorityTarget + difference;

    this.#counter += 1;

    return {
      estimates: {
        type: GasFeeEstimateType.FeeMarket,
        low: {
          maxFeePerGas: this.#getValueForTotalFee(lowMaxTarget, gasDecimal),
          maxPriorityFeePerGas: this.#getValueForTotalFee(
            lowPriorityTarget,
            gasDecimal,
          ),
        },
        medium: {
          maxFeePerGas: this.#getValueForTotalFee(mediumMaxTarget, gasDecimal),
          maxPriorityFeePerGas: this.#getValueForTotalFee(
            mediumPriorityTarget,
            gasDecimal,
          ),
        },
        high: {
          maxFeePerGas: this.#getValueForTotalFee(highMaxTarget, gasDecimal),
          maxPriorityFeePerGas: this.#getValueForTotalFee(
            highPriorityTarget,
            gasDecimal,
          ),
        },
      },
    };
  }

  #getValueForTotalFee(totalFee: number, gas: number): Hex {
    const feeDecimal = Math.ceil(totalFee / gas);
    return toHex(feeDecimal);
  }
}
