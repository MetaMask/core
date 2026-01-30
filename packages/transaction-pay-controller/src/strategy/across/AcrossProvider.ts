import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { AcrossQuote } from './types';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import type {
  TokenPayProvider,
  TokenPayProviderQuote,
} from '../token-pay/types';
import { TransactionPayStrategy } from '../../constants';
import { getTokenPayConfig } from '../../utils/feature-flags';
import { getAcrossQuotes } from './across-quotes';
import { submitAcrossQuotes } from './across-submit';

export class AcrossProvider implements TokenPayProvider<AcrossQuote> {
  readonly id = 'across' as const;

  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getTokenPayConfig(request.messenger);

    if (!config.providers.across.enabled) {
      return false;
    }

    if (request.transaction?.type === TransactionType.perpsDeposit) {
      // TODO: Enable Across for perps deposits once Hypercore USDC-PERPs is supported.
      return false;
    }

    if (config.providers.across.allowSameChain) {
      return true;
    }

    // Across doesn't support same-chain swaps (e.g. mUSD conversions).
    return request.requests.every(
      (singleRequest) =>
        singleRequest.sourceChainId !== singleRequest.targetChainId,
    );
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<TokenPayProviderQuote<AcrossQuote>>[]> {
    const quotes = await getAcrossQuotes(request);

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
    request: PayStrategyExecuteRequest<TokenPayProviderQuote<AcrossQuote>>,
  ): Promise<{ transactionHash?: Hex }> {
    const quotes = request.quotes.map((quote) => ({
      ...quote,
      original: quote.original.quote,
    }));

    return submitAcrossQuotes({
      ...request,
      quotes,
    } as PayStrategyExecuteRequest<AcrossQuote>);
  }
}
