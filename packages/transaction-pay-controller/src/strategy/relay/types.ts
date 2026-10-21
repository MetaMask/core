import type { Hex } from '@metamask/utils';

import type { TradeType } from '../../utils/trade-type.js';

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
  tradeType: TradeType;
  txs?: {
    to: Hex;
    data: Hex;
    value: Hex;
  }[];
  useDepositAddress?: boolean;
  strict?: boolean;
  user: Hex;
  metamask?: {
    executeVersion?: number;
  };
};

export type RelaySolanaQuoteRequest = {
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
  maxRouteLength?: number;
  originChainId: number;
  originCurrency: string;
  recipient: Hex;
  refundTo: string;
  tradeType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  txs?: {
    to: Hex;
    data: Hex;
    value: Hex;
  }[];
  user: string;
};

export type RelaySolanaInstructionKey = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type RelaySolanaInstruction = {
  programId: string;
  keys: RelaySolanaInstructionKey[];
  data: string;
};

export type RelaySolanaTransaction = {
  chainId?: number;
  instructions: RelaySolanaInstruction[];
  addressLookupTableAddresses?: string[];
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

export type RelaySolanaQuote = Pick<RelayQuote, 'details' | 'fees'> & {
  requestId: string;
  request: RelaySolanaQuoteRequest;
  steps: {
    id: string;
    items: {
      check: {
        endpoint: string;
        method: 'GET' | 'POST';
      };
      data: RelaySolanaTransaction;
      status: 'complete' | 'incomplete';
    }[];
    kind: 'transaction';
    requestId: string;
  }[];
};

type RelayQuoteMetamaskBase = {
  isExecute?: boolean;
  isMaxGasStation?: boolean;
  isSubsidized?: boolean;
  signature?: string;
};

export type RelayQuoteMetamask = RelayQuoteMetamaskBase & {
  gasLimits: number[];
  is7702: boolean;
};

export type RelayExecuteMetamask = {
  isSubsidized: boolean;
  quoteRequest: RelayQuoteRequest;
  signature: string;
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
  metamask: RelayExecuteMetamask;
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
  quoteCreatedAt?: number;
  failReason?: string;
  refundFailReason?: string;
  details?: Record<string, unknown>;
};

export type RelayCompletionOutcome = {
  status: RelayStatus | 'timeout' | 'source-failed';
  targetHash?: Hex;
};

/** Core-owned Solana affordability of a compiled quote, in atomic units. */
export type SolanaAffordability = {
  isAffordable: boolean;
  nativeShortfallRaw: string;
  requiredNativeBalanceRaw: string;
  requiredSourceBalanceRaw: string;
  sourceShortfallRaw: string;
};

/** Core-owned Solana execution data attached to a Relay Solana quote. */
export type RelaySolanaQuoteMetamask = {
  /** Whether native SOL and the source asset cover the quote, fee and rent. */
  affordability: SolanaAffordability;

  /** Network fee of the compiled transaction in lamports. */
  feeRaw: string;

  /**
   * Last block height at which the quote-time blockhash is valid.
   *
   * Diagnostic only: submission always recompiles with a fresh blockhash and
   * persists that `lastValidBlockHeight` on the Solana execution checkpoint.
   */
  lastValidBlockHeight: number;

  /** Rent-exempt reserve kept in the source account, in lamports. */
  rentReserveRaw: string;

  /** Base64 unsigned v0 transaction compiled at quote time. */
  transaction: string;
};

/** Relay /quote/v2 Solana quote with Core-owned execution data. */
export type RelaySolanaPayQuote = RelaySolanaQuote & {
  metamask: RelaySolanaQuoteMetamask;
};
