import type { Base58 } from '@metamask/transaction-controller';
import type { CaipAssetType, Hex } from '@metamask/utils';

import type { SolanaTransactionInstructions } from '../../utils/solana.js';
import type { TradeType } from '../../utils/trade-type.js';

/** Token amount with its CAIP-19 asset ID. */
export type ServerQuoteAmount = {
  asset: CaipAssetType;
  decimals: number;
  raw: string;
  formatted: string;
};

export type ServerTransactionStep = {
  type: 'transaction';
  chainId: number;
  to: Hex;
  data: Hex;
  value: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

export type ServerSignatureStep = {
  type: 'signature';
  sign: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    value: Record<string, unknown>;
  };
  post: {
    endpoint: string;
    method: string;
    body: Record<string, unknown>;
    signatureFormat: 'queryParam' | 'rsv';
  };
};

/**
 * Solana transaction for the sender to compile with a recent blockhash, sign
 * and broadcast.
 */
export type ServerSolanaTransactionStep = SolanaTransactionInstructions & {
  type: 'solanaTransaction';
};

export type ServerStep =
  | ServerTransactionStep
  | ServerSignatureStep
  | ServerSolanaTransactionStep;

/** A call to include in the quote request (for delegation flows). */
export type ServerCall = {
  to: Hex;
  data: Hex;
  value: Hex;
};

/** EIP-7702 authorization entry for quote and submit requests. */
export type ServerAuthorization = {
  address: Hex;
  chainId: number;
  nonce: number;
  r: Hex;
  s: Hex;
  yParity: number;
};

/** Request body for POST /quote. */
export type ServerQuoteRequest = {
  /** CAIP-19 asset ID of the source token. */
  sourceAsset: CaipAssetType;

  /** CAIP-19 asset ID of the target token. */
  targetAsset: CaipAssetType;

  amount: string;
  tradeType: TradeType;

  /** Sender on the source chain, a base58 address for a Solana source. */
  sender: Hex | Base58;

  /** Address of the recipient, or another identifier such as a Lighter account index. */
  recipient: string;

  /** Refund address on the source chain, a base58 address for a Solana source. */
  refundTo?: Hex | Base58;
  slippage?: number;
  providers?: string[];
  calls?: ServerCall[];
  authorizationList?: ServerAuthorization[];
  supportsDeferredCalls?: boolean;
  supportsGasless?: boolean;

  /**
   * Whether the recipient must receive exactly `amount`, with any swap surplus
   * kept by the provider rather than sent to the recipient. Requires an exact
   * output trade type. Providers that cannot guarantee this
   * decline the request.
   */
  useTrueExactOutput?: boolean;

  /**
   * Whether the quote is funded with a plain token transfer to a provider
   * deposit address, rather than by calling the provider contracts. The
   * transfer must not include any additional calldata, such as an appended
   * request ID.
   */
  useDepositAddress?: boolean;
};

/** Error detail from a rejected quote result. */
export type ServerQuoteError = {
  code?: string;
  message: string;
};

/** A successful quote payload nested inside a ServerQuoteResult. */
export type ServerQuotePayload = {
  id: string;
  input: ServerQuoteAmount;
  output: ServerQuoteAmount;
  fees: ServerQuoteFees;
  duration: number;
  steps: ServerStep[];
  gasless: boolean;
  callsDeferred?: boolean;
  /** Opaque value to send back unchanged when submitting the quote. */
  signature?: string;
};

/** Fee breakdown from a quote. */
export type ServerQuoteFees = {
  metamask: string;
  provider: string;
  subsidized: boolean;
};

/** A single provider result within the quote response. */
export type ServerQuoteResult = {
  provider: string;
  quote?: ServerQuotePayload;
  error?: ServerQuoteError;
};

/** Response body from POST /quote. */
export type ServerQuoteResponse = {
  results: ServerQuoteResult[];
};

export type ServerQuoteClient = {
  gasLimits: number[];
  is7702: boolean;
  maxFeePerGas: string | undefined;
  maxPriorityFeePerGas: string | undefined;
};

/** Normalized server quote stored in TransactionPayQuote.original. */
export type ServerQuote = {
  /**
   * Signed EIP-7702 authorizations sent with the quote request, kept when the
   * quote embeds the calls, so a non-gasless submit can upgrade the account.
   */
  authorizationList?: ServerAuthorization[];
  id: string;
  provider: string;
  input: ServerQuoteAmount;
  output: ServerQuoteAmount;
  fees: ServerQuoteFees;
  duration: number;
  client: ServerQuoteClient;
  steps: ServerStep[];
  gasless: boolean;

  /** Opaque value to send back unchanged when submitting the quote. */
  signature?: string;

  /** Solana source details, set when the quote is paid with a Solana asset. */
  solana?: ServerSolanaQuote;
};

/** Solana source details of a server quote, all amounts in lamports. */
export type ServerSolanaQuote = {
  /** Network fee of the compiled source transaction. */
  feeRaw: string;

  /** Rent-exempt reserve kept in the source account. */
  rentReserveRaw: string;
};

/** Log from the source transaction receipt sent to POST /status. */
export type ServerStatusLog = {
  address: Hex;
  data: Hex;
  topics: Hex[];
};

/** Status values returned by POST /status. */
export enum ServerStatus {
  Pending = 'PENDING',
  Submitted = 'SUBMITTED',
  Confirmed = 'CONFIRMED',
  Failed = 'FAILED',
  Refunded = 'REFUNDED',
  Timeout = 'TIMEOUT',
  Unknown = 'UNKNOWN',
}

/** Response body from POST /status. */
export type ServerStatusResponse = {
  status: ServerStatus;
  sourceHash?: Hex | Base58;
  targetHash?: Hex;
  error?: string;
};

/** Request body for POST /submit. */
export type ServerSubmitRequest = {
  provider: string;
  id: string;
  chainId: number;
  to: Hex;
  data: Hex;
  value: string;
  signature?: string;
  authorizationList?: {
    chainId: number;
    address: Hex;
    nonce: number;
    yParity: number;
    r: Hex;
    s: Hex;
  }[];
};

/** Response body from POST /submit. */
export type ServerSubmitResponse = {
  success: boolean;
  /** Provider request ID to poll status with, if different to the quote ID. */
  id?: string;
  error?: string;
};
