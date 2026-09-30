/**
 * Lighter Protocol Configuration Constants
 *
 * Endpoints, chain ids, transaction type codes and signer defaults for the
 * zkLighter integration. Values verified against the public API
 * (https://apidocs.lighter.xyz) and lighter-python `endpoint_profiles.py`.
 */

import type {
  LighterEndpoints,
  LighterNetwork,
  LighterOrderBookMeta,
} from '../types/lighter-types.js';

// ============================================================================
// Network Constants
// ============================================================================

/**
 * zkLighter L2 chain ids (protocol-level, not EVM chain ids).
 */
export const LIGHTER_MAINNET_CHAIN_ID = 304;
export const LIGHTER_TESTNET_CHAIN_ID = 300;

/**
 * Get the zkLighter chain id for a network.
 *
 * @param network - The Lighter network environment (mainnet or testnet).
 * @returns The zkLighter chain id for the specified network.
 */
export function getLighterChainId(network: LighterNetwork): number {
  return network === 'testnet'
    ? LIGHTER_TESTNET_CHAIN_ID
    : LIGHTER_MAINNET_CHAIN_ID;
}

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * Lighter REST and WebSocket endpoints
 */
export const LIGHTER_ENDPOINTS: LighterEndpoints = {
  mainnet: {
    http: 'https://mainnet.zklighter.elliot.ai',
    ws: 'wss://mainnet.zklighter.elliot.ai/stream',
  },
  testnet: {
    http: 'https://testnet.zklighter.elliot.ai',
    ws: 'wss://testnet.zklighter.elliot.ai/stream',
  },
};

/**
 * Get HTTP endpoint for a network.
 *
 * @param network - The Lighter network environment (mainnet or testnet).
 * @returns The HTTP API base URL for the specified network.
 */
export function getLighterHttpEndpoint(network: LighterNetwork): string {
  return LIGHTER_ENDPOINTS[network].http;
}

/**
 * Get the WebSocket stream endpoint for a network.
 *
 * @param network - The Lighter network environment (mainnet or testnet).
 * @returns The WebSocket stream URL for the specified network.
 */
export function getLighterWsEndpoint(network: LighterNetwork): string {
  return LIGHTER_ENDPOINTS[network].ws;
}

/** L2 transaction type: Withdraw (funds exit to L1). */
export const LIGHTER_TX_TYPE_WITHDRAW = 13;

/** L2 transaction type: ModifyOrder (reprice/resize a resting order). */
export const LIGHTER_TX_TYPE_MODIFY_ORDER = 17;

/** USDC collateral asset index on zkLighter (asset indexing starts at 1). */
export const LIGHTER_USDC_ASSET_INDEX = 1;

/**
 * Candle resolutions Lighter serves natively (subset of CandlePeriod values).
 */
export const LIGHTER_SUPPORTED_RESOLUTIONS: ReadonlySet<string> = new Set([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '12h',
  '1d',
]);

/**
 * Millisecond span per supported resolution (range computation for candles).
 */
export const LIGHTER_RESOLUTION_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
};

// ============================================================================
// L2 Transaction Types (types/txtypes/constants.go)
// ============================================================================

export const LIGHTER_TX_TYPE_CHANGE_PUB_KEY = 8;
export const LIGHTER_TX_TYPE_CREATE_ORDER = 14;
export const LIGHTER_TX_TYPE_CANCEL_ORDER = 15;
export const LIGHTER_TX_TYPE_CANCEL_ALL_ORDERS = 16;

/** Documented Lighter transaction status values. */
export const LIGHTER_TRANSACTION_STATUS = {
  Failed: 0,
  Pending: 1,
  Executed: 2,
  PendingFinal: 3,
} as const;

export type LighterTransactionOutcome =
  | 'failed'
  | 'pending'
  | 'executed'
  | 'pending-final';

/**
 * Decode the venue transaction status without treating undocumented values
 * as terminal.
 *
 * @param status - Raw status from the transaction endpoint.
 * @returns The documented outcome, or null for an unknown value.
 */
export function getLighterTransactionOutcome(
  status: unknown,
): LighterTransactionOutcome | null {
  switch (status) {
    case LIGHTER_TRANSACTION_STATUS.Failed:
      return 'failed';
    case LIGHTER_TRANSACTION_STATUS.Pending:
      return 'pending';
    case LIGHTER_TRANSACTION_STATUS.Executed:
      return 'executed';
    case LIGHTER_TRANSACTION_STATUS.PendingFinal:
      return 'pending-final';
    default:
      return null;
  }
}

