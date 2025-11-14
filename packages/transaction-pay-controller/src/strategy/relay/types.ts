import type { Hex } from '@metamask/utils';

export type RelayQuote = {
  details: {
    currencyIn: {
      amountFormatted: string;
      amountUsd: string;
      currency: {
        chainId: number;
        decimals: number;
      };
    };
    currencyOut: {
      amountFormatted: string;
      amountUsd: string;
      currency: {
        chainId: number;
        decimals: number;
      };
      minimumAmount: string;
    };
    timeEstimate: number;
  };
  fees: {
    relayer: {
      amountUsd: string;
    };
  };
  steps: {
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
        value: string;
      };
      status: 'complete' | 'incomplete';
    }[];
    kind: 'transaction';
  }[];
};

export type RelayStatus = {
  status:
    | 'refund'
    | 'waiting'
    | 'failure'
    | 'pending'
    | 'submitted'
    | 'success';
  inTxHashes: string[];
  txHashes: string[];
  updatedAt: number;
  originChainId: number;
  destinationChainId: number;
};
