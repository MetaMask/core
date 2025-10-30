import type { Hex } from '@metamask/utils';

export type RelayQuote = {
  details: {
    currencyIn: {
      amountUsd: string;
    };
    currencyOut: {
      amountFormatted: string;
      amountUsd: string;
      currency: {
        decimals: number;
      };
      minimumAmount: string;
    };
    timeEstimate: number;
  };
  fees: {
    gas: {
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
        gas: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
        to: Hex;
        value: string;
      };
      status: 'complete' | 'incomplete';
    }[];
    kind: 'transaction';
  }[];
  skipTransaction?: boolean;
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
