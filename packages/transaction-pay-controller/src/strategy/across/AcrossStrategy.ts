import { TransactionType } from '@metamask/transaction-controller';

import type {
  PayStrategy,
  PayStrategyCheckQuoteSupportRequest,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getAcrossDestination } from './across-actions';
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
      const supportsPerpsDeposit = actionableRequests.every((singleRequest) =>
        isSupportedAcrossPerpsDepositRequest(
          singleRequest,
          request.transaction?.type,
        ),
      );

      if (!supportsPerpsDeposit) {
        return false;
      }
    } else {
      // Across doesn't support same-chain swaps (e.g. mUSD conversions).
      const hasSameChainRequest = actionableRequests.some(
        (singleRequest) =>
          singleRequest.sourceChainId === singleRequest.targetChainId,
      );

      if (hasSameChainRequest) {
        return false;
      }
    }

    // Across cannot submit EIP-7702 authorization lists. This pre-quote check
    // catches transactions where the authorization list is already present.
    // First-time 7702 upgrades discovered during gas planning are handled in
    // `checkQuoteSupport` below.
    if (request.transaction.txParams?.authorizationList?.length) {
      return false;
    }

    return actionableRequests.every((singleRequest) => {
      try {
        getAcrossDestination(request.transaction, singleRequest);
        return true;
      } catch {
        return false;
      }
    });
  }

  checkQuoteSupport(
    request: PayStrategyCheckQuoteSupportRequest<AcrossQuote>,
  ): boolean {
    // Gas planning can discover that TransactionController would add an
    // authorization list for a first-time 7702 upgrade. `is7702` alone is not a
    // blocker because it also covers already-upgraded accounts.
    return !request.quotes.some(
      (quote) => quote.original.metamask.requiresAuthorizationList,
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
