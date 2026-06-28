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
  useDepositAddress?: boolean;
  strict?: boolean;
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

/**
 * Request body for POST /relay/subsidize.
 *
 * The server JIT-fetches a fresh subsidized Relay quote, pairs each step with
 * the corresponding signed permission context supplied by the client, builds
 * redeemDelegations calldata, and submits to Relay — returning the Relay
 * request ID for status polling.
 */
export type RelaySubsidizeRequest = {
  /**
   * Standard Relay quote request parameters passed through to Relay's /quote
   * endpoint verbatim (with subsidizeFees forced server-side).
   */
  quoteRequest: Record<string, unknown>;
  /**
   * Hex-encoded ABI-encoded Delegation[] permission contexts, one per expected
   * Relay step (always send 2 to cover both 1-step and 2-step quotes). Each is
   * signed with ERC20BalanceChangeEnforcer and LimitedCallsEnforcer caveats.
   * The server pairs delegations[i] with steps[i] when building the
   * redeemDelegations calldata from its JIT Relay quote.
   */
  delegations: string[];
  /**
   * Optional EIP-7702 authorization list. When present it is embedded in the
   * Relay execute body as data.authorizationList.
   */
  authorizationList?: {
    chainId: number;
    address: Hex;
    nonce: number;
    yParity: number;
    r: Hex;
    s: Hex;
  }[];
  /**
   * Address of the 7702 account redeeming the delegations. Used as the user
   * field in the Relay execute body.
   */
  from: string;
};

/** Response body from POST /relay/subsidize. */
export type RelaySubsidizeResponse = {
  /** Relay request ID — poll GET /relay/status?requestId=<this> */
  requestId: string;
};
