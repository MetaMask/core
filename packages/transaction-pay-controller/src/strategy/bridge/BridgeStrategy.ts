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
} from '../../types';

export class BridgeStrategy implements PayStrategy<TransactionPayBridgeQuote> {
  async getQuotes(request: PayStrategyGetQuotesRequest) {
    return getBridgeQuotes(request);
  }

  async getBatchTransactions(
    request: PayStrategyGetBatchRequest<TransactionPayBridgeQuote>,
  ) {
    return getBridgeBatchTransactions(request);
  }

  async getRefreshInterval(request: PayStrategyGetRefreshIntervalRequest) {
    return getBridgeRefreshInterval(request);
  }

  async execute(request: PayStrategyExecuteRequest<TransactionPayBridgeQuote>) {
    const { isSmartTransaction, quotes, messenger, transaction } = request;
    const from = transaction.txParams.from as Hex;

    await submitBridgeQuotes({
      from,
      isSmartTransaction,
      messenger,
      quotes,
      transaction,
    });

    return { transactionHash: undefined };
  }
}
