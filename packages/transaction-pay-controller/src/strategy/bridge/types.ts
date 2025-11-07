import type { QuoteResponse } from '@metamask/bridge-controller';

import type { QuoteRequest } from '../../types';

export type TransactionPayBridgeQuote = QuoteResponse & {
  metrics?: {
    attempts: number;
    buffer: number;
    latency: number;
  };
  request: BridgeQuoteRequest;
};

export type BridgeQuoteRequest = QuoteRequest & {
  attemptsMax: number;
  bufferInitial: number;
  bufferStep: number;
  bufferSubsequent: number;
  slippage: number;
  sourceBalanceRaw: string;
};

export type BridgeFeatureFlags = {
  chains?: {
    [chainId: number]: {
      refreshRate?: number;
    };
  };
  refreshRate?: number;
};
