import {
  TransactionType,
  hasTransactionType,
} from '@metamask/transaction-controller';

import type {
  PayStrategy,
  PayStrategyCheckQuoteSupportRequest,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getAcrossDestination } from './across-actions.js';
import { getAcrossQuotes } from './across-quotes.js';
import { submitAcrossQuotes } from './across-submit.js';
import { hasUnsupportedTransactionAuthorizationList } from './authorization-list.js';
import { isSupportedAcrossPerpsDepositRequest } from './perps.js';
import { isAcrossQuoteRequest } from './requests.js';
import type { AcrossQuote } from './types.js';

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

    if (
      hasUnsupportedTransactionAuthorizationList(
        request.transaction,
        actionableRequests,
      )
    ) {
      return false;
    }

    return actionableRequests.every((singleRequest) => {
      if (singleRequest.isPostQuote) {
        return hasTransactionType(request.transaction, [
          TransactionType.predictWithdraw,
        ]);
      }

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
    const requiresAuthorizationList = request.quotes.some(
      (quote) => quote.original.metamask.requiresAuthorizationList,
    );

    if (!requiresAuthorizationList) {
      return true;
    }

    if (
      !hasTransactionType(request.transaction, [
        TransactionType.predictWithdraw,
      ])
    ) {
      return false;
    }

    // A first-time 7702 authorization list is acceptable here only because it is
    // attached to MetaMask's source-chain batch transaction. It must not be
    // smuggled into Across destination post-swap actions.
    return request.quotes.every(
      (quote) =>
        quote.request.isPostQuote === true &&
        quote.original.request.actions.length === 0,
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
