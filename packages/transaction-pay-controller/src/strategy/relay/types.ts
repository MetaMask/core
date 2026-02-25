import type { Hex } from '@metamask/utils';

export type RelayQuoteRequest = {
  amount: string;
  authorizationList?: {
    address: Hex;
    chainId: number;
    nonce: number;
    r: Hex;
    s: Hex;
    yParity: number;
  }[];
  destinationChainId: number;
  destinationCurrency: Hex;
  originChainId: number;
  originCurrency: Hex;
  recipient: Hex;
  refundTo?: Hex;
  slippageTolerance?: string;
  tradeType: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'EXPECTED_OUTPUT';
  txs?: {
    to: Hex;
    data: Hex;
    value: Hex;
  }[];
  user: Hex;
};

export type RelayQuote = {
  details: {
    currencyIn: {
      amount: string;
      amountFormatted: string;
      amountUsd: string;
      currency: {
        chainId: number;
        decimals: number;
      };
    };
    currencyOut: {
      amount: string;
      amountFormatted: string;
      amountUsd: string;
      currency: {
        chainId: number;
        decimals: number;
      };
      minimumAmount: string;
    };
    timeEstimate: number;
    totalImpact: {
      usd: string;
    };
  };
  fees: {
    app?: {
      amountUsd: string;
    };
    relayer: {
      amountUsd: string;
    };
    subsidized?: {
      amount: string;
      amountFormatted: string;
      amountUsd: string;
      currency: {
        address: Hex;
        chainId: number;
        decimals: number;
      };
      minimumAmount: string;
    };
  };
  metamask: {
    gasLimits: number[];
  };
  request: RelayQuoteRequest;
  steps: {
    id: string;
    items: {
      check: {
        endpoint: string;
        method: 'GET' | 'POST';
      };
      data: {
        chainId: number;
        data: Hex;
        from: Hex;
        gas?: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
        to: Hex;
        value?: string;
      };
      status: 'complete' | 'incomplete';
    }[];
    kind: 'transaction';
    requestId: string;
  }[];
};

export type RelayStatus =
  | 'waiting'
  | 'pending'
  | 'submitted'
  | 'success'
  | 'delayed'
  | 'refunded'
  | 'refund'
  | 'failure';

export type RelayStatusResponse = {
  status: RelayStatus;
  inTxHashes: string[];
  txHashes: string[];
  updatedAt: number;
  originChainId: number;
  destinationChainId: number;
};
