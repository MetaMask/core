import type { BatchTransaction } from '@metamask/transaction-controller';

import { getTokenPayProviders } from './provider-registry';
import type { TokenPayProvider, TokenPayProviderQuote } from './types';
import { TransactionPayStrategy } from '../..';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyGetRefreshIntervalRequest,
  TransactionPayQuote,
} from '../../types';
import { getTokenPayConfig } from '../../utils/feature-flags';

export class TokenPayStrategy
  implements PayStrategy<TokenPayProviderQuote<unknown>>
{
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<TokenPayProviderQuote<unknown>>[]> {
    const provider = this.#selectProvider(request);
    return provider.getQuotes(request);
  }

  async getBatchTransactions(
    request: PayStrategyGetBatchRequest<TokenPayProviderQuote<unknown>>,
  ): Promise<BatchTransaction[]> {
    const provider = this.#selectProviderFromQuotes(request.quotes);

    if (!provider?.getBatchTransactions) {
      return [];
    }

    return provider.getBatchTransactions(request as never);
  }

  async getRefreshInterval(
    request: PayStrategyGetRefreshIntervalRequest,
  ): Promise<number | undefined> {
    const provider = this.#selectProviderByConfig(request);
    return provider?.getRefreshInterval?.(request) ?? undefined;
  }

  async execute(
    request: PayStrategyExecuteRequest<TokenPayProviderQuote<unknown>>,
  ): ReturnType<PayStrategy<TokenPayProviderQuote<unknown>>['execute']> {
    const provider = this.#selectProviderFromQuotes(request.quotes);

    if (!provider) {
      throw new Error('Token Pay provider not found for execute');
    }

    return provider.execute(request as never);
  }

  #selectProvider(
    request: PayStrategyGetQuotesRequest,
  ): TokenPayProvider<unknown> {
    const { providerOrder } = getTokenPayConfig(request.messenger);
    const providers = getTokenPayProviders();

    for (const providerId of providerOrder) {
      const provider = providers.find(
        (providerEntry) => providerEntry.id === providerId,
      );
      if (provider?.supports(request)) {
        return provider;
      }
    }

    throw new Error('No supported Token Pay provider found');
  }

  #selectProviderFromQuotes(
    quotes: TransactionPayQuote<TokenPayProviderQuote<unknown>>[],
  ): TokenPayProvider<unknown> | undefined {
    const providerId = quotes[0]?.original?.providerId;

    if (!providerId) {
      return undefined;
    }

    return getTokenPayProviders().find(
      (providerEntry) => providerEntry.id === providerId,
    );
  }

  #selectProviderByConfig(
    request: PayStrategyGetRefreshIntervalRequest,
  ): TokenPayProvider<unknown> | undefined {
    const config = getTokenPayConfig(request.messenger);
    const providers = getTokenPayProviders();
    for (const providerId of config.providerOrder) {
      const provider = providers.find(
        (providerEntry) => providerEntry.id === providerId,
      );
      if (!provider) {
        continue;
      }

      if (provider.id === 'relay' && !config.providers.relay.enabled) {
        continue;
      }

      if (provider.id === 'across' && !config.providers.across.enabled) {
        continue;
      }

      return provider;
    }

    return providers[0];
  }
}

export function isTokenPayStrategy(strategy: TransactionPayStrategy): boolean {
  return strategy === TransactionPayStrategy.TokenPay;
}
