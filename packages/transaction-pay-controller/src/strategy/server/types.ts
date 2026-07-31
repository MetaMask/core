import type { Hex } from '@metamask/utils';

/** Provider names supported by the server intents API. */
export enum ServerProviderName {
  Relay = 'relay',
  Across = 'across',
}

/** Trade type for server quote requests. */
export enum ServerTradeType {
  ExactInput = 'EXACT_INPUT',
  ExpectedOutput = 'EXPECTED_OUTPUT',
}

/** Token amount with chain and token context. */
export type ServerQuoteAmount = {
  chainId: number;
  token: string;
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

export type ServerStep = ServerTransactionStep | ServerSignatureStep;

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
  source: { chainId: number; token: Hex };
  target: { chainId: number; token: Hex };
  amount: string;
  tradeType: ServerTradeType;
  sender: Hex;
  recipient: Hex;
  refundTo?: Hex;
  slippage?: number;
  providers?: ServerProviderName[];
  calls?: ServerCall[];
  authorizationList?: ServerAuthorization[];
  supportsGasless?: boolean;
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
};

/** Fee breakdown from a quote. */
export type ServerQuoteFees = {
  metamask: string;
  provider: string;
  subsidized: boolean;
};

/** A single provider result within the quote response. */
export type ServerQuoteResult = {
  provider: ServerProviderName;
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
  id: string;
  provider: ServerProviderName;
  input: ServerQuoteAmount;
  output: ServerQuoteAmount;
  fees: ServerQuoteFees;
  duration: number;
  client: ServerQuoteClient;
  steps: ServerStep[];
  gasless: boolean;
};

/** Status values returned by GET /status. */
export enum ServerStatus {
  Pending = 'PENDING',
  Submitted = 'SUBMITTED',
  Confirmed = 'CONFIRMED',
  Failed = 'FAILED',
  Refunded = 'REFUNDED',
  Unknown = 'UNKNOWN',
}

/** Response body from GET /status. */
export type ServerStatusResponse = {
  status: ServerStatus;
  sourceHash?: Hex;
  targetHash?: Hex;
  error?: string;
};

/** Request body for POST /submit. */
export type ServerSubmitRequest = {
  provider: ServerProviderName;
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
export type ServerSubmitResponse = {
  success: boolean;
  error?: string;
};
