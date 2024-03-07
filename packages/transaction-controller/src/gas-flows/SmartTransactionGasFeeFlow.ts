import { toHex } from '@metamask/controller-utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';

const log = createModuleLogger(projectLogger, 'smart-transaction-gas-fee-flow');

/**
 * Implementation of a smart transaction gas fee flow specific to Smart Transactions.
 */
export class SmartTransactionGasFeeFlow implements GasFeeFlow {
  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return Boolean(transactionMeta.isSmartTransaction);
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    try {
      return await this.#getSmartTransactionGasFees(request);
    } catch (error) {
      log('Using default flow as fallback due to error', error);
      return new DefaultGasFeeFlow().getGasFees(request);
    }
  }

  async #getSmartTransactionGasFees(
    request: GasFeeFlowRequest,
  ): Promise<GasFeeFlowResponse> {
    const smartTransactionFeesResponse = await this.#getGasFeesAPIResponse(
      request,
    );

    log('Received smart transaction response', smartTransactionFeesResponse);

    const sortedFees = smartTransactionFeesResponse.fees
      .slice()
      .sort((a, b) => b.maxFeePerGas - a.maxFeePerGas);
    const highestValue = sortedFees[0];

    log('Picked highest value', highestValue);

    const estimates = {
      medium: {
        maxFeePerGas: toHex(highestValue.maxFeePerGas),
        maxPriorityFeePerGas: toHex(highestValue.maxPriorityFeePerGas),
      },
    };

    return {
      estimates,
    };
  }

  async #getGasFeesAPIResponse(request: GasFeeFlowRequest) {
    const {
      transactionMeta: { txParams },
      getSmartTransactionGasFeeEstimates,
    } = request;

    const { tradeTxFees } = await getSmartTransactionGasFeeEstimates(txParams);

    if (!tradeTxFees) {
      throw new Error('Trade fees not found');
    }

    return tradeTxFees;
  }
}
