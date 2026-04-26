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
import { isAcrossQuoteRequest } from './requests';
import type { AcrossQuote } from './types';

export class AcrossStrategy implements PayStrategy<AcrossQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);

    if (!config.across.enabled) {
      return false;
    }

    const actionableRequests = request.requests.filter(isAcrossQuoteRequest);

    if (actionableRequests.length === 0) {
      return false;
    }

    if (request.transaction?.type === TransactionType.perpsDeposit) {
      return actionableRequests.every((singleRequest) =>
        isSupportedAcrossPerpsDepositRequest(
          singleRequest,
          request.transaction?.type,
        ),
      );
    }

    // Across doesn't support same-chain swaps (e.g. mUSD conversions).
    return actionableRequests.every(
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
