import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger.js';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getServerQuotes } from './server-quotes.js';
import { submitServerQuotes } from './server-submit.js';
import { getServerUnsupportedReason } from './server-support.js';
import type { ServerQuote } from './types.js';

const log = createModuleLogger(projectLogger, 'server-strategy');

/**
 * Pay strategy that routes quote, submit, and status requests through the
 * MetaMask intents API. Supports both gasless (delegated server-execute) and
 * non-gasless (TransactionController-submitted) execution paths. Gated by the
 * `payStrategies.server.enabled` remote feature flag, then narrowed per flow by
 * `payStrategies.server.enabledTransactionTypes`.
 */
export class ServerStrategy implements PayStrategy<ServerQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);

    if (!config.server.enabled) {
      return false;
    }

    const reason = getServerUnsupportedReason({
      enabledTransactionTypes: config.server.enabledTransactionTypes,
      requests: request.requests,
      transaction: request.transaction,
    });

    if (reason) {
      log('Unsupported request', {
        reason,
        transactionType: request.transaction?.type,
      });

      return false;
    }

    return true;
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
