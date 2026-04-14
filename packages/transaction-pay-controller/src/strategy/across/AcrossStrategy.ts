import { TransactionType } from '@metamask/transaction-controller';

import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getAcrossQuotes } from './across-quotes';
import { submitAcrossQuotes } from './across-submit';
import { isSupportedAcrossPerpsDepositRequest } from './perps';
import type { AcrossQuote } from './types';

export class AcrossStrategy implements PayStrategy<AcrossQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);

    if (!config.across.enabled) {
      return false;
    }

    if (request.transaction?.type === TransactionType.perpsDeposit) {
      return request.requests.every((singleRequest) =>
        isSupportedAcrossPerpsDepositRequest(
          singleRequest,
          request.transaction?.type,
        ),
      );
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
