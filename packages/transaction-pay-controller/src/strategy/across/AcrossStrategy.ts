import { TransactionType } from '@metamask/transaction-controller';

import { getAcrossQuotes } from './across-quotes';
import { submitAcrossQuotes } from './across-submit';
import type { AcrossQuote } from './types';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';

export class AcrossStrategy implements PayStrategy<AcrossQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);

    if (!config.across.enabled) {
      return false;
    }

    if (request.transaction?.type === TransactionType.perpsAcrossDeposit) {
      return false;
    }

    if (config.across.allowSameChain) {
      return true;
    }

    // Across doesn't support same-chain swaps (e.g. mUSD conversions).
    return request.requests.every(
      (singleRequest) =>
        singleRequest.sourceChainId !== singleRequest.targetChainId,
    );
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<AcrossQuote>[]> {
    return getAcrossQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<AcrossQuote>,
  ): ReturnType<PayStrategy<AcrossQuote>['execute']> {
    return submitAcrossQuotes(request);
  }
}
