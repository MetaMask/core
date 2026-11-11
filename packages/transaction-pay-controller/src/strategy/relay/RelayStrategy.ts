import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetRefreshIntervalRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import {
  getMaxBalanceRefreshInterval,
  getPayStrategiesConfig,
} from '../../utils/feature-flags.js';
import { isEvmQuoteRequest } from '../../utils/token.js';
import { getTransaction } from '../../utils/transaction.js';
import { getRelayQuotes } from './relay-quotes.js';
import { submitRelayQuotes } from './relay-submit.js';
import type { RelayQuote } from './types.js';

/**
 * Pay strategy that quotes and submits through Relay. Only supports requests
 * with an EVM source asset.
 */
export class RelayStrategy implements PayStrategy<RelayQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);

    return config.relay.enabled && request.requests.every(isEvmQuoteRequest);
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<RelayQuote>[]> {
    return getRelayQuotes(request);
  }

  async getRefreshInterval(
    request: PayStrategyGetRefreshIntervalRequest,
  ): Promise<number | undefined> {
    const { messenger, transactionId } = request;
    const transactionData = messenger.call('TransactionPayController:getState')
      .transactionData[transactionId];

    if (!transactionData?.isMaxAmount) {
      return undefined;
    }

    const transaction = getTransaction(transactionId, messenger);

    return getMaxBalanceRefreshInterval(messenger, transaction);
  }

  async execute(
    request: PayStrategyExecuteRequest<RelayQuote>,
  ): ReturnType<PayStrategy<RelayQuote>['execute']> {
    return await submitRelayQuotes(request);
  }
}
