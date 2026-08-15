/**
 * Lighter Protocol Type Definitions
 *
 * Types for the zkLighter REST API, the Go/WASM signer bridge, and
 * provider configuration. No SDK dependency — shapes are derived from
 * the public API (https://apidocs.lighter.xyz) and the reference
 * WebView bridge (elliottech/lighter-go, `web-wasm` branch).
 */

// ============================================================================
// Network Configuration Types
// ============================================================================

/**
 * Lighter Network type - mainnet or testnet
 */
export type LighterNetwork = 'mainnet' | 'testnet';

/**
 * Lighter endpoint configuration for a single network
 */
export type LighterEndpointConfig = {
  http: string;
  ws: string;
};

/**
 * Lighter endpoints for all networks
 */
export type LighterEndpoints = {
  mainnet: LighterEndpointConfig;
  testnet: LighterEndpointConfig;
};

// ============================================================================
// Signer Bridge (WASM seam)
// ============================================================================

/**
 * A single call into the Lighter Go/WASM signer.
 *
 * Mirrors the postMessage protocol of the reference React Native WebView
 * bridge (`{ function, params }`), so a WebView-backed bridge on mobile and
 * an in-process WASM bridge in Node are interchangeable implementations.
 */
export type LighterWasmCall = {
  /** Global function name registered by the WASM module (e.g. `_createClient`). */
  function: string;
  /** Positional arguments forwarded verbatim to the WASM function. */
  params: unknown[];
};

/**
 * Transport-agnostic seam to the Lighter Go/WASM signer.
 *
 * Implementations:
 * - Mobile: off-screen WebView loading the locally-bundled
 *   `wasm-wrapper.standalone.html`, dispatching calls via postMessage.
 * - Node (e2e): in-process `WebAssembly.instantiate` via Go's `wasm_exec.js`.
 */
export type LighterSignerBridge = {
  /**
   * Execute one WASM signer call and resolve with its result object.
   *
   * @param call - The function name and positional params to invoke.
   */
  execute<Result>(call: LighterWasmCall): Promise<Result>;

  /**
   * Optional hook to re-arm the bridge after a reload (WebView remount).
   */
  reset?(): void;
};

// ============================================================================
// WASM signer response shapes (from lighter-go react-native/src/lighterSdk.ts)
// ============================================================================

/**
 * Response of `_createClient` / `_createClientByPrv`.
 */
export type LighterCreateClientResult = {
  success: boolean;
  /** Venue public key, hex (80 chars / 40 bytes, Schnorr over ECgFp5). */
  pk: string;
  /** Venue private key, hex. Held only inside the signer boundary. */
  prv: string;
  pubKeySuccess: boolean;
  /**
   * ChangePubKey plaintext body to be signed with EIP-191 `personal_sign`
   * by the user's L1 (EVM) account.
   */
  body: string;
  error?: string;
};

/**
 * Response of `_signChangePubKey`.
 */
export type LighterSignChangePubKeyResult = {
  /** Serialized L2 transaction JSON (includes the injected `L1Sig`). */
  txInfo: string;
  error?: string;
};

/**
 * Response of `_createAuthToken`.
 */
export type LighterCreateAuthTokenResult = {
  token: string;
  deadline: number;
  error?: string;
};

/**
 * Response of signing functions returning a full L2 transaction
 * (`_signCreateOrder`, `_signCancelOrder`, ...).
 */
export type LighterTxResult = {
  txInfo: string;
  txHash?: string;
  error?: string;
};

// ============================================================================
// Auth Configuration
// ============================================================================

/**
 * Signs an EIP-191 personal message and resolves with the 65-byte signature
 * as a 0x-prefixed hex string. Injected for headless use; when a messenger
 * is available the wallet service routes through
 * `KeyringController:signPersonalMessage` instead.
 */
export type LighterPersonalSigner = (message: string) => Promise<string>;

/**
 * Lighter auth/config passed at construction time.
 */
export type LighterAuthConfig = {
  /** Whether the Lighter provider is enabled via local override. */
  enabled?: boolean;
  /** Lighter account index (assigned at first deposit). */
  accountIndex?: number;
  /** API key slot to register/use (0-254). */
  apiKeyIndex?: number;
  /** L1 address owning the Lighter account. */
  l1Address?: string;
  /** Headless personal_sign implementation (e2e / tooling). */
  personalSigner?: LighterPersonalSigner;
};

