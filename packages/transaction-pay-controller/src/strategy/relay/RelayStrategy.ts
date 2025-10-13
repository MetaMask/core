import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';
import type { RelayQuote } from './types';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
} from '../../types';

export class RelayStrategy implements PayStrategy<RelayQuote> {
  async getQuotes(request: PayStrategyGetQuotesRequest) {
    return getRelayQuotes(request);
  }

  async execute(request: PayStrategyExecuteRequest<RelayQuote>) {
    return await submitRelayQuotes(request);
  }
}
