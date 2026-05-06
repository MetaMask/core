import type { Hex } from '@metamask/utils';

/** Quote returned by Polymarket Bridge /quote endpoint. */
export type PolymarketBridgeQuote = {
  /** Unique quote identifier. */
  quoteId: string;
  /** One-shot deposit address; null until execute() mints it via /withdraw. */
  bridgeDepositAddress: Hex | null;
  /** Amount being sent, in base units (e.g. 6 decimals for pUSD). */
  fromAmount: string;
  /** Estimated tokens received, in base units. */
  toAmount: string;
  /** Minimum amount the user will receive. */
  minReceived: string;
  /** Estimated checkout time in milliseconds. */
  estCheckoutTimeMs: number;
  /** Fee breakdown from Polymarket (typically all zero for pUSD→USDC). */
  estFeeBreakdown: PolymarketBridgeFeeBreakdown;
};

/** Fee breakdown from Bridge /quote response. */
export type PolymarketBridgeFeeBreakdown = {
  gasUsd: number;
  appFeeUsd: number;
  swapImpactUsd: number;
};

/** EIP-712 Batch structure for DepositWallet. */
export type PolymarketBridgeWalletBatch = {
  /** Deposit wallet address. */
  wallet: Hex;
  /** Relayer nonce for the wallet. */
  nonce: string;
  /** Unix timestamp deadline. */
  deadline: number;
  /** Calls to execute in the batch. */
  calls: PolymarketBridgeWalletCall[];
};

/** Single call within a DepositWallet Batch. */
export type PolymarketBridgeWalletCall = {
  /** Target contract address. */
  target: Hex;
  /** ETH value (usually 0n for token transfers). */
  value: bigint;
  /** Encoded calldata. */
  data: Hex;
};

/** Request body for relayer /submit (WALLET type). */
export type PolymarketBridgeRelayerSubmitRequest = {
  /** Request type. */
  type: 'WALLET';
  /** Owner/signer EOA address. */
  from: Hex;
  /** Deposit wallet factory address. */
  to: Hex;
  /** Wallet nonce (fetched from relayer). */
  nonce: string;
  /** 65-byte EIP-712 Batch signature. */
  signature: Hex;
  /** Deposit wallet batch parameters. */
  depositWalletParams: {
    /** Deposit wallet contract address. */
    depositWallet: Hex;
    /** Unix timestamp deadline as string. */
    deadline: string;
    /** Calls to execute in the batch. */
    calls: {
      target: string;
      value: string;
      data: string;
    }[];
  };
};

/** Response from relayer /submit. */
export type PolymarketBridgeRelayerSubmitResponse = {
  /** Transaction tracking ID. */
  transactionID: string;
  /** Initial state. */
  state: string;
};

/** Response from relayer /transaction?id=. */
export type PolymarketBridgeRelayerStatusResponse = {
  /** On-chain transaction hash (available once STATE_MINED or later). */
  transactionHash: string | null;
  /** Current state. */
  state: PolymarketRelayerState;
  /** Signer address. */
  from: string;
  /** Target address. */
  to: string;
  /** Proxy wallet address. */
  proxyAddress: string;
  /** Hex-encoded data. */
  data: string;
  /** Nonce. */
  nonce: string;
  /** Signature. */
  signature: string;
  /** Transaction type. */
  type: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  updatedAt: string;
};

/** Relayer transaction states. */
export type PolymarketRelayerState =
  | 'STATE_NEW'
  | 'STATE_EXECUTED'
  | 'STATE_MINED'
  | 'STATE_CONFIRMED'
  | 'STATE_INVALID'
  | 'STATE_FAILED';

export type PolymarketBridgeRelayerApiKeyAuth = {
  authType: 'relayer-api-key';
  environment: 'prod' | 'preprod';
  relayerApiKey: string;
  relayerApiKeyAddress: string;
};

export type PolymarketBridgeBuilderAuth = {
  authType: 'builder';
  environment: 'prod' | 'preprod';
  builderApiKey: string;
  builderSecret: string;
  builderPassphrase?: string;
};

export type PolymarketBridgeStrategyOptions =
  | PolymarketBridgeRelayerApiKeyAuth
  | PolymarketBridgeBuilderAuth;
