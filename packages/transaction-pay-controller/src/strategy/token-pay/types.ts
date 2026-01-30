import type { BatchTransaction } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type {
  PayStrategyExecuteRequest,
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyGetRefreshIntervalRequest,
  TransactionPayQuote,
} from '../../types';

export type TokenPayProviderId = 'relay' | 'across';

export type TokenPayProviderQuote<OriginalQuote> = {
  providerId: TokenPayProviderId;
  quote: OriginalQuote;
};

export type TokenPayProvider<OriginalQuote> = {
  id: TokenPayProviderId;
  supports: (request: PayStrategyGetQuotesRequest) => boolean;
  getQuotes: (
    request: PayStrategyGetQuotesRequest,
  ) => Promise<TransactionPayQuote<TokenPayProviderQuote<OriginalQuote>>[]>;
  getBatchTransactions?: (
    request: PayStrategyGetBatchRequest<TokenPayProviderQuote<OriginalQuote>>,
  ) => Promise<BatchTransaction[]>;
  getRefreshInterval?: (
    request: PayStrategyGetRefreshIntervalRequest,
  ) => Promise<number | undefined>;
  execute: (
    request: PayStrategyExecuteRequest<TokenPayProviderQuote<OriginalQuote>>,
  ) => Promise<{ transactionHash?: Hex }>;
};
