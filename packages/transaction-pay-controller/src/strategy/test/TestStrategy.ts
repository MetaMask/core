import { createModuleLogger } from '@metamask/utils';

import { TransactionPayStrategy } from '../..';
import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';

const log = createModuleLogger(projectLogger, 'test-strategy');

export class TestStrategy implements PayStrategy<void> {
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<void>[]> {
    const { requests } = request;

    log('Getting quotes', requests);

    await this.#timeout(5000);

    return [
      {
        dust: { fiat: '0.12', usd: '0.34' },
        estimatedDuration: 5,
        fees: {
          provider: { fiat: '1.23', usd: '1.23' },
          sourceNetwork: { fiat: '2.34', usd: '2.34' },
          targetNetwork: { fiat: '3.45', usd: '3.45' },
        },
        original: undefined,
        request: requests[0],
        strategy: TransactionPayStrategy.Test,
      },
    ];
  }

  async execute(request: PayStrategyExecuteRequest<void>) {
    const { quotes } = request;

    log('Executing', quotes);

    await this.#timeout(5000);

    return { transactionHash: undefined };
  }

  #timeout(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
