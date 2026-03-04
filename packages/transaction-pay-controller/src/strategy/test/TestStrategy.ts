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
          metaMask: { fiat: '0', usd: '0' },
          provider: { fiat: '1.23', usd: '1.23' },
          sourceNetwork: {
            estimate: {
              human: '2.34',
              fiat: '2.34',
              usd: '2.34',
              raw: '234000',
            },
            max: {
              human: '2.35',
              fiat: '2.35',
              usd: '2.35',
              raw: '235000',
            },
          },
          targetNetwork: {
            fiat: '3.45',
            usd: '3.45',
          },
        },
        original: undefined,
        request: requests[0],
        sourceAmount: {
          human: '4.56',
          fiat: '4.56',
          raw: '456000',
          usd: '4.56',
        },
        targetAmount: {
          fiat: '5.67',
          usd: '5.67',
        },
        strategy: TransactionPayStrategy.Test,
      },
    ];
  }

  async execute(
    request: PayStrategyExecuteRequest<void>,
  ): ReturnType<PayStrategy<void>['execute']> {
    const { quotes } = request;

    log('Executing', quotes);

    await this.#timeout(5000);

    return { transactionHash: undefined };
  }

  #timeout(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