// ============================================================================
// REST API response shapes (subset used by the POC)
//
// The zkLighter wire format is snake_case; LighterClientService converts
// keys to camelCase at the fetch boundary so these parsed shapes follow
// package conventions.
// ============================================================================

/**
 * One market entry from `GET /api/v1/orderBooks`.
 */
export type LighterOrderBookMeta = {
  symbol: string;
  marketId: number;
  marketType: string;
  status: string;
  takerFee: string;
  makerFee: string;
  minBaseAmount: string;
  minQuoteAmount: string;
  supportedSizeDecimals: number;
  supportedPriceDecimals: number;
  supportedQuoteDecimals: number;
};

/**
 * Response of `GET /api/v1/orderBooks`.
 */
export type LighterOrderBooksResponse = {
  code: number;
  orderBooks: LighterOrderBookMeta[];
};

/**
 * Market stats from `GET /api/v1/orderBookDetails`.
 */
export type LighterOrderBookDetail = LighterOrderBookMeta & {
  lastTradePrice: number;
  dailyTradesCount: number;
  dailyBaseTokenVolume: number;
  dailyQuoteTokenVolume: number;
  dailyPriceLow: number;
  dailyPriceHigh: number;
  dailyPriceChange: number;
  openInterest: number;
  dailyChart: Record<string, number>;
};

/**
 * Response of `GET /api/v1/orderBookDetails`.
 */
export type LighterOrderBookDetailsResponse = {
  code: number;
  orderBookDetails: LighterOrderBookDetail[];
};

/**
 * One sub-account from `GET /api/v1/accountsByL1Address` or `account`.
 */
export type LighterSubAccount = {
  code: number;
  accountType: number;
  index: number;
  l1Address: string;
  cancelAllTime: number;
  totalOrderCount: number;
  pendingOrderCount: number;
  status: number;
  collateral: string;
  availableBalance: string;
  positions?: LighterApiPosition[];
};

/**
 * Response of `GET /api/v1/accountsByL1Address`.
 */
export type LighterAccountsByL1AddressResponse = {
  code: number;
  message?: string;
  l1Address: string;
  subAccounts: LighterSubAccount[];
};

/**
 * Response of `GET /api/v1/account` (`by=index`).
 */
export type LighterAccountResponse = {
  code: number;
  message?: string;
  accounts: LighterSubAccount[];
};

/**
 * One position inside an account payload.
 */
export type LighterApiPosition = {
  marketId: number;
  symbol: string;
  initialMarginFraction: string;
  openOrderCount: number;
  /** 1 = long, -1 = short (sign convention per API). */
  sign: number;
  position: string;
  avgEntryPrice: string;
  positionValue: string;
  unrealizedPnl: string;
  realizedPnl: string;
  liquidationPrice: string;
};

/**
 * One API key entry from `GET /api/v1/apikeys`.
 */
export type LighterApiKey = {
  accountIndex: number;
  apiKeyIndex: number;
  nonce: number;
  publicKey: string;
};

/**
 * Response of `GET /api/v1/apikeys`.
 */
export type LighterApiKeysResponse = {
  code: number;
  message?: string;
  apiKeys: LighterApiKey[];
};

/**
 * Response of `GET /api/v1/nextNonce`.
 */
export type LighterNextNonceResponse = {
  code: number;
  message?: string;
  nonce: number;
};

/**
 * Response of `POST /api/v1/sendTx`.
 */
export type LighterSendTxResponse = {
  code: number;
  message?: string;
  txHash?: string;
};

/**
 * One order from `GET /api/v1/accountActiveOrders`.
 */
export type LighterApiOrder = {
  orderIndex: number;
  clientOrderIndex: number;
  marketIndex: number;
  ownerAccountIndex: number;
  initialBaseAmount: string;
  remainingBaseAmount: string;
  price: string;
  isAsk: boolean;
  type: string;
  timeInForce: string;
  reduceOnly: number | boolean;
  status: string;
  orderExpiry: number;
  timestamp: number;
};

/**
 * Response of `GET /api/v1/accountActiveOrders`.
 */
export type LighterActiveOrdersResponse = {
  code: number;
  message?: string;
  orders: LighterApiOrder[];
};
