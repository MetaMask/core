import type { Hex } from '@metamask/utils';

import type { RelayQuote } from './types';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import type {
  TokenPayProvider,
  TokenPayProviderQuote,
} from '../token-pay/types';
import { TransactionPayStrategy } from '../..';
import { getTokenPayConfig } from '../../utils/feature-flags';
import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';

export class RelayProvider implements TokenPayProvider<RelayQuote> {
  readonly id = 'relay' as const;

  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getTokenPayConfig(request.messenger);
    return config.providers.relay.enabled;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<TokenPayProviderQuote<RelayQuote>>[]> {
    const quotes = await getRelayQuotes(request);

    return quotes.map((quote) => ({
      ...quote,
      original: {
        providerId: this.id,
        quote: quote.original,
      },
      strategy: TransactionPayStrategy.TokenPay,
    }));
  }

  async execute(
    request: PayStrategyExecuteRequest<TokenPayProviderQuote<RelayQuote>>,
  ): Promise<{ transactionHash?: Hex }> {
    const quotes = request.quotes.map((quote) => ({
      ...quote,
      original: quote.original.quote,
    }));

    return submitRelayQuotes({
      ...request,
      quotes,
    } as PayStrategyExecuteRequest<RelayQuote>);
  }
}
