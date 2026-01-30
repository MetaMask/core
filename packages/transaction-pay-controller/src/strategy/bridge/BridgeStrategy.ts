import { BatchTransaction } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  getBridgeBatchTransactions,
  getBridgeQuotes,
  getBridgeRefreshInterval,
} from './bridge-quotes';
import { submitBridgeQuotes } from './bridge-submit';
import type { TransactionPayBridgeQuote } from './types';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyGetRefreshIntervalRequest,
  TransactionPayQuote,
} from '../../types';

export class BridgeStrategy implements PayStrategy<TransactionPayBridgeQuote> {
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<TransactionPayBridgeQuote>[]> {
    return getBridgeQuotes(request);
  }

  async getBatchTransactions(
    request: PayStrategyGetBatchRequest<TransactionPayBridgeQuote>,
  ): Promise<BatchTransaction[]> {
    return getBridgeBatchTransactions(request);
  }

  async getRefreshInterval(
    request: PayStrategyGetRefreshIntervalRequest,
  ): Promise<number | undefined> {
    return getBridgeRefreshInterval(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<TransactionPayBridgeQuote>,
  ): ReturnType<PayStrategy<TransactionPayBridgeQuote>['execute']> {
    const { isSmartTransaction, onSubmitted, quotes, messenger, transaction } =
      request;
    const from = transaction.txParams.from as Hex;

    await submitBridgeQuotes({
      from,
      isSmartTransaction,
      messenger,
      onSubmitted,
      quotes,
      transaction,
    });

    return { transactionHash: undefined };
  }
}
