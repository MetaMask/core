import type {
  PayStrategy,
  PayStrategyCheckQuoteSupportRequest,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyQuoteSupportResult,
  TransactionPayQuote,
  TransactionPayQuoteValidationError,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';
import { isRelayQuoteValidationError, validateRelayQuote } from './simulation';
import type { RelayQuote } from './types';

export class RelayStrategy implements PayStrategy<RelayQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);
    return config.relay.enabled;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<RelayQuote>[]> {
    return getRelayQuotes(request);
  }

  async checkQuoteSupport(
    request: PayStrategyCheckQuoteSupportRequest<RelayQuote>,
  ): Promise<PayStrategyQuoteSupportResult> {
    for (const quote of request.quotes) {
      try {
        await validateRelayQuote({
          messenger: request.messenger,
          quote,
          signal: request.signal,
          transaction: request.transaction,
        });
      } catch (error) {
        if (request.signal?.aborted) {
          throw error;
        }

        return {
          isSupported: false,
          validationError: getValidationError(quote, error),
        };
      }
    }

    return { isSupported: true };
  }

  async execute(
    request: PayStrategyExecuteRequest<RelayQuote>,
  ): ReturnType<PayStrategy<RelayQuote>['execute']> {
    try {
      return await submitRelayQuotes(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Relay submit: ${message}`);
    }
  }
}

function getValidationError(
  quote: TransactionPayQuote<RelayQuote>,
  error: unknown,
): TransactionPayQuoteValidationError {
  if (isRelayQuoteValidationError(error)) {
    return error.validationError;
  }

  return {
    chainId: quote.request.sourceChainId,
    code: 'quote_validation_unavailable',
    message: (error as Error).message,
    strategy: quote.strategy,
    tokenAddress: quote.request.sourceTokenAddress,
  };
}
