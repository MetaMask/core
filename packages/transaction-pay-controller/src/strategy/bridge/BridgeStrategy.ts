import type { QuoteResponse } from '@metamask/bridge-controller';
import type { Hex } from '@metamask/utils';
import { noop } from 'lodash';

import { getBridgeQuotes } from './bridge-quotes';
import { submitBridgeQuotes } from './bridge-submit';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
} from '../../types';

export class BridgeStrategy implements PayStrategy<QuoteResponse> {
  async getQuotes(request: PayStrategyGetQuotesRequest) {
    const { messenger, requests } = request;

    return getBridgeQuotes(requests, messenger);
  }

  async execute(request: PayStrategyExecuteRequest<QuoteResponse>) {
    const { isSmartTransaction, quotes, messenger, transaction } = request;
    const from = transaction.txParams.from as Hex;

    await submitBridgeQuotes({
      from,
      isSmartTransaction,
      messenger,
      quotes,
      updateTransaction: noop,
    });

    return { transactionHash: undefined };
  }
}