// ============================================================================
// Order enums (wire values expected by `_signCreateOrder`)
// ============================================================================

export const LIGHTER_ORDER_TYPE_LIMIT = 0;
export const LIGHTER_ORDER_TYPE_MARKET = 1;
export const LIGHTER_ORDER_TYPE_STOP_LOSS = 2;
export const LIGHTER_ORDER_TYPE_TAKE_PROFIT = 4;

/** Grouped-orders grouping type: one-cancels-the-other (OCO). */
export const LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER = 2;

/** L2 transaction type: CreateGroupedOrders (e.g. OCO TP/SL pairs). */
export const LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS = 28;

/** L2 transaction type: UpdateMargin (isolated margin add/remove). */
export const LIGHTER_TX_TYPE_UPDATE_MARGIN = 29;

/** L2 transaction type: UpdateLeverage (per-market IMF + margin mode). */
export const LIGHTER_TX_TYPE_UPDATE_LEVERAGE = 20;

export const LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 0;
export const LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME = 1;
export const LIGHTER_TIME_IN_FORCE_POST_ONLY = 2;

/** Sentinel for "no expiry" on GTT orders (per lighter SDKs). */
export const LIGHTER_ORDER_EXPIRY_NONE = -1;
/** Sentinel for "no trigger price". */
export const LIGHTER_NO_TRIGGER_PRICE = 0;

// ============================================================================
// Signer / key derivation
// ============================================================================

/**
 * Default API key slot used by the MetaMask integration.
 * Slots 0-2 are commonly used by Lighter's own frontends; a dedicated
 * slot avoids clobbering keys registered by other clients.
 */
export const LIGHTER_DEFAULT_API_KEY_INDEX = 7;

// ============================================================================
// REST API Configuration
// ============================================================================

/**
 * HTTP request timeout in milliseconds
 */
export const LIGHTER_HTTP_TIMEOUT_MS = 10000;

/**
 * Interval for polling REST prices (no WS subscription in the POC)
 */
export const LIGHTER_PRICE_POLLING_INTERVAL_MS = 5000;

/**
 * Maximum leverage placeholder until per-market margin fractions are wired.
 */
export const LIGHTER_MAX_LEVERAGE = 50;

/**
 * TTL for the authoritative per-market margin-metadata cache used by
 * explicit leverage validation. Without expiry, metadata fetched once
 * (e.g. an older, higher max) would keep validating later-overlimit
 * leverage for the whole session; the venue cap remains the final
 * enforcement either way.
 */
export const LIGHTER_MARGIN_METADATA_TTL_MS = 60_000;

/**
 * Prefix marking venue-data integrity failures (malformed numeric fields
 * in venue payloads). These must fail closed and surface — never degrade
 * into silently-coerced values or empty reads.
 */
export const LIGHTER_DATA_INTEGRITY_PREFIX = 'Invalid Lighter venue data:';

/** Full-string decimal/scientific literal (optional sign and exponent). */
const LIGHTER_STRICT_DECIMAL_PATTERN =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

/**
 * Parse a numeric string STRICTLY: the entire trimmed string must be a
 * decimal/scientific literal. parseFloat prefix-parses, so '0.1oops'
 * would silently become 0.1.
 *
 * Accepts unknown because venue REST payloads are type-cast without
 * runtime validation: a missing/null/numeric field must yield null (for
 * the caller's explicit error path), never a TypeError that generic
 * catches misclassify as an ordinary read failure.
 *
 * Note: '1e999' matches the literal pattern and parses to Infinity —
 * callers own the finiteness check.
 *
 * @param value - Raw value from params or a venue payload.
 * @returns The parsed number, or null when the value is not a string
 * containing a pure numeric literal.
 */
export function parseLighterStrictDecimal(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return LIGHTER_STRICT_DECIMAL_PATTERN.test(trimmed)
    ? parseFloat(trimmed)
    : null;
}

// ============================================================================
// Size / price integerization
// ============================================================================

