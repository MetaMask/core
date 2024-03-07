import { hexToBN, toHex } from '@metamask/controller-utils';
import { createModuleLogger, type Hex } from '@metamask/utils';
import type BN from 'bn.js';

import { projectLogger } from '../logger';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
  GetSmartTransactionFeeEstimatesResponse,
} from '../types';
import { GasFeeEstimateLevel } from '../types';
import { pickMiddleFeeElement } from '../utils/utils';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';

const log = createModuleLogger(projectLogger, 'smart-transaction-gas-fee-flow');

const BASE_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.35,
  high: 1.7,
};

const PRIORITY_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.05,
  high: 1.1,
};

type FeesByLevel = {
  [key in GasFeeEstimateLevel]: BN;
};

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

    const baseValue = pickMiddleFeeElement(smartTransactionFeesResponse.fees);

    log('Picked base value', baseValue);

    const maxFees = this.#getValuesFromMultipliers(
      toHex(baseValue.maxFeePerGas),
      BASE_FEE_MULTIPLIERS,
    );

    log('Generated max fees', maxFees);

    const priorityFees = this.#getValuesFromMultipliers(
      toHex(baseValue.maxPriorityFeePerGas),
      PRIORITY_FEE_MULTIPLIERS,
    );

    log('Generated priority fees', priorityFees);

    const estimates = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: {
          maxFeePerGas: toHex(maxFees[level]),
          maxPriorityFeePerGas: toHex(priorityFees[level]),
        },
      }),
      {} as GasFeeEstimates,
    );

    return {
      estimates,
    };
  }

  async #getGasFeesAPIResponse(request: GasFeeFlowRequest) {
    const {
      transactionMeta: { txParams },
      getSmartTransactionFeeEstimates,
    } = request;

    const { tradeTxFees } = await getSmartTransactionFeeEstimates(txParams);

    if (!tradeTxFees) {
      throw new Error('Trade fees not found');
    }

    return tradeTxFees;
  }

  #getValuesFromMultipliers(
    value: Hex,
    multipliers: { low: number; medium: number; high: number },
  ): FeesByLevel {
    const base = hexToBN(value);
    const low = base.muln(multipliers.low);
    const medium = base.muln(multipliers.medium);
    const high = base.muln(multipliers.high);

    return {
      low,
      medium,
      high,
    };
  }
}
