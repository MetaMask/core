import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyExecuteResult,
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
import { getRelaySolanaQuotes } from './relay-solana-quotes.js';
import { submitRelayNonEvmQuote } from './relay-submit-non-evm.js';
import { submitRelayQuotes } from './relay-submit.js';
import type { RelayQuote, RelaySolanaPayQuote } from './types.js';

/**
 * Pay strategy that quotes and submits through Relay. Supports every source
 * protocol. Quotes for a non-EVM source are prepared for and executed through
 * the account Snap, and quotes for an EVM source through the
 * `TransactionController`, selected from the protocol of the source asset.
 */
export class RelayStrategy implements PayStrategy<
  RelayQuote | RelaySolanaPayQuote
> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);
    return config.relay.enabled;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<RelayQuote | RelaySolanaPayQuote>[]> {
    if (!request.requests.every(isEvmQuoteRequest)) {
      return getRelaySolanaQuotes(request);
    }

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
    request: PayStrategyExecuteRequest<RelayQuote | RelaySolanaPayQuote>,
  ): Promise<PayStrategyExecuteResult> {
    const { messenger, quotes, transaction } = request;

    if (!quotes.every((quote) => isEvmQuoteRequest(quote.request))) {
      if (quotes.length > 1) {
        throw new Error('Relay: Multiple non-EVM quotes are not supported');
      }

      return await submitRelayNonEvmQuote({
        messenger,
        quote: quotes[0] as TransactionPayQuote<RelaySolanaPayQuote>,
        transaction,
      });
    }

    return await submitRelayQuotes(
      request as PayStrategyExecuteRequest<RelayQuote>,
    );
  }
}
