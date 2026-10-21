import type {
  NonEvmTransactionPayQuote,
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyExecuteResult,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getRelayQuotes } from './relay-quotes.js';
import { getRelaySolanaQuotes } from './relay-solana-quotes.js';
import { submitRelayNonEvmQuote } from './relay-submit-non-evm.js';
import { submitRelayQuotes } from './relay-submit.js';
import type { RelayQuote, RelaySolanaPayQuote } from './types.js';

export class RelayStrategy implements PayStrategy<
  RelayQuote,
  RelaySolanaPayQuote
> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);
    return config.relay.enabled;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<
    (
      | TransactionPayQuote<RelayQuote>
      | NonEvmTransactionPayQuote<RelaySolanaPayQuote>
    )[]
  > {
    if (request.nonEvmRequests?.length) {
      return getRelaySolanaQuotes(request);
    }

    return getRelayQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<RelayQuote, RelaySolanaPayQuote>,
  ): Promise<PayStrategyExecuteResult> {
    const { messenger, nonEvmQuotes, transaction } = request;

    if (nonEvmQuotes?.length) {
      if (nonEvmQuotes.length > 1) {
        throw new Error('Relay: Multiple non-EVM quotes are not supported');
      }

      return await submitRelayNonEvmQuote({
        messenger,
        quote: nonEvmQuotes[0],
        transaction,
      });
    }

    return await submitRelayQuotes(request);
  }
}
