import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getServerQuotes } from './server-quotes';
import { submitServerQuotes } from './server-submit';
import type { ServerQuote } from './types';

export class ServerStrategy implements PayStrategy<ServerQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);
    return config.server.enabled;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<ServerQuote>[]> {
    return getServerQuotes(request);
  }

  async getBatchTransactions(): Promise<[]> {
    return [];
  }

  async execute(
    request: PayStrategyExecuteRequest<ServerQuote>,
  ): ReturnType<PayStrategy<ServerQuote>['execute']> {
    try {
      return await submitServerQuotes(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Server submit: ${message}`);
    }
  }
}
