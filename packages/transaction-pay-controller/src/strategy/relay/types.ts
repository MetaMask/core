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
  originGasOverhead?: string;
  /** Required for HyperLiquid withdrawals (value: 'v2'). */
  protocolVersion?: string;
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
  metamask: RelayQuoteMetamask;
  request: RelayQuoteRequest;
  steps: (
    | RelayTransactionStep
    | RelaySignatureStep
    | RelayHyperliquidDepositStep
  )[];
};

export type RelayTransactionStep = {
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
};

export type RelaySignatureStep = {
  id: string;
  items: {
    data: {
      sign: {
        signatureKind: string;
        domain: Record<string, unknown>;
        types: Record<string, unknown>;
        value: Record<string, unknown>;
        primaryType: string;
      };
      post: {
        endpoint: string;
        method: 'POST';
        body: Record<string, unknown>;
      };
    };
    status: 'complete' | 'incomplete';
  }[];
  kind: 'signature';
  requestId: string;
};

/** HyperLiquid deposit step (sendAsset to Relay solver). */
export type RelayHyperliquidDepositStep = {
  id: string;
  items: {
    check: {
      endpoint: string;
      method: 'GET' | 'POST';
    };
    data: {
      action: {
        type: string;
        parameters: Record<string, unknown>;
      };
      nonce: number;
      eip712Types: Record<string, unknown>;
      eip712PrimaryType: string;
    };
    status: 'complete' | 'incomplete';
  }[];
  kind: 'transaction';
  requestId: string;
  depositAddress?: string;
};

type RelayQuoteMetamaskBase = {
  isExecute?: boolean;
  isMaxGasStation?: boolean;
};

export type RelayQuoteMetamask = RelayQuoteMetamaskBase & {
  gasLimits: number[];
  is7702: boolean;
};

export type RelayExecuteRequest = {
  executionKind: 'rawCalls';
  data: {
    chainId: number;
    to: Hex;
    data: Hex;
    value: string;
    authorizationList?: {
      chainId: number;
      address: Hex;
      nonce: number;
      yParity: number;
      r: Hex;
      s: Hex;
    }[];
  };
  executionOptions: {
    referrer?: string;
    subsidizeFees: boolean;
  };
  requestId?: string;
};

export type RelayExecuteResponse = {
  message: string;
  requestId: string;
};

export type RelayStatus =
  | 'delayed'
  | 'depositing'
  | 'failure'
  | 'pending'
  | 'refund'
  | 'refunded'
  | 'submitted'
  | 'success'
  | 'waiting';

export type RelayStatusResponse = {
  status: RelayStatus;
  inTxHashes: string[];
  txHashes: string[];
  updatedAt: number;
  originChainId: number;
  destinationChainId: number;
};
