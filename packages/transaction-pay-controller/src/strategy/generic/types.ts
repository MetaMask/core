import type { Hex } from '@metamask/utils';

/** Provider names supported by the generic intents API. */
export enum GenericProviderName {
  Relay = 'relay',
  Across = 'across',
}

/** Trade type for generic quote requests. */
export enum GenericTradeType {
  ExactInput = 'EXACT_INPUT',
  ExpectedOutput = 'EXPECTED_OUTPUT',
}

/** Token amount with chain and token context. */
export type GenericQuoteAmount = {
  chainId: number;
  token: string;
  decimals: number;
  raw: string;
  formatted: string;
};

/** A single on-chain step returned by the generic quote endpoint. */
export type GenericQuoteStep = {
  chainId: number;
  to: Hex;
  data: Hex;
  value: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

/** A call to include in the quote request (for delegation flows). */
export type GenericCall = {
  to: Hex;
  data: Hex;
  value: Hex;
};

/** EIP-7702 authorization entry for quote and submit requests. */
export type GenericAuthorization = {
  address: Hex;
  chainId: number;
  nonce: number;
  r: Hex;
  s: Hex;
  yParity: number;
};

/** Request body for POST /quote. */
export type GenericQuoteRequest = {
  source: { chainId: number; token: Hex };
  target: { chainId: number; token: Hex };
  amount: string;
  tradeType: GenericTradeType;
  sender: Hex;
  recipient: Hex;
  refundTo?: Hex;
  slippage?: number;
  providers?: GenericProviderName[];
  calls?: GenericCall[];
  authorizationList?: GenericAuthorization[];
  supportsGasless?: boolean;
};

/** Error detail from a rejected quote result. */
export type GenericQuoteError = {
  code?: string;
  message: string;
};

/** A successful quote payload nested inside a GenericQuoteResult. */
export type GenericQuotePayload = {
  id: string;
  input: GenericQuoteAmount;
  output: GenericQuoteAmount;
  fees: GenericQuoteFees;
  duration: number;
  steps: GenericQuoteStep[];
  gasless: boolean;
};

/** Fee breakdown from a quote. */
export type GenericQuoteFees = {
  metamask: string;
  provider: string;
  subsidized: boolean;
};

/** A single provider result within the quote response. */
export type GenericQuoteResult = {
  provider: GenericProviderName;
  quote?: GenericQuotePayload;
  error?: GenericQuoteError;
};

/** Response body from POST /quote. */
export type GenericQuoteResponse = {
  results: GenericQuoteResult[];
};

/** Normalized generic quote stored in TransactionPayQuote.original. */
export type GenericQuote = {
  id: string;
  provider: GenericProviderName;
  input: GenericQuoteAmount;
  output: GenericQuoteAmount;
  fees: GenericQuoteFees;
  duration: number;
  steps: GenericQuoteStep[];
  gasless: boolean;
};

/** Status values returned by GET /status. */
export enum GenericStatus {
  Pending = 'PENDING',
  Submitted = 'SUBMITTED',
  Confirmed = 'CONFIRMED',
  Failed = 'FAILED',
  Refunded = 'REFUNDED',
  Unknown = 'UNKNOWN',
}

/** Response body from GET /status. */
export type GenericStatusResponse = {
  status: GenericStatus;
  sourceHash?: Hex;
  targetHash?: Hex;
  error?: string;
};

/** Request body for POST /submit. */
export type GenericSubmitRequest = {
  provider: GenericProviderName;
  id: string;
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

/** Response body from POST /submit. */
export type GenericSubmitResponse = {
  success: boolean;
  error?: string;
};