/**
 * Convert a human-readable amount to the integer representation expected by
 * the Lighter signer for a given number of supported decimals.
 *
 * @param value - Human-readable amount (e.g. 0.05 SOL, 187.25 USDC).
 * @param decimals - `supportedSizeDecimals` / `supportedPriceDecimals`
 * from the market metadata.
 * @returns Integer wire value (e.g. 0.05 @ 5 decimals -> 5000).
 */
export function toLighterInteger(value: number, decimals: number): number {
  const scaled = Math.round(value * 10 ** decimals);
  // Fail closed on wire-format overflow: a huge-but-finite value scales to
  // an unsafe integer (or Infinity) and would stringify as '1e+305' inside
  // signer params.
  if (!Number.isSafeInteger(scaled)) {
    throw new Error(
      `Value ${value} is outside Lighter's integer range at ${decimals} decimals`,
    );
  }
  // NOTE: this is a generic converter — zero and negative results are
  // valid here. Positive-intent policy for signer-bound values lives in
  // the provider's internal wire wrapper.
  return scaled;
}

/**
 * Convert an integer wire value back to a human-readable amount.
 *
 * @param value - Integer wire value.
 * @param decimals - Supported decimals from the market metadata.
 * @returns Human-readable amount.
 */
export function fromLighterInteger(value: number, decimals: number): number {
  return value / 10 ** decimals;
}

/**
 * Compute the minimum order base size for a market that satisfies both
 * `minBaseAmount` and `minQuoteAmount` at a given price.
 *
 * @param market - Market metadata from `orderBooks`.
 * @param price - Order price (human units).
 * @returns Base size in human units, rounded up to the market's size step.
 */
export function computeLighterMinOrderSize(
  market: Pick<
    LighterOrderBookMeta,
    'minBaseAmount' | 'minQuoteAmount' | 'supportedSizeDecimals'
  >,
  price: number,
): number {
  const minBase = parseLighterStrictDecimal(market.minBaseAmount);
  const minQuote = parseLighterStrictDecimal(market.minQuoteAmount);
  if (
    minBase === null ||
    !Number.isFinite(minBase) ||
    minBase <= 0 ||
    minQuote === null ||
    !Number.isFinite(minQuote) ||
    minQuote <= 0 ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isSafeInteger(market.supportedSizeDecimals) ||
    market.supportedSizeDecimals < 0
  ) {
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} invalid market minimum-size metadata`,
    );
  }
  const step = 10 ** -market.supportedSizeDecimals;
  const byQuote = minQuote / price;
  const raw = Math.max(minBase, byQuote);
  // Small epsilon guards against float artifacts (0.1 / 1e-5 = 10000.0000002)
  // pushing the ceil one step too high.
  const units = Math.ceil(raw / step - 1e-9);
  return Number((units * step).toFixed(market.supportedSizeDecimals));
}

/**
 * L1 bridge facts per network, as reported live by
 * `GET /api/v1/layer1BasicInfo` (contract addresses) and the venue docs
 * (minimums). Mainnet settles against Ethereum L1; testnet runs on a
 * venue-hosted devnet L1 (chain id 123456), so its route is informational.
 */
export const LIGHTER_BRIDGE_CONFIG = {
  mainnet: {
    /** CAIP-2 chain the bridge contract lives on (Ethereum mainnet). */
    chainId: 'eip155:1',
    /** ZkLighter L1 contract (deposits via `deposit`, selector 0x8a857083). */
    bridgeContract: '0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7',
    /** Canonical Ethereum USDC. */
    usdcContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    /** Venue-documented USDC minimums. */
    minDepositUsdc: '1',
    minWithdrawUsdc: '1',
  },
  testnet: {
    chainId: 'eip155:123456',
    bridgeContract: '0xe034801BC49cCDC79FB683022dA0591C86077261',
    usdcContract: '0x57382a12EC72eBb1e717b7BB76c78CdDAfE3A396',
    minDepositUsdc: '1',
    minWithdrawUsdc: '1',
  },
} as const;

/** UpdateLeverage margin-mode codes (types/txtypes constants). */
export const LIGHTER_MARGIN_MODE_CROSS = 0;
export const LIGHTER_MARGIN_MODE_ISOLATED = 1;

/**
 * Marker prefix for capability-gate errors (unsupported account tier /
 * unverified fee semantics). Callers use it to surface these explicitly
 * instead of degrading them into empty state.
 */
export const LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX =
  'Unsupported Lighter capability:';
