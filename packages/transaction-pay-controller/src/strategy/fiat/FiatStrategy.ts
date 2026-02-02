import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { TransactionPayStrategy } from '../..';
import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';

const log = createModuleLogger(projectLogger, 'fiat-strategy');

const MOCK_TRANSACTION_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

const POC_DELAY_MS = 5000; // 5 seconds

export class FiatStrategy implements PayStrategy<void> {
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<void>[]> {
    const { messenger, requests, transaction } = request;

    log('Getting fiat quotes (PoC mock)', { transactionId: transaction.id });

    // Get required tokens from controller state to compute fee
    const state = messenger.call('TransactionPayController:getState');
    const transactionData = state.transactionData?.[transaction.id];
    const tokens = transactionData?.tokens ?? [];

    // Sum up the USD amounts of required tokens (excluding skipIfBalance)
    const requiredTokens = tokens.filter((token) => !token.skipIfBalance);
    const baseAmountUsd = requiredTokens.reduce(
      (sum, token) => sum + parseFloat(token.amountUsd || '0'),
      0,
    );

    // Compute 2% provider fee
    const providerFeeUsd = baseAmountUsd * 0.02;

    // Use the dummy request passed in (from buildFiatQuoteRequests)
    const dummyRequest = requests[0];

    // PoC: Return a single mocked quote with computed fee
    return [
      {
        dust: { fiat: '0', usd: '0' },
        estimatedDuration: POC_DELAY_MS / 1000,
        fees: {
          provider: {
            fiat: providerFeeUsd.toFixed(2),
            usd: providerFeeUsd.toFixed(2),
          },
          sourceNetwork: {
            estimate: {
              human: '0',
              fiat: '0',
              usd: '0',
              raw: '0',
            },
            max: {
              human: '0',
              fiat: '0',
              usd: '0',
              raw: '0',
            },
          },
          targetNetwork: {
            fiat: '0',
            usd: '0',
          },
        },
        original: undefined,
        request: dummyRequest,
        sourceAmount: {
          human: baseAmountUsd.toFixed(2),
          fiat: baseAmountUsd.toFixed(2),
          raw: baseAmountUsd.toFixed(2),
          usd: baseAmountUsd.toFixed(2),
        },
        targetAmount: {
          human: baseAmountUsd.toFixed(2),
          fiat: baseAmountUsd.toFixed(2),
          raw: baseAmountUsd.toFixed(2),
          usd: baseAmountUsd.toFixed(2),
        },
        strategy: TransactionPayStrategy.Fiat,
      },
    ];
  }

  async execute(
    request: PayStrategyExecuteRequest<void>,
  ): ReturnType<PayStrategy<void>['execute']> {
    const { quotes } = request;

    log('Executing fiat strategy (PoC mock)', quotes);
    log(`Waiting ${POC_DELAY_MS / 1000} seconds...`);

    await this.#timeout(POC_DELAY_MS);

    log('Returning mock transaction hash:', MOCK_TRANSACTION_HASH);

    return { transactionHash: MOCK_TRANSACTION_HASH };
  }

  #timeout(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
