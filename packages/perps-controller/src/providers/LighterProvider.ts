/**
 * LighterProvider
 *
 * Provider implementation for the zkLighter protocol (POC).
 * Implements the PerpsProvider interface with live REST reads and a real
 * write path (place/cancel limit orders) driven through the Lighter Go/WASM
 * signer behind the transport-agnostic {@link LighterSignerBridge} seam.
 *
 * Key differences from HyperLiquid:
 * - Venue-specific key (Schnorr over ECgFp5) registered per API-key slot via
 *   a ChangePubKey L2 transaction carrying an EIP-191 personal_sign L1Sig.
 * - Order prices/sizes are integers scaled by per-market decimals.
 * - REST reads plus WebSocket market, account, position, order, fill,
 *   order-book, and candle streams, with price polling as a fallback.
 */

import type { CaipAccountId } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { CandlePeriod } from '../constants/chartConfig.js';
import {
  computeLighterMinOrderSize,
  LIGHTER_MAX_BASE_AMOUNT,
  LIGHTER_NATIVE_PROBE_MAX_NOTIONAL,
  LIGHTER_NATIVE_PROBE_PAGE_LIMIT,
  LIGHTER_NATIVE_PROBE_PAGE_SIZE,
  LIGHTER_CHASE_DEFAULT_INTERVAL_MS,
  LIGHTER_CHASE_DEFAULT_DURATION_MS,
  LIGHTER_CHASE_DEFAULT_REPRICINGS,
  LIGHTER_CHASE_DEFAULT_DISTANCE_BPS,
  LIGHTER_CHASE_MIN_INTERVAL_MS,
  LIGHTER_CHASE_MAX_DURATION_MS,
  LIGHTER_CHASE_MAX_REPRICINGS,
  LIGHTER_CHASE_MAX_DISTANCE_BPS,
  LIGHTER_CHASE_QUOTE_MAX_AGE_MS,
  LIGHTER_POST_ONLY_QUOTE_MAX_AGE_MS,
  fromLighterInteger,
  getLighterChainId,
  getLighterTransactionOutcome,
  LIGHTER_RESOLUTION_MS,
  LIGHTER_MAX_WIRE_PRICE,
  LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT,
  LIGHTER_SUPPORTED_RESOLUTIONS,
  LIGHTER_DEFAULT_API_KEY_INDEX,
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_TX_EXPIRY_SLACK_MS,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
  LIGHTER_TRADING_API_KEY_COUNT,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS,
  LIGHTER_FILL_REPLAY_LIMIT,
  LIGHTER_NO_TRIGGER_PRICE,
  LIGHTER_ORDER_EXPIRY_NONE,
  LIGHTER_ORDER_TYPE_LIMIT,
  LIGHTER_ORDER_TYPE_MARKET,
  LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME,
  LIGHTER_TIME_IN_FORCE_POST_ONLY,
  getLighterWsEndpoint,
  LIGHTER_PRICE_POLLING_INTERVAL_MS,
  LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
  LIGHTER_BRIDGE_CONFIG,
  LIGHTER_TX_TYPE_CANCEL_ORDER,
  LIGHTER_TX_TYPE_MODIFY_ORDER,
  LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
  LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER,
  LIGHTER_GROUPING_ONE_TRIGGERS_THE_OTHER,
  LIGHTER_GROUPING_ONE_TRIGGERS_OCO,
  LIGHTER_ORDER_TYPE_STOP_LOSS,
  LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
  LIGHTER_TX_TYPE_CREATE_ORDER,
  LIGHTER_TX_TYPE_UPDATE_LEVERAGE,
  LIGHTER_TX_TYPE_UPDATE_MARGIN,
  LIGHTER_TX_TYPE_WITHDRAW,
  LIGHTER_MARGIN_MODE_CROSS,
  LIGHTER_MARGIN_MODE_ISOLATED,
  LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX,
  LIGHTER_USDC_ASSET_INDEX,
  LIGHTER_DATA_INTEGRITY_PREFIX,
  LIGHTER_MARGIN_METADATA_TTL_MS,
  LIGHTER_SCALE_SETTLEMENT_WINDOW_MS,
  LIGHTER_SCALE_SETTLEMENT_POLL_MS,
  parseLighterStrictDecimal,
  toLighterInteger,
} from '../constants/lighterConfig.js';
import type { PerpsControllerMessenger } from '../PerpsController.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import { hasErrorInCauseChain } from '../services/causeChain.js';
import {
  LighterChaseService,
  LighterChaseObservationPendingError,
  toLighterChaseOrder,
} from '../services/LighterChaseService.js';
import type {
  LighterChaseIntent,
  LighterChaseOwner,
  LighterChaseIo,
  LighterChaseRecord,
  LighterChaseDispatch,
  LighterChaseChild,
} from '../services/LighterChaseService.js';
import {
  convertKeysToCamelCase,
  LighterApiError,
  LighterClientService,
} from '../services/LighterClientService.js';
import {
  requireSignedTxIdentity,
  isLighterTxExpiry,
} from '../services/lighterDispatchIdentity.js';
import { LighterTwapService } from '../services/LighterTwapService.js';
import type {
  LighterTwapOwner,
  LighterTwapReadObservation,
} from '../services/LighterTwapService.js';
import { LighterWalletService } from '../services/LighterWalletService.js';
import type {
  ScaleOrderGroup,
  GetScalePriceLadderParams,
  PerpsScalePriceLadder,
  ChaseOrder,
  ChaseOrderStatus,
  GetChaseOrderOwnershipParams,
  ReconcileChaseOrderCancellationParams,
  ReconcileChaseOrderCancellationResult,
  PerpsChaseOrderOwnership,
  PerpsChaseOrderDispatch,
} from '../types/index.js';
import { WebSocketConnectionState } from '../types/index.js';
import type {
  AccountState,
  TwapOrder,
  AssetRoute,
  CandleData,
  CandleStick,
  CancelOrderParams,
  CancelOrderResult,
  ClosePositionParams,
  DepositParams,
  DisconnectResult,
  EditOrderParams,
  FeeCalculationParams,
  FeeCalculationResult,
  Funding,
  DirectProviderOrderCapabilities,
  DirectProviderOrderCapabilitiesUnavailableReason,
  GetOrderCapabilitiesParams,
  GetAccountStateParams,
  GetFundingParams,
  GetHistoricalPortfolioParams,
  GetMarginModeLockParams,
  GetMarketsParams,
  GetOrderFillsParams,
  GetOrdersParams,
  GetOrFetchFillsParams,
  GetPositionsParams,
  GetSupportedPathsParams,
  HistoricalPortfolioResult,
  InitializeResult,
  LiquidationPriceParams,
  LiveDataConfig,
  MaintenanceMarginParams,
  MarginResult,
  MarketInfo,
  Order,
  OrderFill,
  OrderParams,
  OrderResult,
  AttachedOrderGroup,
  TriggerOrderType,
  PerpsMarginModeLock,
  PerpsMarketData,
  PerpsPlatformDependencies,
  PerpsProvider,
  PerpsRecoveredDispatch,
  PerpsPendingManualRecovery,
  PerpsRecoveryVenueReview,
  ResolveRecoveryProtectionParams,
  PerpsRecoveryProtectionResult,
  PerpsReadOptions,
  Position,
  PositionModifyPreviewParams,
  PositionModifyPreviewResult,
  RawLedgerUpdate,
  ReadyToTradeResult,
  SubscribeAccountParams,
  SubscribeCandlesParams,
  SubscribeOICapsParams,
  OrderBookData,
  OrderBookLevel,
  SubscribeOrderBookParams,
  SubscribeOrderFillsParams,
  SubscribeOrdersParams,
  PriceUpdate,
  SubscribePositionsParams,
  SubscribePricesParams,
  ToggleTestnetResult,
  UpdateMarginParams,
  UpdatePositionTPSLParams,
  UserHistoryItem,
  WithdrawParams,
  WithdrawResult,
} from '../types/index.js';
import type {
  LighterApiOrder,
  LighterEditableOrder,
  LighterSignModifyOrderWireParams,
  LighterRestTrade,
  LighterApiPosition,
  LighterAccountsByL1AddressResponse,
  LighterAccountSummary,
  LighterAuthConfig,
  LighterTxLookupResponse,
  LighterTransferHistoryItem,
  LighterCreateClientResult,
  LighterCreateOrderWireParams,
  LighterGroupedOrderWireParams,
  LighterOrderBookMeta,
  LighterSendTxResponse,
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
  LighterTxResult,
  LighterWebSocketCtor,
  LighterWebSocketLike,
  LighterWsAccountMessage,
  LighterCandle,
  LighterWsCandleMessage,
  LighterWsOrderBookMessage,
  LighterWsTradesMessage,
  LighterWsMarketStat,
  LighterWsMarketStatsMessage,
} from '../types/lighter-types.js';
import {
  PERPS_ERROR_ACTION,
  PERPS_ERROR_COMPONENT,
  PERPS_ERROR_OPERATION,
  createPerpsErrorContext,
  markProviderErrorReported,
} from '../utils/errorContext.js';
import type {
  PerpsErrorTags,
  PerpsLoggerOptions,
} from '../utils/errorContext.js';
import { ensureError, isKeyringLockedError } from '../utils/errorUtils.js';
import {
  adaptAccountStateFromLighter,
  adaptAccountStateFromLighterUserStats,
  adaptFillFromLighterTrade,
  adaptMarketDataFromLighter,
  adaptMarketFromLighter,
  adaptOrderFromLighter,
  adaptOrderStatus,
  adaptPositionFromLighter,
  adaptPriceUpdateFromLighter,
  adaptPriceUpdateFromLighterWsStat,
} from '../utils/lighterAdapter.js';
import {
  LIGHTER_ATTACHED_MAX_GROUPS,
  LIGHTER_ATTACHED_HANDLE_PREFIX,
  parseLighterAttachedGroups,
  correlateLighterAttachedOrders,
  toAttachedOrderGroup,
} from '../utils/lighterAttachedOrders.js';
import type { LighterAttachedGroup } from '../utils/lighterAttachedOrders.js';
import {
  identifyLighterChaseChild,
  readLighterChaseQuote,
  reconcileLighterChaseChild,
} from '../utils/lighterChase.js';
import {
  LIGHTER_EDIT_JOURNAL_PREFIX,
  decodeLighterModifyOrder,
  lighterEditOrderId,
  lighterNativeEditTarget,
  lighterNativeEditResult,
  observeLighterNativeEdit,
  parseLighterNativeEditJournal,
  prepareLighterNativeEdit,
} from '../utils/lighterNativeEdit.js';
import type { LighterNativeEditJournal } from '../utils/lighterNativeEdit.js';
import {
  buildLighterScaleLadder,
  captureExpectedScaleLadder,
  assertExpectedScaleLadder,
  normalizeLighterScalePrices,
  parseLighterScaleGroups,
  toLighterScaleGroup,
  isLighterScaleTerminal,
  LIGHTER_SCALE_PREFIX,
  LIGHTER_SCALE_JOURNAL_PREFIX,
  LIGHTER_SCALE_MAX_GROUPS,
} from '../utils/lighterScaleOrders.js';
import type {
  LighterScaleGroup,
  LighterScaleRung,
} from '../utils/lighterScaleOrders.js';
import { prepareLighterTwapOrder } from '../utils/lighterTwap.js';
import { identifyLighterTwapParent } from '../utils/lighterTwapReconciliation.js';
import {
  isLimitExecutionOrderType,
  isTriggerOrderType,
  TRIGGER_ORDER_TYPES,
} from '../utils/orderTypes.js';
import { assertExpectedPosition } from '../utils/positionProtection.js';

type LighterFillQuery = GetOrderFillsParams & {
  symbol?: string;
};

type LighterMarginMetadata = {
  marketId: number;
  minInitial?: number;
  defaultInitial?: number;
  maintenance?: number;
  lastTradePrice?: number;
};

type LighterOrderBookState = {
  bids: Map<string, string>;
  asks: Map<string, string>;
  nonce: number;
};

const NOOP_UNSUBSCRIBE = (): void => undefined;

const LIGHTER_INACTIVE_HISTORY_ROW_LIMIT = 10_000;

/** Default Lighter execution protection, in basis points (5%). */
const LIGHTER_DEFAULT_SLIPPAGE_BPS = 500;

/** Maximum durable position-protection ownership entries per account market. */
const LIGHTER_TPSL_OWNERSHIP_MAX_ORDERS = 256;

/** Single-page history bound used when reclaiming expired protection ownership. */
const LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE = 100;
const LIGHTER_ATTACHED_HISTORY_PAGE_LIMIT =
  LIGHTER_INACTIVE_HISTORY_ROW_LIMIT / LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE;
const LIGHTER_ATTACHED_HISTORY_TIME_SLACK_MS = 30_000;
type LighterAttachedOrderSnapshot = {
  rows: LighterApiOrder[];
  complete: boolean;
};

const deriveLighterMaxLeverage = (
  minInitialMarginFraction: number | undefined,
  market: string | number,
): number => {
  if (
    typeof minInitialMarginFraction !== 'number' ||
    !Number.isSafeInteger(minInitialMarginFraction) ||
    minInitialMarginFraction < 1 ||
    minInitialMarginFraction > 10_000
  ) {
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} invalid initial margin fraction for market ${String(market)}`,
    );
  }
  const maxLeverage = Math.floor(10_000 / minInitialMarginFraction);
  if (!Number.isSafeInteger(maxLeverage) || maxLeverage < 1) {
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} invalid max leverage for market ${String(market)}`,
    );
  }
  return maxLeverage;
};

const isInactiveMarketWithoutUsableRiskMetadata = (market: {
  status: string;
  minInitialMarginFraction?: number;
  maintenanceMarginFraction?: number;
}): boolean =>
  // Lighter retains inactive rows for historical identity but can zero their
  // trading constraints. They are valid venue records, not usable markets.
  market.status === 'inactive' &&
  (market.minInitialMarginFraction === undefined ||
    market.minInitialMarginFraction === 0 ||
    market.maintenanceMarginFraction === 0);

const adaptLighterTransferDelta = (
  entry: LighterTransferHistoryItem,
): RawLedgerUpdate['delta'] => {
  if (entry.type === 'L2TransferOutflow') {
    return { type: 'transferOut', usdc: `-${entry.amount}` };
  }
  if (entry.type === 'L2TransferInflow') {
    return { type: 'transferIn', usdc: entry.amount };
  }
  throw new Error(
    `${LIGHTER_DATA_INTEGRITY_PREFIX} unknown transfer type ${String(entry.type)}`,
  );
};

// ============================================================================
// Constants
// ============================================================================

/** Full-string decimal/scientific literal (optional sign and exponent). */
/**
 * Strict full-string numeric parsing shared with the adaptation boundary
 * (see lighterConfig.parseLighterStrictDecimal): '10USD' or '0.001BTC'
 * would prefix-parse into signed intent under bare parseFloat.
 */
const parseStrictDecimal = parseLighterStrictDecimal;

/**
 * Parse caller-supplied numeric intent, accepting only finite positive
 * values from a strictly numeric string.
 *
 * @param value - Raw numeric string from params.
 * @returns The parsed number, or null when malformed, non-finite or
 * non-positive.
 */
const parseFinitePositive = (value: string): number | null => {
  const parsed = parseStrictDecimal(value);
  return parsed !== null && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
};

/**
 * Integerize a SIGNER-BOUND value: the scaled result must be a positive
 * safe wire integer. The positive-intent policy lives here, not in the
 * generic public converter.
 *
 * @param value - Human-units value.
 * @param decimals - Market/asset decimals.
 * @returns The positive wire integer.
 */
const toSignerWireInteger = (value: number, decimals: number): number => {
  const scaled = toLighterInteger(value, decimals);
  if (scaled < 1) {
    throw new Error(`Value ${value} rounds to zero at ${decimals} decimals`);
  }
  return scaled;
};

/**
 * Snap a base size onto the market's size grid exactly as wire
 * integerization will (round to nearest step). Minimum-size checks must
 * judge the SNAPPED size: a raw USD/price quotient one hair under the
 * minimum still reaches the venue as the valid minimum step, and
 * rejecting the raw quotient refuses orders the venue accepts.
 *
 * @param size - Raw base size (human units).
 * @param supportedSizeDecimals - Market size decimals.
 * @returns The grid-snapped size, or the input unchanged when it cannot
 * be integerized (range overflow) — later wire conversion fails closed.
 */
const snapToLighterSizeGrid = (
  size: number,
  supportedSizeDecimals: number,
): number => {
  try {
    return fromLighterInteger(
      toLighterInteger(size, supportedSizeDecimals),
      supportedSizeDecimals,
    );
  } catch {
    return size;
  }
};

/**
 * Whether Lighter applies its documented maker-only order minimums.
 *
 * @param params - Order intent to classify.
 * @returns Whether the order rests as a maker order.
 */
const isLighterMakerOrder = (params: OrderParams): boolean =>
  isLimitExecutionOrderType(params.orderType) && params.timeInForce !== 'IOC';

/**
 * Parse a candle field without JavaScript's null/boolean/blank coercions.
 *
 * @param value - Raw candle field from the venue.
 * @returns A finite number, or null when the field is malformed.
 */
const toFiniteCandleNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : parseStrictDecimal(value);
  return parsed !== null && Number.isFinite(parsed) ? parsed : null;
};

/**
 * Map one venue candle onto the CandleStick contract, or null when any
 * field is non-finite. WS/REST candle payloads are cast at the boundary,
 * not validated — a malformed candle stringified blind reaches the chart
 * as "undefined"/NaN, the same native-SVG crash class the bare
 * order-book levels produced.
 *
 * @param candle - Raw venue candle.
 * @returns The contract candle, or null when unmappable.
 */
const toFiniteCandle = (candle: LighterCandle): CandleStick | null => {
  const time = toFiniteCandleNumber(candle?.t);
  const fields = [candle?.o, candle?.h, candle?.l, candle?.c, candle?.v].map(
    toFiniteCandleNumber,
  );
  if (time === null || fields.some((value) => value === null)) {
    return null;
  }
  const [open, high, low, close, volume] = fields as number[];
  return {
    time,
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: String(volume),
  };
};

/**
 * One recorded TP/SL venue mutation attempt. Each attempt carries its own
 * nonce and outcome: a single flat flag cannot represent "create accepted,
 * cancel #1 accepted, cancel #2 response-lost".
 */
type TpslCreateAttempt = {
  kind: 'create';
  /**
   * Unique per-journal attempt identity. Nonces CANNOT identify
   * attempts: a proven-never-landed submission releases its nonce and a
   * retry legitimately reuses it.
   */
  attemptId: number;
  /** See TpslCancelAttempt.terminalStatus. */
  terminalStatus?: number;
  /** Current-pass exact-hash absence after expiry; never persisted or reused. */
  neverLanded?: true;
  /** The venue nonce this submission attempted to consume. */
  nonce: number;
  /** 'accepted' only after the venue's 200 was OBSERVED. */
  outcome: 'unknown' | 'accepted';
  /** Created client ids (nonempty). */
  clientIds: number[];
  /** Signed absolute ORDER expiries, aligned with clientIds; legacy may omit. */
  orderExpiries?: number[];
  /** The signed transaction hash (known BEFORE submission). */
  txHash: string;
  /**
   * Signed payload expiry (ms). After this instant (+ clock slack) the
   * sequencer can no longer accept the payload, so a not-found hash is
   * authoritatively never-landed.
   */
  expiresAt: number;
  /** What this create IS: the replacement, or a restore of the old set. */
  role: 'replacement' | 'restore';
  /**
   * For role 'restore' only: the prior triggers (by original orderId in
   * `priorTriggers`) this attempt restores, INDEX-ALIGNED with
   * `clientIds` (a grouped OCO restore carries two legs). With multiple
   * prior triggers and a crash mid-restore, recovery uses this to
   * restore exactly the remaining intents — never duplicating or
   * omitting one.
   */
  priorOrderIds?: string[];
};

type TpslCancelAttempt = {
  kind: 'cancel';
  /** Unique per-journal attempt identity (see TpslCreateAttempt). */
  attemptId: number;
  /**
   * Venue-reported terminal status (4 failed / 5 rejected) recorded by
   * reconciliation for an attempt that LANDED but did not mutate the
   * books — makes it compactable.
   */
  terminalStatus?: number;
  nonce: number;
  outcome: 'unknown' | 'accepted';
  /** The cancelled order id. */
  orderId: string;
  txHash: string;
  expiresAt: number;
  /** Whether this cancels OLD protection or rolls back a failed leg. */
  role: 'stale' | 'rollback';
};

/** A recorded TP/SL venue mutation attempt (discriminated by kind). */
type TpslAttempt = TpslCreateAttempt | TpslCancelAttempt;

/**
 * The wire intent of a PRIOR trigger, persisted before it is cancelled so
 * a crash-then-terminal-failure can still RESTORE the old protection.
 */
type TpslPriorTrigger = {
  orderId: string;
  side: 'buy' | 'sell';
  /**
   * EXACT signer wire order type (2 stop-loss, 3 stop-loss-limit,
   * 4 take-profit, 5 take-profit-limit). A restore must rebuild the
   * prior order faithfully — never coerce a limit trigger to market.
   */
  wireOrderType: 2 | 3 | 4 | 5;
  /** Exact signer wire time-in-force (0 IOC, 1 GTT, 2 post-only). */
  wireTimeInForce: 0 | 1 | 2;
  /**
   * Venue-reported absolute order expiry (ms). Restores reuse it while
   * still in the future; otherwise the signer's default sentinel.
   */
  orderExpiry: number;
  /** Execution price (market triggers) or exact limit price. */
  price: string;
  /** User-facing trigger level. */
  triggerPrice: string;
  remainingSize: string;
};

/**
 * Identity of the position the journalled protection belonged to. A
 * delayed restore must never attach old triggers to a DIFFERENT
 * lifecycle (original closed, new same-symbol position opened).
 */
/**
 * Durable nonce dispatch ledger document. Entries carry the OPERATION
 * kind (tx type) and a human-readable intent so a dispatch whose
 * response was lost but which is later PROVEN consumed can be surfaced
 * as a recovered outcome — blocking blind retries of financial
 * operations until explicitly acknowledged.
 */
type LighterRecoveredDispatch = {
  /** Stable identity for selective acknowledgment. */
  recoveryId: string;
  kind: number;
  intent: string;
  txHash: string | null;
  /**
   * Authoritative outcome: 'succeeded' (exact-hash lookup, venue status
   * executed), 'failed' (exact-hash lookup, venue status failed/rejected
   * — retry-safe, non-blocking), 'unknown' (only the nonce advance is
   * proven, e.g. another device moved the nonce; the intent's own fate
   * is NOT known and must never be reported as completed).
   */
  outcome: 'succeeded' | 'failed' | 'unknown';
  /** What proved the outcome (e.g. 'tx-status:2', 'rest-advance'). */
  evidence: string;
};

type LighterNonceLedgerDoc = {
  consumedFloor: number;
  entries: {
    nonce: number;
    txHash: string | null;
    expiresAt: number | null;
    kind: number;
    intent: string;
    /**
     * Operation that owns reconciliation of this dispatch (a TP/SL
     * journal's operationId). Owned dispatches resolve through their
     * own state machine and are NEVER quarantined into the generic
     * recovered list — that would deadlock the machine behind an
     * acknowledgment it cannot give.
     */
    owner: string | null;
  }[];
  recovered: LighterRecoveredDispatch[];
};

const TPSL_GUARDED_REMOVAL_REVIEW_REASON =
  'Protection removal requires review because its position precondition failed or the guarded session ended; review surviving orders before changing protection';

/** Durable identity of a key registration that must settle before allocation. */
type LighterPendingKeyRegistration = {
  version: 1;
  accountIndex: number;
  apiKeyIndex: number;
  publicKey: string;
  txHash: string;
  nonce: number;
  expiresAt: number;
  accepted: boolean;
};

/**
 * Validate persisted replacement groups retained across signer changes.
 *
 * @param value - Persisted groups.
 * @returns Whether every group contains valid Lighter client order IDs.
 */
const isRecoveryGroups = (value: unknown): value is number[][] =>
  Array.isArray(value) &&
  value.length <= 64 &&
  value.every(
    (group) =>
      Array.isArray(group) &&
      group.length > 0 &&
      group.length <= 2 &&
      group.every(
        (id) =>
          typeof id === 'number' &&
          Number.isSafeInteger(id) &&
          id > 0 &&
          id < 2 ** 48,
      ),
  );

type TpslRecoverySuccessor = {
  version: 1;
  sourceSettlementKey: string;
  sourceOperationId: string;
  successorSettlementKey: string;
  successorOperationId: string;
  state: 'prepared' | 'pending' | 'failed' | 'settled';
  ownedOrderIds: string[];
  retainedReplacementGroups?: number[][];
};

type PartialTpslIntent = {
  positionSign: 1 | -1;
  positionWireSize: number;
  sizeDecimals: number;
  orders: LighterCreateOrderWireParams[];
} & (
  | { version: 1; linkage: 'single' | 'oco' }
  | {
      version: 2;
      linkage: 'independent';
      positionSize: string;
      requestedSizes: (string | null)[];
    }
);

/**
 * Validate persisted fixed coverage before it can authorize recovery.
 *
 * @param value - Untrusted persisted intent.
 * @returns Whether the intent contains valid fixed wire orders.
 */
const isPartialTpslIntent = (value: unknown): value is PartialTpslIntent => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const intent = value as Record<string, unknown>;
  const { orders: rawOrders } = intent;
  const orders: unknown[] = Array.isArray(rawOrders) ? rawOrders : [];
  return (
    (intent.version === 1 ||
      (intent.version === 2 &&
        intent.linkage === 'independent' &&
        typeof intent.positionSize === 'string' &&
        new BigNumber(intent.positionSize).isFinite() &&
        new BigNumber(intent.positionSize).gt(0) &&
        new BigNumber(intent.positionSize)
          .shiftedBy(Number(intent.sizeDecimals))
          .integerValue(BigNumber.ROUND_DOWN)
          .eq(Number(intent.positionWireSize)) &&
        Number(intent.positionWireSize) < 2 ** 48 &&
        Array.isArray(intent.requestedSizes) &&
        intent.requestedSizes.length === 2 &&
        intent.requestedSizes.some((size) => size !== null) &&
        intent.requestedSizes.every((size: unknown, index: number) => {
          if (
            size !== null &&
            (typeof size !== 'string' ||
              !/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(size))
          ) {
            return false;
          }
          const amount = new BigNumber(size ?? (intent.positionSize as string));
          const wire = amount
            .shiftedBy(Number(intent.sizeDecimals))
            .integerValue(BigNumber.ROUND_DOWN);
          const order = orders[index];
          return (
            amount.isFinite() &&
            amount.gt(0) &&
            amount.lte(intent.positionSize as string) &&
            Array.isArray(order) &&
            typeof order[2] === 'string' &&
            wire.eq(order[2]) &&
            wire.lt(2 ** 48) &&
            Number(order[3]) < 2 ** 32 &&
            Number(order[8]) < 2 ** 32 &&
            order[5] ===
              (index === 0
                ? LIGHTER_ORDER_TYPE_TAKE_PROFIT
                : LIGHTER_ORDER_TYPE_STOP_LOSS)
          );
        }))) &&
    (intent.positionSign === 1 || intent.positionSign === -1) &&
    typeof intent.positionWireSize === 'number' &&
    Number.isSafeInteger(intent.positionWireSize) &&
    intent.positionWireSize > 0 &&
    typeof intent.sizeDecimals === 'number' &&
    Number.isInteger(intent.sizeDecimals) &&
    intent.sizeDecimals >= 0 &&
    intent.sizeDecimals <= 18 &&
    Array.isArray(rawOrders) &&
    ((intent.version === 1 &&
      intent.linkage === 'single' &&
      orders.length === 1) ||
      (intent.version === 1 &&
        intent.linkage === 'oco' &&
        orders.length === 2) ||
      (intent.version === 2 &&
        intent.linkage === 'independent' &&
        orders.length === 2)) &&
    orders.every(
      (order: unknown) =>
        Array.isArray(order) &&
        order.length === 10 &&
        Number.isSafeInteger(order[0]) &&
        order[0] >= 0 &&
        Number.isSafeInteger(order[1]) &&
        order[1] > 0 &&
        order[1] < 2 ** 48 &&
        [2, 3, 8].every(
          (index) =>
            typeof order[index] === 'string' &&
            /^[1-9]\d*$/u.test(order[index]) &&
            Number.isSafeInteger(Number(order[index])),
        ) &&
        Number(order[2]) <= Number(intent.positionWireSize) &&
        order[4] === (intent.positionSign === 1 ? 1 : 0) &&
        (order[5] === LIGHTER_ORDER_TYPE_STOP_LOSS ||
          order[5] === LIGHTER_ORDER_TYPE_TAKE_PROFIT) &&
        order[6] === LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL &&
        order[7] === 1 &&
        order[9] === LIGHTER_ORDER_EXPIRY_NONE,
    ) &&
    (orders.length === 1 ||
      (Array.isArray(orders[0]) &&
        Array.isArray(orders[1]) &&
        orders[0][0] === orders[1][0] &&
        orders[0][1] !== orders[1][1] &&
        (intent.linkage === 'independent' || orders[0][2] === orders[1][2]) &&
        orders[0][5] !== orders[1][5]))
  );
};

/**
 * Durable transition state: 'creating' means the old protection is still
 * untouched (a failed replacement needs at most a rollback of surviving
 * legs); 'cancelling' means old cancels are underway/done; 'manual'
 * parks failed replacements or guarded removals for explicit user action.
 * A guarded removal is non-resumable from its first durable attempt.
 */
type TpslJournalState = {
  partialIntent?: PartialTpslIntent;
  attempts: TpslAttempt[];
  recordedAt: number;
  /**
   * IMMUTABLE identity of the operation this journal records. Clears and
   * updates are compare-and-swap on this id so a recovery pass holding a
   * STALE snapshot can never erase a newer operation's journal.
   */
  operationId: string;
  /** Exact manual source operation selected by the explicit successor. */
  sourceRecoveryOperationId?: string;
  sourceRecoverySettlementKey?: string;
  retainedReplacementGroups?: number[][];
  /** When the OPERATION began (immutable; `recordedAt` moves per write). */
  createdAt: number;
  /**
   * DURABLE monotonic attempt-id allocator: compaction removes attempts,
   * so deriving the next id from the surviving maximum could recycle an
   * identity a removed attempt already used.
   */
  nextAttemptId: number;
  /**
   * The durable OPERATION intent: a 'remove' journals only cancels and
   * must NEVER be "recovered" by restoring the cancelled protection —
   * that would silently undo an intentional removal.
   */
  intent: 'replace' | 'remove';
  /**
   * 'creating': old protection untouched (failure needs at most a
   * rollback of surviving replacement legs). 'cancelling': old cancels
   * underway/done. 'manual': the venue has NO atomic primitive that
   * could prove a restore attaches to the same position lifecycle, so a
   * fully-failed replacement after old cancels is NEVER auto-restored —
   * the journal parks durably in this state, is surfaced to callers via
   * `getPendingManualRecoveries`, and only an explicit NEW protection
   * intent from the user resolves it. Guarded removals start in this state
   * before dispatch: only the foreground session may cancel further orders;
   * recovery reconciles attempted cancels and preserves surviving protection.
   */
  phase: 'creating' | 'cancelling' | 'manual';
  /**
   * Whether the prior set was a venue-linked auto-cancel TP+SL pair
   * (decided ONLY by the venue's own linkage fields).
   */
  priorGrouping: 'oco' | 'independent';
  priorTriggers: TpslPriorTrigger[];
};

/** Durable identities of Core-created protection, independent of position size. */
type ManagedTpslOrder = {
  clientId: string;
  orderId: string | null;
  /** Signed absolute order expiry (ms); unknown for legacy records. */
  orderExpiry?: number;
};

/**
 * DURABLE manual-recovery record, SEPARATE from the settlement journal:
 * parking releases the journal slot (so a successor protection intent
 * can run), while this warning survives until a successor intent
 * SUCCEEDS — a failed successor must never erase the warning.
 */
type TpslManualRecovery = {
  partialIntent?: PartialTpslIntent;
  settlementKey: string;
  symbol: string;
  /** Human-readable cause of the parked state. */
  reason: string;
  priorIntent: 'replace' | 'remove';
  /** Exact wire intents of the protection that was in place before. */
  priorTriggers: TpslPriorTrigger[];
  /** Venue order ids still on the books when the state was parked. */
  survivingOrderIds: string[];
  operationId: string;
  recordedAt: number;
};

/** Maximum durable recovered-dispatch outcomes retained per nonce ledger. */
const LIGHTER_RECOVERED_DISPATCH_LIMIT = 32;
/** Bounded native testnet probes retain a one-percent slippage default. */
const LIGHTER_NATIVE_PROBE_DEFAULT_SLIPPAGE = 0.01;
/** Maximum durable TP/SL manual-recovery obligations retained per network. */
const LIGHTER_TPSL_MANUAL_RECOVERY_LIMIT = 64;

/**
 * Capture each exact client's signed absolute order expiry. Transaction expiry
 * only bounds acceptance, so it cannot prove a resting order has ended.
 *
 * @param signed - Bridge signing result.
 * @param signed.txInfo - Signed single or grouped wire payload.
 * @param clientIds - Expected client identities, in journal order.
 * @param zeroExpiryClientIds - Immediate parents whose exact signed expiry must be zero.
 * @returns Index-aligned absolute order expiries, in milliseconds.
 */
const requireSignedOrderExpiries = (
  signed: { txInfo?: string },
  clientIds: number[],
  zeroExpiryClientIds: readonly number[] = [],
): number[] => {
  const invalid = (): Error =>
    new Error(
      'Lighter signing result carries no usable order expiry identity; refusing protection changes',
    );
  let payload: unknown;
  try {
    payload = JSON.parse(signed.txInfo ?? '');
  } catch {
    throw invalid();
  }
  if (typeof payload !== 'object' || payload === null) {
    throw invalid();
  }
  const wire = payload as Record<string, unknown>;
  const rows = clientIds.length === 1 ? [wire] : wire.Orders;
  if (!Array.isArray(rows) || rows.length !== clientIds.length) {
    throw invalid();
  }
  const expiries = new Map<number, number>();
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) {
      throw invalid();
    }
    const { ClientOrderIndex: clientId, OrderExpiry: orderExpiry } =
      row as Record<string, unknown>;
    if (
      typeof clientId !== 'number' ||
      !clientIds.includes(clientId) ||
      expiries.has(clientId) ||
      typeof orderExpiry !== 'number' ||
      !Number.isSafeInteger(orderExpiry) ||
      (zeroExpiryClientIds.includes(clientId)
        ? orderExpiry !== 0
        : orderExpiry <= Date.now())
    ) {
      throw invalid();
    }
    expiries.set(clientId, orderExpiry);
  }
  return clientIds.map((clientId) => {
    const expiry = expiries.get(clientId);
    if (expiry === undefined) {
      throw invalid();
    }
    return expiry;
  });
};

/**
 * PROCESS-WIDE mutexes: venue write sections, the per-settlement journal
 * state machine, and journal/index read-modify-writes are serialized
 * across ALL provider instances in this runtime. Instance-local write
 * chains cannot protect two live providers sharing one venue account or
 * one disk cache. Completed tails are evicted to keep the map bounded.
 */
const processMutexTails = new Map<string, Promise<unknown>>();

/**
 * Run an operation atomically w.r.t. every other holder of the same key
 * in this process.
 *
 * @param key - Key to serialize on.
 * @param operation - The critical operation.
 * @returns The operation's result.
 */
const withProcessMutex = async <Result>(
  key: string,
  operation: () => Promise<Result>,
): Promise<Result> => {
  const tail = processMutexTails.get(key) ?? Promise.resolve();
  const run = tail.then(operation, operation);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  processMutexTails.set(key, settled);
  settled
    .then(() => {
      // Evict when no newer holder queued behind us.
      if (processMutexTails.get(key) === settled) {
        processMutexTails.delete(key);
      }
    })
    .catch(() => undefined);
  return await run;
};

/**
 * Storage-scoped alias of the process mutex (kept for call-site clarity).
 *
 * @param key - Storage key to serialize on.
 * @param operation - The read-modify-write.
 * @returns The operation's result.
 */
const withStorageMutex = withProcessMutex;

/**
 * The WASM signer hosts ONE global client per bridge. These module maps
 * track which venue identity (`network:account:apiKey`) currently owns
 * each bridge's client, and give every bridge a process-unique mutex key
 * so all sign-and-dispatch sections across ALL provider instances
 * sharing a bridge are serialized and re-establish the correct client
 * before signing.
 */
/**
 * Cryptographic randomness with a bounded Math.random fallback for hosts
 * without WebCrypto. Collision-resistant ids matter here: a recycled
 * operation id could let a stale journal resolver clear a live journal.
 *
 * @param byteCount - Number of random bytes.
 * @returns The random bytes.
 */
const randomBytes = (byteCount: number): Uint8Array => {
  const bytes = new Uint8Array(byteCount);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < byteCount; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

/**
 * Two independent 24-bit random values (client order id halves).
 *
 * @returns The [high, low] pair.
 */
const randomUint24Pair = (): [number, number] => {
  const bytes = randomBytes(6);
  return [
    bytes[0] * 65_536 + bytes[1] * 256 + bytes[2],
    bytes[3] * 65_536 + bytes[4] * 256 + bytes[5],
  ];
};

/**
 * Collision-resistant id suffix (80 bits, hex).
 *
 * @returns The suffix string.
 */
const randomIdSuffix = (): string =>
  Array.from(randomBytes(10), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

const bridgeClientOwners = new WeakMap<object, string>();
const bridgeIds = new WeakMap<object, number>();
let nextBridgeId = 1;

/**
 * Process-unique mutex key for a bridge instance.
 *
 * @param bridge - The signer bridge.
 * @returns The mutex key.
 */
const bridgeMutexKey = (bridge: object): string => {
  let id = bridgeIds.get(bridge);
  if (id === undefined) {
    id = nextBridgeId;
    nextBridgeId += 1;
    bridgeIds.set(bridge, id);
  }
  return `lighterBridge:${id}`;
};

/**
 * Parse a journal-pointer document, or null when the content is not a
 * pointer (legacy inline journal or corrupt data — both handled by the
 * caller's payload validation path).
 *
 * @param raw - Raw base-key content.
 * @returns The pointer, or null.
 */
const parseTpslJournalPointer = (
  raw: string,
): { operationId: string } | null => {
  try {
    const parsed = JSON.parse(raw) as {
      pointerVersion?: unknown;
      operationId?: unknown;
    };
    if (
      parsed.pointerVersion === 1 &&
      typeof parsed.operationId === 'string' &&
      parsed.operationId.length >= 1 &&
      parsed.operationId.length <= 64
    ) {
      return { operationId: parsed.operationId };
    }
  } catch {
    // Not JSON: not a pointer.
  }
  return null;
};

/**
 * Best-effort dispatch identity from a bridge signing result. The pinned
 * WASM contract (web-wasm light_client.go) returns `{txHash, txInfo}`
 * where txInfo is the marshaled wire payload — it carries Nonce and
 * ExpiredAt but NEVER the hash. Missing fields return null without throwing.
 * Dispatch validation separately requires complete identities; extraction
 * alone does not authorize submitting a partial signing result.
 *
 * @param signed - Bridge signing result.
 * @param signed.txHash - Signed transaction hash from the RESULT.
 * @param signed.txInfo - Marshaled wire payload.
 * @returns The dispatch identity (null fields when unavailable).
 */
const extractDispatchIdentity = (signed: {
  txHash?: unknown;
  txInfo?: string;
}): { txHash: string | null; expiresAt: number | null } => {
  const txHash =
    typeof signed.txHash === 'string' &&
    /^(0x)?[0-9a-fA-F]{8,128}$/u.test(signed.txHash)
      ? signed.txHash
      : null;
  let expiresAt: number | null = null;
  try {
    const wire = JSON.parse(signed.txInfo ?? '') as Record<string, unknown>;
    expiresAt =
      typeof wire.ExpiredAt === 'number' &&
      Number.isSafeInteger(wire.ExpiredAt) &&
      wire.ExpiredAt > 0
        ? wire.ExpiredAt
        : null;
  } catch {
    expiresAt = null;
  }
  return { txHash, expiresAt };
};

/**
 * Allocate the next unique attempt identity from the journal's DURABLE
 * monotonic counter (compaction can therefore never recycle an id).
 *
 * @param journal - The journal being appended to.
 * @returns The allocated attempt id.
 */
const nextAttemptIdFor = (journal: TpslJournalState): number => {
  const allocated = journal.nextAttemptId;
  journal.nextAttemptId += 1;
  return allocated;
};

/** Delay between exact margin transaction execution reads. */
const LIGHTER_MARGIN_EXECUTION_POLL_MS = 150;

/** Bound settlement reads without repeating the signed dispatch. */
const LIGHTER_MARGIN_EXECUTION_ATTEMPTS = 10;

/** Delay between exact native edit transaction and order settlement reads. */
const LIGHTER_EDIT_SETTLE_POLL_MS = 150;

/** Bound native edit settlement reads without signing or dispatching again. */
const LIGHTER_EDIT_SETTLE_ATTEMPTS = 10;

/** Delay between TP/SL settlement visibility polls. */
const LIGHTER_TPSL_SETTLE_POLL_MS = 150;

/** Bounded attempts for TP/SL settlement visibility. */
const LIGHTER_TPSL_SETTLE_ATTEMPTS = 10;

/** Convert authoritative position percentage or default basis points to leverage.
 * @param positionMargin - Position margin percentage, when a position exists.
 * @param defaultInitial - Market initial margin in basis points.
 * @returns Leverage, or NaN when unavailable.
 */
const scaleLeverageFromMargin = (
  positionMargin: string | undefined,
  defaultInitial: number | undefined,
): number => {
  let margin = defaultInitial === undefined ? null : defaultInitial / 100;
  if (positionMargin !== undefined) {
    margin = parseStrictDecimal(positionMargin);
  }
  return margin !== null && margin > 0 ? 100 / margin : Number.NaN;
};

/**
 * Integerize a signer-bound PRICE (order price / trigger price): the
 * pinned lighter-go signer casts these to uint32 (web-wasm/main.go), so a
 * safe-integer above 2^32-1 silently WRAPS (e.g. 429496729.7 at 1 decimal
 * scales to 4,294,967,297 and wires as 1).
 *
 * @param value - Human-units price.
 * @param decimals - Market price decimals.
 * @returns The positive uint32 wire integer.
 */
const toSignerWirePriceInteger = (value: number, decimals: number): number => {
  const scaled = toSignerWireInteger(value, decimals);
  if (scaled > LIGHTER_MAX_WIRE_PRICE) {
    throw new Error(
      `Price ${value} exceeds Lighter's uint32 wire range at ${decimals} decimals`,
    );
  }
  return scaled;
};

/**
 * Map a RAW venue trigger row to its durable prior wire intent, or null
 * when it cannot be faithfully restored: unknown type/TIF/expiry, a
 * MISSING trigger price (never substituted — that would change the
 * user's protection semantics), a malformed/non-positive decimal, or a
 * value that cannot be integerized onto the wire (range/sub-tick). The
 * writer must never persist state the loader (or the signer) would
 * later reject. A mutation that would cancel such a row must fail
 * closed BEFORE any cancel.
 *
 * @param raw - Raw venue order row.
 * @param market - Market integerization parameters.
 * @param market.supportedSizeDecimals - Size integerization decimals.
 * @param market.supportedPriceDecimals - Price integerization decimals.
 * @returns The exact prior wire intent, or null when unmappable.
 */
const mapRawTriggerToPriorIntent = (
  raw: LighterApiOrder,
  market: {
    supportedSizeDecimals: number;
    supportedPriceDecimals: number;
  },
): TpslPriorTrigger | null => {
  const wireOrderTypeByVenueType: Record<string, 2 | 3 | 4 | 5> = {
    'stop-loss': 2,
    'stop-loss-limit': 3,
    'take-profit': 4,
    'take-profit-limit': 5,
  };
  const wireTimeInForceByVenueTif: Record<string, 0 | 1 | 2> = {
    'immediate-or-cancel': 0,
    'good-till-time': 1,
    'post-only': 2,
  };
  const wireOrderType = wireOrderTypeByVenueType[raw.type];
  const wireTimeInForce = wireTimeInForceByVenueTif[raw.timeInForce];
  if (
    wireOrderType === undefined ||
    wireTimeInForce === undefined ||
    !Number.isSafeInteger(raw.orderExpiry) ||
    raw.orderExpiry < -1 ||
    !/^\d{1,20}$/u.test(String(raw.orderIndex)) ||
    // A trigger's trigger price is REQUIRED verbatim.
    typeof raw.triggerPrice !== 'string'
  ) {
    return null;
  }
  const price = parseStrictDecimal(raw.price);
  const triggerPrice = parseStrictDecimal(raw.triggerPrice);
  const remainingSize = parseStrictDecimal(raw.remainingBaseAmount);
  if (
    price === null ||
    !Number.isFinite(price) ||
    price <= 0 ||
    triggerPrice === null ||
    !Number.isFinite(triggerPrice) ||
    triggerPrice <= 0 ||
    remainingSize === null ||
    !Number.isFinite(remainingSize) ||
    remainingSize <= 0
  ) {
    return null;
  }
  // Wire PREFLIGHT: integerize exactly what a restore would sign. A
  // range/sub-tick failure here refuses the whole mutation up front.
  try {
    toSignerWireInteger(remainingSize, market.supportedSizeDecimals);
    toSignerWirePriceInteger(price, market.supportedPriceDecimals);
    toSignerWirePriceInteger(triggerPrice, market.supportedPriceDecimals);
  } catch {
    return null;
  }
  return {
    orderId: String(raw.orderIndex),
    side: raw.isAsk ? 'sell' : 'buy',
    wireOrderType,
    wireTimeInForce,
    orderExpiry: raw.orderExpiry,
    price: raw.price,
    triggerPrice: raw.triggerPrice,
    remainingSize: raw.remainingBaseAmount,
  };
};

/**
 * Validate caller leverage intent against what Lighter can represent.
 *
 * @param leverage - Requested leverage, if any.
 * @returns The exact rejection message, or null when acceptable.
 */
const lighterLeverageError = (leverage: number | undefined): string | null => {
  if (leverage === undefined) {
    return null;
  }
  if (!Number.isFinite(leverage) || !(leverage > 0)) {
    return `Invalid leverage ${leverage}: must be a positive number`;
  }
  // UpdateLeverage signs an initial margin fraction in hundredths of a
  // percent. The derived IMF must itself be a positive safe integer within
  // the venue's fraction range: huge finite leverage rounds it to zero,
  // tiny finite leverage (Number.MIN_VALUE) overflows the division to
  // Infinity, and sub-1x leverage exceeds a 100% margin fraction.
  const imfHundredths = Math.round(10_000 / leverage);
  if (
    !Number.isSafeInteger(imfHundredths) ||
    imfHundredths < 1 ||
    imfHundredths > 10_000
  ) {
    return `Invalid leverage ${leverage}: outside Lighter's representable leverage range`;
  }
  return null;
};

/**
 * Derive the protection/execution price a market order signs from its
 * reference price, either a live price or a trigger level. Shared by placement and both validators so wire-range
 * checks always inspect the exact value the signer receives.
 *
 * @param referencePrice - Fresh venue price or validated trigger level.
 * @param isBuy - Order side; buys protect above, sells below.
 * @param slippageFraction - Slippage tolerance (validated < 1).
 * @returns The slippage-adjusted execution price.
 */
const deriveLighterExecutionPrice = (
  referencePrice: number,
  isBuy: boolean,
  slippageFraction: number,
): number =>
  isBuy
    ? referencePrice * (1 + slippageFraction)
    : referencePrice * (1 - slippageFraction);

const LIGHTER_NOT_SUPPORTED_ERROR = 'Lighter operation not yet supported';
const LIGHTER_SIGNER_UNAVAILABLE_ERROR = 'Lighter signer bridge not configured';
const LIGHTER_MAINNET_EXPLORER_URL = 'https://scan.lighter.xyz';
const LIGHTER_TESTNET_EXPLORER_URL = 'https://testnet.zklighter.elliot.ai';
const LIGHTER_TRIGGER_WIRE_TYPES: Readonly<Record<TriggerOrderType, number>> =
  Object.freeze({
    stop_market: LIGHTER_ORDER_TYPE_STOP_LOSS,
    stop_limit: LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
    take_profit_market: LIGHTER_ORDER_TYPE_TAKE_PROFIT,
    take_profit_limit: LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  });

/**
 * Keep unsupported post-only fields from silently changing caller intent.
 *
 * @param params - Caller order intent.
 * @returns An unsupported field error, or null for ordinary ALO intent.
 */
const getLighterPostOnlyIntentError = (params: OrderParams): string | null => {
  if (params.timeInForce !== 'ALO') {
    return null;
  }
  if (params.orderType !== 'limit') {
    return 'Lighter post-only requires an ordinary limit order';
  }
  const fields: (keyof OrderParams)[] = [
    'twapDuration',
    'twapRandomize',
    'scaleMinPrice',
    'scaleMaxPrice',
    'scaleNumOrders',
    'scaleSkew',
    'chaseIntervalMs',
    'chaseMaxDurationMs',
    'chaseMaxRepricings',
    'chaseMaxDistanceBps',
    'takeProfitPrice',
    'stopLossPrice',
    'takeProfitSize',
    'stopLossSize',
    'clientOrderId',
    'tpslLinkage',
    'grouping',
  ];
  const unsupported = fields.find((field) => params[field] !== undefined);
  return unsupported
    ? `Lighter post-only does not support ${unsupported}`
    : null;
};

/**
 * Refuse trigger fields that the native standalone transaction cannot carry.
 *
 * @param params - Caller order intent.
 * @returns A validation error, or null when the shape is supported.
 */
const getLighterTriggerIntentError = (params: OrderParams): string | null => {
  if (!isTriggerOrderType(params.orderType)) {
    return params.triggerPrice === undefined
      ? null
      : PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED;
  }
  if (params.timeInForce !== undefined) {
    return PERPS_ERROR_CODES.ORDER_TIME_IN_FORCE_NOT_SUPPORTED;
  }
  if (
    params.takeProfitPrice !== undefined ||
    params.stopLossPrice !== undefined
  ) {
    return PERPS_ERROR_CODES.ORDER_TRIGGER_TPSL_UNSUPPORTED;
  }
  const unsupportedFields = [
    'takeProfitSize',
    'stopLossSize',
    'tpslLinkage',
    'grouping',
    'clientOrderId',
    'twapDuration',
    'twapRandomize',
    'scaleMinPrice',
    'scaleMaxPrice',
    'scaleNumOrders',
    'scaleSkew',
    'chaseIntervalMs',
    'chaseMaxDurationMs',
    'chaseMaxRepricings',
    'chaseMaxDistanceBps',
  ] as const satisfies readonly (keyof OrderParams)[];
  const unsupported = unsupportedFields.find(
    (field) => params[field] !== undefined,
  );
  return unsupported
    ? `Lighter standalone triggers do not support ${unsupported}`
    : null;
};

/**
 * Resolve the native trigger prices before any signer or account mutation.
 *
 * @param params - Standalone trigger intent.
 * @param market - Venue price precision.
 * @returns Sizing reference, execution protection and the exact trigger wire value.
 */
const resolveLighterTriggerPrices = (
  params: OrderParams,
  market: LighterOrderBookMeta,
): {
  referencePrice: number;
  executionPrice: number;
  triggerPriceInt: number;
} => {
  if (params.triggerPrice === undefined || params.triggerPrice === '') {
    throw new Error(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
  }
  const triggerPrice = parseFinitePositive(params.triggerPrice);
  if (triggerPrice === null) {
    throw new Error(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE);
  }
  const triggerPriceInt = toSignerWirePriceInteger(
    triggerPrice,
    market.supportedPriceDecimals,
  );
  if (
    fromLighterInteger(triggerPriceInt, market.supportedPriceDecimals) !==
    triggerPrice
  ) {
    throw new Error('Trigger price does not align with the Lighter price grid');
  }
  if (isLimitExecutionOrderType(params.orderType)) {
    const price = parseFinitePositive(params.price ?? '');
    if (price === null) {
      throw new Error(
        `Invalid limit price ${params.price}: must be a positive number`,
      );
    }
    return { referencePrice: price, executionPrice: price, triggerPriceInt };
  }
  const slippageFraction =
    params.maxSlippageBps === undefined
      ? (params.slippage ?? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000)
      : params.maxSlippageBps / 10_000;
  if (
    !Number.isFinite(slippageFraction) ||
    slippageFraction < 0 ||
    slippageFraction >= 1
  ) {
    throw new Error(
      `Invalid slippage tolerance ${slippageFraction * 10_000} bps: must be at least 0 and below 10000`,
    );
  }
  return {
    referencePrice: triggerPrice,
    executionPrice: deriveLighterExecutionPrice(
      triggerPrice,
      params.isBuy,
      slippageFraction,
    ),
    triggerPriceInt,
  };
};

/**
 * Preserve unsupported attached sizes and linkage as explicit errors.
 *
 * @param params - Caller intent.
 * @returns Error or null for native full attached coverage.
 */
const getLighterAttachedIntentError = (params: OrderParams): string | null => {
  const attached =
    params.takeProfitPrice !== undefined || params.stopLossPrice !== undefined;
  if (
    params.takeProfitSize !== undefined ||
    params.stopLossSize !== undefined
  ) {
    return 'Lighter attached orders do not support explicit child sizes';
  }
  if (!attached) {
    return (params.tpslLinkage !== undefined &&
      params.tpslLinkage !== 'none') ||
      (params.grouping !== undefined && params.grouping !== 'na')
      ? 'Lighter attached linkage requires a TP or SL trigger'
      : null;
  }
  if (params.orderType !== 'limit' && params.orderType !== 'market') {
    return 'Lighter attached orders require a market or limit parent';
  }
  if (params.reduceOnly) {
    return 'Lighter attached orders require an opening parent';
  }
  if (
    (params.tpslLinkage !== undefined && params.tpslLinkage !== 'order') ||
    (params.grouping !== undefined && params.grouping !== 'normalTpsl')
  ) {
    return 'Lighter attached orders only support order linkage';
  }
  if (params.clientOrderId !== undefined) {
    return 'Lighter attached orders do not support caller-provided client IDs';
  }
  if (
    params.timeInForce !== undefined &&
    !['GTC', 'IOC'].includes(params.timeInForce)
  ) {
    return 'Lighter attached orders support GTC or IOC parents';
  }
  return null;
};

/**
 * Validate both native children before key setup or signing.
 *
 * @param params - Parent and attached intent.
 * @param market - Fresh venue grid.
 * @param referencePrice - Parent limit or current market price.
 * @returns Unsigned children; their client IDs are assigned under the write lock.
 */
const resolveLighterAttachedChildren = (
  params: OrderParams,
  market: LighterOrderBookMeta,
  referencePrice: number,
): LighterCreateOrderWireParams[] => {
  const children: LighterCreateOrderWireParams[] = [];
  if (
    params.takeProfitPrice === undefined &&
    params.stopLossPrice === undefined
  ) {
    return children;
  }
  if (
    params.orderType === 'limit' &&
    fromLighterInteger(
      toSignerWirePriceInteger(referencePrice, market.supportedPriceDecimals),
      market.supportedPriceDecimals,
    ) !== referencePrice
  ) {
    throw new Error(
      'Lighter attached parent price does not align with the price grid',
    );
  }
  for (const [price, orderType] of [
    [params.takeProfitPrice, 'take_profit_market'],
    [params.stopLossPrice, 'stop_market'],
  ] as const) {
    if (price === undefined) {
      continue;
    }
    const trigger = parseFinitePositive(price);
    if (trigger === null) {
      throw new Error('Lighter attached trigger prices must be positive');
    }
    const takeProfit = orderType === 'take_profit_market';
    if (
      takeProfit === params.isBuy
        ? trigger <= referencePrice
        : trigger >= referencePrice
    ) {
      throw new Error(
        'Lighter attached trigger is on the wrong side of the parent reference price',
      );
    }
    const childIntent: OrderParams = {
      ...params,
      isBuy: !params.isBuy,
      orderType,
      triggerPrice: price,
    };
    const resolved = resolveLighterTriggerPrices(childIntent, market);
    children.push([
      market.marketId,
      1,
      '0',
      String(
        toSignerWirePriceInteger(
          resolved.executionPrice,
          market.supportedPriceDecimals,
        ),
      ),
      params.isBuy ? 1 : 0,
      takeProfit
        ? LIGHTER_ORDER_TYPE_TAKE_PROFIT
        : LIGHTER_ORDER_TYPE_STOP_LOSS,
      LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
      1,
      String(resolved.triggerPriceInt),
      LIGHTER_ORDER_EXPIRY_NONE,
    ]);
  }
  return children;
};
/** No retained local key matches a current venue registration. */
class LighterRecoveryReadAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LighterRecoveryReadAuthorityError';
  }
}

/** A definitive venue response that the selected wallet has no account. */
class LighterAccountNotFoundError extends Error {
  constructor(address: string) {
    super(
      `No Lighter account exists for ${address}; fund it via the bridge (or the testnet faucet) first`,
    );
    this.name = 'LighterAccountNotFoundError';
  }
}

const SILENT_LIGHTER_TRADING_ERRORS = new Set<string>([
  PERPS_ERROR_CODES.ORDER_MARGIN_MODE_INVALID,
  PERPS_ERROR_CODES.ORDER_MARGIN_MODE_UNSUPPORTED,
  PERPS_ERROR_CODES.ORDER_LEVERAGE_INVALID,
  PERPS_ERROR_CODES.ORDER_SCALE_PREVIEW_STALE,
  'Partial pair linkage requires a supported explicitly sized TP/SL pair',
  'A partial protection size requires its trigger price',
  'Lighter margin adjustment requires exact micro-USDC precision',
]);

/**
 * Session-bound work stopped because the provider disconnected or the wallet
 * switched accounts while it ran.
 */
class LighterSessionCancelledError extends Error {
  constructor(reason: string) {
    super(`Operation cancelled: ${reason}`);
    this.name = 'LighterSessionCancelledError';
  }
}

// EIP-1193 `userRejectedRequest` error code.
const USER_REJECTED_REQUEST_CODE = 4001;

// How wallets word a declined signature when they set no code (the same
// wordings the controller's deposit flow treats as a cancellation).
const USER_REJECTED_MESSAGE_PATTERN = /user (rejected|denied|cancell?ed)/iu;

/**
 * Whether the user declined the venue-key signature; the order path asks
 * again.
 *
 * @param error - The caught error.
 * @returns True for a declined signature.
 */
const isDeclinedRegistration = (error: unknown): boolean =>
  hasErrorInCauseChain(
    error,
    (current) =>
      (current as { code?: unknown }).code === USER_REJECTED_REQUEST_CODE ||
      USER_REJECTED_MESSAGE_PATTERN.test(current.message),
  );

/**
 * Empty account state returned when reads fail or no account exists.
 */
const EMPTY_ACCOUNT_STATE: AccountState = {
  totalBalance: '0',
  spendableBalance: '0',
  withdrawableBalance: '0',
  marginUsed: '0',
  unrealizedPnl: '0',
  returnOnEquity: '0',
  providerId: 'lighter',
};

// ============================================================================
// LighterProvider
// ============================================================================

/**
 * Lighter provider implementation (POC).
 */
export class LighterProvider implements PerpsProvider {
  readonly #reportedTradingErrors = new WeakSet<Error>();

  readonly protocolId = 'lighter';

  readonly #deps: PerpsPlatformDependencies;

  readonly #clientService: LighterClientService;

  readonly #chaseService: LighterChaseService;
  readonly #chaseTestnetProbe: boolean;
  readonly #chaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #chaseGeneration = 0;

  readonly #walletService: LighterWalletService;

  readonly #messenger: PerpsControllerMessenger | null;

  readonly #signerBridge: LighterSignerBridge | null;

  #signerResetUnsubscribe: (() => void) | null = null;

  readonly #isTestnet: boolean;

  #apiKeyIndex: number;

  readonly #preferredApiKeyIndex: number;

  readonly #configuredAccountIndex: number | undefined;

  /** Markets cache keyed by symbol (freshness delegated to client service). */
  #marketsBySymbol: Map<string, LighterOrderBookMeta> = new Map();

  #marketsById: Map<number, LighterOrderBookMeta> = new Map();

  /** Resolved Lighter account index (after ensureAccount()). */
  #accountIndex: number | null = null;

  /** L1 address the current venue session (index/signer/auth) is bound to. */
  #boundAddress: string | null = null;

  /** Terminal lifecycle fence set by disconnect(). */
  #isDisconnected = false;

  /**
   * Monotonic counter bumped on every session rebind. Async resolutions
   * capture it before awaiting and refuse to cache results from a stale
   * generation (an account-A lookup resolving after the switch to B).
   */
  #sessionGeneration = 0;

  /** Active price-stream subscribers (REST polling fan-out). */
  readonly #priceSubscribers: Set<SubscribePricesParams> = new Set();

  #pricePollTimer: ReturnType<typeof setInterval> | null = null;

  #priceWs: LighterWebSocketLike | null = null;

  /** Injectable WebSocket constructor (null → REST polling fallback). */
  readonly #webSocketCtor: LighterWebSocketCtor | null;

  /** Channels the shared socket should be subscribed to (subscribe payloads). */
  readonly #wsWantedChannels: Map<string, { auth?: string }> = new Map();

  #wsKeepaliveTimer: ReturnType<typeof setInterval> | null = null;

  /** Live WS connection state, mirrored to subscribed listeners. */
  #connectionState: WebSocketConnectionState =
    WebSocketConnectionState.Disconnected;

  /** Consecutive reconnect attempts since the last successful open. */
  #wsReconnectAttempts = 0;

  readonly #connectionListeners = new Set<
    (state: WebSocketConnectionState, reconnectionAttempt: number) => void
  >();

  readonly #setConnectionState = (state: WebSocketConnectionState): void => {
    if (this.#connectionState === state) {
      return;
    }
    this.#connectionState = state;
    for (const listener of this.#connectionListeners) {
      try {
        listener(state, this.#wsReconnectAttempts);
      } catch (error) {
        this.#logSubscriberError('connection-state', error);
      }
    }
  };

  #wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Merged latest price per symbol, replayed to late price subscribers. */
  readonly #lastPriceBySymbol: Map<string, PriceUpdate> = new Map();

  /** Merged live position state from account_all_positions (keyed marketId). */
  readonly #wsPositions: Map<number, Position> = new Map();

  /** Merged live open orders from account_all_orders (keyed orderId). */
  readonly #wsOrders: Map<string, Order> = new Map();

  #hasOrdersSnapshot = false;

  /** Last validated fill history for this wallet session, including empty. */
  #wsFills: OrderFill[] | null = null;

  readonly #oiCapSubscribers: Set<SubscribeOICapsParams> = new Set();

  readonly #accountSubscribers: Set<SubscribeAccountParams> = new Set();

  readonly #positionSubscribers: Set<SubscribePositionsParams> = new Set();

  readonly #orderSubscribers: Set<SubscribeOrdersParams> = new Set();

  readonly #fillSubscribers: Set<SubscribeOrderFillsParams> = new Set();

  /** Order-book subscribers keyed by market id. */
  readonly #orderBookSubscribers: Map<number, Set<SubscribeOrderBookParams>> =
    new Map();

  /** Live order-book level state per market (price → size). */
  readonly #orderBookState: Map<number, LighterOrderBookState> = new Map();

  /** Candle subscribers keyed by `marketId:resolution`. */
  readonly #candleSubscribers: Map<string, Set<SubscribeCandlesParams>> =
    new Map();

  /** Cached candle series per `marketId:resolution` (keyed by open time). */
  readonly #candleSeries: Map<string, Map<number, CandleStick>> = new Map();

  /** Dedup for the async account-channel setup. */
  #accountChannelsPromise: Promise<void> | null = null;

  /** Derived venue public key hex, set after the signer client is created. */
  #venuePublicKey: string | null = null;

  /** Signer session dedup. */
  #signerReadyPromise: Promise<void> | null = null;

  /** Set only after key validation, registration and nonce reconciliation succeed. */
  #readyApiKeyIndex: number | null = null;

  /** Cached auth token (deadline-managed). */
  #authToken: { token: string; deadline: number } | null = null;

  readonly #nativeTwapTestnetProbe: boolean;
  readonly #nativeTwapService: LighterTwapService;

  constructor(options: {
    /** Explicit bounded testnet probe, advertised only with an injected signer. */
    chaseTestnetProbe?: boolean;
    nativeTwapTestnetProbe?: boolean;
    isTestnet?: boolean;
    platformDependencies: PerpsPlatformDependencies;
    messenger?: PerpsControllerMessenger;
    lighterAuthConfig?: LighterAuthConfig;
    signerBridge?: LighterSignerBridge;
    webSocketCtor?: LighterWebSocketCtor | null;
  }) {
    this.#deps = options.platformDependencies;
    this.#chaseService = new LighterChaseService({
      storage: this.#deps.diskCache,
    });
    this.#chaseTestnetProbe = options.chaseTestnetProbe ?? false;
    if (this.#chaseTestnetProbe && options.isTestnet === false) {
      throw new Error('Lighter Chase probe is testnet-only');
    }
    this.#isTestnet = options.isTestnet ?? true;
    if (options.nativeTwapTestnetProbe && !this.#isTestnet) {
      throw new Error('Native TWAP probe mode is testnet-only');
    }
    this.#nativeTwapTestnetProbe = options.nativeTwapTestnetProbe ?? false;
    this.#messenger = options.messenger ?? null;
    this.#signerBridge = options.signerBridge ?? null;
    this.#ensureSignerResetListener();
    const globalWebSocket = Reflect.get(globalThis, 'WebSocket') as
      | LighterWebSocketCtor
      | undefined;
    const defaultWebSocketCtor =
      typeof globalWebSocket === 'function' ? globalWebSocket : null;
    this.#webSocketCtor =
      options.webSocketCtor === undefined
        ? defaultWebSocketCtor
        : options.webSocketCtor;
    this.#apiKeyIndex =
      options.lighterAuthConfig?.apiKeyIndex ?? LIGHTER_DEFAULT_API_KEY_INDEX;
    this.#preferredApiKeyIndex = this.#apiKeyIndex;
    this.#configuredAccountIndex = options.lighterAuthConfig?.accountIndex;

    this.#clientService = new LighterClientService(this.#deps, {
      isTestnet: this.#isTestnet,
    });
    this.#walletService = new LighterWalletService(this.#deps, {
      isTestnet: this.#isTestnet,
      messenger: options.messenger,
    });

    this.#nativeTwapService = new LighterTwapService({
      storage: this.#deps.diskCache,
      assertCurrent: (owner): void => {
        this.#ensureSessionBinding();
        if (
          owner.wallet !== this.#boundAddress ||
          owner.network !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
          owner.accountIndex !== this.#accountIndex ||
          this.#isDisconnected
        ) {
          throw new Error('Lighter TWAP ownership changed during operation');
        }
      },
    });

    this.#deps.debugLogger.log('[LighterProvider] Constructor complete', {
      protocolId: this.protocolId,
      isTestnet: this.#isTestnet,
      hasMessenger: Boolean(this.#messenger),
      hasSignerBridge: Boolean(this.#signerBridge),
      apiKeyIndex: this.#apiKeyIndex,
    });
  }

  // ============================================================================
  // Error Context Helper
  // ============================================================================

  readonly #getErrorContext = (
    method: string,
    extra?: Record<string, unknown>,
    errorTags?: PerpsErrorTags,
  ): PerpsLoggerOptions => {
    return createPerpsErrorContext({
      contextName: `LighterProvider.${method}`,
      method,
      provider: 'LighterProvider',
      network: this.#isTestnet ? 'testnet' : 'mainnet',
      errorTags,
      data: {
        isTestnet: this.#isTestnet,
        ...extra,
      },
    });
  };

  /**
   * Whether a trading failure is an expected signer, account, session, or
   * local-validation outcome. Those stay out of Sentry.
   *
   * @param error - Normalized provider error.
   * @returns True when the provider owns silence for this failure.
   */
  #isSilentTradingError(error: Error): boolean {
    return (
      isKeyringLockedError(error) ||
      error instanceof LighterSessionCancelledError ||
      error instanceof LighterAccountNotFoundError ||
      SILENT_LIGHTER_TRADING_ERRORS.has(error.message)
    );
  }

  /**
   * Forward a failed trading operation to the platform logger without
   * classifying or rewriting the provider error.
   *
   * Retryable keyring/session failures, missing accounts, and local intent
   * validation remain caller-visible but are not reported.
   *
   * @param error - The provider or venue failure.
   * @param method - The provider method that failed.
   * @param errorTags - Bounded operation and action tags.
   * @param extra - Diagnostic context that must not become tags.
   * @returns The normalized Error used by the caller result.
   */
  readonly #reportTradingError = (
    error: unknown,
    method: string,
    errorTags: PerpsErrorTags,
    extra?: Record<string, unknown>,
  ): Error => {
    const wrappedError = ensureError(error, `LighterProvider.${method}`);
    if (!this.#isSilentTradingError(wrappedError)) {
      this.#deps.logger.error(
        wrappedError,
        this.#getErrorContext(method, extra, errorTags),
      );
      this.#reportedTradingErrors.add(wrappedError);
    }
    return wrappedError;
  };

  // ============================================================================
  // Initialization & Lifecycle
  // ============================================================================

  async initialize(): Promise<InitializeResult> {
    try {
      const markets = await this.#clientService.getOrderBooks(true);
      if (this.#isDisconnected) {
        return { success: false, error: 'Lighter provider is disconnected' };
      }
      this.#marketsBySymbol = new Map(
        markets.map((market) => [market.symbol, market]),
      );
      this.#marketsById = new Map(
        markets.map((market) => [market.marketId, market]),
      );
      this.#deps.debugLogger.log('[LighterProvider] Initialized', {
        markets: markets.length,
      });
      return { success: true };
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.initialize',
      );
      this.#deps.debugLogger.log('[LighterProvider] initialize failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('initialize'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  async disconnect(): Promise<DisconnectResult> {
    // A disconnect (provider switch, shutdown) invalidates the whole
    // session: an in-flight write paused inside the lock must fail its
    // fences instead of submitting after the provider was torn down.
    this.#interruptChase();
    this.#isDisconnected = true;
    this.#invalidateSessionState();
    this.#removeSignerResetListener();
    this.#teardownStream();
    this.#priceSubscribers.clear();
    this.#oiCapSubscribers.clear();
    this.#accountSubscribers.clear();
    this.#positionSubscribers.clear();
    this.#orderSubscribers.clear();
    this.#fillSubscribers.clear();
    this.#orderBookSubscribers.clear();
    this.#candleSubscribers.clear();
    return { success: true };
  }

  async ping(_timeoutMs?: number): Promise<void> {
    await this.#clientService.getOrderBooks();
  }

  async toggleTestnet(): Promise<ToggleTestnetResult> {
    // Network is fixed at construction.
    return {
      success: false,
      isTestnet: this.#isTestnet,
      error: 'Lighter network is fixed at construction',
    };
  }

  /**
   * Register the venue key ahead of the first order, so its main-account
   * `personal_sign` happens in a guided session. A read-only provider (no
   * signer bridge) has nothing to prepare and resolves `ready: true` while an
   * account is selected and the main-account signer is ready.
   *
   * @returns The readiness result described on
   * `PerpsController.prepareTradingWallet`.
   */
  async prepareTradingWallet(): Promise<ReadyToTradeResult> {
    if (!this.#walletService.isMainAccountSignerReady()) {
      return { ready: false, error: PERPS_ERROR_CODES.KEYRING_LOCKED };
    }
    try {
      this.#walletService.getUserAddress();
    } catch {
      return { ready: false, error: PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED };
    }
    if (!this.#signerBridge) {
      return { ready: true };
    }
    try {
      await this.#ensureSignerReady();
      // The signer can lock while the venue key is being registered.
      if (!this.#walletService.isMainAccountSignerReady()) {
        return { ready: false, error: PERPS_ERROR_CODES.KEYRING_LOCKED };
      }
      return { ready: true };
    } catch (caughtError) {
      // A locked signer, or one that locked while registration ran.
      if (
        isKeyringLockedError(caughtError) ||
        !this.#walletService.isMainAccountSignerReady()
      ) {
        return { ready: false, error: PERPS_ERROR_CODES.KEYRING_LOCKED };
      }
      if (isDeclinedRegistration(caughtError)) {
        return { ready: false };
      }
      // Nothing can be registered before the wallet has a Lighter account.
      if (caughtError instanceof LighterAccountNotFoundError) {
        return {
          ready: false,
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        };
      }
      // The session moved on while registering; the next preparation
      // starts over for the current account.
      if (caughtError instanceof LighterSessionCancelledError) {
        this.#deps.debugLogger.log(
          '[prepareTradingWallet] Session changed during preparation',
          { reason: caughtError.message },
        );
        return {
          ready: false,
          error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        };
      }
      const error = ensureError(
        caughtError,
        'LighterProvider.prepareTradingWallet',
      );
      this.#deps.logger.error(
        error,
        this.#getErrorContext('prepareTradingWallet', undefined, {
          operation: PERPS_ERROR_OPERATION.ConnectionManagement,
          component: PERPS_ERROR_COMPONENT.ConnectionManager,
          action: PERPS_ERROR_ACTION.ConnectionConnection,
        }),
      );
      return { ready: false, error: error.message };
    }
  }

  async isReadyToTrade(): Promise<ReadyToTradeResult> {
    try {
      if (!this.#signerBridge) {
        return {
          ready: false,
          error: LIGHTER_SIGNER_UNAVAILABLE_ERROR,
          walletConnected: false,
          networkSupported: true,
        };
      }
      await this.#ensureSignerReady();
      return {
        ready: true,
        walletConnected: true,
        networkSupported: true,
        authenticatedAddress: this.#walletService.getUserAddress(),
      };
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.isReadyToTrade',
      );
      return {
        ready: false,
        error: wrappedError.message,
        walletConnected: false,
        networkSupported: true,
      };
    }
  }

  // ============================================================================
  // Signer session
  // ============================================================================

  /**
   * The RAW bridge instance — the STABLE identity object for the
   * process-wide ownership map and mutex key. The `#getSignerBridge`
   * wrapper below is a fresh object per call and must NEVER key either.
   *
   * @returns The raw signer bridge.
   */
  readonly #rawSignerBridge = (): LighterSignerBridge => {
    if (!this.#signerBridge) {
      throw new Error(LIGHTER_SIGNER_UNAVAILABLE_ERROR);
    }
    return this.#signerBridge;
  };

  readonly #getSignerBridge = (): LighterSignerBridge => {
    if (!this.#signerBridge) {
      throw new Error(LIGHTER_SIGNER_UNAVAILABLE_ERROR);
    }
    const bridge = this.#signerBridge;
    // The WASM client lives inside the bridge host (mobile: a WebView that
    // can reload and lose it). When the venue signer reports a missing
    // client, drop the cached session so the next call re-runs setup
    // instead of failing forever against a resolved-but-dead session.
    return {
      getRecoverableKeyIndices: bridge.getRecoverableKeyIndices?.bind(bridge),
      getStoredKeyIndices: bridge.getStoredKeyIndices?.bind(bridge),
      createClient: async (params): Promise<LighterCreateClientResult> => {
        try {
          const result = await bridge.createClient(params);
          if (result.error) {
            this.#invalidateSignerSession();
          }
          return result;
        } catch (error) {
          this.#invalidateSignerSession();
          throw error;
        }
      },
      execute: async <Operation extends LighterSignerOperation>(
        call: LighterWasmCall<Operation>,
      ): Promise<LighterSignerResult<Operation>> => {
        const lostClientPattern =
          /client is not created|WebView reloaded|signer not ready|executor not connected|timed out/iu;
        try {
          const result = await bridge.execute(call);
          const error = (result as { error?: string } | null)?.error;
          if (error && lostClientPattern.test(error)) {
            this.#invalidateSignerSession();
          }
          return result;
        } catch (error) {
          if (lostClientPattern.test(String(error))) {
            this.#invalidateSignerSession();
          }
          throw error;
        }
      },
    };
  };

  readonly #invalidateSignerSession = (): void => {
    // Advancing the generation aborts any in-flight setup/write that was
    // started against the now-dead WASM client.
    this.#sessionGeneration += 1;
    this.#signerReadyPromise = null;
    this.#readyApiKeyIndex = null;
    this.#authToken = null;
    this.#clearBridgeOwnership();
    this.#deps.debugLogger.log(
      '[LighterProvider] signer session invalidated (client lost); will re-setup on next call',
    );
  };

  /** Replace this provider's listener on the client-owned signer bridge. */
  readonly #replaceSignerResetListener = (): void => {
    this.#removeSignerResetListener();
    this.#ensureSignerResetListener();
  };

  /** Install the reset listener when the current binding has none. */
  readonly #ensureSignerResetListener = (): void => {
    if (this.#isDisconnected || this.#signerResetUnsubscribe) {
      return;
    }
    this.#signerResetUnsubscribe =
      this.#signerBridge?.onReset?.(() => this.#invalidateSignerSession()) ??
      null;
  };

  /** Remove this provider's listener when its session is retired. */
  readonly #removeSignerResetListener = (): void => {
    this.#signerResetUnsubscribe?.();
    this.#signerResetUnsubscribe = null;
  };

  /**
   * Drop ALL bridge-client ownership material for this provider: the
   * identity, the recreate params, and — when WE are the recorded owner
   * — the process-wide ownership entry, so a dead/rebound session can
   * never be mistaken for the live owner of the singleton client.
   */
  readonly #clearBridgeOwnership = (): void => {
    if (
      this.#signerBridge &&
      this.#signerIdentity !== null &&
      bridgeClientOwners.get(this.#signerBridge) === this.#signerIdentity
    ) {
      bridgeClientOwners.delete(this.#signerBridge);
    }
    this.#signerIdentity = null;
    this.#signerRecreateParams = null;
  };

  /**
   * Bind the venue session to the currently selected wallet address.
   *
   * Everything downstream — account index, venue signer, auth token, and
   * the account-scoped stream channels — is derived from one L1 address.
   * When the wallet switches accounts, all of it must be dropped
   * atomically or reads/writes would keep targeting the previous account.
   */
  readonly #ensureSessionBinding = (): void => {
    if (this.#isDisconnected) {
      return;
    }
    let address: string;
    try {
      address = this.#walletService.getUserAddress().toLowerCase();
    } catch {
      if (this.#boundAddress !== null) {
        // All accounts deselected while a session existed: invalidate so
        // nothing in flight can still act for the old account.
        this.#emitAccountBindingReset();
        this.#invalidateSessionState();
        this.#removeSignerResetListener();
        this.#teardownStream();
      }
      // The caller's own address resolution surfaces the error.
      return;
    }
    if (this.#boundAddress === address) {
      return;
    }
    const hadPreviousBinding = this.#boundAddress !== null;
    this.#boundAddress = address;
    if (!hadPreviousBinding) {
      this.#ensureSignerResetListener();
      // First binding (or first after a deselection): surviving
      // subscribers may be sitting on an empty channel set.
      if (this.#hasAnySubscriber() && this.#wsWantedChannels.size === 0) {
        this.#rebuildStreamForSubscribers();
      }
      return;
    }
    // Invalidate in-flight async resolutions started under the previous
    // binding: they compare this generation after their awaits and retry
    // instead of caching results for the wrong account.
    this.#interruptChase();
    this.#sessionGeneration += 1;
    this.#accountIndex = null;
    this.#apiKeyIndex = this.#preferredApiKeyIndex;
    this.#signerReadyPromise = null;
    this.#readyApiKeyIndex = null;
    this.#authToken = null;
    this.#replaceSignerResetListener();
    // #tpslUnsettled is NOT cleared: entries are keyed by
    // address+accountIndex+symbol, so B never consumes A's pending ids and
    // switching back to A retains its reconciliation obligation.
    this.#emitAccountBindingReset();
    this.#teardownStream();
    this.#rebuildStreamForSubscribers();
    this.#deps.debugLogger.log(
      '[LighterProvider] session rebound to new wallet account',
    );
  };

  /** Clear subscriber-visible account data before a wallet rebind. */
  readonly #emitAccountBindingReset = (): void => {
    for (const subscriber of this.#accountSubscribers) {
      try {
        subscriber.callback(EMPTY_ACCOUNT_STATE);
      } catch (error) {
        this.#logSubscriberError('account', error);
      }
    }
    for (const subscriber of this.#positionSubscribers) {
      try {
        subscriber.callback([]);
      } catch (error) {
        this.#logSubscriberError('positions', error);
      }
    }
    this.#emitToOrderSubscribers([]);
  };

  /**
   * Re-request every channel the current subscriber registries imply.
   *
   * #teardownStream clears the wanted-channel intents; without this,
   * subscribers that outlive an account switch would sit on a fresh socket
   * subscribed to nothing.
   */
  readonly #rebuildStreamForSubscribers = (): void => {
    if (this.#isDisconnected || !this.#hasAnySubscriber()) {
      return;
    }
    if (this.#priceSubscribers.size > 0 || this.#oiCapSubscribers.size > 0) {
      this.#requestChannel('market_stats/all');
    }
    for (const marketId of this.#orderBookSubscribers.keys()) {
      this.#requestChannel(`order_book/${marketId}`);
    }
    for (const seriesKey of this.#candleSubscribers.keys()) {
      // Series keys are `${marketId}:${resolution}`; the channel form uses
      // slashes. The teardown cleared the series state, and the message
      // router drops updates for unknown series — recreate an empty series
      // so live candles flow again (history reseeds on the next fetch).
      this.#candleSeries.set(seriesKey, new Map());
      this.#requestChannel(`candle/${seriesKey.replace(':', '/')}`);
    }
    if (
      this.#accountSubscribers.size > 0 ||
      this.#positionSubscribers.size > 0 ||
      this.#orderSubscribers.size > 0 ||
      this.#fillSubscribers.size > 0
    ) {
      // The promise was cleared by the teardown, so this re-resolves the
      // account channels against the newly bound address.
      this.#ensureAccountChannels();
    }
    this.#ensureStream();
  };

  /**
   * Resolve the Lighter account index for the current user.
   *
   * @returns The account index.
   */
  readonly #ensureAccountIndex = async (): Promise<number> => {
    this.#ensureSessionBinding();
    // Account-bound work requires a bound wallet — including the cached
    // fast path and the configured-index path.
    this.#assertSession(this.#sessionGeneration);
    if (this.#accountIndex !== null) {
      return this.#accountIndex;
    }
    if (this.#configuredAccountIndex !== undefined) {
      // A configured index must be a Standard (0-fee) account AND owned by
      // the bound wallet address: a signed-in wallet must never read or
      // trade another owner's account just because an env var names it.
      const generationAtCheck = this.#sessionGeneration;
      const configured = await this.#clientService.getAccountByIndex(
        this.#configuredAccountIndex,
      );
      this.#ensureSessionBinding();
      if (generationAtCheck !== this.#sessionGeneration) {
        return await this.#ensureAccountIndex();
      }
      const configuredAccount = configured.accounts[0];
      this.#assertStandardAccount(configuredAccount?.accountType);
      this.#assertAccountOwnership(configuredAccount);
      this.#accountIndex = this.#configuredAccountIndex;
      return this.#accountIndex;
    }
    const generation = this.#sessionGeneration;
    const address = this.#walletService.getUserAddress();
    let response: LighterAccountsByL1AddressResponse;
    try {
      response = await this.#clientService.getAccountsByL1Address(address);
    } catch (error) {
      if (error instanceof LighterApiError && error.code === 21100) {
        throw new LighterAccountNotFoundError(address);
      }
      throw error;
    }
    // Re-run the binding so an EXTERNAL switch nothing else observed also
    // advances the generation, then compare: caching after any switch
    // would poison the new session with the old account. Retry instead.
    this.#ensureSessionBinding();
    if (generation !== this.#sessionGeneration) {
      return await this.#ensureAccountIndex();
    }
    if (!response.subAccounts?.length) {
      throw new LighterAccountNotFoundError(address);
    }
    const master = response.subAccounts.reduce((min, account) =>
      account.index < min.index ? account : min,
    );
    this.#assertStandardAccount(master.accountType);
    this.#assertAccountOwnership(master);
    this.#accountIndex = master.index;
    return this.#accountIndex;
  };

  /**
   * Verify venue identity before caching it or recording recovery authority.
   *
   * @param account - Venue account returned for the bound wallet.
   */
  readonly #assertAccountOwnership = (
    account: LighterAccountSummary | undefined,
  ): void => {
    if (
      account === undefined ||
      !Number.isSafeInteger(account.index) ||
      account.index < 0
    ) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} account index is invalid`,
      );
    }
    if (
      this.#configuredAccountIndex !== undefined &&
      account.index !== this.#configuredAccountIndex
    ) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} account index does not match the configured account`,
      );
    }
    if (account.l1Address.toLowerCase() !== this.#boundAddress) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} account is not owned by the selected wallet address`,
      );
    }
  };

  /**
   * Local account identities recorded before any venue mutation.
   *
   * @returns Storage key scoped to the selected wallet and network.
   */
  readonly #recoveryAccountsKey = (): string =>
    `lighterRecoveryAccounts:${this.#isTestnet ? 'testnet' : 'mainnet'}:${this.#boundAddress}`;

  /**
   * @param key - Captured wallet/network storage key, or the bound session key.
   * @returns Wallet-scoped previously verified venue accounts.
   */
  readonly #readRememberedRecoveryAccounts = async (
    key = this.#recoveryAccountsKey(),
  ): Promise<number[]> => {
    let raw: string | null;
    try {
      raw = await this.#deps.diskCache.getItem(key);
    } catch (error) {
      throw new Error(
        `Lighter recovery account index read failed: ${ensureError(error, 'LighterProvider.#readRememberedRecoveryAccounts').message}`,
      );
    }
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length > LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT ||
      !parsed.every(
        (index) =>
          typeof index === 'number' &&
          Number.isSafeInteger(index) &&
          index >= 0,
      ) ||
      new Set(parsed).size !== parsed.length
    ) {
      throw new Error('Lighter recovery account index is corrupt');
    }
    return parsed as number[];
  };

  /**
   * Preserve discovery of nonce-only obligations if the venue later reports absence.
   *
   * @param accountIndex - Account already verified for this wallet.
   * @param generation - Issuing session.
   */
  readonly #rememberRecoveryAccount = async (
    accountIndex: number,
    generation: number,
  ): Promise<void> => {
    const key = this.#recoveryAccountsKey();
    await withStorageMutex(key, async () => {
      this.#assertSession(generation);
      const accounts = await this.#readRememberedRecoveryAccounts();
      this.#assertSession(generation);
      if (accounts.includes(accountIndex)) {
        return;
      }
      if (accounts.length >= LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT) {
        throw new Error(
          'Lighter recovery account index is full; refusing to hide a future obligation',
        );
      }
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify([...accounts, accountIndex]),
      );
      this.#assertSession(generation);
    });
  };

  /**
   * Resolve inventory independently of fee/trading capability. Expected absence
   * and known Premium accounts retain local obligations without venue mutation.
   * Ownership, malformed metadata, transport and storage failures still reject.
   *
   * @param generation - Issuing wallet session.
   * @returns Inventory accounts and whether current venue reconciliation is supported.
   */
  readonly #resolveRecoveryInventory = async (
    generation: number,
  ): Promise<{
    accounts: number[];
    canReconcile: boolean;
  }> => {
    const absent = async (): Promise<{
      accounts: number[];
      canReconcile: false;
    }> => {
      const [remembered, manual, journals] = await Promise.all([
        this.#readRememberedRecoveryAccounts(),
        this.#readTpslManualIndex(),
        this.#readTpslJournalIndex(),
      ]);
      this.#assertSession(generation);
      const prior = new Set(remembered);
      for (const key of [...manual, ...journals]) {
        if (!key.startsWith(`${this.#boundAddress}:`)) {
          continue;
        }
        const account = key.split(':')[1];
        const index = Number(account);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== account
        ) {
          throw new Error(
            'Lighter recovery index contains an invalid account identity',
          );
        }
        prior.add(index);
      }
      return {
        accounts: [...prior].filter(
          (index) =>
            this.#configuredAccountIndex === undefined ||
            index === this.#configuredAccountIndex,
        ),
        canReconcile: false,
      };
    };
    if (this.#accountIndex !== null) {
      return { accounts: [this.#accountIndex], canReconcile: true };
    }
    let account: LighterAccountSummary | undefined;
    try {
      if (this.#configuredAccountIndex === undefined) {
        const response = await this.#clientService.getAccountsByL1Address(
          this.#walletService.getUserAddress(),
        );
        account = response.subAccounts.reduce<
          LighterAccountSummary | undefined
        >(
          (selected, next) =>
            selected === undefined || next.index < selected.index
              ? next
              : selected,
          undefined,
        );
      } else {
        const response = await this.#clientService.getAccountByIndex(
          this.#configuredAccountIndex,
        );
        account = response.accounts[0];
      }
    } catch (error) {
      this.#assertSession(generation);
      if (error instanceof LighterApiError && error.code === 21100) {
        return absent();
      }
      throw error;
    }
    this.#assertSession(generation);
    if (account === undefined) {
      return absent();
    }
    this.#assertAccountOwnership(account);
    if (account.accountType !== 0 && account.accountType !== 1) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} recovery account type could not be verified`,
      );
    }
    if (account.accountType === 0) {
      this.#accountIndex = account.index;
    }
    return {
      accounts: [account.index],
      canReconcile: account.accountType === 0,
    };
  };

  /**
   * Capability gate: only Standard (0-fee) Lighter accounts are supported.
   * Premium accounts pay nonzero maker/taker fees whose wire unit is
   * unverified — serving their history would show financially false zero
   * fees, so the whole account-bound surface refuses instead.
   *
   * @param accountType - Venue account type code (0 = Standard).
   */
  readonly #assertStandardAccount = (accountType: number | undefined): void => {
    // Fail closed: only a PROVEN Standard (type 0) account passes. A
    // missing account/type is not evidence of Standard.
    if (accountType === undefined) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} account type could not be verified (account not found); refusing to assume a Standard account`,
      );
    }
    if (accountType !== 0) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} Premium accounts are not supported yet: their fee semantics are unverified and history would be financially incorrect`,
      );
    }
  };

  /**
   * Whether an error is an explicit capability gate (unsupported account
   * tier / unverified fee semantics). These must SURFACE to callers —
   * swallowing them into empty state would present false data.
   *
   * @param error - Caught error.
   * @returns True for capability-gate errors.
   */
  readonly #isUnsupportedCapabilityError = (error: unknown): boolean =>
    String(error).includes(LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX);

  readonly #isDataIntegrityError = (error: unknown): boolean =>
    String(error).includes(LIGHTER_DATA_INTEGRITY_PREFIX);

  /**
   * Whether a read error represents an explicit non-empty state.
   *
   * @param error - Caught read error.
   * @returns Whether the error must surface to the caller.
   */
  readonly #mustSurfaceReadError = (error: unknown): boolean =>
    this.#isUnsupportedCapabilityError(error) ||
    this.#isDataIntegrityError(error);

  /**
   * TP/SL settlement expectations that timed out before becoming visible
   * on the venue's REST book, per symbol. While an entry exists, further
   * TP/SL mutations for that symbol must reconcile it first.
   */
  readonly #tpslUnsettled = new Map<string, TpslJournalState>();

  /**
   * Session-global nonce reservation per `accountIndex:apiKeyIndex`.
   * Advanced at submission DISPATCH; consulted by every write-lock
   * section so a lagging nextNonce endpoint can never reissue a nonce an
   * earlier (possibly response-lost) submission may have consumed. A
   * reconciliation that PROVES a submission never landed (exact-hash
   * not-found after signed expiry) releases the reservation again.
   */
  readonly #nonceReservations = new Map<string, number>();

  /** Monotonic source for journal operation ids within this session. */
  #tpslOperationCounter = 0;

  /** This provider's bridge-client ownership identity (set at setup). */
  #signerIdentity: string | null = null;

  /**
   * Parameters to re-create OUR venue client on the shared bridge. The
   * wallet-derived seed is NEVER retained here — it is re-derived under
   * the bridge lease each time re-establishment is needed.
   */
  #signerRecreateParams: {
    chainId: number;
    accountIndex: number;
  } | null = null;

  /**
   * Durable dispatch-ledger key: every nonce-consuming submission is
   * recorded here BEFORE dispatch so a restart can never reissue a nonce
   * whose outcome is unknown, and a proven never-landed dispatch can
   * release its nonce for the venue to consume.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @returns The disk-cache key.
   */
  readonly #nonceLedgerKey = (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): string =>
    `lighterNonceLedger:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}:${apiKeyIndex}`;

  /**
   * Read and strictly validate the durable dispatch ledger. Corruption
   * fails CLOSED (writes stay blocked) — guessing at nonce state could
   * duplicate or wedge submissions.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @returns The ledger document (consumed-nonce watermark + unresolved
   * dispatch entries).
   */
  readonly #readNonceLedger = async (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<LighterNonceLedgerDoc> => {
    let raw: string | null;
    try {
      raw = await this.#deps.diskCache.getItem(
        this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      );
    } catch (error) {
      throw new Error(
        `Lighter nonce ledger read failed; refusing writes: ${ensureError(error, 'LighterProvider.#readNonceLedger').message}`,
      );
    }
    if (raw === null) {
      return { consumedFloor: 0, entries: [], recovered: [] };
    }
    try {
      const parsed = JSON.parse(raw) as {
        version?: unknown;
        consumedFloor?: unknown;
        entries?: unknown;
        recovered?: unknown;
      };
      // EXPLICIT schema evolution: earlier documents (v1 without the
      // consumed watermark, v2 without operation kind/intent) migrate in
      // place — calling valid outstanding dispatch state corrupt would
      // block writes permanently.
      const consumedFloor =
        parsed.version === 1 && parsed.consumedFloor === undefined
          ? 0
          : parsed.consumedFloor;
      if (
        (parsed.version === 1 ||
          parsed.version === 2 ||
          parsed.version === 3 ||
          parsed.version === 4) &&
        typeof consumedFloor === 'number' &&
        Number.isSafeInteger(consumedFloor) &&
        consumedFloor >= 0 &&
        Array.isArray(parsed.entries) &&
        parsed.entries.length <= 16 &&
        parsed.entries.every((entry) => {
          if (typeof entry !== 'object' || entry === null) {
            return false;
          }
          const candidate = entry as Record<string, unknown>;
          return (
            typeof candidate.nonce === 'number' &&
            Number.isSafeInteger(candidate.nonce) &&
            candidate.nonce >= 0 &&
            (candidate.txHash === null ||
              typeof candidate.txHash === 'string') &&
            (candidate.expiresAt === null ||
              (typeof candidate.expiresAt === 'number' &&
                Number.isSafeInteger(candidate.expiresAt) &&
                candidate.expiresAt > 0))
          );
        })
      ) {
        // v4 recovered outcomes are safety state: silently dropping a
        // malformed or overflow row could make a completed/unknown
        // financial intent retryable. Older schemas predate the list.
        const recoveredRaw = parsed.version === 4 ? parsed.recovered : [];
        if (
          !Array.isArray(recoveredRaw) ||
          recoveredRaw.length > LIGHTER_RECOVERED_DISPATCH_LIMIT ||
          !recoveredRaw.every((row): row is LighterRecoveredDispatch => {
            if (typeof row !== 'object' || row === null) {
              return false;
            }
            const candidate = row as Record<string, unknown>;
            return (
              typeof candidate.recoveryId === 'string' &&
              candidate.recoveryId.length >= 1 &&
              candidate.recoveryId.length <= 160 &&
              typeof candidate.kind === 'number' &&
              typeof candidate.intent === 'string' &&
              candidate.intent.length <= 200 &&
              (candidate.txHash === null ||
                typeof candidate.txHash === 'string') &&
              (candidate.outcome === 'succeeded' ||
                candidate.outcome === 'failed' ||
                candidate.outcome === 'unknown') &&
              typeof candidate.evidence === 'string'
            );
          })
        ) {
          throw new Error('Malformed recovered-dispatch safety state');
        }
        const recovered = recoveredRaw;
        return {
          consumedFloor,
          entries: (
            parsed.entries as {
              nonce: number;
              txHash: string | null;
              expiresAt: number | null;
              kind?: number;
              intent?: string;
              owner?: string | null;
              onDispatch?: () => void;
            }[]
          ).map((entry) => ({
            ...entry,
            // v1-v3 migration: kind/intent/owner unknown.
            kind: typeof entry.kind === 'number' ? entry.kind : -1,
            intent: typeof entry.intent === 'string' ? entry.intent : 'unknown',
            owner: typeof entry.owner === 'string' ? entry.owner : null,
          })),
          recovered,
        };
      }
    } catch {
      // fall through to fail closed
    }
    throw new Error(
      'Lighter nonce dispatch ledger is corrupt; refusing further writes until it is resolved',
    );
  };

  /**
   * Persist the dispatch ledger document.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param doc - The ledger document.
   * @param doc.consumedFloor - Highest proven-consumed nonce + 1.
   * @param doc.entries - Unresolved dispatch entries.
   */
  readonly #writeNonceLedger = async (
    accountIndex: number,
    doc: LighterNonceLedgerDoc,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> => {
    await this.#deps.diskCache.setItem(
      this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      JSON.stringify({ version: 4, ...doc }),
    );
  };

  /**
   * Resolve one dispatch entry as CONSUMED: remove it and advance the
   * durable consumed-nonce watermark so no later (stale) reconciliation
   * can ever release the nonce back.
   *
   * @param accountIndex - Venue account index.
   * @param entry - The consumed entry.
   * @param entry.nonce - The dispatched nonce.
   * @param entry.txHash - The dispatched tx hash (or null).
   */
  /**
   * EVERY ledger read-modify-write (append, resolve, consumed-resolve,
   * selective acknowledgment) serializes on this ONE process-wide mutex
   * per account+slot document. The venue write mutex alone cannot
   * protect the document: `acknowledgeRecoveredDispatch` legitimately
   * runs OUTSIDE it, and an unserialized ack RMW could overwrite a
   * concurrent append with a stale doc — silently erasing an unresolved
   * dispatch entry. Lock order is always venueWrite → bridge → ledger
   * (the ack path takes only the ledger mutex), so no cycle exists.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param operation - The ledger RMW critical section.
   * @returns The operation's result.
   */
  readonly #withLedgerLock = async <Result>(
    accountIndex: number,
    operation: () => Promise<Result>,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<Result> =>
    await withProcessMutex(
      this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      operation,
    );

  /**
   * Append a recovered dispatch without ever sacrificing a blocking
   * succeeded/unknown outcome to bounded storage. Retry-safe failures may
   * be omitted at capacity; a blocking outcome may replace one such row.
   * If every retained row is already blocking, fail before persistence so
   * the original unresolved ledger entry remains authoritative.
   *
   * @param doc - Mutable nonce ledger document held under its mutex.
   * @param outcome - Recovered dispatch to retain when safety requires it.
   */
  readonly #appendRecoveredDispatch = (
    doc: LighterNonceLedgerDoc,
    outcome: LighterRecoveredDispatch,
  ): void => {
    if (
      doc.recovered.some(
        (candidate) => candidate.recoveryId === outcome.recoveryId,
      )
    ) {
      return;
    }
    if (doc.recovered.length < LIGHTER_RECOVERED_DISPATCH_LIMIT) {
      doc.recovered.push(outcome);
      return;
    }
    if (outcome.outcome === 'failed') {
      return;
    }
    const failedIndex = doc.recovered.findIndex(
      (candidate) => candidate.outcome === 'failed',
    );
    if (failedIndex < 0) {
      throw new Error(
        'Lighter recovered-dispatch ledger is full of unresolved blocking outcomes; refusing to discard the current dispatch',
      );
    }
    doc.recovered.splice(failedIndex, 1, outcome);
  };

  /**
   * ATOMIC post-dispatch entry transition, decided by the session fence
   * BEFORE any ledger mutation: fence passed → the entry is consumed and
   * removed (watermark advances); fence failed → the entry converts to a
   * durable recovered SUCCEEDED outcome (the venue mutation is committed
   * and a later retry under the original account would double the
   * financial intent). Both shapes land in ONE write under the ledger
   * lock — if that write fails, the ORIGINAL unresolved entry remains
   * the durable record and every retry stays blocked. The entry is never
   * consumed first and quarantined second. TP/SL-journal-owned entries
   * are consumed without quarantine in both cases (their machine
   * reconciles the intent by exact hash).
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index of the ORIGINAL session.
   * @param entry - The dispatched (accepted) ledger entry.
   * @param fenceFailed - Whether the post-send session fence rejected.
   * @returns Resolves when the transition is durably committed.
   */
  readonly #resolveEntryPostDispatch = async (
    accountIndex: number,
    entry: LighterNonceLedgerDoc['entries'][number],
    fenceFailed: boolean,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> =>
    await this.#withLedgerLock(
      accountIndex,
      async () => {
        const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
        const at = doc.entries.findIndex(
          (candidate) =>
            candidate.nonce === entry.nonce &&
            candidate.txHash === entry.txHash,
        );
        if (at >= 0) {
          doc.entries.splice(at, 1);
        }
        doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
        if (fenceFailed && entry.owner === null) {
          const recoveryId = `${String(entry.nonce)}:${entry.txHash ?? 'nohash'}`;
          this.#appendRecoveredDispatch(doc, {
            recoveryId,
            kind: entry.kind,
            intent: entry.intent,
            txHash: entry.txHash,
            outcome: 'succeeded',
            evidence: 'post-dispatch-session-cancelled',
          });
        }
        await this.#writeNonceLedger(accountIndex, doc, apiKeyIndex);
      },
      apiKeyIndex,
    );

  /**
   * Resolve every unresolved dispatch before a write section may issue
   * nonces. Consumption is proven by REST-nonce advance or an exact tx
   * lookup verifying the FULL identity (hash + account + api-key slot +
   * nonce + a numeric venue status); never-landed is proven ONLY by
   * venue-confirmed absence of the exact HASH after the signed validity
   * elapsed. A hashless dispatch can never be proven absent — it stays
   * blocking until the venue advances. Ambiguity blocks the write.
   * Runs under the account+slot ledger lock.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @returns Resolves when every prior dispatch is accounted for.
   */
  readonly #resolveNonceLedger = async (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> =>
    await this.#withLedgerLock(
      accountIndex,
      async () => this.#resolveNonceLedgerLocked(accountIndex, apiKeyIndex),
      apiKeyIndex,
    );

  /**
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param reconciliation - Non-financial pass that retains owned entries and
   * reports pending/quarantined outcomes instead of granting write permission.
   * @returns Resolves when the pass completes.
   */
  readonly #resolveNonceLedgerLocked = async (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
    reconciliation?: { generation: number },
  ): Promise<void> => {
    const generation = reconciliation?.generation ?? this.#sessionGeneration;
    this.#assertSession(generation);
    const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
    this.#assertSession(generation);
    const reservationKey = `${accountIndex}:${apiKeyIndex}`;
    const releasedNonces: number[] = [];
    const commitReservations = (): void => {
      this.#assertSession(generation);
      const floor = this.#nonceReservations.get(reservationKey) ?? 0;
      this.#nonceReservations.set(
        reservationKey,
        Math.max(floor, doc.consumedFloor),
      );
      for (const nonce of releasedNonces) {
        if (nonce >= doc.consumedFloor) {
          this.#releaseNonceReservation(accountIndex, nonce, apiKeyIndex);
        }
      }
    };
    // QUARANTINE CHECK FIRST: unacknowledged recovered outcomes block
    // EVERY retry, including retries arriving when no unresolved
    // entries remain — an early empty-entries return here would let the
    // second retry sail past the quarantine.
    const throwIfQuarantined = (): void => {
      const blocking = doc.recovered.filter(
        (outcome) => outcome.outcome !== 'failed',
      );
      if (blocking.length > 0) {
        throw new Error(
          `A previous Lighter submission believed failed actually ${blocking.some((outcome) => outcome.outcome === 'succeeded') ? 'completed' : 'landed with an UNKNOWN outcome'} (${blocking
            .map((outcome) => outcome.intent)
            .join(
              ', ',
            )}); refresh state and call acknowledgeRecoveredDispatch before retrying`,
        );
      }
    };
    if (!reconciliation) {
      throwIfQuarantined();
    }
    if (!doc.entries.some((entry) => !reconciliation || entry.owner === null)) {
      if (!reconciliation) {
        commitReservations();
      }
      return;
    }
    const quarantine = (
      entry: LighterNonceLedgerDoc['entries'][number],
      outcome: LighterRecoveredDispatch['outcome'],
      evidence: string,
    ): void => {
      // TP/SL-journal-OWNED dispatches resolve through their own state
      // machine (journal attempts + exact-hash reconciliation) — they
      // are never parked behind the generic acknowledgment.
      if (entry.owner !== null) {
        return;
      }
      this.#appendRecoveredDispatch(doc, {
        recoveryId: `${String(entry.nonce)}:${entry.txHash ?? 'nohash'}`,
        kind: entry.kind,
        intent: entry.intent,
        txHash: entry.txHash,
        outcome,
        evidence,
      });
    };
    // Persist attached ownership settlement before retiring its nonce evidence.
    const settleAttached = async (
      entry: LighterNonceLedgerDoc['entries'][number],
      proof: NonNullable<LighterAttachedGroup['nonAcceptance']>,
    ): Promise<boolean> => {
      if (!entry.intent.startsWith('placeAttached:')) {
        return true;
      }
      const key = this.#attachedKey(accountIndex);
      const groups = await this.#readAttachedGroups(key);
      this.#assertSession(generation);
      const group = groups.find(
        (candidate) => `placeAttached:${candidate.groupId}` === entry.intent,
      );
      if (
        !group ||
        group.accountIndex !== accountIndex ||
        group.apiKeyIndex !== apiKeyIndex ||
        group.nonce !== entry.nonce ||
        group.txHash === null ||
        group.txHash !== entry.txHash ||
        group.expiresAt !== entry.expiresAt ||
        group.venueIds.some((id) => id !== null) ||
        (proof === 'nonce-consumed' &&
          (entry.expiresAt === null ||
            Date.now() <= entry.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS)) ||
        (group.submission !== 'unknown' &&
          !(group.submission === 'canceled' && group.nonAcceptance))
      ) {
        return false;
      }
      group.nonAcceptance = proof;
      await this.#writeAttachedGroup(key, group, generation);
      return true;
    };
    const settleScale = async (
      entry: LighterNonceLedgerDoc['entries'][number],
      proof: NonNullable<LighterScaleRung['nonAcceptance']>,
    ): Promise<boolean> => {
      if (!entry.intent.startsWith('placeScale:')) {
        return true;
      }
      if (entry.kind !== LIGHTER_TX_TYPE_CREATE_ORDER || entry.owner !== null) {
        return false;
      }
      const key = this.#scaleKey(accountIndex);
      const groups = await this.#readScaleGroups(key, accountIndex);
      this.#assertSession(generation);
      const group = groups.find((candidate) =>
        candidate.rungs.some(
          (rung) =>
            entry.intent ===
            `placeScale:${candidate.groupId}:${rung.clientOrderId}`,
        ),
      );
      const rung = group?.rungs.find(
        (candidate) =>
          entry.intent ===
          `placeScale:${group.groupId}:${candidate.clientOrderId}`,
      );
      // Transport is ordered after the durable unknown transition. A prepared
      // rung therefore proves that this intent never reached transport, even
      // if the process stopped after appending its generic nonce ledger entry.
      if (
        group &&
        rung &&
        group.accountIndex === accountIndex &&
        group.apiKeyIndex === apiKeyIndex &&
        rung.state === 'prepared' &&
        rung.orderId === undefined &&
        ((rung.nonce === null &&
          rung.txHash === null &&
          rung.expiresAt === null) ||
          (rung.nonce === entry.nonce &&
            rung.txHash === entry.txHash &&
            rung.expiresAt === entry.expiresAt))
      ) {
        return true;
      }
      if (
        !group ||
        !rung ||
        group.accountIndex !== accountIndex ||
        group.apiKeyIndex !== apiKeyIndex ||
        rung.nonce !== entry.nonce ||
        rung.txHash === null ||
        rung.txHash !== entry.txHash ||
        rung.expiresAt !== entry.expiresAt ||
        rung.orderId !== undefined ||
        (rung.state !== 'unknown' &&
          rung.state !== 'submitted' &&
          !(rung.state === 'rejected' && rung.nonAcceptance !== undefined)) ||
        (proof === 'nonce-consumed' &&
          (entry.expiresAt === null ||
            Date.now() <= entry.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS))
      ) {
        return false;
      }
      if (rung.state !== 'rejected') {
        rung.state = 'unknown';
      }
      rung.nonAcceptance = proof;
      group.placementStopped = true;
      await this.#writeScaleGroup(key, group, generation);
      return true;
    };
    const nonceResponse = await this.#clientService.getNextNonce(
      accountIndex,
      apiKeyIndex,
    );
    this.#assertSession(generation);
    if (!Number.isSafeInteger(nonceResponse.nonce) || nonceResponse.nonce < 0) {
      throw new Error(
        'Lighter nonce reconciliation received an invalid venue nonce',
      );
    }
    const remaining: typeof doc.entries = [];
    for (const entry of doc.entries) {
      if (reconciliation && entry.owner !== null) {
        remaining.push(entry);
        continue;
      }
      if (entry.txHash === null && nonceResponse.nonce > entry.nonce) {
        // Only the nonce ADVANCE is proven (possibly by another device):
        // the intent's own fate is UNKNOWN — never reported completed.
        doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
        quarantine(entry, 'unknown', 'rest-advance');
        continue;
      }
      if (entry.txHash !== null) {
        let lookedUp: LighterTxLookupResponse | null;
        try {
          lookedUp = await this.#clientService.getTx(entry.txHash);
        } catch {
          this.#assertSession(generation);
          // Lookup failure is AMBIGUITY, never evidence either way: the
          // entry stays and the write remains blocked.
          remaining.push(entry);
          continue;
        }
        this.#assertSession(generation);
        if (lookedUp !== null) {
          const matchesIdentity =
            typeof lookedUp.hash === 'string' &&
            lookedUp.hash.toLowerCase().replace(/^0x/u, '') ===
              entry.txHash.toLowerCase().replace(/^0x/u, '') &&
            lookedUp.accountIndex === accountIndex &&
            lookedUp.apiKeyIndex === apiKeyIndex &&
            lookedUp.nonce === entry.nonce &&
            typeof lookedUp.status === 'number';
          if (matchesIdentity) {
            const transactionOutcome = getLighterTransactionOutcome(
              lookedUp.status,
            );
            // A matching hash is not enough to prove the transaction's
            // outcome. Non-terminal statuses must retain the unresolved
            // entry so no acknowledgment can make the intent retryable
            // while the original transaction is still in flight.
            if (
              transactionOutcome !== 'failed' &&
              transactionOutcome !== 'executed'
            ) {
              remaining.push(entry);
              continue;
            }
            if (
              transactionOutcome === 'failed' &&
              (!(await settleAttached(entry, 'failed')) ||
                !(await settleScale(entry, 'failed')))
            ) {
              remaining.push(entry);
              continue;
            }
            doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
            // The EXACT tx status decides the intent's fate: executed →
            // succeeded (blocking until acknowledged); failed/rejected →
            // retry-safe FAILURE (recorded, non-blocking); anything else
            // still pending → keep blocking as unresolved.
            if (transactionOutcome === 'failed') {
              quarantine(
                entry,
                'failed',
                `tx-status:${String(lookedUp.status)}`,
              );
            } else {
              quarantine(
                entry,
                'succeeded',
                `tx-status:${String(lookedUp.status)}`,
              );
            }
            continue;
          }
          // A DIFFERENT payload under this hash: ambiguity, fail closed.
          remaining.push(entry);
          continue;
        }
        if (
          entry.intent.startsWith('updateMargin:') ||
          entry.intent.startsWith('updateMarginMode:')
        ) {
          // Additive collateral and mode changes require exact terminal proof.
          // An accepted transaction can disappear from an indexing endpoint;
          // nonce advance or elapsed expiry alone must not authorize a repeat.
          remaining.push(entry);
          continue;
        }
        if (nonceResponse.nonce > entry.nonce) {
          // The venue moved past this nonce while OUR exact hash is
          // absent: another dispatch (e.g. a second device) consumed it.
          // Our payload can never land now — retry-safe never-landed,
          // no quarantine; the floor advances with the venue.
          if (
            !(await settleAttached(entry, 'nonce-consumed')) ||
            !(await settleScale(entry, 'nonce-consumed'))
          ) {
            remaining.push(entry);
            continue;
          }
          doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
          continue;
        }
        if (
          entry.expiresAt !== null &&
          Date.now() > entry.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
        ) {
          // Venue-confirmed absent after the signed validity: PROVEN
          // never landed — the venue still expects this nonce (unless a
          // later dispatch already consumed it: consumedFloor guards).
          if (
            !(await settleAttached(entry, 'expired')) ||
            !(await settleScale(entry, 'expired'))
          ) {
            remaining.push(entry);
            continue;
          }
          releasedNonces.push(entry.nonce);
          continue;
        }
      }
      // Hashless, or hash present but unexpired-and-absent: ambiguous.
      remaining.push(entry);
    }
    this.#assertSession(generation);
    await this.#writeNonceLedger(
      accountIndex,
      {
        consumedFloor: doc.consumedFloor,
        entries: remaining,
        recovered: doc.recovered,
      },
      apiKeyIndex,
    );
    this.#assertSession(generation);
    commitReservations();
    if (reconciliation) {
      return;
    }
    if (remaining.length > 0) {
      throw new Error(
        'A previous Lighter submission has an unresolved outcome; writes are blocked until it can be proven consumed or never-landed',
      );
    }
    // RECOVERED-OUTCOME quarantine: succeeded/unknown outcomes block
    // every subsequent write until selectively acknowledged (a blind
    // retry could double the financial intent). FAILED outcomes are
    // retry-safe and never block.
    throwIfQuarantined();
  };

  /**
   * List TP/SL obligations parked in DURABLE manual-recovery state: the
   * venue removed (or rejected) protection in a way that cannot be
   * safely re-established automatically. Surfaced to callers/UI; each
   * current-key entry resolves after a successful explicit TP/SL update.
   * Selected obligations can be resolved through an explicitly linked successor.
   * Previous-key transactions settle read-only using their original identity;
   * an explicit current-key update clears warnings after recorded orders settle.
   *
   * @returns Parked manual-recovery entries.
   */
  async getPendingManualRecoveries(): Promise<
    (PerpsPendingManualRecovery & { providerId?: 'lighter' })[]
  > {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const inventory = await this.#resolveRecoveryInventory(generation);
    const rows = await Promise.all(
      inventory.accounts.map(async (accountIndex) =>
        this.#listPendingManualRecoveries(accountIndex, generation),
      ),
    );
    this.#assertSession(generation);
    return rows.flat();
  }

  /**
   * @param accountIndex - Verified current or durably remembered account.
   * @param generation - Issuing wallet session.
   * @returns Local manual obligations scoped to that account.
   */
  readonly #listPendingManualRecoveries = async (
    accountIndex: number,
    generation: number,
  ): ReturnType<LighterProvider['getPendingManualRecoveries']> => {
    // Protection belongs to the wallet and venue account, even after its
    // trading key migrates. Network storage remains separately scoped.
    const identityPrefix = `${this.#boundAddress ?? 'unbound'}:${accountIndex}:`;
    const currentSlotPrefix =
      this.#readyApiKeyIndex === null
        ? null
        : `${identityPrefix}${this.#readyApiKeyIndex}:`;
    const pending: (PerpsPendingManualRecovery & { providerId?: 'lighter' })[] =
      [];
    const describePartial = (
      intent: PartialTpslIntent | undefined,
    ): PerpsPendingManualRecovery['partialIntent'] =>
      intent
        ? {
            version: intent.version,
            positionSide: intent.positionSign === 1 ? 'long' : 'short',
            linkage: intent.linkage,
            legs: intent.orders.map((order) => ({
              type:
                order[5] === LIGHTER_ORDER_TYPE_TAKE_PROFIT
                  ? 'take-profit'
                  : 'stop-loss',
              size: String(
                fromLighterInteger(Number(order[2]), intent.sizeDecimals),
              ),
              clientOrderId: String(order[1]),
            })),
          }
        : undefined;
    const partialAction =
      'Review the current position and resolve this exact recovery ID with a fresh explicit protection intent; saved partial quantities will not be replayed';
    const actionNeeded = (
      settlementKey: string,
      intent: 'replace' | 'remove',
      unsettled = false,
    ): string => {
      if (currentSlotPrefix === null) {
        return 'Initialize the wallet trading key and review the position and recorded TP/SL orders. Select the obligation to reconcile its original submissions before requesting new protection';
      }
      if (settlementKey.startsWith(currentSlotPrefix)) {
        return intent === 'remove'
          ? 'Review surviving orders and submit a new explicit TP/SL removal if you still want to remove protection'
          : 'Review the position and submit a new explicit TP/SL update for this symbol to re-establish protection';
      }
      return unsettled
        ? 'Recorded TP/SL transactions are still settling under a previous trading key. Retry after the venue shows their outcome'
        : 'Review surviving orders with the current trading key and submit an explicit TP/SL update or removal. This warning clears once its recorded transactions and orders are settled';
    };
    // Storage errors PROPAGATE — a corrupt index degrading to "nothing
    // pending" would hide a naked position.
    const manualIndex = await this.#readTpslManualIndex();
    for (const settlementKey of manualIndex) {
      if (!settlementKey.startsWith(identityPrefix)) {
        continue;
      }
      const doc = await this.#loadTpslManualRecovery(settlementKey);
      if (doc) {
        const unsettled = await this.#loadTpslJournal(settlementKey);
        this.#assertSession(generation);
        pending.push({
          providerId: 'lighter',
          walletAddress: this.#boundAddress ?? undefined,
          network: this.#isTestnet ? 'testnet' : 'mainnet',
          symbol: doc.symbol,
          recoveryId: this.#protectionRecoveryId(
            settlementKey,
            doc.operationId,
          ),
          settlementKey,
          recordedAt: doc.recordedAt,
          reason: doc.reason,
          priorIntent: doc.priorIntent,
          survivingOrderIds: doc.survivingOrderIds,
          ...(doc.partialIntent
            ? { partialIntent: describePartial(doc.partialIntent) }
            : {}),
          actionNeeded: doc.partialIntent
            ? partialAction
            : actionNeeded(settlementKey, doc.priorIntent, unsettled !== null),
        });
      }
    }
    // Manual journals, including guarded removals, remain in their slot
    // until reconciliation can move them into the durable warning document.
    const journalIndex = await this.#readTpslJournalIndex();
    for (const settlementKey of journalIndex) {
      if (
        !settlementKey.startsWith(identityPrefix) ||
        pending.some((entry) => entry.settlementKey === settlementKey)
      ) {
        continue;
      }
      const journal = await this.#loadTpslJournal(settlementKey);
      if (
        journal?.sourceRecoverySettlementKey &&
        journal.sourceRecoveryOperationId &&
        pending.some(
          (entry) =>
            entry.recoveryId ===
            this.#protectionRecoveryId(
              journal.sourceRecoverySettlementKey as string,
              journal.sourceRecoveryOperationId as string,
            ),
        )
      ) {
        continue;
      }
      if (
        journal &&
        (journal.partialIntent !== undefined ||
          journal.phase === 'manual' ||
          currentSlotPrefix === null ||
          !settlementKey.startsWith(currentSlotPrefix))
      ) {
        let reason =
          'An unfinished TP/SL update from a previous trading key requires reconciliation';
        if (journal.phase === 'manual') {
          reason =
            journal.intent === 'remove'
              ? TPSL_GUARDED_REMOVAL_REVIEW_REASON
              : 'TP/SL protection could not be safely re-established automatically (parked by an earlier session)';
        } else if (currentSlotPrefix === null) {
          reason = 'An unfinished TP/SL update requires startup reconciliation';
        } else if (
          journal.partialIntent &&
          settlementKey.startsWith(currentSlotPrefix)
        ) {
          reason =
            'A partial TP/SL update on the current trading key is pending; it may still be running';
        }
        pending.push({
          providerId: 'lighter',
          walletAddress: this.#boundAddress ?? undefined,
          network: this.#isTestnet ? 'testnet' : 'mainnet',
          symbol: settlementKey.split(':').slice(3).join(':'),
          recoveryId: this.#protectionRecoveryId(
            settlementKey,
            journal.operationId,
          ),
          settlementKey,
          recordedAt: journal.recordedAt,
          reason,
          priorIntent: journal.intent,
          survivingOrderIds: [],
          ...(journal.partialIntent
            ? { partialIntent: describePartial(journal.partialIntent) }
            : {}),
          actionNeeded: journal.partialIntent
            ? partialAction
            : actionNeeded(settlementKey, journal.intent, true),
        });
      }
    }
    this.#assertSession(generation);
    return pending;
  };

  /**
   * Read local durable outcomes across the bounded trading-slot range without
   * changing ledgers or registering/signing with previous keys. Corruption
   * fails closed instead of presenting an incomplete account as empty.
   *
   * @param accountIndex - Captured venue account.
   * @param generation - Wallet session owning the read.
   * @returns Slot-labelled local ledger documents.
   */
  readonly #readAccountRecoveryLedgers = async (
    accountIndex: number,
    generation: number,
  ): Promise<{ apiKeyIndex: number; doc: LighterNonceLedgerDoc }[]> => {
    const ledgers: { apiKeyIndex: number; doc: LighterNonceLedgerDoc }[] = [];
    for (
      let apiKeyIndex = LIGHTER_MIN_TRADING_API_KEY_INDEX;
      apiKeyIndex <= LIGHTER_MAX_TRADING_API_KEY_INDEX;
      apiKeyIndex += 1
    ) {
      this.#assertSession(generation);
      const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
      this.#assertSession(generation);
      if (doc.recovered.length > 0 || doc.entries.length > 0) {
        ledgers.push({ apiKeyIndex, doc });
      }
    }
    return ledgers;
  };

  /**
   * Read-only account-wide view of durable recovered outcomes, including keys
   * skipped during discovery. Waits for an in-flight setup but remains usable
   * after setup failure and before initialization. Opaque IDs bind the selected
   * wallet, network, account, key slot and original ledger identity. No signing,
   * nonce reconciliation, quarantine clearing or financial retry occurs.
   * Unresolved raw entries are reported separately as unknown with
   * acknowledgeable:false, including current-session in-flight submissions.
   * Local-only absent or Premium inventories also refuse acknowledgment.
   * Listing is read-only and starts no background reconciliation. A later
   * fenced financial action re-checks authoritative state before any dispatch.
   *
   * @returns Pending outcomes labelled with their original trading-key slot.
   */
  async getRecoveredDispatches(): Promise<
    (PerpsRecoveredDispatch & { apiKeyIndex: number })[]
  > {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const inventory = await this.#resolveRecoveryInventory(generation);
    const rows = await Promise.all(
      inventory.accounts.map(async (accountIndex) =>
        this.#listRecoveredDispatches(
          accountIndex,
          generation,
          inventory.canReconcile,
        ),
      ),
    );
    this.#assertSession(generation);
    return rows.flat();
  }

  /**
   * Format a fenced local view for the already captured account.
   *
   * @param accountIndex - Captured venue account.
   * @param generation - Captured wallet session.
   * @param canAcknowledge - Whether a supported current account was verified.
   * @returns Scoped pending and recovered dispatches.
   */
  readonly #listRecoveredDispatches = async (
    accountIndex: number,
    generation: number,
    canAcknowledge: boolean,
  ): Promise<(PerpsRecoveredDispatch & { apiKeyIndex: number })[]> => {
    const ledgers = await this.#readAccountRecoveryLedgers(
      accountIndex,
      generation,
    );
    this.#assertSession(generation);
    return ledgers.flatMap(({ apiKeyIndex, doc }) => [
      ...doc.recovered.map((outcome) => ({
        ...outcome,
        ...(canAcknowledge ? {} : { acknowledgeable: false }),
        providerId: 'lighter' as const,
        walletAddress: this.#boundAddress ?? undefined,
        network: this.#isTestnet ? 'testnet' : 'mainnet',
        apiKeyIndex,
        recoveryId: `lighter:${JSON.stringify([this.#isTestnet ? 'testnet' : 'mainnet', this.#boundAddress, accountIndex, apiKeyIndex, outcome.recoveryId])}`,
      })),
      ...doc.entries.map((entry) => ({
        providerId: 'lighter' as const,
        walletAddress: this.#boundAddress ?? undefined,
        network: this.#isTestnet ? 'testnet' : 'mainnet',
        recoveryId: `lighter-pending:${JSON.stringify([this.#isTestnet ? 'testnet' : 'mainnet', this.#boundAddress, accountIndex, apiKeyIndex, entry.nonce, entry.txHash])}`,
        apiKeyIndex,
        acknowledgeable: false,
        kind: entry.kind,
        intent: entry.intent,
        txHash: entry.txHash,
        outcome: 'unknown' as const,
        evidence: 'unresolved-dispatch',
      })),
    ]);
  };

  /**
   * Reconcile owner-null dispatches using unauthenticated venue nonce/hash reads
   * and local persistence. This never initializes a signer, signs, submits,
   * acknowledges outcomes or starts TP/SL recovery. Owned entries remain pending.
   * Existing quarantine and ambiguous slots do not prevent inspection of others.
   * A removed pending row can mean proven absence, not successful execution.
   * Replace the caller's view with these newly scoped IDs after every pass.
   *
   * @returns Current account-wide pending and recovered dispatches.
   */
  async reconcileRecoveredDispatches(): Promise<PerpsRecoveredDispatch[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    this.#assertSession(generation);
    const network = this.#isTestnet ? 'testnet' : 'mainnet';
    const inventory = await this.#resolveRecoveryInventory(generation);
    if (!inventory.canReconcile) {
      const rows = await Promise.all(
        inventory.accounts.map(async (index) =>
          this.#listRecoveredDispatches(index, generation, false),
        ),
      );
      this.#assertSession(generation);
      return rows.flat();
    }
    const [accountIndex] = inventory.accounts;
    if (accountIndex === undefined) {
      throw new Error('Lighter recovery account identity is missing');
    }
    this.#assertSession(generation);
    const result = await withProcessMutex(
      `lighterVenueWrite:${network}:${accountIndex}`,
      async () => {
        this.#assertSession(generation);
        for (
          let apiKeyIndex = LIGHTER_MIN_TRADING_API_KEY_INDEX;
          apiKeyIndex <= LIGHTER_MAX_TRADING_API_KEY_INDEX;
          apiKeyIndex += 1
        ) {
          await this.#withLedgerLock(
            accountIndex,
            async () => {
              this.#assertSession(generation);
              await this.#resolveNonceLedgerLocked(accountIndex, apiKeyIndex, {
                generation,
              });
              this.#assertSession(generation);
            },
            apiKeyIndex,
          );
          this.#assertSession(generation);
        }
        const rows = await this.#listRecoveredDispatches(
          accountIndex,
          generation,
          true,
        );
        this.#assertSession(generation);
        return rows;
      },
    );
    this.#assertSession(generation);
    return result;
  }

  /**
   * Bind the opaque source ID to the exact durable operation and venue scope.
   *
   * @param settlementKey - Original wallet/account/slot/symbol identity.
   * @param operationId - Immutable source operation.
   * @returns Public opaque selection reference.
   */
  readonly #protectionRecoveryId = (
    settlementKey: string,
    operationId: string,
  ): string => {
    const [address, account, slot, ...symbolParts] = settlementKey.split(':');
    const symbol = symbolParts.join(':');
    return `lighter-protection:${JSON.stringify([this.#isTestnet ? 'testnet' : 'mainnet', address, Number(account), Number(slot), symbol, operationId])}`;
  };

  readonly #recoverySuccessorKey = (
    settlementKey: string,
    operationId: string,
  ): string =>
    `lighterTpslSuccessor:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}:${operationId}`;

  readonly #loadRecoverySuccessor = async (
    settlementKey: string,
    operationId: string,
  ): Promise<TpslRecoverySuccessor | null> => {
    const raw = await this.#deps.diskCache.getItem(
      this.#recoverySuccessorKey(settlementKey, operationId),
    );
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid Lighter recovery successor record');
    }
    const doc = parsed as Record<string, unknown>;
    if (
      doc.version !== 1 ||
      doc.sourceSettlementKey !== settlementKey ||
      doc.sourceOperationId !== operationId ||
      typeof doc.successorSettlementKey !== 'string' ||
      typeof doc.successorOperationId !== 'string' ||
      !['prepared', 'pending', 'failed', 'settled'].includes(
        String(doc.state),
      ) ||
      (doc.retainedReplacementGroups !== undefined &&
        !isRecoveryGroups(doc.retainedReplacementGroups)) ||
      !Array.isArray(doc.ownedOrderIds) ||
      !doc.ownedOrderIds.every((id) => typeof id === 'string')
    ) {
      throw new Error('Invalid Lighter recovery successor identity');
    }
    return parsed as TpslRecoverySuccessor;
  };

  readonly #persistRecoverySuccessor = async (
    doc: TpslRecoverySuccessor,
    generation: number,
  ): Promise<void> => {
    this.#assertSession(generation);
    await this.#deps.diskCache.setItem(
      this.#recoverySuccessorKey(
        doc.sourceSettlementKey,
        doc.sourceOperationId,
      ),
      JSON.stringify(doc),
    );
    this.#assertSession(generation);
  };

  readonly #assertRecoverySource = async (
    journal: TpslJournalState,
    generation: number,
  ): Promise<void> => {
    this.#assertSession(generation);
    if (
      !journal.sourceRecoveryOperationId ||
      !journal.sourceRecoverySettlementKey
    ) {
      return;
    }
    const source = await this.#loadTpslManualRecovery(
      journal.sourceRecoverySettlementKey,
    );
    this.#assertSession(generation);
    if (source?.operationId !== journal.sourceRecoveryOperationId) {
      throw new Error('Lighter recovery source operation changed');
    }
  };

  // Caller holds the venue lock. Terminal persistence is the authority for
  // cleanup, never permission to repeat a financial intent.
  readonly #finalizeRecoverySuccessor = async (
    doc: TpslRecoverySuccessor,
    generation: number,
  ): Promise<void> => {
    this.#assertSession(generation);
    if (doc.state !== 'settled') {
      throw new Error('Lighter successor is not settled');
    }
    const journal = await this.#loadTpslJournal(doc.successorSettlementKey);
    this.#assertSession(generation);
    if (journal?.operationId === doc.successorOperationId) {
      if (
        journal.sourceRecoveryOperationId !== doc.sourceOperationId ||
        journal.sourceRecoverySettlementKey !== doc.sourceSettlementKey
      ) {
        throw new Error('Lighter terminal successor link changed');
      }
      await this.#clearTpslJournal(
        doc.successorSettlementKey,
        doc.successorOperationId,
      );
      this.#assertSession(generation);
    } else if (journal === null) {
      // Prune a pointer whose payload was already removed at the crash boundary.
      await this.#clearTpslJournal(doc.successorSettlementKey, null);
      this.#assertSession(generation);
    }
    const source = await this.#loadTpslManualRecovery(doc.sourceSettlementKey);
    this.#assertSession(generation);
    if (source === null || source.operationId === doc.sourceOperationId) {
      await this.#clearTpslManualRecovery(
        doc.sourceSettlementKey,
        doc.sourceOperationId,
        generation,
      );
    }
  };

  readonly #verifyRetainedRecoveryCoverage = async (
    journal: TpslJournalState,
    readActive: () => Promise<LighterApiOrder[]>,
    readInactive: (ids: number[]) => Promise<LighterApiOrder[]>,
  ): Promise<void> => {
    const generation = this.#sessionGeneration;
    const groups = journal.retainedReplacementGroups;
    if (!groups || groups.length === 0) {
      return;
    }
    const visible = await this.#awaitTpslVisibility(
      readActive,
      readInactive,
      { createdClientIds: groups.flat(), cancelledOrderIds: [] },
      { createdGroups: groups },
    );
    if (visible.outcome === 'created-terminal-failed') {
      const active = await readActive();
      this.#assertSession(generation);
      await this.#finishRecoverySuccessor(
        journal,
        'failed',
        active,
        generation,
      );
      const sourceKey = journal.sourceRecoverySettlementKey;
      const sourceOperation = journal.sourceRecoveryOperationId;
      if (!sourceKey || !sourceOperation) {
        throw new Error('Lighter retained successor source link is missing');
      }
      const failed = await this.#loadRecoverySuccessor(
        sourceKey,
        sourceOperation,
      );
      this.#assertSession(generation);
      if (
        !failed ||
        failed.successorOperationId !== journal.operationId ||
        failed.state !== 'failed'
      ) {
        throw new Error('Lighter retained successor operation changed');
      }
      await this.#clearTpslJournal(
        failed.successorSettlementKey,
        journal.operationId,
        active,
      );
      this.#assertSession(generation);
      throw new Error(
        'Lighter retained successor coverage failed; select a new protection intent',
      );
    }
    if (visible.outcome !== 'settled') {
      throw new Error('Lighter retained successor coverage is not settled');
    }
  };

  readonly #finishRecoverySuccessor = async (
    journal: TpslJournalState,
    state: 'failed' | 'settled',
    active: LighterApiOrder[],
    generation: number,
  ): Promise<void> => {
    if (
      journal.sourceRecoveryOperationId === undefined ||
      journal.sourceRecoverySettlementKey === undefined
    ) {
      return;
    }
    this.#assertSession(generation);
    const doc = await this.#loadRecoverySuccessor(
      journal.sourceRecoverySettlementKey,
      journal.sourceRecoveryOperationId,
    );
    this.#assertSession(generation);
    if (!doc || doc.successorOperationId !== journal.operationId) {
      throw new Error('Lighter recovery successor operation changed');
    }
    const owned = active.filter(
      (row) =>
        journal.priorTriggers.some(
          (prior) => prior.orderId === String(row.orderIndex),
        ) ||
        (journal.retainedReplacementGroups ?? []).some((group) =>
          group.includes(row.clientOrderIndex),
        ) ||
        journal.attempts.some(
          (attempt) =>
            attempt.kind === 'create' &&
            attempt.clientIds.includes(row.clientOrderIndex),
        ),
    );
    if (state === 'settled') {
      await this.#updateManagedTpsl(
        doc.successorSettlementKey,
        journal,
        active,
      );
      this.#assertSession(generation);
    }
    await this.#persistRecoverySuccessor(
      {
        ...doc,
        state,
        retainedReplacementGroups:
          state === 'failed' ? undefined : doc.retainedReplacementGroups,
        ownedOrderIds: [
          ...new Set([
            ...doc.ownedOrderIds,
            ...owned.map((row) => String(row.orderIndex)),
          ]),
        ],
      },
      generation,
    );
    if (state === 'settled') {
      await this.#finalizeRecoverySuccessor({ ...doc, state }, generation);
    }
  };

  /**
   * Mint read authentication with an existing registered local key only.
   * Caller holds the account venue lock; this helper takes the bridge lease.
   *
   * @param accountIndex - Captured account.
   * @param generation - Issuing wallet session.
   * @param requiredSlot - Restrict authentication to a selected original slot.
   * @returns Authentication token, without granting financial readiness.
   */
  readonly #getRecoveryReadToken = async (
    accountIndex: number,
    generation: number,
    requiredSlot?: number,
  ): Promise<{ token: string; apiKeyIndex: number; publicKey: string }> => {
    const address = this.#boundAddress;
    const bridge = this.#rawSignerBridge();
    return withProcessMutex(
      bridgeMutexKey(this.#rawSignerBridge()),
      async () => {
        this.#assertSession(generation);
        const registrations =
          await this.#clientService.getApiKeys(accountIndex);
        this.#assertSession(generation);
        if (
          !Array.isArray(registrations.apiKeys) ||
          registrations.apiKeys.some(
            (key) =>
              key.accountIndex !== accountIndex ||
              !Number.isSafeInteger(key.apiKeyIndex) ||
              typeof key.publicKey !== 'string',
          )
        ) {
          throw new Error(
            'Lighter recovery review registration metadata unavailable',
          );
        }
        const requested = registrations.apiKeys
          .filter(
            (key) =>
              key.accountIndex === accountIndex &&
              Number.isSafeInteger(key.apiKeyIndex) &&
              key.apiKeyIndex >= LIGHTER_MIN_TRADING_API_KEY_INDEX &&
              key.apiKeyIndex <= LIGHTER_MAX_TRADING_API_KEY_INDEX,
          )
          .map((key) => key.apiKeyIndex);
        const discover =
          bridge.getRecoverableKeyIndices?.bind(bridge) ??
          bridge.getStoredKeyIndices?.bind(bridge);
        const discovered = discover
          ? await discover({
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
              apiKeyIndices: requested,
              walletAddress: address ?? undefined,
            })
          : [this.#preferredApiKeyIndex];
        const local =
          requiredSlot === undefined
            ? [...new Set([this.#preferredApiKeyIndex, ...discovered])].filter(
                (slot) => discovered.includes(slot),
              )
            : discovered.filter((slot) => slot === requiredSlot);
        this.#assertSession(generation);
        if (discover && local.some((slot) => !requested.includes(slot))) {
          throw new Error(
            'Lighter recovery review received an unrequested local key',
          );
        }
        try {
          for (const slot of local) {
            const matches = registrations.apiKeys.filter(
              (key) =>
                key.apiKeyIndex === slot && key.accountIndex === accountIndex,
            );
            if (matches.length !== 1) {
              continue;
            }
            const nonce = await this.#clientService.getNextNonce(
              accountIndex,
              slot,
            );
            this.#assertSession(generation);
            if (!Number.isSafeInteger(nonce.nonce) || nonce.nonce < 0) {
              throw new Error(
                'Lighter recovery review received invalid nonce metadata',
              );
            }
            const created = await bridge.createClient({
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
              nonce: nonce.nonce,
              apiKeyIndex: slot,
              walletAddress: address ?? undefined,
            });
            this.#assertSession(generation);
            if (created.error || !created.success) {
              throw new Error(
                created.error ?? 'Lighter recovery review client unavailable',
              );
            }
            const normalize = (key: string): string =>
              key.replace(/^0x/u, '').toLowerCase();
            if (
              !created.pk ||
              normalize(created.pk) !== normalize(matches[0].publicKey)
            ) {
              continue;
            }
            const auth = await bridge.execute({
              function: '_createAuthToken',
              params: [accountIndex, slot],
            });
            this.#assertSession(generation);
            if (
              auth.error ||
              !auth.token ||
              !Number.isFinite(auth.deadline) ||
              auth.deadline <= Date.now() / 1000
            ) {
              throw new Error(
                auth.error ?? 'Lighter recovery review auth unavailable',
              );
            }
            return {
              token: auth.token,
              apiKeyIndex: slot,
              publicKey: created.pk,
            };
          }
          throw new LighterRecoveryReadAuthorityError(
            'Lighter recovery review requires a matching locally retained registered key; reconnect without replacing venue keys',
          );
        } finally {
          bridgeClientOwners.delete(this.#rawSignerBridge());
        }
      },
    );
  };

  /**
   * Read fresh account positions and authenticated orders without financial
   * readiness. Only a locally held, already registered key can mint the read
   * token; client creation is local and auth signing cannot submit a transaction.
   * No authority is cached and ownership is released before returning.
   *
   * @returns A provider-scoped authoritative snapshot.
   */
  async reviewRecoveryVenue(): Promise<PerpsRecoveryVenueReview> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    this.#assertSession(generation);
    const address = this.#boundAddress;
    const network = this.#isTestnet ? 'testnet' : 'mainnet';
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const result = await withProcessMutex(
      `lighterVenueWrite:${network}:${accountIndex}`,
      async () => {
        this.#assertSession(generation);
        const { token } = await this.#getRecoveryReadToken(
          accountIndex,
          generation,
        );
        this.#assertSession(generation);
        const accountResponse =
          await this.#clientService.getAccountByIndex(accountIndex);
        this.#assertSession(generation);
        const account = accountResponse.accounts?.[0];
        if (
          !Array.isArray(accountResponse.accounts) ||
          accountResponse.accounts.length !== 1 ||
          !account ||
          account.index !== accountIndex ||
          account.l1Address?.toLowerCase() !== address ||
          account.accountType !== 0 ||
          !Array.isArray(account.positions)
        ) {
          throw new Error(
            'Lighter recovery review account identity or positions unavailable',
          );
        }
        const metadata = await this.#clientService.getOrderBookDetails();
        this.#assertSession(generation);
        if (!Array.isArray(metadata.orderBookDetails)) {
          throw new Error(
            'Lighter recovery review market metadata unavailable',
          );
        }
        const positions = account.positions
          .map((position) => {
            const markets = metadata.orderBookDetails.filter(
              (market) =>
                market.marketId === position.marketId &&
                market.symbol === position.symbol,
            );
            if (
              markets.length !== 1 ||
              parseStrictDecimal(position.position) === null ||
              parseStrictDecimal(position.avgEntryPrice) === null ||
              (position.sign !== 1 && position.sign !== -1)
            ) {
              throw new Error(
                'Lighter recovery review position metadata unavailable',
              );
            }
            return adaptPositionFromLighter(
              position,
              deriveLighterMaxLeverage(
                markets[0].minInitialMarginFraction,
                position.marketId,
              ),
            );
          })
          .filter((position) => parseStrictDecimal(position.size) !== 0);
        const active = await this.#clientService.getActiveOrders(
          accountIndex,
          token,
        );
        this.#assertSession(generation);
        if (!Array.isArray(active.orders)) {
          throw new Error('Lighter recovery review orders unavailable');
        }
        const orders = active.orders.map((order) => {
          const markets = metadata.orderBookDetails.filter(
            (market) => market.marketId === order.marketIndex,
          );
          if (
            markets.length !== 1 ||
            order.ownerAccountIndex !== accountIndex
          ) {
            throw new Error(
              'Lighter recovery review order identity or metadata unavailable',
            );
          }
          return adaptOrderFromLighter(order, markets[0].symbol);
        });
        this.#assertSession(generation);
        return {
          status: 'ready' as const,
          providerId: 'lighter' as const,
          walletAddress: address ?? '',
          network,
          accountIndex,
          positions,
          orders,
          reviewedAt: Date.now(),
        };
      },
    );
    this.#assertSession(generation);
    return result;
  }

  /**
   * Acknowledge one exact stored outcome after the caller refreshes venue state.
   * Scoped IDs from any local slot work without changing the active signer.
   * Legacy unscoped IDs are accepted only when unique across this account.
   * The slot mutex and session fence preserve concurrent appends, unresolved
   * entries and all other outcomes. Unknown outcomes require the same explicit
   * acknowledgment; this is never permission to resubmit an ambiguous intent.
   *
   * @param recoveryId - Opaque stable id from {@link getRecoveredDispatches}.
   */
  async acknowledgeRecoveredDispatch(recoveryId: string): Promise<void> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const unmatched = (): Error =>
      new Error(
        'No pending recovered Lighter dispatch matches this scoped id; refresh and re-read before acknowledging',
      );
    if (recoveryId.startsWith('lighter-pending:')) {
      throw new Error(
        'Unresolved Lighter dispatches cannot be acknowledged. Use reconcileRecoveredDispatches to check authoritative state; unresolved dispatches remain blocked',
      );
    }
    let apiKeyIndex: number;
    let ledgerRecoveryId: string;
    if (recoveryId.startsWith('lighter:')) {
      let scope: unknown;
      try {
        scope = JSON.parse(recoveryId.slice('lighter:'.length));
      } catch {
        throw unmatched();
      }
      if (
        !Array.isArray(scope) ||
        scope.length !== 5 ||
        scope[0] !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
        scope[1] !== this.#boundAddress ||
        scope[2] !== accountIndex ||
        typeof scope[3] !== 'number' ||
        !Number.isSafeInteger(scope[3]) ||
        scope[3] < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
        scope[3] > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
        typeof scope[4] !== 'string'
      ) {
        throw unmatched();
      }
      apiKeyIndex = scope[3];
      ledgerRecoveryId = scope[4];
    } else {
      const matches = (
        await this.#readAccountRecoveryLedgers(accountIndex, generation)
      ).filter(({ doc }) =>
        doc.recovered.some((outcome) => outcome.recoveryId === recoveryId),
      );
      if (matches.length !== 1) {
        throw unmatched();
      }
      apiKeyIndex = matches[0].apiKeyIndex;
      ledgerRecoveryId = recoveryId;
    }
    await withProcessMutex(
      this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      async () => {
        this.#ensureSessionBinding();
        this.#assertSession(generation);
        const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
        this.#assertSession(generation);
        const matching = doc.recovered.filter(
          (outcome) => outcome.recoveryId === ledgerRecoveryId,
        );
        if (matching.length !== 1) {
          throw unmatched();
        }
        await this.#writeNonceLedger(
          accountIndex,
          {
            consumedFloor: doc.consumedFloor,
            entries: doc.entries,
            recovered: doc.recovered.filter(
              (outcome) => outcome.recoveryId !== ledgerRecoveryId,
            ),
          },
          apiKeyIndex,
        );
      },
    );
  }

  /**
   * Release a nonce reservation for a PROVEN never-landed dispatch —
   * refused when the durable consumed watermark shows a later dispatch
   * (e.g. a retry) already consumed the nonce.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param nonce - The proven-unconsumed nonce.
   */
  readonly #releaseNonceReservationIfUnconsumed = async (
    accountIndex: number,
    nonce: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> => {
    const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex).catch(
      () => null,
    );
    if (doc === null || nonce < doc.consumedFloor) {
      return;
    }
    this.#releaseNonceReservation(accountIndex, nonce, apiKeyIndex);
  };

  /**
   * Durable TP/SL journal key (network + address + accountIndex + symbol
   * scoped): the in-memory map alone cannot survive app/WebView/provider
   * death between venue commit and visibility.
   *
   * @param settlementKey - address:accountIndex:symbol identity.
   * @returns The disk-cache key.
   */
  readonly #tpslJournalKey = (settlementKey: string): string =>
    `lighterTpslJournal:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}`;

  /**
   * Protection belongs to the wallet/account/market, not the signing key slot.
   * A key recovered into another slot must still recognize this device's orders.
   *
   * @param settlementKey - Address:accountIndex:apiKeyIndex:symbol identity.
   * @returns The network-scoped ownership storage key.
   */
  readonly #managedTpslKey = (settlementKey: string): string => {
    const [address, accountIndex, , ...symbolParts] = settlementKey.split(':');
    const symbol = symbolParts.join(':');
    return `lighterManagedTpsl:${this.#isTestnet ? 'testnet' : 'mainnet'}:${address}:${accountIndex}:${symbol}`;
  };

  /**
   * Read ownership strictly. Storage failure or corruption never means unowned.
   *
   * @param settlementKey - Captured settlement identity.
   * @returns Recorded client and venue identities.
   */
  readonly #readManagedTpsl = async (
    settlementKey: string,
  ): Promise<ManagedTpslOrder[]> => {
    const raw = await this.#deps.diskCache.getItem(
      this.#managedTpslKey(settlementKey),
    );
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw) as { version?: unknown; orders?: unknown };
    if (
      parsed === null ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.orders) ||
      parsed.orders.length > LIGHTER_TPSL_OWNERSHIP_MAX_ORDERS ||
      !parsed.orders.every((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) {
          return false;
        }
        const order = entry as Partial<ManagedTpslOrder>;
        return (
          typeof order.clientId === 'string' &&
          /^\d{1,15}$/u.test(order.clientId) &&
          Number.isSafeInteger(Number(order.clientId)) &&
          Number(order.clientId) > 0 &&
          (order.orderId === null ||
            (typeof order.orderId === 'string' &&
              /^\d{1,20}$/u.test(order.orderId))) &&
          (order.orderExpiry === undefined ||
            (typeof order.orderExpiry === 'number' &&
              Number.isSafeInteger(order.orderExpiry) &&
              order.orderExpiry > 0))
        );
      })
    ) {
      throw new Error(
        'Invalid Lighter managed TP/SL ownership; refusing protection changes',
      );
    }
    const orders = parsed.orders as ManagedTpslOrder[];
    if (new Set(orders.map((entry) => entry.clientId)).size !== orders.length) {
      throw new Error(
        'Duplicate Lighter managed TP/SL ownership; refusing protection changes',
      );
    }
    return orders;
  };

  /**
   * Record every journalled creation before dispatch. At proven settlement,
   * prune only proven cancelled venue IDs. A lagging book never erases a create.
   * Unrelated or uncertain IDs from another slot's operation are retained.
   *
   * @param settlementKey - Captured settlement identity.
   * @param journal - Operation whose IDs are being updated.
   * @param settledActive - Strict active book after authoritative settlement.
   * @returns Newly inserted client IDs, for rollback of a failed pre-dispatch write.
   */
  readonly #updateManagedTpsl = async (
    settlementKey: string,
    journal: TpslJournalState,
    settledActive?: LighterApiOrder[],
  ): Promise<string[]> => {
    const key = this.#managedTpslKey(settlementKey);
    return await withStorageMutex(key, async () => {
      const orders = new Map(
        (await this.#readManagedTpsl(settlementKey)).map((entry) => [
          entry.clientId,
          entry,
        ]),
      );
      const createdOrders = new Map(
        journal.attempts.flatMap((attempt) =>
          attempt.kind === 'create' &&
          attempt.neverLanded !== true &&
          getLighterTransactionOutcome(attempt.terminalStatus) !== 'failed'
            ? attempt.clientIds.map((id, index): [string, ManagedTpslOrder] => [
                String(id),
                {
                  clientId: String(id),
                  orderId: null,
                  ...(attempt.orderExpiries === undefined
                    ? {}
                    : { orderExpiry: attempt.orderExpiries[index] }),
                },
              ])
            : [],
        ),
      );
      const inserted: string[] = [];
      for (const [clientId, entry] of settledActive ? [] : createdOrders) {
        if (!orders.has(clientId)) {
          inserted.push(clientId);
          orders.set(clientId, entry);
        }
      }
      if (settledActive) {
        const cancelledIds = new Set(
          journal.attempts.flatMap((attempt) =>
            attempt.kind === 'cancel' ? [attempt.orderId] : [],
          ),
        );
        for (const [clientId, entry] of orders) {
          const active = settledActive.find(
            (row) => String(row.clientOrderIndex) === clientId,
          );
          if (active) {
            orders.set(clientId, {
              ...entry,
              orderId: String(active.orderIndex),
            });
          } else if (
            entry.orderId !== null &&
            cancelledIds.has(entry.orderId)
          ) {
            orders.delete(clientId);
          }
        }
      }
      if (orders.size > LIGHTER_TPSL_OWNERSHIP_MAX_ORDERS) {
        throw new Error(
          'Lighter managed TP/SL ownership is full; refusing further protection changes',
        );
      }
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify({ version: 1, orders: [...orders.values()] }),
      );
      return inserted;
    });
  };

  /**
   * Drop IDs only with explicit pre-dispatch, terminal-failure or expiry proof.
   *
   * @param settlementKey - Captured settlement identity.
   * @param clientIds - Exact IDs proven incapable of creating a live order.
   */
  readonly #discardManagedTpslIds = async (
    settlementKey: string,
    clientIds: string[],
  ): Promise<void> => {
    if (clientIds.length === 0) {
      return;
    }
    const key = this.#managedTpslKey(settlementKey);
    await withStorageMutex(key, async () => {
      const orders = await this.#readManagedTpsl(settlementKey);
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify({
          version: 1,
          orders: orders.filter((entry) => !clientIds.includes(entry.clientId)),
        }),
      );
    });
  };

  /**
   * Prune ownership on exact terminal history or signed order expiry plus slack.
   * Absence from an active read alone never discards an uncertain creation.
   * Bookkeeping reads are bounded and best-effort, unlike journal settlement.
   *
   * @param settlementKey - Captured settlement identity.
   * @param active - Strict active venue book.
   * @param readRecentInactive - One-page, captured-account inactive reader.
   */
  readonly #pruneManagedTpsl = async (
    settlementKey: string,
    active: LighterApiOrder[],
    readRecentInactive: () => Promise<LighterApiOrder[]>,
  ): Promise<void> => {
    const orders = await this.#readManagedTpsl(settlementKey);
    const missing = orders.filter(
      (entry) =>
        !active.some((row) => String(row.clientOrderIndex) === entry.clientId),
    );
    if (missing.length === 0) {
      return;
    }
    const expired = new Map(
      missing
        .filter(
          (entry) =>
            entry.orderExpiry !== undefined &&
            Date.now() - entry.orderExpiry > LIGHTER_TX_EXPIRY_SLACK_MS,
        )
        .map((entry) => [entry.clientId, entry.orderExpiry]),
    );
    const missingIds = new Set(
      missing
        .filter((entry) => !expired.has(entry.clientId))
        .map((entry) => entry.clientId),
    );
    let inactive: LighterApiOrder[] = [];
    if (missingIds.size > 0) {
      try {
        inactive = await readRecentInactive();
      } catch (error) {
        this.#deps.debugLogger.log(
          '[LighterProvider] TP/SL ownership history unavailable; retaining uncertain IDs',
          { error: String(error) },
        );
      }
    }
    const terminalIds = new Set(
      inactive
        .filter((row) => {
          if (!missingIds.has(String(row.clientOrderIndex))) {
            return false;
          }
          const status = row.status.toLowerCase();
          if (status === 'rejected') {
            return true;
          }
          if (status === 'executed') {
            return parseStrictDecimal(row.remainingBaseAmount) === 0;
          }
          try {
            // The adapter is the canonical venue status vocabulary, including
            // OCO, reduce-only, expiry and other cancellation causes.
            const adapted = adaptOrderFromLighter(row, String(row.marketIndex));
            return (
              adapted.status === 'canceled' ||
              (adapted.status === 'filled' &&
                parseStrictDecimal(row.remainingBaseAmount) === 0)
            );
          } catch {
            // Unknown states retain ownership rather than guessing termination.
            return false;
          }
        })
        .map((row) => String(row.clientOrderIndex)),
    );
    if (terminalIds.size === 0 && expired.size === 0) {
      return;
    }
    const key = this.#managedTpslKey(settlementKey);
    await withStorageMutex(key, async () => {
      const current = await this.#readManagedTpsl(settlementKey);
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify({
          version: 1,
          orders: current.filter(
            (entry) =>
              !terminalIds.has(entry.clientId) &&
              !(
                expired.has(entry.clientId) &&
                expired.get(entry.clientId) === entry.orderExpiry
              ),
          ),
        }),
      );
    });
  };

  /**
   * Operation-scoped journal payload key: each operation's journal lives
   * under its OWN key so a stale resolver physically cannot overwrite or
   * delete a newer operation's payload — only its own.
   *
   * @param settlementKey - Settlement identity.
   * @param operationId - The operation identity.
   * @returns The disk-cache key.
   */
  readonly #tpslJournalOpKey = (
    settlementKey: string,
    operationId: string,
  ): string =>
    `lighterTpslJournalOp:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}:${operationId}`;

  /**
   * Load and strictly validate a persisted journal entry. Malformed or
   * unsupported disk data BLOCKS protection changes (fail closed) — it is
   * never trusted into signing decisions nor silently dropped.
   *
   * @param settlementKey - Settlement identity.
   * @returns The validated entry, or null.
   */
  readonly #loadTpslJournal = async (
    settlementKey: string,
  ): Promise<TpslJournalState | null> => {
    const key = this.#tpslJournalKey(settlementKey);
    // FAIL CLOSED on read failure and on corruption: turning either into
    // "no entry" would erase exactly the uncertainty this journal exists
    // to preserve and could duplicate a committed mutation. Malformed
    // data is NOT auto-removed — it blocks until inspected/resolved.
    let baseRaw: string | null;
    try {
      baseRaw = await this.#deps.diskCache.getItem(key);
    } catch (error) {
      throw new Error(
        `Lighter TP/SL journal read failed for ${settlementKey}; refusing protection changes: ${ensureError(error, 'LighterProvider.#loadTpslJournal').message}`,
      );
    }
    if (baseRaw === null) {
      return null;
    }
    // The base key holds either a POINTER to an operation-scoped payload
    // (code-written journals: a stale writer physically cannot destroy a
    // newer operation's payload) or a legacy inline journal.
    let raw = baseRaw;
    const pointer = parseTpslJournalPointer(baseRaw);
    if (pointer !== null) {
      const payloadRaw = await this.#deps.diskCache.getItem(
        this.#tpslJournalOpKey(settlementKey, pointer.operationId),
      );
      if (payloadRaw === null) {
        // Dangling pointer (payload already resolved elsewhere).
        return null;
      }
      raw = payloadRaw;
    }
    let parsed: {
      version?: unknown;
      recordedAt?: unknown;
      operationId?: unknown;
      sourceRecoveryOperationId?: unknown;
      sourceRecoverySettlementKey?: unknown;
      retainedReplacementGroups?: unknown;
      partialIntent?: unknown;
      createdAt?: unknown;
      nextAttemptId?: unknown;
      apiKeyIndex?: unknown;
      intent?: unknown;
      phase?: unknown;
      priorGrouping?: unknown;
      priorTriggers?: unknown;
      attempts?: unknown;
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new Error(
        `Lighter TP/SL journal for ${settlementKey} is corrupt; refusing protection changes until it is resolved`,
      );
    }
    const isWireId = (value: unknown): boolean =>
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value < 2 ** 48;
    const isNonce = (value: unknown): boolean =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    const isOrderIdString = (value: unknown): boolean =>
      typeof value === 'string' && /^\d{1,20}$/u.test(value);
    const isTxHash = (value: unknown): boolean =>
      typeof value === 'string' && /^(0x)?[0-9a-fA-F]{8,128}$/u.test(value);
    const isExpiry = (value: unknown): boolean =>
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
    const isAttempt = (value: unknown): value is TpslAttempt => {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      const attempt = value as Record<string, unknown>;
      if (
        !isNonce(attempt.nonce) ||
        typeof attempt.attemptId !== 'number' ||
        !Number.isSafeInteger(attempt.attemptId) ||
        attempt.attemptId < 1 ||
        (attempt.terminalStatus !== undefined &&
          (typeof attempt.terminalStatus !== 'number' ||
            !Number.isSafeInteger(attempt.terminalStatus))) ||
        (attempt.outcome !== 'unknown' && attempt.outcome !== 'accepted') ||
        !isTxHash(attempt.txHash) ||
        !isExpiry(attempt.expiresAt)
      ) {
        return false;
      }
      if (attempt.kind === 'create') {
        return (
          attempt.orderId === undefined &&
          (attempt.role === 'replacement' || attempt.role === 'restore') &&
          // priorOrderIds durably key WHICH prior intents a restore
          // restores, INDEX-ALIGNED with clientIds; REQUIRED on
          // restores, forbidden on replacements.
          (attempt.role === 'restore'
            ? Array.isArray(attempt.priorOrderIds) &&
              Array.isArray(attempt.clientIds) &&
              attempt.priorOrderIds.length === attempt.clientIds.length &&
              attempt.priorOrderIds.every(isOrderIdString)
            : attempt.priorOrderIds === undefined) &&
          Array.isArray(attempt.clientIds) &&
          attempt.clientIds.length >= 1 &&
          attempt.clientIds.length <= 2 &&
          attempt.clientIds.every(isWireId) &&
          new Set(attempt.clientIds).size === attempt.clientIds.length &&
          (attempt.orderExpiries === undefined ||
            (Array.isArray(attempt.orderExpiries) &&
              attempt.orderExpiries.length === attempt.clientIds.length &&
              attempt.orderExpiries.every(isExpiry)))
        );
      }
      if (attempt.kind === 'cancel') {
        return (
          attempt.clientIds === undefined &&
          (attempt.role === 'stale' || attempt.role === 'rollback') &&
          isOrderIdString(attempt.orderId)
        );
      }
      return false;
    };
    // Recovery SIGNS from these values: they must be strict, finite and
    // strictly positive before they can reach the wire.
    const isPositiveDecimalString = (value: unknown): boolean => {
      if (typeof value !== 'string') {
        return false;
      }
      const numeric = parseStrictDecimal(value);
      return numeric !== null && Number.isFinite(numeric) && numeric > 0;
    };
    const isPriorTrigger = (value: unknown): value is TpslPriorTrigger => {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      const trigger = value as Record<string, unknown>;
      return (
        isOrderIdString(trigger.orderId) &&
        (trigger.side === 'buy' || trigger.side === 'sell') &&
        (trigger.wireOrderType === 2 ||
          trigger.wireOrderType === 3 ||
          trigger.wireOrderType === 4 ||
          trigger.wireOrderType === 5) &&
        (trigger.wireTimeInForce === 0 ||
          trigger.wireTimeInForce === 1 ||
          trigger.wireTimeInForce === 2) &&
        typeof trigger.orderExpiry === 'number' &&
        Number.isSafeInteger(trigger.orderExpiry) &&
        trigger.orderExpiry >= -1 &&
        isPositiveDecimalString(trigger.price) &&
        isPositiveDecimalString(trigger.triggerPrice) &&
        isPositiveDecimalString(trigger.remainingSize)
      );
    };
    // EXPLICIT remediation policy for early schemas (v1/v2): their
    // transition state cannot be interpreted safely, so instead of a
    // permanent opaque block they convert to a DURABLE MANUAL-recovery
    // state — surfaced to the user, resolved only by an explicit new
    // protection intent.
    if (parsed.version === 1 || parsed.version === 2) {
      return {
        attempts: [],
        recordedAt:
          typeof parsed.recordedAt === 'number' ? parsed.recordedAt : 0,
        operationId:
          typeof parsed.operationId === 'string' &&
          parsed.operationId.length > 0
            ? parsed.operationId
            : `legacy-v${String(parsed.version)}`,
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
        nextAttemptId: 1,
        intent: 'replace',
        phase: 'manual',
        priorGrouping: 'independent',
        priorTriggers: [],
      };
    }
    if (
      (parsed.version === 3 ||
        parsed.version === 4 ||
        parsed.version === 5 ||
        parsed.version === 6) &&
      (parsed.version === 5 || parsed.version === 6
        ? isPartialTpslIntent(parsed.partialIntent) &&
          parsed.partialIntent.version === (parsed.version === 6 ? 2 : 1) &&
          parsed.intent === 'replace' &&
          parsed.phase !== 'creating'
        : parsed.partialIntent === undefined) &&
      typeof parsed.recordedAt === 'number' &&
      Number.isSafeInteger(parsed.recordedAt) &&
      parsed.recordedAt >= 0 &&
      // The journal is bound to ONE api-key slot: nonces are per slot.
      String(parsed.apiKeyIndex) === settlementKey.split(':').at(-2) &&
      typeof parsed.apiKeyIndex === 'number' &&
      Number.isSafeInteger(parsed.apiKeyIndex) &&
      parsed.apiKeyIndex >= 0 &&
      (parsed.retainedReplacementGroups === undefined ||
        isRecoveryGroups(parsed.retainedReplacementGroups)) &&
      (parsed.sourceRecoverySettlementKey === undefined) ===
        (parsed.sourceRecoveryOperationId === undefined) &&
      (parsed.sourceRecoverySettlementKey === undefined ||
        (typeof parsed.sourceRecoverySettlementKey === 'string' &&
          parsed.sourceRecoverySettlementKey.length > 0)) &&
      (parsed.sourceRecoveryOperationId === undefined ||
        (typeof parsed.sourceRecoveryOperationId === 'string' &&
          parsed.sourceRecoveryOperationId.length > 0 &&
          parsed.sourceRecoveryOperationId.length <= 64)) &&
      typeof parsed.operationId === 'string' &&
      parsed.operationId.length >= 1 &&
      parsed.operationId.length <= 64 &&
      typeof parsed.createdAt === 'number' &&
      Number.isSafeInteger(parsed.createdAt) &&
      parsed.createdAt >= 0 &&
      typeof parsed.nextAttemptId === 'number' &&
      Number.isSafeInteger(parsed.nextAttemptId) &&
      parsed.nextAttemptId >= 1 &&
      // An explicit durable operation intent is REQUIRED: without it a
      // remove could be misread as a failed replacement.
      (parsed.intent === 'replace' || parsed.intent === 'remove') &&
      (parsed.phase === 'creating' ||
        parsed.phase === 'cancelling' ||
        // v3's 'restoring' migrates to 'manual' below.
        parsed.phase === 'restoring' ||
        parsed.phase === 'manual') &&
      // 'oco' grouping structurally requires the linked pair.
      (parsed.priorGrouping === 'independent' ||
        (parsed.priorGrouping === 'oco' &&
          Array.isArray(parsed.priorTriggers) &&
          parsed.priorTriggers.length === 2)) &&
      Array.isArray(parsed.priorTriggers) &&
      parsed.priorTriggers.length <= 4 &&
      parsed.priorTriggers.every(isPriorTrigger) &&
      new Set(parsed.priorTriggers.map((trigger) => trigger.orderId)).size ===
        parsed.priorTriggers.length &&
      Array.isArray(parsed.attempts) &&
      // Only schema 5 records a validated intent before any cancellation.
      // Older schemas require at least one signed attempt.
      (parsed.attempts.length >= 1 ||
        parsed.version === 5 ||
        parsed.version === 6) &&
      parsed.attempts.length <= 40 &&
      parsed.attempts.every(isAttempt) &&
      // Attempt IDENTITY is the attemptId — nonces may legitimately
      // repeat when a proven-never-landed submission is retried. The
      // durable allocator must sit strictly ABOVE every recorded id so
      // compaction can never recycle one.
      new Set(parsed.attempts.map((entry) => entry.attemptId)).size ===
        parsed.attempts.length &&
      parsed.attempts.every(
        (entry) => entry.attemptId < (parsed.nextAttemptId as number),
      )
    ) {
      const { attempts } = parsed;
      const { priorTriggers } = parsed;
      // Every restore leg must link to a persisted prior intent — an
      // unlinked restore could sign a duplicate or orphan a prior one.
      const restoresLinked = attempts.every(
        (attempt) =>
          attempt.kind !== 'create' ||
          attempt.role !== 'restore' ||
          (attempt.priorOrderIds ?? []).every((priorOrderId) =>
            priorTriggers.some((trigger) => trigger.orderId === priorOrderId),
          ),
      );
      const independentIntent = parsed.partialIntent;
      const independentAttemptsValid =
        !isPartialTpslIntent(independentIntent) ||
        independentIntent.version !== 2 ||
        attempts
          .filter((attempt) => attempt.kind === 'create')
          .every(
            (attempt, index) =>
              attempt.kind === 'create' &&
              attempt.role === 'replacement' &&
              attempt.clientIds.length === 1 &&
              independentIntent.orders[index]?.[1] === attempt.clientIds[0],
          );
      if (restoresLinked && independentAttemptsValid) {
        return {
          attempts: attempts.map((attempt) =>
            attempt.kind === 'create'
              ? { ...attempt, neverLanded: undefined }
              : attempt,
          ),
          partialIntent: isPartialTpslIntent(parsed.partialIntent)
            ? parsed.partialIntent
            : undefined,
          recordedAt: parsed.recordedAt,
          operationId: parsed.operationId,
          retainedReplacementGroups: isRecoveryGroups(
            parsed.retainedReplacementGroups,
          )
            ? parsed.retainedReplacementGroups
            : undefined,
          sourceRecoverySettlementKey:
            typeof parsed.sourceRecoverySettlementKey === 'string'
              ? parsed.sourceRecoverySettlementKey
              : undefined,
          sourceRecoveryOperationId:
            typeof parsed.sourceRecoveryOperationId === 'string'
              ? parsed.sourceRecoveryOperationId
              : undefined,
          createdAt: parsed.createdAt,
          nextAttemptId: parsed.nextAttemptId,
          intent: parsed.intent,
          // v3 MIGRATION: an interrupted 'restoring' operation predates
          // the no-auto-restore policy — it parks as MANUAL.
          phase: parsed.phase === 'restoring' ? 'manual' : parsed.phase,
          priorGrouping: parsed.priorGrouping,
          priorTriggers,
        };
      }
    }
    throw new Error(
      `Lighter TP/SL journal for ${settlementKey} is malformed; refusing protection changes until it is resolved`,
    );
  };

  /**
   * Durable index of settlement keys with pending journals.
   *
   * @returns The disk-cache key of the index.
   */
  readonly #tpslJournalIndexKey = (): string =>
    `lighterTpslJournalIndex:${this.#isTestnet ? 'testnet' : 'mainnet'}`;

  /**
   * Read the durable journal index (strictly validated; failures fail
   * closed by throwing).
   *
   * @returns The list of settlement keys with pending journals.
   */
  readonly #readTpslJournalIndex = async (): Promise<string[]> => {
    const raw = await this.#deps.diskCache.getItem(this.#tpslJournalIndexKey());
    if (raw === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length <= 64 &&
        parsed.every((entry) => typeof entry === 'string')
      ) {
        return parsed;
      }
    } catch {
      // fall through
    }
    throw new Error('Lighter TP/SL journal index is corrupt');
  };

  /**
   * Durable manual-recovery doc key (separate from the journal slot).
   *
   * @param settlementKey - Settlement identity.
   * @returns The disk-cache key.
   */
  readonly #tpslManualKey = (settlementKey: string): string =>
    `lighterTpslManual:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}`;

  /**
   * Manual-recovery index key.
   *
   * @returns The disk-cache key.
   */
  readonly #tpslManualIndexKey = (): string =>
    `lighterTpslManualIndex:${this.#isTestnet ? 'testnet' : 'mainnet'}`;

  /**
   * Read the manual-recovery index. Corruption THROWS — a parked
   * protection warning silently degrading to "nothing pending" would
   * hide a naked position.
   *
   * @returns Settlement keys with pending manual recoveries.
   */
  readonly #readTpslManualIndex = async (): Promise<string[]> => {
    const raw = await this.#deps.diskCache.getItem(this.#tpslManualIndexKey());
    if (raw === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length <= 64 &&
        parsed.every((entry) => typeof entry === 'string')
      ) {
        return parsed;
      }
    } catch {
      // fall through
    }
    throw new Error('Lighter TP/SL manual-recovery index is corrupt');
  };

  /**
   * Durably record a manual-recovery warning (doc + index entry).
   *
   * @param doc - The manual-recovery record.
   */
  readonly #writeTpslManualRecovery = async (
    doc: TpslManualRecovery,
  ): Promise<void> => {
    await withStorageMutex(this.#tpslManualIndexKey(), async () => {
      const index = await this.#readTpslManualIndex();
      if (
        !index.includes(doc.settlementKey) &&
        index.length >= LIGHTER_TPSL_MANUAL_RECOVERY_LIMIT
      ) {
        throw new Error(
          'Lighter TP/SL manual-recovery index is full; refusing to hide a new recovery obligation',
        );
      }
      await this.#deps.diskCache.setItem(
        this.#tpslManualKey(doc.settlementKey),
        JSON.stringify({ version: 1, ...doc }),
      );
      if (!index.includes(doc.settlementKey)) {
        await this.#deps.diskCache.setItem(
          this.#tpslManualIndexKey(),
          JSON.stringify([...index, doc.settlementKey]),
        );
      }
    });
  };

  /**
   * Load a manual-recovery record. Corruption THROWS (never null) so a
   * parked warning cannot silently vanish.
   *
   * @param settlementKey - Settlement identity.
   * @returns The record, or null when none is parked.
   */
  readonly #loadTpslManualRecovery = async (
    settlementKey: string,
  ): Promise<TpslManualRecovery | null> => {
    const raw = await this.#deps.diskCache.getItem(
      this.#tpslManualKey(settlementKey),
    );
    if (raw === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        parsed.version === 1 &&
        (parsed.partialIntent === undefined ||
          isPartialTpslIntent(parsed.partialIntent)) &&
        typeof parsed.settlementKey === 'string' &&
        typeof parsed.symbol === 'string' &&
        typeof parsed.reason === 'string' &&
        parsed.reason.length <= 500 &&
        (parsed.priorIntent === 'replace' || parsed.priorIntent === 'remove') &&
        Array.isArray(parsed.priorTriggers) &&
        Array.isArray(parsed.survivingOrderIds) &&
        (parsed.survivingOrderIds as unknown[]).every(
          (id) => typeof id === 'string',
        ) &&
        typeof parsed.operationId === 'string' &&
        typeof parsed.recordedAt === 'number'
      ) {
        return {
          partialIntent: isPartialTpslIntent(parsed.partialIntent)
            ? parsed.partialIntent
            : undefined,
          settlementKey: parsed.settlementKey,
          symbol: parsed.symbol,
          reason: parsed.reason,
          priorIntent: parsed.priorIntent,
          priorTriggers: parsed.priorTriggers as TpslPriorTrigger[],
          survivingOrderIds: parsed.survivingOrderIds as string[],
          operationId: parsed.operationId,
          recordedAt: parsed.recordedAt,
        };
      }
    } catch {
      // fall through to fail closed
    }
    throw new Error(
      `Lighter TP/SL manual-recovery record for ${settlementKey} is corrupt; resolve storage before proceeding`,
    );
  };

  /**
   * Clear an obsolete manual-recovery record after an explicit protection
   * intent succeeds, including a guarded removal settled during recovery.
   *
   * @param settlementKey - Settlement identity.
   * @param expectedOperationId - Exact source to clear, when explicitly selected.
   * @param generation - Issuing wallet session.
   * @param requireSettledJournal - Keep previous-slot warnings while a journal survives.
   */
  readonly #clearTpslManualRecovery = async (
    settlementKey: string,
    expectedOperationId?: string,
    generation = this.#sessionGeneration,
    requireSettledJournal = false,
  ): Promise<void> => {
    await withStorageMutex(this.#tpslManualIndexKey(), async () => {
      this.#assertSession(generation);
      const current = await this.#loadTpslManualRecovery(settlementKey);
      this.#assertSession(generation);
      if (
        expectedOperationId !== undefined &&
        current !== null &&
        current.operationId !== expectedOperationId
      ) {
        if (requireSettledJournal) {
          return;
        }
        throw new Error(
          'Lighter recovery source operation changed before completion',
        );
      }
      const index = await this.#readTpslManualIndex();
      this.#assertSession(generation);
      if (expectedOperationId !== undefined) {
        const latest = await this.#loadTpslManualRecovery(settlementKey);
        this.#assertSession(generation);
        if (latest && latest.operationId !== expectedOperationId) {
          return;
        }
      }
      if (requireSettledJournal) {
        const journal = await this.#loadTpslJournal(settlementKey);
        this.#assertSession(generation);
        if (journal) {
          return;
        }
      }
      await this.#deps.diskCache.removeItem(this.#tpslManualKey(settlementKey));
      this.#assertSession(generation);
      if (index.includes(settlementKey)) {
        await this.#deps.diskCache.setItem(
          this.#tpslManualIndexKey(),
          JSON.stringify(index.filter((entry) => entry !== settlementKey)),
        );
        this.#assertSession(generation);
      }
    });
  };

  /**
   * Retire other-slot warnings only after an explicit current-key intent
   * succeeds. Reads alone never acknowledge surviving protection.
   * @param settlementKey - Current wallet/account/slot/symbol identity.
   * @param accountIndex - Captured venue account.
   * @param symbol - Symbol changed by the successful explicit intent.
   * @param generation - Captured wallet session.
   * @param readActiveRaw - Strict account-wide active book reader.
   */
  readonly #clearSettledPreviousSlotWarnings = async (
    settlementKey: string,
    accountIndex: number,
    symbol: string,
    generation: number,
    readActiveRaw: () => Promise<LighterApiOrder[]>,
  ): Promise<void> => {
    const index = await this.#readTpslManualIndex();
    this.#assertSession(generation);
    for (const key of index) {
      const [address, account, , ...keySymbol] = key.split(':');
      if (
        key === settlementKey ||
        address !== this.#boundAddress ||
        account !== String(accountIndex) ||
        keySymbol.join(':') !== symbol
      ) {
        continue;
      }
      // A manual document can coexist with an unresolved journal after a
      // failed cleanup. Preserve that obligation regardless of book absence.
      if (await this.#loadTpslJournal(key)) {
        this.#assertSession(generation);
        continue;
      }
      this.#assertSession(generation);
      const doc = await this.#loadTpslManualRecovery(key);
      this.#assertSession(generation);
      if (!doc) {
        // A document removal may have landed before its index write failed.
        // Recheck under the writer mutex so a newly parked warning survives.
        await withStorageMutex(this.#tpslManualIndexKey(), async () => {
          const currentIndex = await this.#readTpslManualIndex();
          const currentDoc = await this.#loadTpslManualRecovery(key);
          const currentJournal = await this.#loadTpslJournal(key);
          this.#assertSession(generation);
          if (!currentDoc && !currentJournal && currentIndex.includes(key)) {
            await this.#deps.diskCache.setItem(
              this.#tpslManualIndexKey(),
              JSON.stringify(currentIndex.filter((entry) => entry !== key)),
            );
            this.#assertSession(generation);
          }
        });
        continue;
      }
      if (doc.settlementKey !== key || doc.symbol !== symbol) {
        throw new Error(
          'Lighter previous-slot protection warning identity is invalid',
        );
      }
      // Partial recovery requires its exact explicit successor; an ordinary
      // protection update must not retire saved partial intent.
      if (doc.partialIntent) {
        continue;
      }
      const ids = [
        ...doc.survivingOrderIds,
        ...doc.priorTriggers.map((prior) => prior.orderId),
      ];
      if (
        ids.some(
          (id) =>
            typeof id !== 'string' ||
            !/^[1-9]\d*$/u.test(id) ||
            !Number.isSafeInteger(Number(id)),
        )
      ) {
        throw new Error(
          'Lighter previous-slot protection warning order identity is invalid',
        );
      }
      const readSurvivors = async (): Promise<boolean> => {
        const active = await readActiveRaw();
        this.#assertSession(generation);
        if (
          !Array.isArray(active) ||
          active.some(
            (row) =>
              !row ||
              row.ownerAccountIndex !== accountIndex ||
              !Number.isSafeInteger(row.orderIndex) ||
              row.orderIndex <= 0 ||
              !Number.isSafeInteger(row.marketIndex) ||
              row.marketIndex < 0,
          )
        ) {
          throw new Error(
            'Lighter previous-slot protection review requires a complete account order response',
          );
        }
        return active.some((row) => ids.includes(String(row.orderIndex)));
      };
      if ((await readSurvivors()) || (await readSurvivors())) {
        continue;
      }
      if (await this.#loadTpslJournal(key)) {
        this.#assertSession(generation);
        continue;
      }
      this.#assertSession(generation);
      await this.#clearTpslManualRecovery(
        key,
        doc.operationId,
        generation,
        true,
      );
      this.#assertSession(generation);
    }
  };

  /**
   * Persist a journal entry durably and ensure the index lists its key so
   * restart recovery can enumerate pending obligations without waiting
   * for the next mutation.
   *
   * @param settlementKey - Settlement identity.
   * @param journal - The journal entry.
   */
  readonly #persistTpslJournal = async (
    settlementKey: string,
    journal: TpslJournalState,
  ): Promise<void> => {
    // WRITER-SIDE capacity enforcement, mirrored from the loader: a
    // journal the loader would reject as malformed must never be written
    // in the first place. Throwing here aborts BEFORE the submission the
    // entry was journalling, with every older obligation intact.
    if (journal.priorTriggers.length > 4) {
      throw new Error(
        `Lighter TP/SL journal for ${settlementKey} would record too many prior triggers (${journal.priorTriggers.length} > 4); refusing the mutation`,
      );
    }
    if (journal.attempts.length > 40) {
      throw new Error(
        `Lighter TP/SL journal for ${settlementKey} would record too many attempts (${journal.attempts.length} > 40); refusing further submissions until pending obligations resolve`,
      );
    }
    // INDEX-FIRST: a dangling index entry (no journal behind it) is
    // safely prunable by recovery, whereas compensating a failed index
    // write by removing the journal could erase an EXISTING authoritative
    // journal holding already-accepted attempts. Any failure here aborts
    // BEFORE the next submission with every older obligation intact.
    // Index RMW under its OWN process-wide mutex: concurrent persists
    // for different settlement keys must never lose each other's entry.
    await withStorageMutex(this.#tpslJournalIndexKey(), async () => {
      const index = await this.#readTpslJournalIndex();
      if (!index.includes(settlementKey)) {
        if (index.length >= 64) {
          // NEVER evict a live obligation: fail the mutation before
          // submission instead.
          throw new Error(
            'Lighter TP/SL journal index is full; refusing further protection changes until pending obligations resolve',
          );
        }
        await this.#deps.diskCache.setItem(
          this.#tpslJournalIndexKey(),
          JSON.stringify([...index, settlementKey]),
        );
      }
    });
    const baseKey = this.#tpslJournalKey(settlementKey);
    // The pointer read-modify-write is serialized PROCESS-WIDE: the
    // instance-local write lock cannot protect two live provider
    // instances sharing one disk cache.
    await withStorageMutex(baseKey, async () => {
      // COMPARE-AND-SWAP on the operation identity: a writer holding a
      // stale snapshot must never take over a DIFFERENT operation's
      // journal. (A missing journal is fine — first write of an op.)
      const currentRaw = await this.#deps.diskCache.getItem(baseKey);
      const pointerAlreadyOurs =
        currentRaw !== null &&
        parseTpslJournalPointer(currentRaw)?.operationId ===
          journal.operationId;
      // A DANGLING pointer (payload already resolved; only the base
      // removal failed) has no live owner — it is claimable, otherwise a
      // partial clear would block every future operation forever.
      let danglingPointer = false;
      if (currentRaw !== null) {
        const staleCheck = parseTpslJournalPointer(currentRaw);
        if (
          staleCheck !== null &&
          staleCheck.operationId !== journal.operationId
        ) {
          danglingPointer =
            (await this.#deps.diskCache.getItem(
              this.#tpslJournalOpKey(settlementKey, staleCheck.operationId),
            )) === null;
        }
      }
      if (currentRaw !== null && !danglingPointer) {
        const pointer = parseTpslJournalPointer(currentRaw);
        let currentOperationId: unknown = pointer?.operationId ?? null;
        if (pointer === null) {
          try {
            currentOperationId = (
              JSON.parse(currentRaw) as { operationId?: unknown }
            ).operationId;
          } catch {
            // Corrupt current journal: fail closed below via mismatch.
          }
        }
        if (currentOperationId !== journal.operationId) {
          throw new Error(
            `Lighter TP/SL journal for ${settlementKey} belongs to a different operation; refusing a stale write`,
          );
        }
      }
      const previous = danglingPointer
        ? null
        : await this.#loadTpslJournal(settlementKey);
      if (
        previous &&
        JSON.stringify(previous.partialIntent) !==
          JSON.stringify(journal.partialIntent)
      ) {
        throw new Error(
          'Cannot change the persisted partial protection intent',
        );
      }
      const priorCreateIds = new Set(
        previous?.attempts.flatMap((attempt) =>
          attempt.kind === 'create' ? attempt.clientIds.map(String) : [],
        ) ?? [],
      );
      // Ownership must succeed BEFORE publishing an unknown journal attempt.
      // A failed ownership write therefore leaves no never-sent obligation.
      const insertedOwnership = await this.#updateManagedTpsl(
        settlementKey,
        journal,
      );
      try {
        await this.#deps.diskCache.setItem(
          this.#tpslJournalOpKey(settlementKey, journal.operationId),
          JSON.stringify({
            version: journal.partialIntent
              ? journal.partialIntent.version + 4
              : 4,
            partialIntent: journal.partialIntent,
            recordedAt: journal.recordedAt,
            operationId: journal.operationId,
            sourceRecoveryOperationId: journal.sourceRecoveryOperationId,
            sourceRecoverySettlementKey: journal.sourceRecoverySettlementKey,
            retainedReplacementGroups: journal.retainedReplacementGroups,
            createdAt: journal.createdAt,
            nextAttemptId: journal.nextAttemptId,
            apiKeyIndex: this.#apiKeyIndex,
            intent: journal.intent,
            phase: journal.phase,
            priorGrouping: journal.priorGrouping,
            priorTriggers: journal.priorTriggers,
            attempts: journal.attempts.map((attempt) =>
              attempt.kind === 'create'
                ? { ...attempt, neverLanded: undefined }
                : attempt,
            ),
          }),
        );
        if (!pointerAlreadyOurs) {
          await this.#deps.diskCache.setItem(
            baseKey,
            JSON.stringify({
              pointerVersion: 1,
              operationId: journal.operationId,
            }),
          );
        }
      } catch (error) {
        // Pointer write failed on the FIRST persist of this operation:
        // remove the freshly written payload so no orphan accumulates.
        // (When an earlier persist already pointed here, the payload is
        // referenced durable state — keep it.)
        if (!pointerAlreadyOurs) {
          await this.#deps.diskCache
            .removeItem(
              this.#tpslJournalOpKey(settlementKey, journal.operationId),
            )
            .catch(() => undefined);
        }
        // Only brand-new attempts absent from the previous durable journal
        // are known never dispatched. Retain all prior committed identities.
        try {
          await this.#discardManagedTpslIds(
            settlementKey,
            insertedOwnership.filter((id) => !priorCreateIds.has(id)),
          );
        } catch (rollbackError) {
          // Keep ownership conservatively if storage also fails during rollback.
          // Bounded bookkeeping can reclaim them after their signed order expiry.
          this.#deps.debugLogger.log(
            '[LighterProvider] pre-dispatch ownership rollback failed; retaining IDs',
            { error: String(rollbackError) },
          );
        }
        throw error;
      }
    });
    // A NEW pending obligation invalidates any "recovery complete"
    // marker recorded earlier in this session — otherwise later read
    // kicks would skip it until a restart or another mutation.
    this.#tpslRecoveryGeneration = -1;
  };

  /**
   * Resolve a settlement obligation everywhere — compare-and-swap on the
   * operation identity: a resolver holding a STALE snapshot must never
   * erase a NEWER operation's journal. Disk removal failures PROPAGATE
   * and the in-memory entry is retained: silently dropping only the
   * memory copy would leave a stale durable obligation to wedge a later
   * session.
   *
   * @param settlementKey - Settlement identity.
   * @param expectedOperationId - The operation this resolver settled;
   * null prunes only a dangling index entry with NO journal behind it.
   * @param settledActive - Strict active book after the operation settled.
   * @returns True when the obligation was cleared (or already gone);
   * false when a NEWER operation owns the journal (unresolved).
   */
  readonly #clearTpslJournal = async (
    settlementKey: string,
    expectedOperationId: string | null,
    settledActive?: LighterApiOrder[],
  ): Promise<boolean> => {
    const journalKey = this.#tpslJournalKey(settlementKey);
    const cleared = await withStorageMutex(journalKey, async () => {
      const currentRaw = await this.#deps.diskCache.getItem(journalKey);
      if (currentRaw === null) {
        // Already resolved (or never journalled): nothing left to clear.
        return true;
      }
      const pointer = parseTpslJournalPointer(currentRaw);
      if (pointer !== null) {
        if (expectedOperationId === null) {
          // Prune mode: only a DANGLING pointer may be pruned.
          const payloadRaw = await this.#deps.diskCache.getItem(
            this.#tpslJournalOpKey(settlementKey, pointer.operationId),
          );
          if (payloadRaw !== null) {
            return false;
          }
          await this.#deps.diskCache.removeItem(journalKey);
          return true;
        }
        if (pointer.operationId !== expectedOperationId) {
          // A NEWER operation owns the journal: remove only OUR OWN
          // payload (physically incapable of touching theirs) and
          // report the clear as unresolved.
          this.#deps.debugLogger.log(
            '[LighterProvider] TP/SL journal clear refused: different operation',
            { settlementKey },
          );
          await this.#deps.diskCache
            .removeItem(
              this.#tpslJournalOpKey(settlementKey, expectedOperationId),
            )
            .catch(() => undefined);
          return false;
        }
        if (settledActive) {
          const journal = await this.#loadTpslJournal(settlementKey);
          if (journal) {
            await this.#updateManagedTpsl(
              settlementKey,
              journal,
              settledActive,
            );
          }
        }
        await this.#deps.diskCache.removeItem(
          this.#tpslJournalOpKey(settlementKey, expectedOperationId),
        );
        await this.#deps.diskCache.removeItem(journalKey);
        return true;
      }
      // Legacy inline journal at the base key.
      if (expectedOperationId === null) {
        return false;
      }
      let currentOperationId: unknown = null;
      try {
        const inline = JSON.parse(currentRaw) as {
          operationId?: unknown;
          version?: unknown;
        };
        currentOperationId =
          inline.operationId ??
          // Early schemas carry no operation id: the loader synthesizes
          // `legacy-v{n}` for their manual-remediation state — mirror it
          // so the explicit new intent can clear them.
          (inline.version === 1 || inline.version === 2
            ? `legacy-v${String(inline.version)}`
            : null);
      } catch {
        // Corrupt journal is never silently cleared.
      }
      if (currentOperationId !== expectedOperationId) {
        this.#deps.debugLogger.log(
          '[LighterProvider] TP/SL journal clear refused: different operation',
          { settlementKey },
        );
        return false;
      }
      if (settledActive) {
        const journal = await this.#loadTpslJournal(settlementKey);
        if (journal) {
          await this.#updateManagedTpsl(settlementKey, journal, settledActive);
        }
      }
      await this.#deps.diskCache.removeItem(journalKey);
      return true;
    });
    if (!cleared) {
      return false;
    }
    // Index removal under the index mutex, RE-VERIFYING the journal is
    // still gone: a newer operation may have persisted (journal +
    // index entry) between our clear and this removal — removing the
    // entry then would blind restart recovery to a live obligation.
    // A storage READ failure here is AMBIGUITY, never absence: it
    // propagates (the index entry is retained and the settlement stays
    // unresolved) — guessing could orphan a live obligation.
    await withStorageMutex(this.#tpslJournalIndexKey(), async () => {
      const stillGone =
        (await this.#deps.diskCache.getItem(journalKey)) === null;
      if (!stillGone) {
        return;
      }
      const index = await this.#readTpslJournalIndex();
      if (index.includes(settlementKey)) {
        await this.#deps.diskCache.setItem(
          this.#tpslJournalIndexKey(),
          JSON.stringify(index.filter((entry) => entry !== settlementKey)),
        );
      }
    });
    const memoryEntry = this.#tpslUnsettled.get(settlementKey);
    if (
      memoryEntry === undefined ||
      expectedOperationId === null ||
      memoryEntry.operationId === expectedOperationId
    ) {
      this.#tpslUnsettled.delete(settlementKey);
    }
    return true;
  };

  /**
   * Targeted, cached, active-first inactive-history reader shared by the
   * mutation transition and recovery: terminal rows are immutable so they
   * cache across polls; page 1 per call; the deep cursor walk runs at
   * most ONCE per reader and stops when every target id is found.
   *
   * @param accountIndex - Captured account index.
   * @param authToken - Captured auth token.
   * @param generation - Captured session generation (fenced per read).
   * @param marketId - Market to scope inactive-history requests to.
   * @returns The reader closure.
   */
  readonly #makeInactiveReader = (
    accountIndex: number,
    authToken: string,
    generation: number,
    marketId: number,
  ): ((targetClientIds: number[]) => Promise<LighterApiOrder[]>) => {
    const terminalCache = new Map<string, LighterApiOrder>();
    const conflictingClients = new Set<string>();
    let deepTraversalDone = false;
    return async (targetClientIds: number[]): Promise<LighterApiOrder[]> => {
      this.#assertSession(generation);
      const targets = targetClientIds.map(String);
      const missing = (): boolean =>
        targets.some((id) => !terminalCache.has(id));
      const ingest = (orders: LighterApiOrder[]): void => {
        for (const order of orders) {
          if (order.ownerAccountIndex === accountIndex) {
            const clientId = String(order.clientOrderIndex);
            const previous = terminalCache.get(clientId);
            if (
              previous &&
              (previous.orderIndex !== order.orderIndex ||
                previous.marketIndex !== order.marketIndex)
            ) {
              conflictingClients.add(clientId);
            }
            terminalCache.set(clientId, order);
          }
        }
      };
      const firstPage = await this.#clientService.getInactiveOrders(
        accountIndex,
        authToken,
        100,
        undefined,
        marketId,
      );
      this.#assertSession(generation);
      let rowsRead = firstPage.orders.length;
      if (rowsRead > LIGHTER_INACTIVE_HISTORY_ROW_LIMIT) {
        throw new Error(
          `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history exceeded ${LIGHTER_INACTIVE_HISTORY_ROW_LIMIT} rows; TP/SL recovery is still pending`,
        );
      }
      ingest(firstPage.orders);
      if (missing() && !deepTraversalDone) {
        let cursor = firstPage.nextCursor;
        const seenCursors = new Set<string>();
        let pagesRead = 1;
        while (cursor && missing()) {
          if (seenCursors.has(cursor)) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history repeated cursor ${cursor} after ${rowsRead} rows; TP/SL recovery is still pending`,
            );
          }
          seenCursors.add(cursor);
          const response = await this.#clientService.getInactiveOrders(
            accountIndex,
            authToken,
            100,
            cursor,
            marketId,
          );
          this.#assertSession(generation);
          pagesRead += 1;
          if (
            response.orders.length === 0 &&
            response.nextCursor !== undefined
          ) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history advanced without returning rows; TP/SL recovery is still pending`,
            );
          }
          if (pagesRead > LIGHTER_INACTIVE_HISTORY_ROW_LIMIT) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history exceeded ${LIGHTER_INACTIVE_HISTORY_ROW_LIMIT} pages; TP/SL recovery is still pending`,
            );
          }
          rowsRead += response.orders.length;
          if (rowsRead > LIGHTER_INACTIVE_HISTORY_ROW_LIMIT) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history exceeded ${LIGHTER_INACTIVE_HISTORY_ROW_LIMIT} rows (${rowsRead} rows returned); TP/SL recovery is still pending`,
            );
          }
          ingest(response.orders);
          cursor = response.nextCursor;
        }
        deepTraversalDone = !cursor || !missing();
      }
      if (targets.some((id) => conflictingClients.has(id))) {
        throw new Error(
          `${LIGHTER_DATA_INTEGRITY_PREFIX} conflicting inactive-order identity for requested client; TP/SL recovery is still pending`,
        );
      }
      return [...terminalCache.values()];
    };
  };

  /** Session generation whose journal recovery fully resolved. */
  #tpslRecoveryGeneration = -1;

  /** In-flight journal recovery (deduplicates concurrent triggers). */
  #tpslRecoveryInFlight: Promise<void> | null = null;

  /**
   * Detached, deduplicated recovery kick. Wired into signer setup AND the
   * public read paths: a recovery that returned unresolved (e.g. REST
   * visibility lag) must get another chance later in the SAME session,
   * not only at the next signer setup.
   */
  /** A kick arrived while a (possibly stale) recovery was in flight. */
  #tpslRecoveryKickPending = false;

  readonly #kickTpslRecovery = (): void => {
    if (this.#tpslRecoveryGeneration === this.#sessionGeneration) {
      return;
    }
    if (this.#tpslRecoveryInFlight) {
      // A stale-generation recovery may be finishing: remember this kick
      // so the CURRENT generation's journals are not silently skipped.
      this.#tpslRecoveryKickPending = true;
      return;
    }
    setTimeout(() => {
      this.#recoverPendingTpslJournals().catch((error) => {
        this.#deps.debugLogger.log(
          '[LighterProvider] TP/SL journal recovery failed',
          { error: String(error) },
        );
      });
    }, 0);
  };

  /**
   * Enumerate durable journal-index entries for the CURRENT identity and
   * recover each: reconcile, complete an interrupted replacement's stale
   * cancels when its created protection is live, then clear. Bounded and
   * deduplicated per session generation; unresolved entries stay for the
   * next attempt.
   */
  readonly #recoverPendingTpslJournals = async (): Promise<void> => {
    const generation = this.#sessionGeneration;
    if (this.#tpslRecoveryGeneration === generation) {
      return;
    }
    if (this.#tpslRecoveryInFlight) {
      await this.#tpslRecoveryInFlight;
      return;
    }
    this.#tpslRecoveryInFlight = (async (): Promise<void> => {
      try {
        // Index corruption/read failure PROPAGATES (logged by the hook):
        // silently treating it as empty would disable recovery entirely.
        const index = await this.#readTpslJournalIndex();
        if (index.length === 0) {
          this.#tpslRecoveryGeneration = generation;
          return;
        }
        const address = this.#boundAddress;
        if (!address) {
          return;
        }
        const accountIndex = await this.#ensureAccountIndex();
        this.#assertSession(generation);
        const prefix = `${address}:${accountIndex}:`;
        let allResolved = true;
        for (const settlementKey of index) {
          if (!settlementKey.startsWith(prefix)) {
            continue;
          }
          const [slot, ...symbol] = settlementKey
            .slice(prefix.length)
            .split(':');
          const originalSlot = Number(slot);
          const resolved = await this.#recoverTpslSymbol(
            symbol.join(':'),
            settlementKey,
            generation,
            accountIndex,
            originalSlot,
          ).catch((error) => {
            // Surface the exact cause (corruption, transport, session
            // fence) — the entry stays retryable, but never silently.
            this.#deps.debugLogger.log(
              '[LighterProvider] TP/SL journal entry recovery failed',
              {
                settlementKey,
                error:
                  error instanceof Error
                    ? (error.stack ?? error.message)
                    : String(error),
              },
            );
            return false;
          });
          if (!resolved) {
            allResolved = false;
          }
        }
        // Marked complete ONLY when everything resolved: unresolved or
        // errored entries stay retryable within this session.
        if (allResolved) {
          this.#tpslRecoveryGeneration = generation;
        }
      } finally {
        this.#tpslRecoveryInFlight = null;
        if (this.#tpslRecoveryKickPending) {
          this.#tpslRecoveryKickPending = false;
          this.#kickTpslRecovery();
        }
      }
    })();
    await this.#tpslRecoveryInFlight;
  };

  /**
   * Recover one pending TP/SL journal without any new protection intent.
   *
   * @param symbol - Market symbol from the settlement key.
   * @param settlementKey - Full settlement identity.
   * @param generation - Captured session generation.
   * @param accountIndex - Captured account index.
   * @param originalSlot - Original journal slot, read-only if different after setup.
   * @returns True when the obligation fully resolved (journal cleared);
   * false when it remains pending and must be retried.
   */
  readonly #recoverTpslSymbol = async (
    symbol: string,
    settlementKey: string,
    generation: number,
    accountIndex: number,
    originalSlot = this.#apiKeyIndex,
  ): Promise<boolean> => {
    const markets = await this.#ensureMarkets();
    const market = markets.get(symbol);
    if (!market) {
      return false;
    }
    await this.#ensureSignerReady();
    this.#assertSession(generation);
    const authToken = await this.#getAuthToken();
    this.#assertSession(generation);
    return await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit): Promise<boolean> => {
        // The journal is loaded INSIDE the lock: a snapshot taken while
        // waiting for the lock could be superseded by a foreground
        // operation that settles it and journals a NEW one — acting on
        // the stale snapshot could erase the newer obligation.
        const journalEntry = await this.#loadTpslJournal(settlementKey);
        if (!journalEntry) {
          // Stale index entry with no journal behind it: prune.
          return await this.#clearTpslJournal(settlementKey, null).catch(
            () => false,
          );
        }
        const readActiveRaw = async (): Promise<LighterApiOrder[]> => {
          this.#assertSession(generation);
          const response = await this.#clientService.getActiveOrders(
            accountIndex,
            authToken,
          );
          this.#assertSession(generation);
          return response.orders;
        };
        const readInactiveFor = this.#makeInactiveReader(
          accountIndex,
          authToken,
          generation,
          market.marketId,
        );
        return await this.#settleTpslObligation({
          settlementKey,
          symbol,
          journalEntry,
          readOnlyApiKeyIndex:
            originalSlot === this.#apiKeyIndex ? undefined : originalSlot,
          market,
          accountIndex,
          authToken,
          generation,
          readActiveRaw,
          readInactiveFor,
          nextNonce,
          submit,
        });
      },
      generation,
    );
  };

  /**
   * THE TP/SL obligation state machine — the single implementation run by
   * startup/read-path recovery AND by a direct foreground update that
   * finds a pending journal. Reconciles every attempt authoritatively,
   * then acts per durable intent and phase, and clears the journal ONLY
   * on a fully-settled outcome.
   *
   * @param context - Captured settlement context.
   * @param context.settlementKey - Full settlement identity.
   * @param context.symbol - Market symbol.
   * @param context.journalEntry - The pending journal.
   * @param context.readOnlyApiKeyIndex - Original slot for read-only migrated settlement.
   * @param context.market - Market integerization parameters.
   * @param context.market.marketId - Venue market id.
   * @param context.market.supportedSizeDecimals - Size integerization decimals.
   * @param context.market.supportedPriceDecimals - Price integerization decimals.
   * @param context.accountIndex - Captured account index.
   * @param context.authToken - Captured venue auth token.
   * @param context.generation - Captured session generation.
   * @param context.readActiveRaw - Session-fenced raw active reader.
   * @param context.readInactiveFor - Targeted inactive reader.
   * @param context.nextNonce - Lock-section nonce issuer.
   * @param context.submit - Lock-section submitter.
   * @returns True when fully resolved (journal cleared); false when the
   * obligation remains pending and must be retried.
   */
  readonly #settleTpslObligation = async (context: {
    settlementKey: string;
    symbol: string;
    journalEntry: TpslJournalState;
    readOnlyApiKeyIndex?: number;
    market: {
      marketId: number;
      supportedSizeDecimals: number;
      supportedPriceDecimals: number;
    };
    accountIndex: number;
    authToken: string;
    generation: number;
    readActiveRaw: () => Promise<LighterApiOrder[]>;
    readInactiveFor: (targetClientIds: number[]) => Promise<LighterApiOrder[]>;
    nextNonce: () => Promise<number>;
    submit: (
      txType: number,
      txInfo: string,
      onAccepted?: () => void,
      identity?: {
        txHash: string | null;
        expiresAt: number | null;
        intent?: string;
        owner?: string | null;
        beforeDispatch?: () => Promise<void>;
        onDispatch?: () => void;
      },
    ) => Promise<LighterSendTxResponse>;
  }): Promise<boolean> => {
    const { settlementKey } = context;
    // The ENTIRE same-settlement state machine is serialized
    // PROCESS-WIDE: two live providers resolving the same operation
    // could otherwise both choose and submit identical restores/cancels
    // and overwrite each other's attempt state.
    return await withProcessMutex(
      `lighterTpslSettle:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}`,
      async () => await this.#settleTpslObligationLocked(context),
    );
  };

  /**
   * The settlement machine body — MUST only run under the per-settlement
   * process mutex (see #settleTpslObligation).
   *
   * @param context - See #settleTpslObligation.
   * @param context.settlementKey - Full settlement identity.
   * @param context.symbol - Market symbol.
   * @param context.journalEntry - Caller's journal snapshot (reloaded).
   * @param context.readOnlyApiKeyIndex - Original slot for read-only migrated settlement.
   * @param context.market - Market integerization parameters.
   * @param context.market.marketId - Venue market id.
   * @param context.market.supportedSizeDecimals - Size decimals.
   * @param context.market.supportedPriceDecimals - Price decimals.
   * @param context.accountIndex - Captured account index.
   * @param context.authToken - Captured venue auth token.
   * @param context.generation - Captured session generation.
   * @param context.readActiveRaw - Session-fenced raw active reader.
   * @param context.readInactiveFor - Targeted inactive reader.
   * @param context.nextNonce - Lock-section nonce issuer.
   * @param context.submit - Lock-section submitter.
   * @returns See #settleTpslObligation.
   */
  readonly #settleTpslObligationLocked = async (context: {
    settlementKey: string;
    symbol: string;
    journalEntry: TpslJournalState;
    readOnlyApiKeyIndex?: number;
    market: {
      marketId: number;
      supportedSizeDecimals: number;
      supportedPriceDecimals: number;
    };
    accountIndex: number;
    authToken: string;
    generation: number;
    readActiveRaw: () => Promise<LighterApiOrder[]>;
    readInactiveFor: (targetClientIds: number[]) => Promise<LighterApiOrder[]>;
    nextNonce: () => Promise<number>;
    submit: (
      txType: number,
      txInfo: string,
      onAccepted?: () => void,
      identity?: {
        txHash: string | null;
        expiresAt: number | null;
        intent?: string;
        owner?: string | null;
        beforeDispatch?: () => Promise<void>;
        onDispatch?: () => void;
      },
    ) => Promise<LighterSendTxResponse>;
  }): Promise<boolean> => {
    const {
      settlementKey,
      symbol,
      market,
      accountIndex,
      readActiveRaw,
      readInactiveFor,
      nextNonce,
      submit,
    } = context;
    // RELOAD inside the settlement mutex: the caller's snapshot may have
    // been superseded while waiting for the mutex — decisions must be
    // made on the CURRENT journal of the SAME operation only. Disk is
    // AUTHORITATIVE: absence means another resolver cleared it, so any
    // stale in-memory copy must be dropped, never resurrected.
    const journalEntry = await this.#loadTpslJournal(settlementKey);
    if (!journalEntry) {
      this.#tpslUnsettled.delete(settlementKey);
      return await this.#clearTpslJournal(settlementKey, null).catch(
        () => false,
      );
    }
    if (journalEntry.operationId !== context.journalEntry.operationId) {
      // A different operation owns the journal now: this resolver's
      // obligation no longer exists — report unresolved so the caller
      // re-evaluates against the fresh state.
      return false;
    }
    const successor = await this.#loadRecoverySuccessor(
      settlementKey,
      journalEntry.operationId,
    );
    this.#assertSession(context.generation);
    if (successor && successor.state !== 'failed') {
      return false;
    }
    if (
      journalEntry.sourceRecoveryOperationId &&
      journalEntry.sourceRecoverySettlementKey
    ) {
      const linked = await this.#loadRecoverySuccessor(
        journalEntry.sourceRecoverySettlementKey,
        journalEntry.sourceRecoveryOperationId,
      );
      this.#assertSession(context.generation);
      if (
        linked?.state === 'failed' &&
        linked.successorOperationId === journalEntry.operationId &&
        linked.successorSettlementKey === settlementKey
      ) {
        // Failure retirement may have stopped after its durable marker.
        // Replay only exact cleanup; never retry the failed financial intent.
        await this.#clearTpslJournal(settlementKey, journalEntry.operationId);
        this.#assertSession(context.generation);
        return false;
      }
      if (
        linked?.state === 'settled' &&
        linked.successorOperationId === journalEntry.operationId &&
        linked.successorSettlementKey === settlementKey
      ) {
        await this.#finalizeRecoverySuccessor(linked, context.generation);
        return true;
      }
    }
    // Check before compaction: an empty original attempt list proves no
    // transaction was sent; a compacted list alone would not prove this.
    if (journalEntry.partialIntent && journalEntry.attempts.length === 0) {
      await this.#finishRecoverySuccessor(
        journalEntry,
        'failed',
        journalEntry.sourceRecoveryOperationId ? await readActiveRaw() : [],
        context.generation,
      );
      return await this.#clearTpslJournal(
        settlementKey,
        journalEntry.operationId,
      );
    }
    await this.#assertRecoverySource(journalEntry, context.generation);
    const reconciled = await this.#reconcilePriorTpsl(
      readActiveRaw,
      readInactiveFor,
      accountIndex,
      journalEntry,
      context.readOnlyApiKeyIndex,
    );
    if (reconciled === 'unresolved') {
      return false;
    }
    // Diagnose retained coverage before issuing any remaining cancellations.
    await this.#verifyRetainedRecoveryCoverage(
      journalEntry,
      readActiveRaw,
      readInactiveFor,
    );
    await this.#discardManagedTpslIds(
      settlementKey,
      journalEntry.attempts.flatMap((attempt) =>
        attempt.kind === 'create' &&
        (attempt.neverLanded === true ||
          getLighterTransactionOutcome(attempt.terminalStatus) === 'failed')
          ? attempt.clientIds.map(String)
          : [],
      ),
    );
    const persistEntry = async (): Promise<void> => {
      this.#tpslUnsettled.set(settlementKey, journalEntry);
      await this.#persistTpslJournal(settlementKey, journalEntry);
    };
    // Same journalled cancel discipline as the live transition.
    const submitRecoveryCancel = async (
      orderId: string,
      role: 'stale' | 'rollback',
    ): Promise<void> => {
      if (context.readOnlyApiKeyIndex !== undefined) {
        throw new Error(
          'Read-only original-slot settlement cannot sign a cancellation',
        );
      }
      if (role === 'stale' && journalEntry.intent === 'replace') {
        journalEntry.phase = 'cancelling';
      }
      await this.#assertRecoverySource(journalEntry, context.generation);
      const cancelNonce = await nextNonce();
      const signedCancel = await this.#getSignerBridge().execute({
        function: '_signCancelOrder',
        params: [accountIndex, market.marketId, orderId, cancelNonce],
      });
      if (signedCancel.error) {
        throw new Error(
          `Failed to cancel trigger order ${orderId}: ${signedCancel.error}`,
        );
      }
      const cancelIdentity = requireSignedTxIdentity(signedCancel);
      const cancelAttempt: TpslCancelAttempt = {
        kind: 'cancel',
        attemptId: nextAttemptIdFor(journalEntry),
        nonce: cancelNonce,
        outcome: 'unknown',
        orderId,
        txHash: cancelIdentity.txHash,
        expiresAt: cancelIdentity.expiresAt,
        role,
      };
      journalEntry.attempts.push(cancelAttempt);
      await persistEntry();
      await submit(
        LIGHTER_TX_TYPE_CANCEL_ORDER,
        signedCancel.txInfo,
        () => {
          cancelAttempt.outcome = 'accepted';
        },
        {
          txHash: cancelIdentity.txHash,
          expiresAt: cancelIdentity.expiresAt,
          owner: journalEntry.operationId,
          beforeDispatch: async () =>
            this.#assertRecoverySource(journalEntry, context.generation),
        },
      );
    };
    // Classify every journalled create leg on the books (reconcile
    // proved each attempt either landed or never can).
    const replacementIds = journalEntry.attempts
      .filter(
        (attempt): attempt is TpslCreateAttempt =>
          attempt.kind === 'create' && attempt.role === 'replacement',
      )
      .flatMap((attempt) => attempt.clientIds);
    const restoreAttempts = journalEntry.attempts.filter(
      (attempt): attempt is TpslCreateAttempt =>
        attempt.kind === 'create' && attempt.role === 'restore',
    );
    const allCreateIds = [
      ...replacementIds,
      ...restoreAttempts.flatMap((attempt) => attempt.clientIds),
    ];
    const rawActive = await readActiveRaw();
    const missingFromActive = allCreateIds.filter(
      (clientId) =>
        !rawActive.some(
          (order) => String(order.clientOrderIndex) === String(clientId),
        ),
    );
    const rawInactive =
      missingFromActive.length > 0
        ? await readInactiveFor(missingFromActive)
        : [];
    const stateOf = (clientId: number): 'active' | 'success' | 'failed' => {
      if (
        rawActive.some(
          (order) => String(order.clientOrderIndex) === String(clientId),
        )
      ) {
        return 'active';
      }
      const terminal = rawInactive.find(
        (order) => String(order.clientOrderIndex) === String(clientId),
      );
      if (!terminal) {
        // Reconcile proved never-landed: same outcome as failed.
        return 'failed';
      }
      const status = terminal.status.toLowerCase();
      const fullyExecuted =
        (status === 'filled' || status === 'executed') &&
        parseStrictDecimal(terminal.remainingBaseAmount) === 0;
      return fullyExecuted ? 'success' : 'failed';
    };
    const replacementStates = replacementIds.map(stateOf);
    const anySuccess = replacementStates.includes('success');
    const anyActive = replacementStates.includes('active');
    const anyFailed = replacementStates.includes('failed');
    const priorActive = (prior: TpslPriorTrigger): boolean =>
      rawActive.some((order) => String(order.orderIndex) === prior.orderId);
    const cancelledOrderIds: string[] = [];
    const createdClientIds: number[] = [];
    // Aggregation groups parallel to createdClientIds: one group per
    // create ATTEMPT (grouped OCO semantics within, independence across).
    const createdGroups: number[][] = [];
    const pushCreatedGroup = (group: number[]): void => {
      createdClientIds.push(...group);
      createdGroups.push(group);
    };
    const cancelPriorLeftovers = async (): Promise<void> => {
      // The replacement must STAY proven while the old protection is
      // removed: keep its live ids in the final expectation so a leg
      // terminal-failing DURING these cancels (the phase race) fails
      // this pass instead of clearing the journal naked. Grouped per
      // replacement ATTEMPT: an executed OCO leg legitimately
      // auto-cancels its sibling.
      for (const attempt of journalEntry.attempts) {
        if (attempt.kind !== 'create' || attempt.role !== 'replacement') {
          continue;
        }
        const activeLegs = attempt.clientIds.filter(
          (clientId) => stateOf(clientId) === 'active',
        );
        if (activeLegs.length > 0) {
          pushCreatedGroup(attempt.clientIds);
        }
      }
      for (const prior of journalEntry.priorTriggers) {
        if (priorActive(prior)) {
          await submitRecoveryCancel(prior.orderId, 'stale');
          cancelledOrderIds.push(prior.orderId);
        }
      }
    };
    const rollbackActiveJournalledLegs = async (
      legIds: number[],
    ): Promise<void> => {
      for (const clientId of legIds) {
        if (stateOf(clientId) !== 'active') {
          continue;
        }
        const survivor = rawActive.find(
          (order) => String(order.clientOrderIndex) === String(clientId),
        );
        if (survivor) {
          await submitRecoveryCancel(String(survivor.orderIndex), 'rollback');
          cancelledOrderIds.push(String(survivor.orderIndex));
        }
      }
    };
    const rollbackActiveReplacements = async (): Promise<void> =>
      await rollbackActiveJournalledLegs(replacementIds);
    // COMPACTION: proven-resolved attempts with no live effect and no
    // coverage are dropped so repeated retries can never dead-end at the
    // attempt cap: FAILED restore creates (never landed/terminal-failed)
    // and resolved cancels (target gone, or proven never-landed).
    const compactionNow = Date.now();
    journalEntry.attempts = journalEntry.attempts.filter((attempt) => {
      if (attempt.kind === 'create') {
        return (
          attempt.role !== 'restore' ||
          attempt.clientIds.some((clientId) => stateOf(clientId) !== 'failed')
        );
      }
      const targetGone = !rawActive.some(
        (order) => String(order.orderIndex) === attempt.orderId,
      );
      const provenNeverLanded =
        attempt.outcome === 'unknown' &&
        compactionNow > attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS;
      // Accepted-but-terminal-FAILED cancels (venue status 0) landed
      // without mutating the books: proven-resolved, compactable.
      const landedTerminalFailed =
        getLighterTransactionOutcome(attempt.terminalStatus) === 'failed';
      return !(targetGone || provenNeverLanded || landedTerminalFailed);
    });
    // NO AUTOMATIC RESTORE: the venue exposes no atomic primitive that
    // could prove a re-created trigger attaches to the SAME position
    // lifecycle, so a fully-failed replacement after old cancels parks
    // the journal in a DURABLE 'manual' state — surfaced via
    // `getPendingManualRecoveries` and resolved only by an explicit NEW
    // protection intent from the user. Never restored, never silently
    // cleared.
    const parkManual = async (reason: string): Promise<boolean> => {
      // Survivors: prior triggers still on the books + replacement legs
      // still active — deliberately LEFT (only remaining protection).
      const survivingOrderIds = [
        ...new Set([
          ...journalEntry.priorTriggers
            .filter((prior) => priorActive(prior))
            .map((prior) => prior.orderId),
          ...rawActive
            .filter((order) =>
              replacementIds.some(
                (clientId) =>
                  String(order.clientOrderIndex) === String(clientId),
              ),
            )
            .map((order) => String(order.orderIndex)),
        ]),
      ];
      // The DURABLE warning lives in its own doc; the journal slot is
      // released so a successor protection intent can run. The doc
      // clears only after a successor SUCCEEDS.
      if (journalEntry.sourceRecoveryOperationId) {
        await this.#finishRecoverySuccessor(
          journalEntry,
          'failed',
          rawActive,
          context.generation,
        );
      } else {
        await this.#writeTpslManualRecovery({
          settlementKey,
          symbol,
          reason,
          partialIntent: journalEntry.partialIntent,
          priorIntent: journalEntry.intent,
          priorTriggers: journalEntry.priorTriggers,
          survivingOrderIds,
          operationId: journalEntry.operationId,
          recordedAt: Date.now(),
        });
      }
      this.#deps.debugLogger.log(
        '[LighterProvider] TP/SL protection requires MANUAL re-establishment',
        { settlementKey, reason },
      );
      await this.#clearTpslJournal(
        settlementKey,
        journalEntry.operationId,
        await readActiveRaw(),
      );
      return true;
    };
    if (
      journalEntry.partialIntent?.version === 2 &&
      (anyFailed ||
        journalEntry.partialIntent.orders.some(
          (order) => !replacementIds.includes(order[1]),
        ))
    ) {
      return await parkManual(
        'Independent protection was not fully established; surviving legs require explicit current-position recovery',
      );
    }
    if (context.readOnlyApiKeyIndex !== undefined) {
      const hasPriorSurvivors = journalEntry.priorTriggers.some(priorActive);
      const replacementWon = anySuccess || (anyActive && !anyFailed);
      const needsPriorCleanup =
        hasPriorSurvivors &&
        (journalEntry.intent === 'remove' ||
          (journalEntry.phase === 'creating' &&
            replacementIds.length > 0 &&
            replacementWon) ||
          (journalEntry.phase === 'cancelling' && replacementWon));
      const needsRollback =
        journalEntry.intent === 'replace' &&
        journalEntry.phase === 'creating' &&
        !anySuccess &&
        anyFailed &&
        anyActive;
      if (needsPriorCleanup || needsRollback) {
        return await parkManual(
          'An earlier trading key completed its dispatched attempts but further protection changes require a new explicit request; surviving orders were preserved',
        );
      }
    }
    if (journalEntry.phase === 'manual') {
      if (
        journalEntry.intent === 'remove' &&
        !journalEntry.priorTriggers.some(priorActive)
      ) {
        // Reconciliation above settled every actual attempt. Confirm the
        // removed targets remain absent in a fresh complete book before
        // retiring their obligation, without authorizing another cancel.
        const settledActive = await readActiveRaw();
        if (
          journalEntry.priorTriggers.some((prior) =>
            settledActive.some(
              (order) => String(order.orderIndex) === prior.orderId,
            ),
          )
        ) {
          return false;
        }
        // Clear the obsolete warning first: if storage fails, the journal
        // survives so a later read/restart can finish this same cleanup.
        await this.#clearTpslManualRecovery(settlementKey);
        return await this.#clearTpslJournal(
          settlementKey,
          journalEntry.operationId,
          settledActive,
        );
      }
      // Reconciled manual journals release only their settlement slot.
      // Keep surviving protection in the durable warning for explicit action.
      return await parkManual(
        journalEntry.intent === 'remove'
          ? TPSL_GUARDED_REMOVAL_REVIEW_REASON
          : 'TP/SL protection could not be safely re-established automatically (parked by an earlier session)',
      );
    }
    if (journalEntry.intent === 'remove') {
      // An intentional REMOVAL is never "recovered" by restoring the
      // cancelled protection: finish/reconcile the cancels exactly.
      for (const prior of journalEntry.priorTriggers) {
        if (priorActive(prior)) {
          await submitRecoveryCancel(prior.orderId, 'stale');
          cancelledOrderIds.push(prior.orderId);
        }
      }
    } else if (journalEntry.phase === 'creating') {
      // Old protection untouched. Nothing landed / everything failed
      // → the old set is still the only intent: just clear.
      if (replacementIds.length > 0 && (anySuccess || anyActive)) {
        if (!anySuccess && anyFailed) {
          // Partial OCO before old cancels: roll surviving legs back so
          // the OLD protection remains authoritative.
          await rollbackActiveReplacements();
        } else {
          // Replacement in force (or executed): finish the swap.
          await cancelPriorLeftovers();
        }
      }
    } else if (journalEntry.phase === 'cancelling') {
      if (anySuccess || (anyActive && !anyFailed)) {
        // Replacement fully won — finish cancelling the old protection.
        await cancelPriorLeftovers();
      } else {
        // Replacement fully failed (or degraded to a partial set) AFTER
        // old cancels began: the position's protection can no longer be
        // proven — park durably for MANUAL re-establishment. Any
        // surviving leg is deliberately LEFT (it is the only protection
        // remaining); nothing is restored.
        return await parkManual(
          'Replacement TP/SL orders failed after the previous protection cancels began; the position may be under-protected',
        );
      }
    }
    if (cancelledOrderIds.length > 0 || createdClientIds.length > 0) {
      const settled = await this.#awaitTpslVisibility(
        readActiveRaw,
        readInactiveFor,
        { createdClientIds, cancelledOrderIds },
        // PER-ATTEMPT groups: a grouped OCO replacement's executed leg
        // legitimately auto-cancels its sibling.
        { createdGroups },
      );
      // ONLY a fully-settled pass may clear; a replacement dying DURING
      // the old cancels parks for manual re-establishment.
      if (settled.outcome === 'timeout') {
        return false;
      }
      if (settled.outcome === 'created-terminal-failed') {
        return await parkManual(
          'Replacement TP/SL order was cancelled or rejected by the venue after the previous protection was already removed',
        );
      }
    }
    // Persist terminal successor disposition before journal removal so a
    // restarted caller cannot replay an already completed explicit intent.
    await this.#verifyRetainedRecoveryCoverage(
      journalEntry,
      readActiveRaw,
      readInactiveFor,
    );
    await this.#finishRecoverySuccessor(
      journalEntry,
      journalEntry.intent === 'remove' ||
        anySuccess ||
        (anyActive && !anyFailed)
        ? 'settled'
        : 'failed',
      await readActiveRaw(),
      context.generation,
    );
    // A refused clear (superseded by a newer operation) is UNRESOLVED —
    // never reported as success.
    return await this.#clearTpslJournal(
      settlementKey,
      journalEntry.operationId,
      await readActiveRaw(),
    );
  };

  /**
   * Reconcile a PRIOR transition's expectation before any new mutation.
   * Only created ids can cause duplicates from a stale snapshot, so they
   * must be accounted for (active or terminal). Cancelled ids are safe in
   * either state: still-active targets reappear in the fresh snapshot and
   * are re-cancelled.
   *
   * @param readActiveRaw - Strict raw active-orders reader.
   * @param readInactive - Targeted inactive-history reader (cached, bounded).
   * @param accountIndex - Captured account index.
   * @param entry - The recorded expectation.
   * @param entry.attempts - Journalled per-attempt submissions.
   * @param entry.recordedAt - When the journal was recorded (ms).
   * @param apiKeyIndex - Original attempt slot, independent of the successor key.
   * @returns 'resolved' when safe to proceed; 'unresolved' when an
   * ACCEPTED mutation is still not visible.
   */
  readonly #reconcilePriorTpsl = async (
    readActiveRaw: () => Promise<LighterApiOrder[]>,
    readInactive: (targetClientIds: number[]) => Promise<LighterApiOrder[]>,
    accountIndex: number,
    entry: { attempts: TpslAttempt[]; recordedAt: number },
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<'resolved' | 'unresolved'> => {
    const generation = this.#sessionGeneration;
    this.#assertSession(generation);
    for (const attempt of entry.attempts) {
      if (attempt.kind === 'create') {
        delete attempt.neverLanded;
      }
    }
    // Per-attempt reconciliation, authoritative and never time-guessed:
    // 1. Books first — a create is resolved when its ids are all
    //    active/terminal, a cancel when its target left the active book.
    // 2. Otherwise the EXACT signed tx hash is looked up: a strict match
    //    (hash + account + api key slot + nonce) proves the payload
    //    reached the sequencer, so absence from the books can only be
    //    visibility lag (keep blocking). A venue-confirmed not-found is
    //    only never-landed once the signed ExpiredAt (+ clock slack) has
    //    passed — the sequencer cannot accept an expired payload.
    const satisfiedOnBooks = (
      attempt: TpslAttempt,
      rawActive: LighterApiOrder[],
      rawInactive: LighterApiOrder[],
    ): boolean =>
      attempt.kind === 'create'
        ? attempt.clientIds.every(
            (clientId) =>
              rawActive.some(
                (order) => String(order.clientOrderIndex) === String(clientId),
              ) ||
              rawInactive.some(
                (order) => String(order.clientOrderIndex) === String(clientId),
              ),
          )
        : !rawActive.some(
            (order) => String(order.orderIndex) === attempt.orderId,
          );
    // Books can satisfy only OBSERVED-accepted attempts. An UNKNOWN
    // attempt's desired book state may hold for INDEPENDENT reasons (a
    // fill, an external cancel) while the signed payload could still
    // land later and consume its nonce — every unknown attempt must
    // resolve by exact hash identity or proven expiry.
    let rawActive: LighterApiOrder[] = [];
    let rawInactive: LighterApiOrder[] = [];
    for (let poll = 0; poll < LIGHTER_TPSL_SETTLE_ATTEMPTS; poll += 1) {
      const activeNow = await readActiveRaw();
      // ACTIVE-FIRST (see #awaitTpslVisibility): inactive history is only
      // consulted for create ids not already visible active.
      const createIdsMissingFromActive = entry.attempts
        .filter(
          (attempt): attempt is TpslCreateAttempt => attempt.kind === 'create',
        )
        .flatMap((attempt) => attempt.clientIds)
        .filter(
          (clientId) =>
            !activeNow.some(
              (order) => String(order.clientOrderIndex) === String(clientId),
            ),
        );
      const inactiveNow =
        createIdsMissingFromActive.length > 0
          ? await readInactive(createIdsMissingFromActive)
          : [];
      rawActive = activeNow;
      rawInactive = inactiveNow;
      // Poll the books through visibility lag for ALL attempts — book
      // convergence resolves accepted attempts directly and lets an
      // unknown-but-landed attempt pass its final identity check below.
      const anyUnsatisfied = entry.attempts.some(
        (attempt) => !satisfiedOnBooks(attempt, activeNow, inactiveNow),
      );
      if (!anyUnsatisfied) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, LIGHTER_TPSL_SETTLE_POLL_MS),
      );
    }
    for (const attempt of entry.attempts) {
      if (
        attempt.outcome === 'accepted' &&
        satisfiedOnBooks(attempt, rawActive, rawInactive)
      ) {
        continue;
      }
      let lookedUp: LighterTxLookupResponse | null;
      try {
        lookedUp = await this.#clientService.getTx(attempt.txHash);
        this.#assertSession(generation);
      } catch {
        // Lookup failure is AMBIGUOUS, never evidence of non-acceptance.
        return 'unresolved';
      }
      if (lookedUp !== null) {
        // The exact signed hash exists at the venue. With a matching
        // identity (hash + account + api key slot + nonce):
        //  - terminal FAILED status (0) resolves the attempt
        //    deterministically — the nonce was consumed but the books
        //    were never mutated (the machine re-acts on book state);
        //  - executed (2) or pending-final (3) with books reflecting the
        //    attempt resolves it;
        //  - otherwise it reached the sequencer but is not yet visible —
        //    keep blocking. A NON-matching payload under this hash fails
        //    closed identically, and is logged (signer/venue defect).
        const matchesIdentity =
          typeof lookedUp.hash === 'string' &&
          lookedUp.hash.toLowerCase().replace(/^0x/u, '') ===
            attempt.txHash.toLowerCase().replace(/^0x/u, '') &&
          lookedUp.accountIndex === accountIndex &&
          lookedUp.apiKeyIndex === apiKeyIndex &&
          lookedUp.nonce === attempt.nonce;
        if (!matchesIdentity) {
          this.#deps.debugLogger.log(
            '[LighterProvider] TP/SL tx lookup identity mismatch; failing closed',
            { txHash: attempt.txHash },
          );
          return 'unresolved';
        }
        const transactionOutcome = getLighterTransactionOutcome(
          lookedUp.status,
        );
        if (transactionOutcome === 'failed') {
          // Record the terminal venue status durably (next persist):
          // compaction can then drop this attempt even though its target
          // may still be on the books.
          attempt.terminalStatus = lookedUp.status;
          continue;
        }
        if (
          (transactionOutcome === 'executed' ||
            transactionOutcome === 'pending-final') &&
          satisfiedOnBooks(attempt, rawActive, rawInactive)
        ) {
          continue;
        }
        // Executed proves the transaction landed, but the order books may
        // still lag. Keep the journal until the expected create/cancel state
        // is visible.
        return 'unresolved';
      }
      // Venue-confirmed not-found: only never-landed once the signed
      // payload can no longer be accepted.
      if (
        attempt.outcome === 'accepted' ||
        Date.now() <= attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
      ) {
        // Observed acceptance cannot become never-landed due to a later
        // missing lookup or book lag. Retain its obligation until proven.
        return 'unresolved';
      }
      if (attempt.kind === 'create') {
        attempt.neverLanded = true;
      }
      // Expired and venue-confirmed absent: authoritatively never landed —
      // its reserved nonce may be released UNLESS a later dispatch (a
      // retry) already consumed it (durable consumed watermark guards).
      this.#assertSession(generation);
      await this.#releaseNonceReservationIfUnconsumed(
        accountIndex,
        attempt.nonce,
        apiKeyIndex,
      );
    }
    return 'resolved';
  };

  /**
   * Release a session-global nonce reservation once a submission is
   * PROVEN never-landed. Only the topmost reservation can be safely
   * lowered; anything else stays reserved until proven in turn.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param nonce - The proven-unconsumed nonce.
   */
  readonly #releaseNonceReservation = (
    accountIndex: number,
    nonce: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): void => {
    const reservationKey = `${accountIndex}:${apiKeyIndex}`;
    if (this.#nonceReservations.get(reservationKey) === nonce + 1) {
      this.#nonceReservations.set(reservationKey, nonce);
    }
  };

  /**
   * Bounded poll until the venue reflects a TP/SL transition: every
   * created client id accounted for and every cancelled order id absent
   * from the active book.
   *
   * A created trigger can EXECUTE, expire, or be venue-cancelled before
   * the first poll (an immediate/crossed TP/SL never rests), so created
   * ids reconcile against the active book PLUS the inactive/terminal
   * history — otherwise the obligation could never resolve and would
   * permanently block the symbol.
   *
   * @param readActiveRaw - Strict raw active-orders reader (session-fenced).
   * @param readInactive - Targeted inactive-history reader (cached, bounded).
   * @param expectation - Ids the venue must account for.
   * @param expectation.createdClientIds - Client ids that must be active
   * or terminal.
   * @param expectation.cancelledOrderIds - Order ids that must leave the
   * active book.
   * @param options - Aggregation options.
   * @param options.createdGroups - Per-attempt aggregation groups over
   * the created ids (see inline doc).
   * @param options.receiptIdentity - Account and market bound to a new receipt.
   * @returns Outcome: 'settled' when every id is accounted for and no
   * created id failed ('executedCreated' marks created ids that reached a
   * SUCCESS terminal state — filled/executed — instead of resting
   * active); 'created-terminal-failed' when the venue reports a created
   * id cancelled/rejected/expired (the obligation RESOLVES — the caller
   * surfaces the failure but no permanent block remains); 'timeout' when
   * the bound elapsed unresolved.
   */
  readonly #awaitTpslVisibility = async (
    readActiveRaw: () => Promise<LighterApiOrder[]>,
    readInactive: (targetClientIds: number[]) => Promise<LighterApiOrder[]>,
    expectation: { createdClientIds: number[]; cancelledOrderIds: string[] },
    options: {
      /**
       * PER-ATTEMPT aggregation groups over `createdClientIds`: within a
       * group, grouped-OCO semantics hold (one fully executed leg
       * legitimately auto-cancels its sibling — the GROUP succeeded);
       * ACROSS groups every group must independently succeed or rest
       * active. Omitted: all created ids form one group (legacy grouped
       * semantics).
       */
      createdGroups?: number[][];
      /** Require exact venue IDs for the current operation receipt. */
      receiptIdentity?: { accountIndex: number; marketIndex: number };
    } = {},
  ): Promise<
    | { outcome: 'settled'; executedCreated: boolean; childOrderIds: string[] }
    | {
        outcome: 'created-terminal-failed';
        /** New legs still resting ACTIVE despite a failed sibling. */
        survivingActiveClientIds: number[];
      }
    | { outcome: 'timeout' }
  > => {
    for (
      let attempt = 0;
      attempt < LIGHTER_TPSL_SETTLE_ATTEMPTS;
      attempt += 1
    ) {
      const rawActive = await readActiveRaw();
      // ACTIVE-FIRST: only ids not already proven active need the
      // high-weight inactive-history lookup; a normal freshly-active
      // replacement performs ZERO inactive requests.
      const missingFromActive = expectation.createdClientIds.filter(
        (clientId) =>
          !rawActive.some(
            (order) => String(order.clientOrderIndex) === String(clientId),
          ),
      );
      const rawInactive =
        missingFromActive.length > 0
          ? await readInactive(missingFromActive)
          : [];
      const childOrderIds: string[] = [];
      if (options.receiptIdentity) {
        for (const clientId of expectation.createdClientIds) {
          const active = rawActive.filter(
            (row) => String(row.clientOrderIndex) === String(clientId),
          );
          const matches =
            active.length > 0
              ? active
              : rawInactive.filter(
                  (row) => String(row.clientOrderIndex) === String(clientId),
                );
          if (matches.length === 0) {
            continue; // Existing settlement polling retains the obligation.
          }
          const [row] = matches;
          if (
            matches.length !== 1 ||
            row.ownerAccountIndex !== options.receiptIdentity.accountIndex ||
            row.marketIndex !== options.receiptIdentity.marketIndex ||
            !Number.isSafeInteger(row.orderIndex) ||
            row.orderIndex <= 0 ||
            childOrderIds.includes(String(row.orderIndex))
          ) {
            throw new Error(
              'Lighter TP/SL receipt identity is invalid or ambiguous',
            );
          }
          childOrderIds.push(String(row.orderIndex));
        }
      }
      // Per-id classification. Success is EXACT-whitelisted
      // ('filled'/'executed') AND requires a strictly ZERO remaining size
      // (a 'filled' row with remainder is not a proven execution);
      // everything else terminal — including unknown statuses — fails
      // CLOSED.
      const classified = expectation.createdClientIds.map((clientId) => {
        if (
          rawActive.some(
            (order) => String(order.clientOrderIndex) === String(clientId),
          )
        ) {
          return { clientId, state: 'active' as const };
        }
        const terminal = rawInactive.find(
          (order) => String(order.clientOrderIndex) === String(clientId),
        );
        if (!terminal) {
          return { clientId, state: 'missing' as const };
        }
        const status = terminal.status.toLowerCase();
        // STRICT remaining parse: a prefix-parsed '0oops' must never
        // count as a proven zero remainder.
        const fullyExecuted =
          (status === 'filled' || status === 'executed') &&
          parseStrictDecimal(terminal.remainingBaseAmount) === 0;
        return {
          clientId,
          state: fullyExecuted ? ('success' as const) : ('failed' as const),
        };
      });
      const createdAccounted = !classified.some(
        (entry) => entry.state === 'missing',
      );
      const cancelledGone = expectation.cancelledOrderIds.every(
        (orderId) =>
          !rawActive.some((order) => String(order.orderIndex) === orderId),
      );
      if (createdAccounted && cancelledGone) {
        // PER-GROUP aggregation: within a group one fully executed leg
        // auto-cancels its sibling (grouped OCO — the GROUP succeeded);
        // across groups each must independently succeed or rest active.
        const groups =
          options.createdGroups ??
          (expectation.createdClientIds.length > 0
            ? [expectation.createdClientIds]
            : []);
        const stateOfId = new Map(
          classified.map((entry) => [entry.clientId, entry.state]),
        );
        let anyGroupSuccess = false;
        const failedGroupActiveIds: number[] = [];
        let anyGroupFailed = false;
        for (const group of groups) {
          const states = group.map(
            (clientId) => stateOfId.get(clientId) ?? 'missing',
          );
          if (states.includes('success')) {
            anyGroupSuccess = true;
            continue;
          }
          if (states.includes('failed')) {
            anyGroupFailed = true;
            failedGroupActiveIds.push(
              ...group.filter(
                (clientId) => stateOfId.get(clientId) === 'active',
              ),
            );
          }
        }
        if (anyGroupFailed) {
          return {
            outcome: 'created-terminal-failed',
            survivingActiveClientIds: failedGroupActiveIds,
          };
        }
        return {
          outcome: 'settled',
          executedCreated: anyGroupSuccess,
          childOrderIds,
        };
      }
      await new Promise((resolve) =>
        setTimeout(resolve, LIGHTER_TPSL_SETTLE_POLL_MS),
      );
    }
    return { outcome: 'timeout' };
  };

  /**
   * Throws when the session generation moved past the captured one — used
   * after every await in account-bound async work so a delayed account-A
   * step can never mutate account-B's session.
   *
   * @param generation - Generation captured when the work started.
   */
  readonly #assertSession = (generation: number): void => {
    if (this.#isDisconnected) {
      throw new LighterSessionCancelledError(
        'the Lighter provider was disconnected',
      );
    }
    if (generation !== this.#sessionGeneration) {
      throw new LighterSessionCancelledError(
        'the wallet switched accounts (or the signer reset) while this operation was in flight',
      );
    }
    // The generation only advances when some provider call rebinds; also
    // notice a wallet switch nothing has observed yet. Account-bound work
    // must never run without a binding: every legitimate flow (including
    // configured-index setups) binds first, so a null binding here means the
    // wallet was deselected — fail closed even when a configured account
    // index could still resolve.
    if (this.#boundAddress === null) {
      throw new LighterSessionCancelledError(
        'no wallet account is bound to the venue session',
      );
    }
    let address: string | null = null;
    try {
      address = this.#walletService.getUserAddress().toLowerCase();
    } catch {
      address = null;
    }
    if (address !== this.#boundAddress) {
      if (address === null) {
        // Deselected: nothing to rebind to yet.
        this.#invalidateSessionState();
        this.#teardownStream();
      } else {
        // Unobserved switch: rebind properly (invalidates caches and
        // rebuilds stream channels for the new account) before cancelling
        // the stale operation.
        this.#ensureSessionBinding();
      }
      throw new LighterSessionCancelledError(
        'the wallet switched accounts (or the signer reset) while this operation was in flight',
      );
    }
  };

  /** Drop every cache derived from the previously bound account. */
  readonly #invalidateSessionState = (): void => {
    this.#interruptChase();
    this.#sessionGeneration += 1;
    this.#boundAddress = null;
    this.#accountIndex = null;
    this.#apiKeyIndex = this.#preferredApiKeyIndex;
    this.#signerReadyPromise = null;
    this.#readyApiKeyIndex = null;
    this.#authToken = null;
    this.#clearBridgeOwnership();
    // #tpslUnsettled survives (address+accountIndex+symbol keyed): a
    // reselect of the same account must still reconcile its pending ids.
  };

  /**
   * Create the WASM signer client and register the venue key if the
   * account's key slot does not hold it yet. Deduplicated.
   *
   * @returns Resolves when the signer session is ready.
   */
  readonly #ensureSignerReady = async (): Promise<void> => {
    this.#ensureSessionBinding();
    this.#assertSession(this.#sessionGeneration);
    if (this.#signerReadyPromise) {
      return await this.#signerReadyPromise;
    }
    const generation = this.#sessionGeneration;
    this.#readyApiKeyIndex = null;
    const setupPromise = this.#setupSigner(generation);
    this.#signerReadyPromise = setupPromise;
    try {
      return await setupPromise;
    } catch (error) {
      // Only clear the promise WE installed — a newer session may already
      // have replaced it, and an old rejection must not tear that down.
      if (this.#signerReadyPromise === setupPromise) {
        this.#signerReadyPromise = null;
        this.#readyApiKeyIndex = null;
        this.#apiKeyIndex = this.#preferredApiKeyIndex;
        this.#clearBridgeOwnership();
      }
      throw error;
    }
  };

  /**
   * Account-scoped storage is independent of whichever slot setup selects.
   * @param accountIndex - Venue account that owns the pending registration.
   * @returns Wallet/network/account-scoped storage key.
   */
  readonly #pendingKeyRegistrationKey = (accountIndex: number): string =>
    `lighterKeyRegistration:${this.#isTestnet ? 'testnet' : 'mainnet'}:${this.#boundAddress}:${accountIndex}`;

  /**
   * Load the outstanding registration before choosing any unused slot.
   * @param accountIndex - Captured venue account.
   * @returns Valid durable identity, or null when no registration is pending.
   */
  readonly #loadPendingKeyRegistration = async (
    accountIndex: number,
  ): Promise<LighterPendingKeyRegistration | null> => {
    let raw: string | null;
    try {
      raw = await this.#deps.diskCache.getItem(
        this.#pendingKeyRegistrationKey(accountIndex),
      );
    } catch (error) {
      throw new Error(
        `Lighter pending key registration read failed: ${ensureError(error, 'LighterProvider.#loadPendingKeyRegistration').message}`,
      );
    }
    if (raw === null) {
      return null;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(
        'Lighter pending key registration is corrupt; resolve storage before reconnecting',
      );
    }
    if (typeof value === 'object' && value !== null) {
      const doc = value as Record<string, unknown>;
      if (
        doc.version === 1 &&
        doc.accountIndex === accountIndex &&
        typeof doc.apiKeyIndex === 'number' &&
        Number.isSafeInteger(doc.apiKeyIndex) &&
        doc.apiKeyIndex >= LIGHTER_MIN_TRADING_API_KEY_INDEX &&
        doc.apiKeyIndex <= LIGHTER_MAX_TRADING_API_KEY_INDEX &&
        typeof doc.publicKey === 'string' &&
        /^[0-9a-f]{80}$/u.test(doc.publicKey) &&
        typeof doc.txHash === 'string' &&
        /^(0x)?[0-9a-fA-F]{8,128}$/u.test(doc.txHash) &&
        typeof doc.nonce === 'number' &&
        Number.isSafeInteger(doc.nonce) &&
        doc.nonce >= 0 &&
        typeof doc.expiresAt === 'number' &&
        Number.isSafeInteger(doc.expiresAt) &&
        doc.expiresAt > 0 &&
        typeof doc.accepted === 'boolean'
      ) {
        return {
          version: 1,
          accountIndex,
          apiKeyIndex: doc.apiKeyIndex,
          publicKey: doc.publicKey,
          txHash: doc.txHash,
          nonce: doc.nonce,
          expiresAt: doc.expiresAt,
          accepted: doc.accepted,
        };
      }
    }
    throw new Error(
      'Lighter pending key registration is corrupt; resolve storage before reconnecting',
    );
  };

  /**
   * Reconcile an invisible registration without signing or changing slots.
   * Caller holds the account write mutex. Accepted registrations never become
   * retryable merely because a later transaction lookup cannot find them.
   * @param pending - Exact durable registration identity.
   * @param generation - Captured wallet session.
   */
  readonly #reconcilePendingKeyRegistration = async (
    pending: LighterPendingKeyRegistration,
    generation: number,
  ): Promise<void> => {
    const tx = await this.#clientService.getTx(pending.txHash);
    this.#assertSession(generation);
    const matches =
      tx !== null &&
      tx.hash?.toLowerCase().replace(/^0x/u, '') ===
        pending.txHash.toLowerCase().replace(/^0x/u, '') &&
      tx.accountIndex === pending.accountIndex &&
      tx.apiKeyIndex === pending.apiKeyIndex &&
      tx.nonce === pending.nonce;
    const failed =
      matches && getLighterTransactionOutcome(tx.status) === 'failed';
    if (
      matches &&
      getLighterTransactionOutcome(tx.status) === 'executed' &&
      !pending.accepted
    ) {
      // Retain the strongest observed outcome before another reconnect can
      // mistake expired index absence for proof that this registration failed.
      pending.accepted = true;
      await this.#deps.diskCache.setItem(
        this.#pendingKeyRegistrationKey(pending.accountIndex),
        JSON.stringify(pending),
      );
      this.#assertSession(generation);
    }

    let expiredUnsent = false;
    if (
      !pending.accepted &&
      tx === null &&
      Date.now() > pending.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
    ) {
      const ledger = await this.#readNonceLedger(
        pending.accountIndex,
        pending.apiKeyIndex,
      );
      this.#assertSession(generation);
      expiredUnsent =
        ledger.consumedFloor <= pending.nonce &&
        !ledger.recovered.some(
          (entry) =>
            entry.txHash === pending.txHash && entry.outcome !== 'failed',
        );
    }
    if (failed || expiredUnsent) {
      await this.#deps.diskCache.removeItem(
        this.#pendingKeyRegistrationKey(pending.accountIndex),
      );
      this.#assertSession(generation);
      return;
    }
    throw new Error(
      'Lighter trading key registration is still pending; reconnect to check its status',
    );
  };

  /**
   * Find local keys first, then unused slots. Never replace a venue key.
   *
   * @param accountIndex - Venue account whose local keys may be reused.
   * @param generation - Session captured before storage and venue reads.
   * @returns Locally persisted slots followed by unused trading slots.
   */
  readonly #signerCandidates = async (
    accountIndex: number,
    generation: number,
  ): Promise<number[]> => {
    const pending = await this.#loadPendingKeyRegistration(accountIndex);
    this.#assertSession(generation);
    if (pending) {
      return [pending.apiKeyIndex];
    }
    const bridge = this.#getSignerBridge();
    const discoverKeys =
      bridge.getRecoverableKeyIndices?.bind(bridge) ??
      bridge.getStoredKeyIndices?.bind(bridge);
    if (!discoverKeys) {
      return [this.#preferredApiKeyIndex];
    }
    const response = await this.#clientService.getApiKeys(accountIndex);
    this.#assertSession(generation);
    const occupied = new Set(response.apiKeys.map((key) => key.apiKeyIndex));
    const requested = [
      ...new Set([this.#preferredApiKeyIndex, ...occupied]),
    ].filter(
      (index) =>
        Number.isSafeInteger(index) &&
        index >= LIGHTER_MIN_TRADING_API_KEY_INDEX &&
        index <= LIGHTER_MAX_TRADING_API_KEY_INDEX,
    );
    const stored = await discoverKeys({
      chainId: getLighterChainId(this.#clientService.network),
      accountIndex,
      apiKeyIndices: requested,
      walletAddress: this.#boundAddress ?? undefined,
    });
    this.#assertSession(generation);
    if (stored.some((index) => !requested.includes(index))) {
      throw new Error('Lighter signer returned an unrequested key slot');
    }
    const unused = Array.from(
      { length: LIGHTER_TRADING_API_KEY_COUNT },
      (_, index) => index + LIGHTER_MIN_TRADING_API_KEY_INDEX,
    ).filter((index) => !occupied.has(index));
    if (
      stored.length === 0 &&
      occupied.has(this.#preferredApiKeyIndex) &&
      unused.length > 0
    ) {
      throw new Error(
        'No recoverable Lighter trading key is available from this wallet or local storage. Use an existing registered device.',
      );
    }
    // Wallet-derived recovery uses a stable free-slot order. Storage-only
    // discovery rotates unused slots; venue public keys are always checked.
    const offset = bridge.getRecoverableKeyIndices
      ? 0
      : Math.floor(Math.random() * unused.length);
    const randomized = [...unused.slice(offset), ...unused.slice(0, offset)];
    return [
      ...new Set([
        ...stored.filter((index) => occupied.has(index)),
        ...stored.filter((index) => !occupied.has(index)),
        ...(requested.includes(this.#preferredApiKeyIndex) &&
        !occupied.has(this.#preferredApiKeyIndex)
          ? [this.#preferredApiKeyIndex]
          : []),
        ...randomized,
      ]),
    ];
  };

  readonly #setupSigner = async (generation: number): Promise<void> => {
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    // Keep discovery and allocation together across provider lifetimes. The
    // inner venue lock separately protects each candidate's financial writes.
    await withProcessMutex(
      `lighterKeySetup:${this.#clientService.network}:${accountIndex}`,
      async () => this.#setupSignerForAccount(accountIndex, generation),
    );
  };

  /**
   * Select and settle a key while holding the account setup mutex.
   * @param accountIndex - Venue account bound to this setup.
   * @param generation - Wallet session captured before waiting for the mutex.
   */
  readonly #setupSignerForAccount = async (
    accountIndex: number,
    generation: number,
  ): Promise<void> => {
    this.#assertSession(generation);
    const bridge = this.#getSignerBridge();
    const chainId = getLighterChainId(this.#clientService.network);
    const candidates = await this.#signerCandidates(accountIndex, generation);
    for (const apiKeyIndex of candidates) {
      let candidateNonce = 0;
      let changePubKeyBody = '';
      let candidateStatus: 'available' | 'matching' = 'matching';
      // Inspect identity under the same slot and bridge locks as writes.
      // An unrelated key's ledger must not block discovery of our key.
      const ready = await this.#withVenueWriteLock(
        accountIndex,
        async (nextNonce, submit) => {
          if (candidateStatus === 'available') {
            // Reconciliation can raise the nonce floor. The registration
            // plaintext must bind to the safe nonce, not the probe's seed.
            const nonce = await nextNonce();
            if (nonce !== candidateNonce) {
              const created = await bridge.createClient({
                chainId,
                accountIndex,
                nonce,
                apiKeyIndex,
                walletAddress: this.#boundAddress ?? undefined,
              });
              this.#assertSession(generation);
              if (
                created.error ||
                !created.success ||
                created.pk !== this.#venuePublicKey
              ) {
                throw new Error(
                  'Lighter signer identity changed during registration preparation',
                );
              }
              changePubKeyBody = created.body;
            }
            await this.#registerVenueKey(
              accountIndex,
              changePubKeyBody,
              generation,
              async () => nonce,
              submit,
            );
            this.#assertSession(generation);
            if (bridge.getRecoverableKeyIndices || bridge.getStoredKeyIndices) {
              await this.#waitForRegisteredKey(accountIndex, generation);
            }
          }
          return true;
        },
        generation,
        apiKeyIndex,
        async () => {
          // Candidate selection can race a second provider's completed setup.
          // Recheck under the account mutex before creating or registering a key.
          const pending = await this.#loadPendingKeyRegistration(accountIndex);
          this.#assertSession(generation);
          if (pending && pending.apiKeyIndex !== apiKeyIndex) {
            throw new Error(
              'Lighter trading key registration is still pending; reconnect to check its status',
            );
          }
          const nonceResponse = await this.#clientService.getNextNonce(
            accountIndex,
            apiKeyIndex,
          );
          this.#assertSession(generation);
          candidateNonce = nonceResponse.nonce;
          const created = await bridge.createClient({
            chainId,
            accountIndex,
            nonce: candidateNonce,
            apiKeyIndex,
            walletAddress: this.#boundAddress ?? undefined,
          });
          if (created.error || !created.success) {
            throw new Error(
              `Lighter signer client creation failed: ${created.error ?? 'unknown'}`,
            );
          }
          this.#assertSession(generation);
          if (
            pending &&
            created.pk.replace(/^0x/u, '').toLowerCase() !== pending.publicKey
          ) {
            throw new Error(
              'Lighter pending registration belongs to a different local key; restore the original signer before reconnecting',
            );
          }
          this.#venuePublicKey = created.pk;
          this.#signerIdentity = `${this.#clientService.network}:${accountIndex}:${apiKeyIndex}`;
          this.#signerRecreateParams = { chainId, accountIndex };
          bridgeClientOwners.set(this.#rawSignerBridge(), this.#signerIdentity);
          changePubKeyBody = created.body;
          const status = await this.#venueKeyStatus(accountIndex);
          this.#assertSession(generation);
          if (pending) {
            if (status === 'matching') {
              await this.#deps.diskCache.removeItem(
                this.#pendingKeyRegistrationKey(accountIndex),
              );
              this.#assertSession(generation);
            } else if (status === 'available') {
              await this.#reconcilePendingKeyRegistration(pending, generation);
            } else {
              throw new Error(
                'Lighter trading key changed during pending registration; reconcile the original slot before reconnecting',
              );
            }
          }
          if (status === 'occupied') {
            this.#clearBridgeOwnership();
            if (
              !bridge.getRecoverableKeyIndices &&
              !bridge.getStoredKeyIndices
            ) {
              throw new Error(
                `Lighter API key slot ${String(apiKeyIndex)} already contains a different key; reconnect with a client that supports device-key recovery`,
              );
            }
            return { result: false };
          }
          candidateStatus = status;
        },
      );
      if (ready) {
        this.#assertSession(generation);
        this.#readyApiKeyIndex = apiKeyIndex;
        this.#kickTpslRecovery();
        return;
      }
    }
    throw new Error(
      'No available Lighter trading key slot. Remove an unused API key in Lighter, then reconnect.',
    );
  };

  readonly #venueKeyStatus = async (
    accountIndex: number,
  ): Promise<'available' | 'matching' | 'occupied'> => {
    const response = await this.#clientService.getApiKeys(accountIndex);
    const configuredSlot = response.apiKeys.find(
      (key) => key.apiKeyIndex === this.#apiKeyIndex,
    );
    if (!configuredSlot) {
      return 'available';
    }
    const normalizeKey = (key: string | null): string =>
      (key ?? '').replace(/^0x/u, '').toLowerCase();
    return normalizeKey(configuredSlot.publicKey) ===
      normalizeKey(this.#venuePublicKey)
      ? 'matching'
      : 'occupied';
  };

  /**
   * Wait for registration visibility before authenticating against a new slot.
   * A successful send only establishes acceptance, not indexed read readiness.
   *
   * @param accountIndex - Account whose registration was just submitted.
   * @param generation - Session that owns the registration.
   */
  readonly #waitForRegisteredKey = async (
    accountIndex: number,
    generation: number,
  ): Promise<void> => {
    const deadline =
      Date.now() + LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS;
    for (
      let attempt = 0;
      attempt < LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS;
      attempt += 1
    ) {
      this.#assertSession(generation);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        break;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const status = await Promise.race([
        this.#venueKeyStatus(accountIndex),
        new Promise<'pending'>((resolve) => {
          timer = setTimeout(() => resolve('pending'), remaining);
        }),
      ]).finally(() => clearTimeout(timer));
      this.#assertSession(generation);
      if (status === 'pending') {
        break;
      }
      if (status === 'matching') {
        await this.#deps.diskCache.removeItem(
          this.#pendingKeyRegistrationKey(accountIndex),
        );
        this.#assertSession(generation);
        return;
      }
      if (status === 'occupied') {
        throw new Error('Lighter trading key changed during registration');
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS),
      );
    }
    throw new Error(
      'Lighter trading key registration is still pending; reconnect to check its status',
    );
  };

  readonly #registerVenueKey = async (
    accountIndex: number,
    changePubKeyBody: string,
    generation: number,
    nextNonce: () => Promise<number>,
    submit: (
      txType: number,
      txInfo: string,
      onAccepted?: () => void,
      identity?: {
        txHash: string | null;
        expiresAt: number | null;
        intent?: string;
        owner?: string | null;
        onDispatch?: () => void;
      },
    ) => Promise<LighterSendTxResponse>,
  ): Promise<void> => {
    const bridge = this.#getSignerBridge();
    // The ChangePubKey plaintext from _createClient embeds the nonce used at
    // client creation; sign it with the user's L1 account (EIP-191). Every
    // await is fenced and the submission goes through the lock's fenced
    // submit — a stale registration can never reach the venue.
    const l1Signature =
      await this.#walletService.signPersonalMessage(changePubKeyBody);
    this.#assertSession(generation);
    const nonce = await nextNonce();
    this.#assertSession(generation);
    const signed = await bridge.execute({
      function: '_signChangePubKey',
      params: [accountIndex, l1Signature, nonce, this.#apiKeyIndex],
    });
    if (signed.error) {
      throw new Error(`Lighter ChangePubKey signing failed: ${signed.error}`);
    }
    this.#assertSession(generation);
    const identity = extractDispatchIdentity(signed);
    let result: LighterSendTxResponse;
    if (!bridge.getRecoverableKeyIndices && !bridge.getStoredKeyIndices) {
      // Legacy bridges use only their explicitly configured slot. Preserve
      // that contract; durable allocation tracking applies to discovery.
      result = await submit(
        LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
        signed.txInfo,
        undefined,
        identity,
      );
    } else {
      if (identity.txHash === null || identity.expiresAt === null) {
        throw new Error(
          'Lighter registration signing result has no complete transaction identity',
        );
      }
      const registrationKey = this.#pendingKeyRegistrationKey(accountIndex);
      const pending: LighterPendingKeyRegistration = {
        version: 1,
        accountIndex,
        apiKeyIndex: this.#apiKeyIndex,
        publicKey: (this.#venuePublicKey ?? '')
          .replace(/^0x/u, '')
          .toLowerCase(),
        txHash: identity.txHash,
        nonce,
        expiresAt: identity.expiresAt,
        accepted: false,
      };
      await this.#deps.diskCache.setItem(
        registrationKey,
        JSON.stringify(pending),
      );
      let dispatched = false;
      try {
        this.#assertSession(generation);
        result = await submit(
          LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
          signed.txInfo,
          () => {
            pending.accepted = true;
          },
          {
            ...identity,
            onDispatch: () => {
              dispatched = true;
            },
          },
        );
      } catch (error) {
        if (!dispatched) {
          await this.#deps.diskCache.removeItem(registrationKey);
        } else if (pending.accepted) {
          await this.#deps.diskCache.setItem(
            registrationKey,
            JSON.stringify(pending),
          );
        }
        throw error;
      }
      await this.#deps.diskCache.setItem(
        registrationKey,
        JSON.stringify(pending),
      );
      this.#assertSession(generation);
    }
    this.#deps.debugLogger.log('[LighterProvider] Venue key registered', {
      accountIndex,
      apiKeyIndex: this.#apiKeyIndex,
      txHash: result.txHash,
    });
  };

  /**
   * Mint (or reuse) an auth token for authenticated REST reads.
   *
   * @returns Auth token string.
   */
  /** Tail of the serialized venue-write chain (see #withVenueNonce). */
  #writeChain: Promise<void> = Promise.resolve();

  /** Every client order id this instance has issued (collision set). */
  readonly #issuedClientOrderIds = new Set<number>();

  /**
   * Atomically reserve unique client order indexes.
   *
   * The venue requires client_order_index to be UNIQUE ACROSS ALL MARKETS
   * for the account (official Get Started docs) and does not require
   * monotonicity. Ids are uniform random draws over the uint48 space
   * (two 24-bit draws, exact in float space) with a per-instance
   * collision set and retry: within an instance duplicates are
   * impossible; across simultaneous instances/devices a single pair
   * collides with probability 1/2^48 (~3.6e-15) and the birthday bound
   * over n total ids is ~n(n-1)/2^49 — about 1.8e-7 after ten thousand
   * orders, versus the 1% per-pair risk of the previous 100-lane scheme.
   *
   * @param count - How many ids to reserve.
   * @returns The reserved ids.
   */
  readonly #allocateClientOrderIndexes = (count: number): number[] => {
    const ids: number[] = [];
    // Bounded: a degenerate randomness source (or an absurdly full
    // collision set) must surface as an error, never a synchronous spin.
    // 100 attempts per id makes accidental exhaustion unreachable in
    // practice (collision odds per draw stay astronomically small).
    let attempts = 0;
    const maxAttempts = count * 100;
    while (ids.length < count) {
      if (attempts >= maxAttempts) {
        throw new Error(
          `Unable to allocate a unique Lighter client order id after ${maxAttempts} attempts`,
        );
      }
      attempts += 1;
      const [high, low] = randomUint24Pair();
      const candidate = high * 2 ** 24 + low;
      if (candidate === 0 || this.#issuedClientOrderIds.has(candidate)) {
        continue;
      }
      this.#issuedClientOrderIds.add(candidate);
      ids.push(candidate);
    }
    return ids;
  };

  /**
   * Serialize a nonce-consuming venue write.
   *
   * Lighter nonces are strictly ordered per key slot; two interleaved
   * fetch→submit pairs (e.g. the controller's per-item batch fallbacks
   * running concurrently) would sign with the same nonce and get one
   * rejection. Every write acquires the chain, fetches a fresh nonce
   * inside it, and submits before the next write's fetch runs. A section
   * queued under a wallet account that has since been switched away from
   * refuses to run — a delayed account-A write must never execute inside
   * account-B's session.
   *
   * @param accountIndex - Account whose key-slot nonce is consumed.
   * @param section - Work to run exclusively; fetch nonces via the
   * provided helper (each call returns the next fresh nonce).
   * @param generationAtIntent - Session generation captured when the
   * caller's intent was formed (defaults to now).
   * @param apiKeyIndex - Slot captured when this section was queued.
   * @param inspectCandidate - Optional read-only identity inspection before
   * ledger resolution. A nonmatching candidate may return without reading or
   * changing its unrelated ledger. Matching/available candidates retain all
   * nonce safeguards before the write section runs.
   * @returns The section's result.
   */
  readonly #withVenueWriteLock = async <Result>(
    accountIndex: number,
    section: (
      nextNonce: () => Promise<number>,
      submit: (
        txType: number,
        txInfo: string,
        onAccepted?: () => void,
        identity?: {
          txHash: string | null;
          expiresAt: number | null;
          intent?: string;
          owner?: string | null;
          beforeDispatch?: () => Promise<void>;
          onNotDispatched?: () => Promise<void>;
          requireExecution?: boolean;
          onDispatch?: () => void;
          afterAccepted?: () => Promise<void>;
        },
      ) => Promise<LighterSendTxResponse>,
    ) => Promise<Result>,
    generationAtIntent = this.#sessionGeneration,
    apiKeyIndex = this.#apiKeyIndex,
    inspectCandidate?: () => Promise<{ result: Result } | void>,
  ): Promise<Result> => {
    const criticalSection = async (): Promise<Result> => {
      this.#assertSession(generationAtIntent);
      if (this.#apiKeyIndex !== apiKeyIndex) {
        this.#clearBridgeOwnership();
      }
      this.#apiKeyIndex = apiKeyIndex;
      if (inspectCandidate) {
        const inspected = await inspectCandidate();
        this.#assertSession(generationAtIntent);
        if (inspected) {
          return inspected.result;
        }
      }
      await this.#rememberRecoveryAccount(accountIndex, generationAtIntent);
      this.#assertSession(generationAtIntent);
      // Every unresolved prior dispatch (this session OR a previous one —
      // the ledger is durable) must resolve before this section may issue
      // nonces: a restart would otherwise reuse a consumed-but-lagging
      // nonce, and a proven never-landed dispatch must release its nonce.
      // Key discovery/registration must remain possible without touching an
      // unrelated candidate's obligations. Financial operations, however,
      // cannot escape account-local quarantine by switching signing slots.
      if (!inspectCandidate) {
        for (
          let previousSlot = LIGHTER_MIN_TRADING_API_KEY_INDEX;
          previousSlot <= LIGHTER_MAX_TRADING_API_KEY_INDEX;
          previousSlot += 1
        ) {
          this.#assertSession(generationAtIntent);
          if (previousSlot !== apiKeyIndex) {
            await this.#resolveNonceLedger(accountIndex, previousSlot);
            this.#assertSession(generationAtIntent);
          }
        }
      }
      await this.#resolveNonceLedger(accountIndex, apiKeyIndex);
      this.#assertSession(generationAtIntent);
      // Monotonic nonce reservation: the venue's nextNonce endpoint can
      // LAG accepted submissions. The floor is SESSION-GLOBAL per
      // accountIndex:apiKeyIndex — a queued/next lock section (any
      // symbol, any operation) must never be handed a nonce an earlier
      // submission may have consumed, even when that submission's
      // response was lost. Reservation advances at DISPATCH (a signing
      // failure never burns a nonce the venue still expects); a proven
      // never-landed submission releases it again via reconciliation.
      const reservationKey = `${accountIndex}:${apiKeyIndex}`;
      let lastIssuedNonce: number | null = null;
      const nextNonce = async (): Promise<number> => {
        // Re-fenced on every fetch AND after it resolves: the account can
        // switch between the section's own await points, not only while it
        // sat in the queue.
        this.#assertSession(generationAtIntent);
        const nonceResponse = await this.#clientService.getNextNonce(
          accountIndex,
          apiKeyIndex,
        );
        this.#assertSession(generationAtIntent);
        const reservedFloor = this.#nonceReservations.get(reservationKey);
        const issued =
          reservedFloor === undefined
            ? nonceResponse.nonce
            : Math.max(nonceResponse.nonce, reservedFloor);
        lastIssuedNonce = issued;
        return issued;
      };
      // BRIDGE OWNERSHIP: the WASM client is a singleton per bridge —
      // another provider (different account/network sharing the bridge)
      // may have overwritten it since our setup. Re-establish OUR client
      // before any signing in this section. (During initial setup the
      // identity is not yet recorded; setup itself creates the client.)
      if (
        this.#signerIdentity !== null &&
        this.#signerRecreateParams !== null &&
        bridgeClientOwners.get(this.#rawSignerBridge()) !== this.#signerIdentity
      ) {
        await this.#reestablishSignerClient(
          generationAtIntent,
          await nextNonce(),
        );
      }
      const submit = async (
        txType: number,
        txInfo: string,
        onAccepted?: () => void,
        identity?: {
          txHash: string | null;
          expiresAt: number | null;
          intent?: string;
          owner?: string | null;
          beforeDispatch?: () => Promise<void>;
          onNotDispatched?: () => Promise<void>;
          requireExecution?: boolean;
          onDispatch?: () => void;
          afterAccepted?: () => Promise<void>;
        },
      ): Promise<LighterSendTxResponse> => {
        // Last fence before anything reaches the venue: a switch that
        // happened while SIGNING must abort before submission.
        this.#assertSession(generationAtIntent);
        // Record the dispatch DURABLY BEFORE anything else: a failed
        // ledger read/write means NO dispatch and an UNTOUCHED memory
        // floor — the nonce stays safely unissued at the venue. The
        // identity comes from the SIGNING RESULT (pinned WASM contract:
        // txInfo never carries the hash).
        let ledgerEntry: LighterNonceLedgerDoc['entries'][number] | null = null;
        if (lastIssuedNonce !== null) {
          // COMPLETE identity is REQUIRED before anything reaches the
          // wire: a hashless dispatch could never be proven absent, so a
          // response loss would wedge writes until the venue advances.
          if (
            identity?.txHash === null ||
            identity?.expiresAt === null ||
            identity === undefined
          ) {
            throw new Error(
              'Lighter dispatch refused: the signing result did not provide a complete transaction identity (hash + expiry)',
            );
          }
          ledgerEntry = {
            nonce: lastIssuedNonce,
            txHash: identity.txHash,
            expiresAt: identity.expiresAt,
            kind: txType,
            intent: identity.intent ?? `txType:${txType}`,
            owner: identity.owner ?? null,
          };
          const appendedEntry = ledgerEntry;
          await this.#withLedgerLock(
            accountIndex,
            async () => {
              const doc = await this.#readNonceLedger(
                accountIndex,
                apiKeyIndex,
              );
              if (doc.entries.length >= 16) {
                throw new Error(
                  'Too many unresolved Lighter dispatches; refusing further writes until they resolve',
                );
              }
              await this.#writeNonceLedger(
                accountIndex,
                {
                  consumedFloor: doc.consumedFloor,
                  entries: [...doc.entries, appendedEntry],
                  recovered: doc.recovered,
                },
                apiKeyIndex,
              );
            },
            apiKeyIndex,
          );
          // Only AFTER the durable append: reserve in memory — from this
          // point the venue may consume the nonce even if the response
          // never arrives.
          this.#nonceReservations.set(reservationKey, lastIssuedNonce + 1);
        }
        // EVERY error path below keeps the durable entry — a coded venue
        // or HTTP error can mask a commit, so nothing short of an exact
        // authoritative reconciliation may release the nonce.
        // A switch after append leaves the unsent entry for conservative
        // reconciliation. It may block until signed expiry plus clock slack;
        // retaining uncertainty avoids treating a durable append as absent.
        try {
          await identity?.beforeDispatch?.();
          this.#assertSession(generationAtIntent);
        } catch (error) {
          // No transport call has occurred. Keep the final after-persistence
          // guard, but release only this exact proven-unsent attempt. A stale
          // session retains quarantine rather than touching another scope.
          this.#assertSession(generationAtIntent);
          try {
            await identity?.onNotDispatched?.();
          } catch (cleanupError) {
            this.#assertSession(generationAtIntent);
            this.#deps.debugLogger.log(
              '[LighterProvider] Proven-unsent dispatch cleanup remains pending',
              { error: String(cleanupError) },
            );
            // Keep the ledger quarantined when its owner could not retire.
            throw error;
          }
          this.#assertSession(generationAtIntent);
          const unsentEntry = ledgerEntry;
          if (unsentEntry) {
            await this.#withLedgerLock(
              accountIndex,
              async () => {
                this.#assertSession(generationAtIntent);
                const doc = await this.#readNonceLedger(
                  accountIndex,
                  apiKeyIndex,
                );
                this.#assertSession(generationAtIntent);
                await this.#writeNonceLedger(
                  accountIndex,
                  {
                    ...doc,
                    entries: doc.entries.filter(
                      (entry) =>
                        entry.nonce !== unsentEntry.nonce ||
                        entry.txHash !== unsentEntry.txHash ||
                        entry.owner !== unsentEntry.owner,
                    ),
                  },
                  apiKeyIndex,
                );
                this.#assertSession(generationAtIntent);
                if (unsentEntry.nonce >= doc.consumedFloor) {
                  this.#releaseNonceReservation(
                    accountIndex,
                    unsentEntry.nonce,
                    apiKeyIndex,
                  );
                }
              },
              apiKeyIndex,
            );
          }
          throw error;
        }
        identity?.onDispatch?.();
        const response: LighterSendTxResponse =
          await this.#clientService.sendTx(txType, txInfo);
        if (identity?.requireExecution) {
          // Transport acceptance cannot retire additive collateral intent.
          // Keep its durable record until its exact transaction executes.
          this.#assertSession(generationAtIntent);
          let executed = false;
          for (
            let attempt = 0;
            attempt < LIGHTER_MARGIN_EXECUTION_ATTEMPTS;
            attempt += 1
          ) {
            this.#assertSession(generationAtIntent);
            const transaction = ledgerEntry?.txHash
              ? await this.#clientService.getTx(ledgerEntry.txHash)
              : null;
            this.#assertSession(generationAtIntent);
            const matches =
              ledgerEntry !== null &&
              transaction !== null &&
              typeof transaction.hash === 'string' &&
              transaction.hash.toLowerCase().replace(/^0x/u, '') ===
                ledgerEntry.txHash?.toLowerCase().replace(/^0x/u, '') &&
              transaction.accountIndex === accountIndex &&
              transaction.apiKeyIndex === apiKeyIndex &&
              transaction.nonce === ledgerEntry.nonce;
            const outcome = matches
              ? getLighterTransactionOutcome(transaction.status)
              : null;
            if (outcome === 'failed') {
              throw new Error(
                'Lighter margin transaction failed; refresh its exact outcome before retrying',
              );
            }
            if (outcome === 'executed') {
              executed = true;
              break;
            }
            if (attempt + 1 < LIGHTER_MARGIN_EXECUTION_ATTEMPTS) {
              await new Promise((resolve) =>
                setTimeout(resolve, LIGHTER_MARGIN_EXECUTION_POLL_MS),
              );
              this.#assertSession(generationAtIntent);
            }
          }
          if (!executed) {
            throw new Error(
              'Lighter margin mode update remains unresolved or margin adjustment is pending; review its exact transaction before retrying',
            );
          }
        }
        // Acceptance bookkeeping runs SYNCHRONOUSLY before anything can
        // fail: a switch during network submission must cancel the
        // operation, never the record of an accepted venue mutation.
        onAccepted?.();
        if (identity?.afterAccepted) {
          await identity.afterAccepted();
        }
        // POST-SEND ORDER: evaluate the session fence BEFORE the ledger
        // entry transitions, then commit the transition ATOMICALLY in
        // ONE write under the ledger lock — fence pass → consumed/
        // removed; fence fail → recovered(SUCCEEDED). If that single
        // write fails, the ORIGINAL unresolved entry remains the durable
        // record and every retry stays blocked; the only durable proof
        // of the accepted mutation is never consumed first and
        // quarantined second.
        let fenceError: unknown = null;
        try {
          this.#assertSession(generationAtIntent);
        } catch (error) {
          fenceError = error;
        }
        if (ledgerEntry !== null) {
          await this.#resolveEntryPostDispatch(
            accountIndex,
            ledgerEntry,
            fenceError !== null,
            apiKeyIndex,
          ).catch(() => undefined);
        }
        if (fenceError !== null) {
          throw ensureError(fenceError, 'LighterProvider.submit');
        }
        return response;
      };
      return await section(nextNonce, submit);
    };
    // The ENTIRE nonce resolve→fetch→sign/append→dispatch sequence is
    // serialized PROCESS-WIDE per network+account across key slots: the
    // instance chain alone cannot stop a second live provider from
    // issuing the same nonce or interleaving ledger writes.
    const guardedSection = async (): Promise<Result> =>
      await withProcessMutex(
        `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
        // INNERMOST: the bridge mutex — the WASM client is a singleton
        // per bridge, so ensure-correct-client + every sign of a section
        // are serialized across ALL providers sharing the bridge.
        async () =>
          await withProcessMutex(
            bridgeMutexKey(this.#rawSignerBridge()),
            criticalSection,
          ),
      );
    const run = this.#writeChain.then(guardedSection, guardedSection);
    this.#writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  };

  readonly #withVenueNonce = async <Result>(
    accountIndex: number,
    operation: (
      nonce: number,
      submit: (
        txType: number,
        txInfo: string,
        onAccepted?: () => void,
        identity?: {
          txHash: string | null;
          expiresAt: number | null;
          intent?: string;
          owner?: string | null;
          beforeDispatch?: () => Promise<void>;
          onNotDispatched?: () => Promise<void>;
          requireExecution?: boolean;
          onDispatch?: () => void;
          afterAccepted?: () => Promise<void>;
        },
      ) => Promise<LighterSendTxResponse>,
    ) => Promise<Result>,
    generationAtIntent = this.#sessionGeneration,
  ): Promise<Result> =>
    await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit) => operation(await nextNonce(), submit),
      generationAtIntent,
    );

  /**
   * Re-create OUR venue client on the shared bridge after another
   * identity overwrote the singleton. MUST run while holding the bridge
   * mutex. The bridge owns key generation and persistence.
   *
   * @param generation - The caller's captured session generation.
   * @param nonce - A fresh venue nonce for the client creation.
   */
  readonly #reestablishSignerClient = async (
    generation: number,
    nonce: number,
  ): Promise<void> => {
    const recreateParams = this.#signerRecreateParams;
    const identity = this.#signerIdentity;
    if (recreateParams === null || identity === null) {
      throw new Error(
        'Lighter signer client re-establishment attempted before setup',
      );
    }
    this.#assertSession(generation);
    const recreated = await this.#getSignerBridge().createClient({
      chainId: recreateParams.chainId,
      accountIndex: recreateParams.accountIndex,
      nonce,
      apiKeyIndex: this.#apiKeyIndex,
      walletAddress: this.#boundAddress ?? undefined,
    });
    if (recreated.error || !recreated.success) {
      throw new Error(
        `Lighter signer client re-establishment failed: ${recreated.error ?? 'unknown'}`,
      );
    }
    this.#assertSession(generation);
    bridgeClientOwners.set(this.#rawSignerBridge(), identity);
  };

  readonly #getAuthToken = async (): Promise<string> => {
    this.#ensureSessionBinding();
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.#authToken && this.#authToken.deadline - nowSeconds > 60) {
      return this.#authToken.token;
    }
    const generation = this.#sessionGeneration;
    await this.#ensureSignerReady();
    const accountIndex = await this.#ensureAccountIndex();
    // The auth-token mint is a singleton-client call like any other sign:
    // it runs under the BRIDGE LEASE, and re-establishes OUR client first
    // when another identity has since overwritten it — otherwise the
    // token would be minted by the wrong account's venue key.
    const token = await withProcessMutex(
      bridgeMutexKey(this.#rawSignerBridge()),
      async () => {
        if (
          this.#signerIdentity !== null &&
          this.#signerRecreateParams !== null &&
          bridgeClientOwners.get(this.#rawSignerBridge()) !==
            this.#signerIdentity
        ) {
          // Client creation is bridge-local: the read-only nonce fetch
          // seeds its tracking without dispatching anything.
          const nonceResponse = await this.#clientService.getNextNonce(
            this.#signerRecreateParams.accountIndex,
            this.#apiKeyIndex,
          );
          this.#assertSession(generation);
          await this.#reestablishSignerClient(generation, nonceResponse.nonce);
        }
        return await this.#getSignerBridge().execute({
          function: '_createAuthToken',
          params: [accountIndex, this.#apiKeyIndex],
        });
      },
    );
    if (token.error || !token.token) {
      throw new Error(
        `Lighter auth token creation failed: ${token.error ?? 'unknown'}`,
      );
    }
    // Rebind first so an unobserved external switch during the bridge call
    // advances the generation, then compare: a token minted under a binding
    // that no longer exists must never be cached — re-mint under the new
    // captured session instead.
    this.#ensureSessionBinding();
    if (generation !== this.#sessionGeneration) {
      return await this.#getAuthToken();
    }
    this.#authToken = { token: token.token, deadline: token.deadline };
    return token.token;
  };

  readonly #ensureMarkets = async (
    forceRefresh = false,
  ): Promise<Map<string, LighterOrderBookMeta>> => {
    if (forceRefresh || this.#marketsBySymbol.size === 0) {
      const result = await this.initialize();
      if (forceRefresh && !result.success) {
        throw new Error(result.error ?? 'Lighter market metadata unavailable');
      }
    }
    return this.#marketsBySymbol;
  };

  // ============================================================================
  // Market Data Operations (Public Reads)
  // ============================================================================

  /**
   * Report native standalone triggers for an active, known perpetual market. Explicit
   * margin modes and strategies remain unreported until their write paths exist.
   *
   * @param params - Market route to inspect.
   * @returns Native trigger types or the reason the market is unavailable.
   */
  async getOrderCapabilities(
    params: GetOrderCapabilitiesParams,
  ): Promise<DirectProviderOrderCapabilities> {
    const unavailable = (
      reason: DirectProviderOrderCapabilitiesUnavailableReason,
    ): DirectProviderOrderCapabilities =>
      Object.freeze({
        status: 'unavailable',
        providerId: this.protocolId,
        reason,
      });
    if (!params.symbol.trim()) {
      return unavailable('invalid_symbol');
    }
    if (this.#isDisconnected) {
      return unavailable('provider_unavailable');
    }
    let markets: Map<string, LighterOrderBookMeta>;
    try {
      markets = await this.#ensureMarkets(true);
    } catch {
      return unavailable('provider_unavailable');
    }
    if (this.#isDisconnected) {
      return unavailable('provider_unavailable');
    }
    const market = markets.get(params.symbol);
    if (!market) {
      return unavailable('market_not_found');
    }
    if (market.status !== 'active' || market.marketType !== 'perp') {
      return unavailable('order_market_unsupported');
    }
    return Object.freeze({
      status: 'ready',
      providerId: this.protocolId,
      supportedStrategies: Object.freeze(
        this.#chaseTestnetProbe &&
          this.#isTestnet &&
          this.#signerBridge !== null
          ? (['scale', 'chase'] as const)
          : (['scale'] as const),
      ),
      supportedMarginModes: Object.freeze(['cross', 'isolated'] as const),
      supportedTriggerOrderTypes: Object.freeze([...TRIGGER_ORDER_TYPES]),
      attachedTpsl: Object.freeze({
        submission: 'native-oto-otoco',
        childCoverage: 'venue-native-zero-size',
        partialSizes: false,
        lifecycleVerification: 'pending',
        cancellation: 'explicit-exact-owned-orders',
      }),
      positionTpsl: Object.freeze({
        supportsExpectedPosition: true,
        childOrderIds: 'request-correlated',
        takeProfitOrderType: 'take_profit_market',
        stopLossOrderType: 'stop_market',
        defaultCoverage: 'position-snapshot',
        partialCoverage: Object.freeze({
          single: true,
          pair: 'equal-quantity-oco',
          supportedPairs: Object.freeze([
            'equal-quantity-oco',
            'independent',
          ] as const),
          replacement: 'cancel-before-create',
          recovery: 'explicit-current-position-intent',
        }),
      }),
    });
  }

  /** Normalize a Scale preview without account or signer setup.
   * @param params - Market, price range and optional sizing intent.
   * @returns Fixed-grid prices and requested sizing, or unavailable scope.
   */
  async getScalePriceLadder(
    params: GetScalePriceLadderParams,
  ): Promise<PerpsScalePriceLadder> {
    const intent = {
      ...params,
      sizing: params.sizing === undefined ? undefined : { ...params.sizing },
    };
    if (
      intent.providerId !== undefined &&
      intent.providerId !== this.protocolId
    ) {
      return {
        status: 'unavailable',
        providerId: this.protocolId,
        reason: 'provider_not_routable',
      };
    }
    const capability = await this.getOrderCapabilities(intent);
    if (capability.status !== 'ready') {
      const reason =
        capability.reason === 'order_market_unsupported' ||
        capability.reason === 'strategy_market_unsupported'
          ? 'market_not_found'
          : capability.reason;
      return { status: 'unavailable', providerId: this.protocolId, reason };
    }
    const market = this.#marketsBySymbol.get(intent.symbol);
    if (!market) {
      return {
        status: 'unavailable',
        providerId: this.protocolId,
        reason: 'market_not_found',
      };
    }
    if (intent.sizing !== undefined) {
      const { sizing } = intent;
      if ((sizing.size !== undefined) === (sizing.usdAmount !== undefined)) {
        throw new Error(
          'Lighter Scale sizing requires exactly one exposure intent',
        );
      }
      const ladder = buildLighterScaleLadder(
        {
          symbol: intent.symbol,
          orderType: 'scale',
          scaleMinPrice: String(intent.minPrice),
          scaleMaxPrice: String(intent.maxPrice),
          scaleNumOrders: intent.count,
          size: sizing.size,
          usdAmount: sizing.usdAmount,
          scaleSkew: sizing.skew,
        },
        market,
      );
      return {
        status: 'ready',
        providerId: this.protocolId,
        prices: ladder.prices,
        sizingPreview: {
          sizes: ladder.sizes,
          totalSize: ladder.size,
          totalNotional: ladder.notional,
          minimumBaseSize: market.minBaseAmount,
          minimumQuoteAmount: market.minQuoteAmount,
          sizeDecimals: market.supportedSizeDecimals,
        },
      };
    }
    return {
      status: 'ready',
      providerId: this.protocolId,
      prices: normalizeLighterScalePrices(
        String(intent.minPrice),
        String(intent.maxPrice),
        intent.count,
        market.supportedPriceDecimals,
      ),
    };
  }

  readonly #scaleKey = (accountIndex: number): string =>
    `${LIGHTER_SCALE_JOURNAL_PREFIX}${this.#isTestnet ? 'testnet' : 'mainnet'}:${this.#boundAddress}:${accountIndex}`;

  readonly #readScaleGroups = async (
    key: string,
    accountIndex: number,
  ): Promise<LighterScaleGroup[]> => {
    let groups: LighterScaleGroup[];
    try {
      groups = parseLighterScaleGroups(await this.#deps.diskCache.getItem(key));
    } catch {
      throw new Error(
        `${LIGHTER_DATA_INTEGRITY_PREFIX} Lighter Scale journal is unavailable or invalid`,
      );
    }
    const scope = `${LIGHTER_SCALE_PREFIX}${key.slice(LIGHTER_SCALE_JOURNAL_PREFIX.length)}:`;
    for (const group of groups) {
      if (
        group.accountIndex !== accountIndex ||
        group.walletAddress !== this.#boundAddress ||
        group.network !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
        group.groupId !== `${scope}${group.rungs[0].clientOrderId}`
      ) {
        throw new Error(
          `${LIGHTER_DATA_INTEGRITY_PREFIX} Lighter Scale ownership belongs to another account`,
        );
      }
      group.rungs.forEach((rung) =>
        this.#issuedClientOrderIds.add(rung.clientOrderId),
      );
    }
    return groups;
  };

  readonly #writeScaleGroup = async (
    key: string,
    group: LighterScaleGroup,
    generation: number,
  ): Promise<void> => {
    await withStorageMutex(key, async () => {
      this.#assertSession(generation);
      const groups = await this.#readScaleGroups(key, group.accountIndex);
      this.#assertSession(generation);
      const index = groups.findIndex((item) => item.groupId === group.groupId);
      if (index < 0) {
        if (groups.length >= LIGHTER_SCALE_MAX_GROUPS) {
          const terminal = groups.findIndex(isLighterScaleTerminal);
          if (terminal < 0) {
            throw new Error('Lighter Scale ownership is full');
          }
          groups.splice(terminal, 1);
        }
        groups.push(group);
      } else {
        if (JSON.stringify(groups[index]) === JSON.stringify(group)) {
          return;
        }
        groups[index] = group;
      }
      const serialized = JSON.stringify(groups);
      parseLighterScaleGroups(serialized);
      await this.#deps.diskCache.setItem(key, serialized);
      this.#assertSession(generation);
    });
  };

  readonly #recordScaleCancellationAcknowledgement = async (
    key: string,
    group: LighterScaleGroup,
    rung: LighterScaleRung,
    attempt: NonNullable<LighterScaleRung['cancelAttempt']>,
    acknowledged: boolean,
  ): Promise<void> => {
    // Completion evidence belongs to its captured owner even after a session
    // switch. This updates only an already-persisted exact attempt, never authority.
    await withStorageMutex(key, async () => {
      const groups = parseLighterScaleGroups(
        await this.#deps.diskCache.getItem(key),
      );
      const current = groups.find((entry) => entry.groupId === group.groupId);
      if (
        !current ||
        current.walletAddress !== group.walletAddress ||
        current.network !== group.network ||
        current.accountIndex !== group.accountIndex ||
        current.marketId !== group.marketId ||
        current.apiKeyIndex !== group.apiKeyIndex
      ) {
        throw new Error('Lighter Scale acknowledgement ownership mismatch');
      }
      const child = current.rungs.find(
        (entry) => entry.clientOrderId === rung.clientOrderId,
      );
      const saved = child?.cancelAttempt;
      if (saved === undefined) {
        return;
      }
      if (
        child?.orderId !== rung.orderId ||
        saved.apiKeyIndex !== attempt.apiKeyIndex ||
        saved.nonce !== attempt.nonce ||
        saved.txHash !== attempt.txHash ||
        saved.expiresAt !== attempt.expiresAt
      ) {
        throw new Error('Lighter Scale acknowledgement attempt mismatch');
      }
      if (saved.acknowledged === true) {
        return;
      }
      saved.acknowledged = acknowledged;
      const serialized = JSON.stringify(groups);
      parseLighterScaleGroups(serialized);
      await this.#deps.diskCache.setItem(key, serialized);
    });
  };

  readonly #readScaleReservations = async (
    accountIndex: number,
    marketId: number,
    isBuy: boolean,
    token: string,
    generation: number,
  ): Promise<{ reserved: BigNumber; identities: Set<string> }> => {
    const active = await this.#clientService.getActiveOrders(
      accountIndex,
      token,
      marketId,
    );
    this.#assertSession(generation);
    if (!Array.isArray(active.orders)) {
      throw new Error('Lighter Scale active reservations are unavailable');
    }
    let reserved = new BigNumber(0);
    const identities = new Set<string>();
    for (const row of active.orders) {
      if (
        row.ownerAccountIndex !== accountIndex ||
        row.marketIndex !== marketId ||
        ![0, 1, false, true].includes(row.reduceOnly)
      ) {
        throw new Error('Invalid Lighter Scale active reservation scope');
      }
      const identity = String(row.orderIndex);
      if (identities.has(identity)) {
        throw new Error('Duplicate Lighter Scale active reservation');
      }
      identities.add(identity);
      if (!row.reduceOnly) {
        continue;
      }
      const quantity = parseStrictDecimal(row.remainingBaseAmount);
      if (quantity === null || quantity < 0 || row.isAsk !== !isBuy) {
        throw new Error('Invalid Lighter Scale reduce-only reservation');
      }
      reserved = reserved.plus(row.remainingBaseAmount);
    }
    return { reserved, identities };
  };

  readonly #prepareScaleOrder = async (
    params: OrderParams,
    generation: number,
    readToken?: string,
  ): Promise<{
    market: LighterOrderBookMeta;
    ladder: ReturnType<typeof buildLighterScaleLadder>;
    accountIndex: number;
  }> => {
    const leverageError = lighterLeverageError(params.leverage);
    if (leverageError) {
      throw new Error(leverageError);
    }
    const markets = await this.#ensureMarkets(true);
    this.#assertSession(generation);
    const market = markets.get(params.symbol);
    if (!market) {
      throw new Error('Unknown Lighter Scale market');
    }
    let ladder: ReturnType<typeof buildLighterScaleLadder>;
    try {
      ladder = buildLighterScaleLadder(params, market);
    } catch (error) {
      if (params.expectedScaleLadder !== undefined) {
        throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_PREVIEW_STALE);
      }
      throw error;
    }
    assertExpectedScaleLadder(params.expectedScaleLadder, ladder, market);
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const response = await this.#clientService.getAccountByIndex(accountIndex);
    this.#assertSession(generation);
    const account = response.accounts?.[0];
    if (
      !Array.isArray(response.accounts) ||
      response.accounts.length !== 1 ||
      !account ||
      account.index !== accountIndex ||
      account.l1Address.toLowerCase() !== this.#boundAddress ||
      account.accountType !== 0 ||
      !Array.isArray(account.positions)
    ) {
      throw new Error('Lighter Scale account state is not authoritative');
    }
    const matches = account.positions.filter(
      (position) => position.marketId === market.marketId,
    );
    if (matches.length > 1) {
      throw new Error('Ambiguous Lighter Scale position');
    }
    const held = matches[0];
    const maximum = await this.#requireMarketMaxLeverage(params.symbol);
    this.#assertSession(generation);
    if (
      maximum === null ||
      (params.leverage !== undefined && params.leverage > maximum)
    ) {
      throw new Error(
        'Lighter Scale leverage metadata is unavailable or exceeded',
      );
    }
    if (params.reduceOnly) {
      if (
        !held ||
        (held.sign !== 1 && held.sign !== -1) ||
        (held.sign === 1) === params.isBuy ||
        parseFinitePositive(held.position) === null ||
        new BigNumber(ladder.size).gt(held.position)
      ) {
        throw new Error(
          'Lighter Scale reduce-only size or side exceeds the live position',
        );
      }
      const token =
        readToken ??
        (await this.#getRecoveryReadToken(accountIndex, generation)).token;
      const { reserved } = await this.#readScaleReservations(
        accountIndex,
        market.marketId,
        params.isBuy,
        token,
        generation,
      );
      if (reserved.plus(ladder.size).gt(held.position)) {
        throw new Error(
          'Lighter Scale aggregate reduce-only reservation exceeds live position',
        );
      }
    } else {
      const leverage =
        params.leverage ??
        scaleLeverageFromMargin(
          held?.initialMarginFraction,
          this.#marginBySymbol.get(params.symbol)?.defaultInitial,
        );
      if (
        !Number.isFinite(leverage) ||
        leverage < 1 ||
        leverage > maximum ||
        parseStrictDecimal(account.availableBalance) === null ||
        new BigNumber(account.availableBalance).lt(0)
      ) {
        throw new Error('Invalid Lighter Scale margin state');
      }
      if (
        new BigNumber(ladder.notional)
          .div(leverage)
          .gt(account.availableBalance)
      ) {
        throw new Error('Insufficient aggregate Lighter Scale margin');
      }
    }
    return { market, ladder, accountIndex };
  };

  /** Revalidate the unsubmitted ladder against fresh, scoped venue state.
   * @param group - Durable ladder intent.
   * @param requestedLeverage - Explicit leverage, when supplied.
   * @param token - Account-bound read token.
   * @param generation - Source session generation.
   * @param pendingClientId - Child being guarded before transport.
   */
  readonly #assertScaleRemaining = async (
    group: LighterScaleGroup,
    requestedLeverage: number | undefined,
    token: string,
    generation: number,
    pendingClientId: number,
  ): Promise<void> => {
    // Refresh prior children before reading the position: filled reduce-only
    // children may have left active orders and already reduced the position.
    if (
      group.reduceOnly &&
      group.rungs.some(
        (rung) => rung.state === 'resting' || rung.state === 'accepted',
      )
    ) {
      await this.#refreshScaleGroup(
        group,
        this.#scaleKey(group.accountIndex),
        token,
        generation,
      );
    }
    const maximum = await this.#requireMarketMaxLeverage(group.symbol);
    this.#assertSession(generation);
    if (
      maximum === null ||
      (requestedLeverage !== undefined && requestedLeverage > maximum)
    ) {
      throw new Error(
        'Lighter Scale leverage metadata is unavailable or exceeded',
      );
    }
    const response = await this.#clientService.getAccountByIndex(
      group.accountIndex,
    );
    this.#assertSession(generation);
    const account = response.accounts?.[0];
    if (
      !Array.isArray(response.accounts) ||
      response.accounts.length !== 1 ||
      !account ||
      account.index !== group.accountIndex ||
      account.l1Address.toLowerCase() !== group.walletAddress ||
      group.walletAddress !== this.#boundAddress ||
      group.network !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
      account.accountType !== 0 ||
      !Array.isArray(account.positions)
    ) {
      throw new Error('Lighter Scale account changed before dispatch');
    }
    const positions = account.positions.filter(
      (position) => position.marketId === group.marketId,
    );
    if (positions.length > 1) {
      throw new Error('Ambiguous Lighter Scale position');
    }
    const held = positions[0];
    const remaining = group.rungs.filter(
      (rung) =>
        rung.state === 'prepared' || rung.clientOrderId === pendingClientId,
    );
    if (group.reduceOnly) {
      if (
        !held ||
        (held.sign !== 1 && held.sign !== -1) ||
        (held.sign === 1) === group.isBuy ||
        parseFinitePositive(held.position) === null
      ) {
        throw new Error(
          'Lighter Scale reduce-only position changed before dispatch',
        );
      }
      const { reserved, identities } = await this.#readScaleReservations(
        group.accountIndex,
        group.marketId,
        group.isBuy,
        token,
        generation,
      );
      for (const rung of group.rungs) {
        if (rung.clientOrderId === pendingClientId) {
          continue;
        }
        if (
          rung.state === 'accepted' ||
          rung.state === 'unknown' ||
          rung.state === 'submitted' ||
          (rung.state === 'resting' &&
            (rung.orderId === undefined || !identities.has(rung.orderId)))
        ) {
          throw new Error(
            'Lighter Scale previous child reservation is unresolved',
          );
        }
      }
      const unsubmitted = remaining.reduce(
        (total, rung) => total.plus(rung.size),
        new BigNumber(0),
      );
      if (reserved.plus(unsubmitted).gt(held.position)) {
        throw new Error(
          'Lighter Scale aggregate reduce-only reservation exceeds live position',
        );
      }
      return;
    }
    const leverage =
      requestedLeverage ??
      scaleLeverageFromMargin(
        held?.initialMarginFraction,
        this.#marginBySymbol.get(group.symbol)?.defaultInitial,
      );
    const balance = parseStrictDecimal(account.availableBalance);
    if (
      maximum === null ||
      !Number.isFinite(leverage) ||
      leverage < 1 ||
      leverage > maximum ||
      balance === null ||
      balance < 0
    ) {
      throw new Error('Invalid Lighter Scale remaining margin');
    }
    const notional = remaining.reduce(
      (total, rung) => total.plus(new BigNumber(rung.price).times(rung.size)),
      new BigNumber(0),
    );
    if (notional.div(leverage).gt(account.availableBalance)) {
      throw new Error('Insufficient aggregate Lighter Scale remaining margin');
    }
  };

  /** List account-owned Scale groups without replay or signer setup.
   * @returns Durable groups including wholly unknown placement.
   */
  async getScaleOrderGroups(): Promise<ScaleOrderGroup[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const inventory = await this.#resolveRecoveryInventory(generation);
    const groups = await Promise.all(
      inventory.accounts.map(async (account) =>
        this.#readScaleGroups(this.#scaleKey(account), account),
      ),
    );
    this.#assertSession(generation);
    return groups.flat().map(toLighterScaleGroup);
  }

  readonly #settleObservedScaleAcceptance = async (
    group: LighterScaleGroup,
    observed: LighterScaleRung[],
    generation: number,
  ): Promise<void> => {
    for (const rung of observed) {
      if (
        rung.txHash === null ||
        rung.nonce === null ||
        rung.expiresAt === null
      ) {
        continue;
      }
      const transaction = await this.#clientService.getTx(rung.txHash);
      this.#assertSession(generation);
      if (transaction !== null) {
        continue;
      }
      const nonce = await this.#clientService.getNextNonce(
        group.accountIndex,
        group.apiKeyIndex,
      );
      this.#assertSession(generation);
      if (!Number.isSafeInteger(nonce.nonce) || nonce.nonce <= rung.nonce) {
        continue;
      }
      await this.#withLedgerLock(
        group.accountIndex,
        async () => {
          const doc = await this.#readNonceLedger(
            group.accountIndex,
            group.apiKeyIndex,
          );
          this.#assertSession(generation);
          const entry = doc.entries.find(
            (candidate) =>
              candidate.owner === null &&
              candidate.intent ===
                `placeScale:${group.groupId}:${rung.clientOrderId}` &&
              candidate.kind === LIGHTER_TX_TYPE_CREATE_ORDER &&
              candidate.nonce === rung.nonce &&
              candidate.txHash === rung.txHash &&
              candidate.expiresAt === rung.expiresAt,
          );
          if (!entry) {
            return;
          }
          this.#appendRecoveredDispatch(doc, {
            recoveryId: `${entry.nonce}:${entry.txHash}`,
            kind: entry.kind,
            intent: entry.intent,
            txHash: entry.txHash,
            outcome: rung.state === 'rejected' ? 'failed' : 'succeeded',
            evidence: 'fresh-exact-scale-child',
          });
          doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
          doc.entries = doc.entries.filter((candidate) => candidate !== entry);
          await this.#writeNonceLedger(
            group.accountIndex,
            doc,
            group.apiKeyIndex,
          );
          this.#assertSession(generation);
          const reservationKey = `${group.accountIndex}:${group.apiKeyIndex}`;
          this.#nonceReservations.set(
            reservationKey,
            Math.max(
              this.#nonceReservations.get(reservationKey) ?? 0,
              entry.nonce + 1,
            ),
          );
        },
        group.apiKeyIndex,
      );
    }
  };

  readonly #refreshScaleGroup = async (
    group: LighterScaleGroup,
    key: string,
    token: string,
    generation: number,
    abandon = false,
    settleLedger = false,
  ): Promise<void> => {
    const pending = settleLedger
      ? (await this.#readNonceLedger(group.accountIndex, group.apiKeyIndex))
          .entries
      : [];
    this.#assertSession(generation);
    if (
      isLighterScaleTerminal(group) &&
      !pending.some((entry) =>
        entry.intent.startsWith(`placeScale:${group.groupId}:`),
      )
    ) {
      return;
    }
    const observed: LighterScaleRung[] = [];
    const active = await this.#clientService.getActiveOrders(
      group.accountIndex,
      token,
      group.marketId,
    );
    this.#assertSession(generation);
    if (
      !Array.isArray(active.orders) ||
      active.orders.some(
        (row) =>
          row.ownerAccountIndex !== group.accountIndex ||
          row.marketIndex !== group.marketId,
      )
    ) {
      throw new Error(
        'Lighter Scale active orders are unavailable or unscoped',
      );
    }
    const rows = [...active.orders];
    const missing = (): boolean =>
      group.rungs.some(
        (rung) =>
          rung.state !== 'prepared' &&
          (!['filled', 'canceled', 'rejected'].includes(rung.state) ||
            pending.some(
              (entry) =>
                entry.intent ===
                `placeScale:${group.groupId}:${rung.clientOrderId}`,
            )) &&
          !rows.some(
            (row) =>
              row.ownerAccountIndex === group.accountIndex &&
              row.marketIndex === group.marketId &&
              row.clientOrderIndex === rung.clientOrderId,
          ),
      );
    let cursor: string | undefined;
    let historyRows = 0;
    const cursors = new Set<string>();
    while (missing()) {
      const page = await this.#clientService.getInactiveOrders(
        group.accountIndex,
        token,
        LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE,
        cursor,
        group.marketId,
      );
      this.#assertSession(generation);
      if (
        !Array.isArray(page.orders) ||
        page.orders.length > LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE ||
        (page.orders.length === 0 && page.nextCursor !== undefined)
      ) {
        throw new Error(
          'Lighter Scale requires bounded authoritative order history',
        );
      }
      historyRows += page.orders.length;
      if (historyRows > LIGHTER_INACTIVE_HISTORY_ROW_LIMIT) {
        throw new Error('Lighter Scale order history limit exceeded');
      }
      if (
        page.orders.some(
          (row) =>
            row.ownerAccountIndex !== group.accountIndex ||
            row.marketIndex !== group.marketId,
        )
      ) {
        throw new Error('Lighter Scale history scope is invalid');
      }
      rows.push(...page.orders);
      cursor = page.nextCursor;
      if (cursor !== undefined) {
        if (
          typeof cursor !== 'string' ||
          cursor.length === 0 ||
          cursors.has(cursor)
        ) {
          throw new Error(
            'Lighter Scale history cursor is invalid or repeated',
          );
        }
        cursors.add(cursor);
      }
      if (cursor === undefined) {
        break;
      }
    }
    for (const rung of group.rungs) {
      if (rung.state === 'prepared') {
        continue;
      }
      const matches = rows.filter(
        (row) =>
          row.ownerAccountIndex === group.accountIndex &&
          row.marketIndex === group.marketId &&
          row.clientOrderIndex === rung.clientOrderId,
      );
      const overlap = matches.length > 1;
      if (
        overlap &&
        (matches.length !== 2 ||
          !active.orders.includes(matches[0]) ||
          active.orders.includes(matches[1]) ||
          String(matches[0].orderIndex) !== String(matches[1].orderIndex))
      ) {
        throw new Error('Ambiguous Lighter Scale order identity');
      }
      // Validate both snapshots before treating a cross-endpoint overlap as lag.
      for (const row of matches) {
        const orderId = String(row.orderIndex);
        if (
          !/^\d{1,20}$/u.test(orderId) ||
          (rung.orderId !== undefined && rung.orderId !== orderId) ||
          row.isAsk !== !group.isBuy ||
          ![0, 1, false, true].includes(row.reduceOnly) ||
          Boolean(row.reduceOnly) !== group.reduceOnly ||
          row.type !== 'limit' ||
          !new BigNumber(row.price).eq(rung.price) ||
          !new BigNumber(row.initialBaseAmount).eq(rung.size)
        ) {
          throw new Error('Lighter Scale order does not match signed intent');
        }
        if (rung.state === 'rejected' && row.status !== 'rejected') {
          throw new Error('Lighter Scale rejection conflicts with venue order');
        }
        if (row.filledBaseAmount !== undefined) {
          const filled = parseStrictDecimal(row.filledBaseAmount);
          if (
            filled === null ||
            filled < 0 ||
            new BigNumber(row.filledBaseAmount).gt(rung.size)
          ) {
            throw new Error('Invalid Lighter Scale fill quantity');
          }
        }
      }
      if (overlap) {
        // Separate endpoint reads are not atomic. Reobserve this exact child
        // rather than resolving conflicting mutable snapshots by endpoint order.
        continue;
      }
      const row = matches[0];
      if (row) {
        const orderId = String(row.orderIndex);
        const adapted =
          row.status === 'rejected'
            ? undefined
            : adaptOrderFromLighter(row, group.symbol);
        if (
          row.filledBaseAmount !== undefined &&
          rung.filledSize !== undefined &&
          new BigNumber(row.filledBaseAmount).lt(rung.filledSize)
        ) {
          // Indexer lag cannot erase cumulative execution evidence.
          continue;
        }
        // Limit price is not execution price. No average fill price is inferred.
        let nextState: LighterScaleRung['state'];
        if (row.status === 'rejected') {
          nextState = 'rejected';
        } else if (adapted?.status === 'canceled') {
          nextState = 'canceled';
        } else if (
          adapted?.status === 'filled' &&
          parseStrictDecimal(row.remainingBaseAmount) === 0
        ) {
          nextState = 'filled';
        } else if (adapted?.status === 'open') {
          nextState = 'resting';
        } else {
          nextState = 'accepted';
        }
        if (
          ['filled', 'canceled', 'rejected'].includes(rung.state) &&
          nextState !== rung.state
        ) {
          // Keep terminal proof when an older active row reappears. Fresh
          // matching terminal rows still settle any pending nonce ledger.
          continue;
        }
        delete rung.nonAcceptance;
        rung.orderId = orderId;
        if (row.filledBaseAmount !== undefined) {
          rung.filledSize = row.filledBaseAmount;
        }
        rung.state = nextState;
        observed.push(rung);
      } else if (rung.txHash !== null && rung.orderId === undefined) {
        const transaction = await this.#clientService.getTx(rung.txHash);
        this.#assertSession(generation);
        if (
          transaction &&
          typeof transaction.hash === 'string' &&
          transaction.hash.replace(/^0x/u, '').toLowerCase() ===
            rung.txHash.replace(/^0x/u, '').toLowerCase() &&
          transaction.accountIndex === group.accountIndex &&
          transaction.apiKeyIndex === group.apiKeyIndex &&
          transaction.nonce === rung.nonce
        ) {
          const outcome = getLighterTransactionOutcome(transaction.status);
          if (outcome === 'executed') {
            delete rung.nonAcceptance;
            rung.state = 'accepted';
          } else if (outcome === 'failed') {
            rung.nonAcceptance = 'failed';
            rung.state = 'rejected';
          }
        } else if (
          abandon &&
          (rung.state === 'unknown' || rung.state === 'submitted') &&
          transaction === null &&
          cursor === undefined &&
          rung.expiresAt !== null &&
          Date.now() > rung.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
        ) {
          // Complete fresh absence and the exact signed expiry also cover an
          // acknowledged dispatch whose nonce ledger has already retired.
          rung.nonAcceptance = 'expired';
          rung.state = 'rejected';
        }
      }
    }
    for (const rung of group.rungs) {
      const attempt = rung.cancelAttempt;
      if (attempt === undefined || rung.state !== 'resting') {
        continue;
      }
      const transaction = await this.#clientService.getTx(attempt.txHash);
      this.#assertSession(generation);
      if (transaction !== null) {
        const matches =
          typeof transaction.hash === 'string' &&
          transaction.hash.replace(/^0x/u, '').toLowerCase() ===
            attempt.txHash &&
          transaction.accountIndex === group.accountIndex &&
          transaction.apiKeyIndex === attempt.apiKeyIndex &&
          transaction.nonce === attempt.nonce;
        if (
          matches &&
          getLighterTransactionOutcome(transaction.status) === 'failed'
        ) {
          delete rung.cancelAttempt;
        } else if (matches) {
          // A seen transaction cannot become never-landed through later indexer loss.
          attempt.acknowledged = true;
        } else if (attempt.acknowledged !== true) {
          delete attempt.acknowledged;
        }
      } else if (
        attempt.acknowledged === false &&
        observed.includes(rung) &&
        active.orders.some(
          (row) =>
            row.clientOrderIndex === rung.clientOrderId &&
            String(row.orderIndex) === rung.orderId,
        ) &&
        Date.now() > attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
      ) {
        const nonce = await this.#clientService.getNextNonce(
          group.accountIndex,
          attempt.apiKeyIndex,
        );
        this.#assertSession(generation);
        if (
          Number.isSafeInteger(nonce.nonce) &&
          nonce.nonce >= 0 &&
          nonce.nonce <= attempt.nonce
        ) {
          // Exact not-found after validity, an unconsumed nonce and a fresh owned
          // resting row prove this unacknowledged cancellation never landed.
          delete rung.cancelAttempt;
        }
      }
    }
    await this.#writeScaleGroup(key, group, generation);
    if (settleLedger) {
      await this.#settleObservedScaleAcceptance(group, observed, generation);
    }
  };

  readonly #awaitScaleVisibility = async (
    group: LighterScaleGroup,
    key: string,
    token: string,
    generation: number,
    settled: () => boolean,
    deadline = Date.now() + LIGHTER_SCALE_SETTLEMENT_WINDOW_MS,
  ): Promise<void> => {
    const startedAt = Date.now();
    const maxPolls =
      LIGHTER_SCALE_SETTLEMENT_WINDOW_MS / LIGHTER_SCALE_SETTLEMENT_POLL_MS;
    for (let poll = 0; poll <= maxPolls; poll += 1) {
      this.#assertSession(generation);
      await this.#refreshScaleGroup(group, key, token, generation, true);
      if (settled()) {
        return;
      }
      const now = Date.now();
      if (poll === maxPolls || now < startedAt || now >= deadline) {
        return;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(LIGHTER_SCALE_SETTLEMENT_POLL_MS, deadline - now),
        ),
      );
      this.#assertSession(generation);
    }
  };

  /** Reconcile exact Scale children without signing financial transactions.
   * @returns Latest durable observations without replaying placement.
   */
  async reviewScaleOrderGroups(): Promise<ScaleOrderGroup[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const key = this.#scaleKey(accountIndex);
    return await withProcessMutex(
      `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
      async () => {
        const groups = await this.#readScaleGroups(key, accountIndex);
        this.#assertSession(generation);
        const pending = await Promise.all(
          groups.map(async (group) =>
            (
              await this.#readNonceLedger(accountIndex, group.apiKeyIndex)
            ).entries.some((entry) =>
              entry.intent.startsWith(`placeScale:${group.groupId}:`),
            ),
          ),
        );
        this.#assertSession(generation);
        if (
          groups.every(isLighterScaleTerminal) &&
          pending.every((value) => !value)
        ) {
          return groups.map(toLighterScaleGroup);
        }
        const { token } = await this.#getRecoveryReadToken(
          accountIndex,
          generation,
        );
        for (const group of groups) {
          // A restart stops the coordinator permanently; it never resumes rungs.
          group.placementStopped = true;
          await this.#refreshScaleGroup(
            group,
            key,
            token,
            generation,
            true,
            true,
          );
          await this.#writeScaleGroup(key, group, generation);
          await this.#withLedgerLock(
            accountIndex,
            async () => {
              await this.#resolveNonceLedgerLocked(
                accountIndex,
                group.apiKeyIndex,
                { generation },
              );
            },
            group.apiKeyIndex,
          );
        }
        this.#assertSession(generation);
        return groups.map(toLighterScaleGroup);
      },
    );
  }

  readonly #placeScaleOrder = async (
    input: OrderParams,
    inheritedGeneration?: number,
  ): Promise<OrderResult> => {
    let params = { ...input };
    let group: LighterScaleGroup | undefined;
    let key: string | undefined;
    let generation: number | undefined;
    let leverageCommitted = false;
    try {
      params = {
        ...params,
        expectedScaleLadder: captureExpectedScaleLadder(
          params.expectedScaleLadder,
        ),
      };
      this.#ensureSessionBinding();
      generation = inheritedGeneration ?? this.#sessionGeneration;
      this.#assertSession(generation);
      const prepared = await this.#prepareScaleOrder(params, generation);
      const { market, ladder, accountIndex } = prepared;
      // Compare metadata only here. Accepted reduce-only children may already
      // have reduced the position; remaining exposure is checked separately.
      const metadataIntent = (
        currentMarket: LighterOrderBookMeta,
        currentLadder: ReturnType<typeof buildLighterScaleLadder>,
      ): string =>
        JSON.stringify({
          ladder: currentLadder,
          marketId: currentMarket.marketId,
          priceDecimals: currentMarket.supportedPriceDecimals,
          sizeDecimals: currentMarket.supportedSizeDecimals,
          minimumBaseSize: currentMarket.minBaseAmount,
          minimumQuoteAmount: currentMarket.minQuoteAmount,
        });
      const originalMetadataIntent = metadataIntent(market, ladder);
      const metadataGeneration = generation;
      const assertFreshMetadata = async (): Promise<void> => {
        const markets = await this.#ensureMarkets(true);
        this.#assertSession(metadataGeneration);
        const currentMarket = markets.get(params.symbol);
        try {
          if (!currentMarket) {
            throw new Error('Unknown Lighter Scale market');
          }
          const currentLadder = buildLighterScaleLadder(params, currentMarket);
          assertExpectedScaleLadder(
            params.expectedScaleLadder,
            currentLadder,
            currentMarket,
          );
          if (
            metadataIntent(currentMarket, currentLadder) !==
            originalMetadataIntent
          ) {
            throw new Error('Lighter Scale grid changed before dispatch');
          }
        } catch (error) {
          if (params.expectedScaleLadder !== undefined) {
            throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_PREVIEW_STALE);
          }
          throw error;
        }
      };

      key = this.#scaleKey(accountIndex);
      const prior = await this.#readScaleGroups(key, accountIndex);
      this.#assertSession(generation);
      if (
        prior.some(
          (entry) =>
            entry.rungs.some(
              (rung) => rung.state === 'unknown' || rung.state === 'submitted',
            ) || !entry.placementStopped,
        )
      ) {
        throw new Error(
          'Lighter Scale has unresolved placement; review its group before new exposure',
        );
      }
      if (
        prior.length >= LIGHTER_SCALE_MAX_GROUPS &&
        !prior.some(isLighterScaleTerminal)
      ) {
        throw new Error('Lighter Scale ownership is full');
      }
      const leverage = await this.#resolveLeverageIntent(params);
      const marginMode =
        leverage === null
          ? null
          : await this.#resolveMarginModeForSymbol(params.symbol);
      this.#assertSession(generation);
      await this.#ensureSignerReady();
      this.#assertSession(generation);
      const token = await this.#getAuthToken();
      this.#assertSession(generation);
      const capturedGeneration = generation;
      const capturedKey = key;
      return await this.#withVenueWriteLock(
        accountIndex,
        async (nextNonce, submit) => {
          const fresh = await this.#prepareScaleOrder(
            params,
            capturedGeneration,
            token,
          );
          if (
            JSON.stringify(fresh.ladder) !== JSON.stringify(ladder) ||
            fresh.market.marketId !== market.marketId
          ) {
            throw new Error('Lighter Scale grid changed before dispatch');
          }
          const groups = await this.#readScaleGroups(capturedKey, accountIndex);
          this.#assertSession(capturedGeneration);
          if (
            groups.some(
              (entry) =>
                !entry.placementStopped ||
                entry.rungs.some(
                  (rung) =>
                    rung.state === 'unknown' || rung.state === 'submitted',
                ),
            )
          ) {
            throw new Error('Lighter Scale has unresolved placement');
          }
          const ids = this.#allocateClientOrderIndexes(ladder.prices.length);
          if (this.#boundAddress === null) {
            throw new Error('Lighter Scale account binding is unavailable');
          }
          const ownedGroup: LighterScaleGroup = {
            version: 1,
            groupId: `${LIGHTER_SCALE_PREFIX}${capturedKey.slice(LIGHTER_SCALE_JOURNAL_PREFIX.length)}:${ids[0]}`,
            symbol: params.symbol,
            accountIndex,
            apiKeyIndex: this.#apiKeyIndex,
            marketId: market.marketId,
            isBuy: params.isBuy,
            reduceOnly: params.reduceOnly ?? false,
            createdAt: Date.now(),
            walletAddress: this.#boundAddress,
            network: this.#isTestnet ? 'testnet' : 'mainnet',
            sizeDecimals: market.supportedSizeDecimals,
            priceDecimals: market.supportedPriceDecimals,
            placementStopped: false,
            rungs: ladder.prices.map((price, index) => ({
              clientOrderId: ids[index],
              price,
              size: ladder.sizes[index],
              priceInt: new BigNumber(price)
                .shiftedBy(market.supportedPriceDecimals)
                .toNumber(),
              sizeInt: new BigNumber(ladder.sizes[index])
                .shiftedBy(market.supportedSizeDecimals)
                .toNumber(),
              state: 'prepared',
              nonce: null,
              txHash: null,
              expiresAt: null,
              orderExpiry: null,
            })),
          };
          group = ownedGroup;
          await this.#writeScaleGroup(
            capturedKey,
            ownedGroup,
            capturedGeneration,
          );
          await this.#assertScaleRemaining(
            ownedGroup,
            params.leverage,
            token,
            capturedGeneration,
            ownedGroup.rungs[0].clientOrderId,
          );
          if (leverage !== null && marginMode !== null) {
            const nonce = await nextNonce();
            await assertFreshMetadata();
            const signed = await this.#getSignerBridge().execute({
              function: '_signUpdateLeverage',
              params: [
                accountIndex,
                market.marketId,
                leverage,
                marginMode,
                nonce,
              ],
            });
            if (signed.error) {
              throw new Error(signed.error);
            }
            await submit(
              LIGHTER_TX_TYPE_UPDATE_LEVERAGE,
              signed.txInfo,
              () => {
                leverageCommitted = true;
              },
              {
                ...extractDispatchIdentity(signed),
                intent: `updateLeverage:${params.symbol}:${String(params.leverage)}`,
                beforeDispatch: assertFreshMetadata,
              },
            );
          }
          for (const rung of ownedGroup.rungs) {
            this.#assertSession(capturedGeneration);
            // Recheck aggregate remaining exposure after each accepted child.
            const nonce = await nextNonce();
            await assertFreshMetadata();
            const signed = await this.#getSignerBridge().execute({
              function: '_signCreateOrder',
              params: [
                accountIndex,
                market.marketId,
                rung.clientOrderId,
                String(rung.sizeInt),
                String(rung.priceInt),
                params.isBuy ? 0 : 1,
                LIGHTER_ORDER_TYPE_LIMIT,
                LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME,
                params.reduceOnly ? 1 : 0,
                String(LIGHTER_NO_TRIGGER_PRICE),
                LIGHTER_ORDER_EXPIRY_NONE,
                nonce,
              ],
            });
            this.#assertSession(capturedGeneration);
            if (signed.error) {
              throw new Error(signed.error);
            }
            const identity = extractDispatchIdentity(signed);
            if (identity.txHash === null || identity.expiresAt === null) {
              throw new Error(
                'Lighter Scale signing omitted dispatch identity',
              );
            }
            const wire: unknown = JSON.parse(signed.txInfo);
            if (
              typeof wire !== 'object' ||
              wire === null ||
              !('Nonce' in wire) ||
              wire.Nonce !== nonce ||
              !('OrderExpiry' in wire) ||
              typeof wire.OrderExpiry !== 'number' ||
              !Number.isSafeInteger(wire.OrderExpiry) ||
              wire.OrderExpiry <= Date.now()
            ) {
              throw new Error(
                'Invalid Lighter Scale signed nonce or order expiry',
              );
            }
            rung.nonce = nonce;
            rung.txHash = identity.txHash;
            rung.expiresAt = identity.expiresAt;
            rung.orderExpiry = wire.OrderExpiry;
            await submit(
              LIGHTER_TX_TYPE_CREATE_ORDER,
              signed.txInfo,
              () => {
                rung.state = 'submitted';
              },
              {
                ...identity,
                intent: `placeScale:${ownedGroup.groupId}:${rung.clientOrderId}`,
                beforeDispatch: async () => {
                  rung.state = 'unknown';
                  await this.#writeScaleGroup(
                    capturedKey,
                    ownedGroup,
                    capturedGeneration,
                  );
                  await this.#assertScaleRemaining(
                    ownedGroup,
                    params.leverage,
                    token,
                    capturedGeneration,
                    rung.clientOrderId,
                  );
                  await assertFreshMetadata();
                },
                onNotDispatched: async () => {
                  rung.state = 'prepared';
                  rung.nonce = null;
                  rung.txHash = null;
                  rung.expiresAt = null;
                  rung.orderExpiry = null;
                  await this.#writeScaleGroup(
                    capturedKey,
                    ownedGroup,
                    capturedGeneration,
                  );
                },
              },
            );
            await this.#writeScaleGroup(
              capturedKey,
              ownedGroup,
              capturedGeneration,
            );
            await this.#awaitScaleVisibility(
              ownedGroup,
              capturedKey,
              token,
              capturedGeneration,
              () => !['unknown', 'submitted'].includes(rung.state),
            );
            if (
              rung.state === 'unknown' ||
              rung.state === 'submitted' ||
              rung.state === 'rejected'
            ) {
              throw new Error(
                'Lighter Scale child acceptance is not confirmed; remaining rungs stopped',
              );
            }
          }
          ownedGroup.placementStopped = true;
          await this.#writeScaleGroup(
            capturedKey,
            ownedGroup,
            capturedGeneration,
          );
          return { ...toLighterScaleGroup(ownedGroup), success: true };
        },
        capturedGeneration,
      );
    } catch (error) {
      const wrappedError = this.#reportTradingError(
        error,
        'placeScaleOrder',
        {
          operation: PERPS_ERROR_OPERATION.OrderManagement,
          action: PERPS_ERROR_ACTION.PlaceOrder,
        },
        {
          symbol: params.symbol,
          orderType: params.orderType,
        },
      );
      if (group && key !== undefined && generation !== undefined) {
        group.placementStopped = true;
        try {
          await this.#writeScaleGroup(key, group, generation);
        } catch {
          /* Prior durable dispatch ownership remains. */
        }
      }
      return {
        ...(group ? toLighterScaleGroup(group) : {}),
        success: false,
        error: wrappedError.message,
        ...(leverageCommitted
          ? { partialState: { leverageUpdated: Number(params.leverage) } }
          : {}),
      };
    }
  };

  readonly #cancelScaleOrder = async (
    params: CancelOrderParams,
    generation: number,
  ): Promise<CancelOrderResult> => {
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const key = this.#scaleKey(accountIndex);
    const lookup = async (): Promise<LighterScaleGroup> => {
      const groups = await this.#readScaleGroups(key, accountIndex);
      this.#assertSession(generation);
      const group = groups.find(
        (entry) =>
          entry.groupId === params.orderId && entry.symbol === params.symbol,
      );
      if (!group) {
        throw new Error('Unknown Lighter Scale group for this account');
      }
      return group;
    };
    const terminal = await withProcessMutex(
      `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
      async () => {
        const current = await lookup();
        current.placementStopped = true;
        if (!isLighterScaleTerminal(current)) {
          try {
            const { token: readToken } = await this.#getRecoveryReadToken(
              accountIndex,
              generation,
            );
            await this.#refreshScaleGroup(
              current,
              key,
              readToken,
              generation,
              true,
            );
          } catch (error) {
            if (!(error instanceof LighterRecoveryReadAuthorityError)) {
              throw error;
            }
            // A live owned group can acquire signing authority below even
            // after local key loss. Registration and transport errors cannot.
            this.#assertSession(generation);
          }
        }
        await this.#writeScaleGroup(key, current, generation);
        if (!isLighterScaleTerminal(current)) {
          return false;
        }
        await this.#withLedgerLock(
          accountIndex,
          async () => {
            await this.#resolveNonceLedgerLocked(
              accountIndex,
              current.apiKeyIndex,
              { generation },
            );
          },
          current.apiKeyIndex,
        );
        return true;
      },
    );
    this.#assertSession(generation);
    if (terminal) {
      return { success: true, orderId: params.orderId, providerId: 'lighter' };
    }
    await this.#ensureSignerReady();
    const token = await this.#getAuthToken();
    this.#assertSession(generation);
    return await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit) => {
        const group = await lookup();
        group.placementStopped = true;
        await this.#writeScaleGroup(key, group, generation);
        await this.#refreshScaleGroup(group, key, token, generation, true);
        // One group deadline includes every authorized child cancellation.
        // Dispatch each exact child once before polling the whole group.
        const settlementDeadline =
          Date.now() + LIGHTER_SCALE_SETTLEMENT_WINDOW_MS;
        const cancellations: LighterScaleRung[] = [];
        for (const rung of group.rungs) {
          if (
            ['prepared', 'filled', 'canceled', 'rejected'].includes(rung.state)
          ) {
            continue;
          }
          if (rung.state !== 'resting' || rung.orderId === undefined) {
            continue;
          }
          if (rung.cancelAttempt !== undefined) {
            cancellations.push(rung);
            continue;
          }
          const nonce = await nextNonce();
          const signed = await this.#getSignerBridge().execute({
            function: '_signCancelOrder',
            params: [accountIndex, group.marketId, rung.orderId, nonce],
          });
          if (signed.error) {
            throw new Error(signed.error);
          }
          const identity = extractDispatchIdentity(signed);
          const wire: unknown = JSON.parse(signed.txInfo);
          if (
            identity.txHash === null ||
            identity.expiresAt === null ||
            typeof wire !== 'object' ||
            wire === null ||
            !('Nonce' in wire) ||
            wire.Nonce !== nonce
          ) {
            throw new Error('Invalid Lighter Scale cancellation identity');
          }
          const attempt: NonNullable<LighterScaleRung['cancelAttempt']> = {
            apiKeyIndex: this.#apiKeyIndex,
            nonce,
            txHash: identity.txHash.replace(/^0x/u, '').toLowerCase(),
            expiresAt: identity.expiresAt,
          };
          let accepted = false;
          try {
            await submit(
              LIGHTER_TX_TYPE_CANCEL_ORDER,
              signed.txInfo,
              () => {
                accepted = true;
                attempt.acknowledged = true;
              },
              {
                ...identity,
                intent: `cancelScale:${group.groupId}:${rung.clientOrderId}`,
                beforeDispatch: async () => {
                  rung.cancelAttempt = attempt;
                  await this.#writeScaleGroup(key, group, generation);
                },
                onNotDispatched: async () => {
                  delete rung.cancelAttempt;
                  await this.#writeScaleGroup(key, group, generation);
                },
                afterAccepted: async () =>
                  this.#recordScaleCancellationAcknowledgement(
                    key,
                    group,
                    rung,
                    attempt,
                    true,
                  ),
              },
            );
          } catch (error) {
            if (!accepted) {
              await this.#recordScaleCancellationAcknowledgement(
                key,
                group,
                rung,
                attempt,
                false,
              );
            }
            throw error;
          }
          cancellations.push(rung);
        }
        if (cancellations.length > 0) {
          await this.#awaitScaleVisibility(
            group,
            key,
            token,
            generation,
            () => cancellations.every((rung) => rung.state !== 'resting'),
            settlementDeadline,
          );
        }
        await this.#refreshScaleGroup(group, key, token, generation, true);
        if (!isLighterScaleTerminal(group)) {
          throw new Error('Lighter Scale cancellation remains unresolved');
        }
        await this.#writeScaleGroup(key, group, generation);
        return { success: true, orderId: group.groupId, providerId: 'lighter' };
      },
      generation,
    );
  };

  async getMarkets(_params?: GetMarketsParams): Promise<MarketInfo[]> {
    try {
      const markets = await this.#clientService.getOrderBooks();
      await this.#ensureMarketMargins();
      return markets
        .filter((market) => market.marketType === 'perp')
        .flatMap((market) => {
          const margins = this.#marginBySymbol.get(market.symbol);
          if (!margins) {
            // #ensureMarketMargins deliberately omits inactive rows whose
            // retired risk metadata cannot produce a canonical MarketInfo.
            if (market.status === 'inactive') {
              return [];
            }
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} missing authoritative leverage for ${market.symbol}`,
            );
          }
          const adapted = adaptMarketFromLighter(
            market,
            deriveLighterMaxLeverage(margins.minInitial, market.symbol),
          );
          // minBaseAmount and minQuoteAmount are maker-only. Market and
          // IOC orders can use one base-size tick, so the public universal
          // minimum must report that tick rather than the maker floor.
          delete adapted.minimumOrderSize;
          if (margins?.lastTradePrice && margins.lastTradePrice > 0) {
            const oneTickUsd =
              margins.lastTradePrice / 10 ** market.supportedSizeDecimals;
            if (Number.isFinite(oneTickUsd) && oneTickUsd > 0) {
              adapted.minimumOrderSize = oneTickUsd;
            }
          }
          return [adapted];
        });
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getMarkets',
      );
      this.#deps.debugLogger.log('[LighterProvider] getMarkets failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getMarkets'),
      });
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        throw caughtError;
      }
      return [];
    }
  }

  async getMarketDataWithPrices(): Promise<PerpsMarketData[]> {
    try {
      const response = await this.#clientService.getOrderBookDetails();
      return response.orderBookDetails
        .filter((detail) => detail.marketType === 'perp')
        .filter((detail) => !isInactiveMarketWithoutUsableRiskMetadata(detail))
        .map((detail) =>
          adaptMarketDataFromLighter(detail, this.#deps.marketDataFormatters),
        );
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getMarketDataWithPrices',
      );
      this.#deps.debugLogger.log(
        '[LighterProvider] getMarketDataWithPrices failed',
        {
          error: String(wrappedError),
          ...this.#getErrorContext('getMarketDataWithPrices'),
        },
      );
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        throw caughtError;
      }
      return [];
    }
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async getPositions(_params?: GetPositionsParams): Promise<Position[]> {
    return this.#getPositions(false);
  }

  /**
   * Keep raw signed decimals only for exact partial protection intent.
   *
   * @param preserveRawSize - Preserve venue size before adapter number conversion.
   * @returns Validated positions.
   */
  readonly #getPositions = async (
    preserveRawSize: boolean,
  ): Promise<Position[]> => {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    // Risk metadata is required for every returned position. A transport
    // failure must reject instead of looking like an authoritative empty
    // account.
    await this.#ensureMarketMargins();
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const response =
        await this.#clientService.getAccountByIndex(accountIndex);
      this.#assertSession(generation);
      const account = response.accounts[0];
      if (!account?.positions) {
        return [];
      }
      // Adapt BEFORE filtering: the adapter strict-validates raw numeric
      // sizes, and a prefix-parsing filter would silently drop (or keep)
      // malformed entries like '0oops' before validation could fire.
      return account.positions
        .map((position) => {
          const adapted = adaptPositionFromLighter(
            position,
            this.#maxLeverageForPosition(position),
          );
          return preserveRawSize
            ? {
                ...adapted,
                size: `${position.sign === -1 ? '-' : ''}${position.position}`,
              }
            : adapted;
        })
        .filter((position) => parseFloat(position.size) !== 0);
    } catch (caughtError) {
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        // Capability gates and venue-data integrity failures must surface,
        // never degrade into empty state that can preserve stale views.
        throw caughtError;
      }
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getPositions',
      );
      this.#deps.debugLogger.log('[LighterProvider] getPositions failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getPositions'),
      });
      return [];
    }
  };

  /**
   * Report the margin mode Lighter currently binds to a market. Only an
   * open position locks the mode here: the venue refuses a mode change
   * while a position is open. Resting orders are not treated as a lock.
   *
   * @param params - Market and optional provider route.
   * @returns The current lock, or unavailable when it cannot be read.
   */
  async getMarginModeLock(
    params: GetMarginModeLockParams,
  ): Promise<PerpsMarginModeLock> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const wireMarginMode = await this.#readPositionMarginMode(params.symbol);
      this.#assertSession(generation);
      if (wireMarginMode === null) {
        return { status: 'unlocked', providerId: this.protocolId };
      }
      return {
        status: 'locked',
        providerId: this.protocolId,
        marginMode:
          wireMarginMode === LIGHTER_MARGIN_MODE_ISOLATED
            ? 'isolated'
            : 'cross',
        reason: 'position',
      };
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] getMarginModeLock unavailable',
        {
          symbol: params.symbol,
          error: ensureError(error, 'LighterProvider.getMarginModeLock')
            .message,
        },
      );
      return {
        status: 'unavailable',
        providerId: this.protocolId,
        reason: 'provider_unavailable',
      };
    }
  }

  async getAccountState(
    _params?: GetAccountStateParams,
  ): Promise<AccountState> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const response =
        await this.#clientService.getAccountByIndex(accountIndex);
      // A delayed response for the previous account must never surface as
      // the current account's state.
      this.#assertSession(generation);
      const account = response.accounts[0];
      if (!account) {
        return EMPTY_ACCOUNT_STATE;
      }
      return adaptAccountStateFromLighter(account);
    } catch (caughtError) {
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        // Capability gates and venue-data integrity failures must surface,
        // never degrade into empty state that can preserve stale views.
        throw caughtError;
      }
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getAccountState',
      );
      this.#deps.debugLogger.log('[LighterProvider] getAccountState failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getAccountState'),
      });
      return EMPTY_ACCOUNT_STATE;
    }
  }

  /** Decorate real venue rows only when they match durable Scale intent.
   * @param rows - Authoritative venue rows.
   * @param accountIndex - Bound account.
   * @param generation - Issuing session.
   * @returns Adapted orders, with exact durable group ownership when present.
   */
  readonly #adaptScaleOrders = async (
    rows: LighterApiOrder[],
    accountIndex: number,
    generation: number,
  ): Promise<Order[]> => {
    let groups: LighterScaleGroup[] = [];
    try {
      groups = await this.#readScaleGroups(
        this.#scaleKey(accountIndex),
        accountIndex,
      );
    } catch {
      // Attribution is optional; group inventory still exposes integrity errors.
    }
    this.#assertSession(generation);
    return rows.map((row) => {
      const order = adaptOrderFromLighter(
        row,
        this.#marketsById.get(row.marketIndex)?.symbol ??
          String(row.marketIndex),
      );
      const matches = groups.filter(
        (group) =>
          group.accountIndex === row.ownerAccountIndex &&
          group.marketId === row.marketIndex &&
          group.rungs.some(
            (rung) =>
              rung.clientOrderId === row.clientOrderIndex &&
              rung.state !== 'rejected' &&
              (rung.orderId === undefined ||
                rung.orderId === String(row.orderIndex)) &&
              new BigNumber(rung.size).eq(row.initialBaseAmount) &&
              new BigNumber(rung.price).eq(row.price),
          ) &&
          row.isAsk === !group.isBuy &&
          Boolean(row.reduceOnly) === group.reduceOnly &&
          row.type === 'limit',
      );
      if (matches.length > 1) {
        throw new Error('Ambiguous Lighter Scale ownership');
      }
      return matches.length === 1
        ? { ...order, strategyGroupId: matches[0].groupId }
        : order;
    });
  };

  /**
   * STRICT active-orders read: any REST/auth failure THROWS. Mutation
   * flows (TP/SL replacement/removal) must use this — treating a swallowed
   * [] as authoritative would let them "succeed" while cancelling nothing.
   *
   * @returns Adapted open orders.
   */
  readonly #readOpenOrdersStrict = async (): Promise<Order[]> => {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    const authToken = await this.#getAuthToken();
    // The index and the token must belong to the SAME session — never
    // pair the previous account's index with the new account's token.
    this.#assertSession(generation);
    const response = await this.#clientService.getActiveOrders(
      accountIndex,
      authToken,
    );
    this.#assertSession(generation);
    return this.#adaptScaleOrders(response.orders, accountIndex, generation);
  };

  async getOpenOrders(_params?: GetOrdersParams): Promise<Order[]> {
    // Public reads re-kick pending journal recovery (deduped, detached).
    this.#kickTpslRecovery();
    try {
      return await this.#readOpenOrdersStrict();
    } catch (caughtError) {
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        // Capability gates must surface, never degrade into empty state.
        throw caughtError;
      }
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getOpenOrders',
      );
      this.#deps.debugLogger.log('[LighterProvider] getOpenOrders failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getOpenOrders'),
      });
      return [];
    }
  }

  async getOrders(
    params?: GetOrdersParams,
    _options?: PerpsReadOptions,
  ): Promise<Order[]> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      this.#assertSession(generation);
      await this.#ensureMarkets();
      const response = await this.#clientService.getInactiveOrders(
        accountIndex,
        authToken,
      );
      // Both legs (historical + open) must come from one session — a
      // switch mid-way would merge account A's history with B's orders.
      this.#assertSession(generation);
      const historical = await this.#adaptScaleOrders(
        response.orders ?? [],
        accountIndex,
        generation,
      );
      // Full lifecycle: open orders first, then the historical states.
      const open = await this.getOpenOrders(params);
      // getOpenOrders swallows its own cancellation into []; the merge must
      // still refuse to pair A's history with B's session.
      this.#assertSession(generation);
      return [...open, ...historical];
    } catch (caughtError) {
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        // Capability gates must surface, never degrade into empty state.
        throw caughtError;
      }
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getOrders',
      );
      this.#deps.debugLogger.log('[LighterProvider] getOrders failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getOrders'),
      });
      return [];
    }
  }

  async getCurrentAccountId(): Promise<CaipAccountId> {
    const address = this.#walletService.getUserAddress();
    const chainId = getLighterChainId(this.#clientService.network);
    return `eip155:${chainId}:${address}`;
  }

  // ============================================================================
  // Trading Operations (POC: limit/market place + cancel)
  // ============================================================================

  /**
   * Apply the leverage the caller requested with the order.
   *
   * Lighter models leverage as a per-market account setting (UpdateLeverage,
   * tx 20; initial margin fraction in hundredths of a percent), not an order
   * field. The venue rejects the update while a position or resting order
   * exists on the market, so in that case the request is skipped with a log
   * (matching the already-set leverage is not an error).
   *
   * @param accountIndex - Lighter account index.
   * @param market - Market metadata for the order being placed.
   * @param params - The original order params carrying `leverage`.
   */
  /**
   * Decide whether the caller's requested leverage needs a venue update.
   *
   * @param params - The order params carrying `leverage`.
   * @returns The UpdateLeverage margin fraction (hundredths of a percent)
   * to sign, or null when no change is needed.
   */
  readonly #resolveLeverageIntent = async (
    params: OrderParams,
  ): Promise<number | null> => {
    const requested = params.leverage;
    if (requested === undefined) {
      return null;
    }
    // Venue state decides, never the caller's possibly-stale
    // existingPositionLeverage snapshot.
    const positions = await this.getPositions();
    const held = positions.find(
      (position) => position.symbol === params.symbol,
    );
    if (
      held?.leverage?.value !== undefined &&
      Math.abs(held.leverage.value - requested) < 0.5
    ) {
      // Requested leverage already in effect — intent satisfied.
      return null;
    }
    // Otherwise sign the update inside the placement's own write lock. If
    // the market has a position or resting order the venue rejects it with
    // a clear error, failing the placement instead of silently trading at
    // a leverage the caller did not ask for.
    return Math.round(10_000 / requested);
  };

  /**
   * Account-wide attached ownership survives signer-key migration.
   *
   * @param accountIndex - Captured venue account.
   * @returns Storage identity bound to this wallet and network.
   */
  readonly #attachedKey = (accountIndex: number): string =>
    `lighterAttachedOrders:${this.#isTestnet ? 'testnet' : 'mainnet'}:${this.#boundAddress}:${accountIndex}`;

  /**
   * Read immutable groups and reserve their client IDs in this provider lifetime.
   *
   * @param key - Captured account storage key.
   * @returns Validated durable groups.
   */
  readonly #readAttachedGroups = async (
    key: string,
  ): Promise<LighterAttachedGroup[]> => {
    const groups = parseLighterAttachedGroups(
      await this.#deps.diskCache.getItem(key),
    );
    const scope = `${LIGHTER_ATTACHED_HANDLE_PREFIX}${key.slice('lighterAttachedOrders:'.length)}:`;
    for (const group of groups) {
      if (
        group.accountIndex !== Number(key.split(':').at(-1)) ||
        !group.groupId.startsWith(scope) ||
        !group.groupId.endsWith(`:${group.orders[0][0]}:${group.orders[0][1]}`)
      ) {
        throw new Error(
          'Lighter attached-order journal belongs to a different account',
        );
      }
      for (const order of group.orders) {
        this.#issuedClientOrderIds.add(order[1]);
      }
    }
    return groups;
  };

  /**
   * Persist one group without replacing another concurrent operation.
   *
   * @param key - Captured account storage key.
   * @param group - Group with immutable intent and updated observation.
   * @param generation - Caller session.
   */
  readonly #writeAttachedGroup = async (
    key: string,
    group: LighterAttachedGroup,
    generation: number,
  ): Promise<void> => {
    await withStorageMutex(key, async () => {
      this.#assertSession(generation);
      const groups = await this.#readAttachedGroups(key);
      this.#assertSession(generation);
      const index = groups.findIndex(
        (entry) => entry.groupId === group.groupId,
      );
      if (index < 0) {
        if (groups.length >= LIGHTER_ATTACHED_MAX_GROUPS) {
          const reclaimable = groups.findIndex(
            (entry) =>
              entry.submission === 'canceled' ||
              entry.submission === 'completed',
          );
          if (reclaimable < 0) {
            throw new Error('Lighter attached-order ownership is full');
          }
          groups.splice(reclaimable, 1);
        }
        groups.push(group);
      } else {
        if (JSON.stringify(groups[index]) === JSON.stringify(group)) {
          return;
        }
        groups[index] = group;
      }
      const serialized = JSON.stringify(groups);
      parseLighterAttachedGroups(serialized);
      await this.#deps.diskCache.setItem(key, serialized);
      this.#assertSession(generation);
    });
  };

  /**
   * Read local attached group identities without signer setup or financial replay.
   *
   * @returns All retained groups for the selected account.
   */
  async getAttachedOrderGroups(): Promise<AttachedOrderGroup[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const inventory = await this.#resolveRecoveryInventory(generation);
    const groups = await Promise.all(
      inventory.accounts.map(async (accountIndex) =>
        this.#readAttachedGroups(this.#attachedKey(accountIndex)),
      ),
    );
    this.#assertSession(generation);
    return groups.flat().map(toAttachedOrderGroup);
  }

  /**
   * Read one bounded market snapshot under the caller's session.
   *
   * @param accountIndex - Venue account.
   * @param token - Registered read authority.
   * @param marketIndex - Signed market identity.
   * @param generation - Caller session.
   * @param groups - Same-market groups whose missing legs require older history.
   * @returns Authoritative active and bounded inactive rows.
   */
  readonly #readAttachedOrders = async (
    accountIndex: number,
    token: string,
    marketIndex: number,
    generation: number,
    groups: LighterAttachedGroup[],
  ): Promise<LighterAttachedOrderSnapshot> => {
    const active = await this.#clientService.getActiveOrders(
      accountIndex,
      token,
      marketIndex,
    );
    this.#assertSession(generation);
    if (!Array.isArray(active.orders)) {
      throw new Error(
        'Lighter attached orders require bounded authoritative order containers',
      );
    }
    const rows = [...active.orders];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    let historyRows = 0;
    let pages = 0;
    const prepared = groups.map((group) => group.preparedAt);
    const cutoff = prepared.every((time): time is number => time !== undefined)
      ? (Math.min(...prepared) - LIGHTER_ATTACHED_HISTORY_TIME_SLACK_MS) / 1000
      : null;
    let previousTimestamp = Number.POSITIVE_INFINITY;
    let orderedHistory = true;
    do {
      const inactive = await this.#clientService.getInactiveOrders(
        accountIndex,
        token,
        LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE,
        cursor,
        marketIndex,
      );
      this.#assertSession(generation);
      pages += 1;
      if (
        !Array.isArray(inactive.orders) ||
        inactive.orders.length > LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE ||
        (inactive.nextCursor !== undefined &&
          typeof inactive.nextCursor !== 'string')
      ) {
        throw new Error(
          'Lighter attached orders require bounded authoritative order containers',
        );
      }
      historyRows += inactive.orders.length;
      rows.push(...inactive.orders);
      cursor = inactive.nextCursor;
      for (const row of inactive.orders) {
        if (
          !Number.isFinite(row.timestamp) ||
          row.timestamp <= 0 ||
          row.timestamp > previousTimestamp ||
          row.ownerAccountIndex !== accountIndex ||
          row.marketIndex !== marketIndex
        ) {
          orderedHistory = false;
        }
        previousTimestamp = row.timestamp;
      }
      if (
        !groups.some((group) =>
          correlateLighterAttachedOrders(group, rows).some(
            (row) => row === null,
          ),
        )
      ) {
        return { rows, complete: true };
      }
      if (cutoff !== null && orderedHistory && previousTimestamp < cutoff) {
        return { rows, complete: true };
      }
      if (
        cursor &&
        (historyRows >= LIGHTER_INACTIVE_HISTORY_ROW_LIMIT ||
          pages >= LIGHTER_ATTACHED_HISTORY_PAGE_LIMIT)
      ) {
        return { rows, complete: false };
      }
      if (cursor) {
        if (seenCursors.has(cursor) || inactive.orders.length === 0) {
          throw new Error(
            'Lighter attached history cursor did not make progress',
          );
        }
        seenCursors.add(cursor);
      }
    } while (cursor);
    return { rows, complete: orderedHistory };
  };

  /**
   * Transfer fresh complete native-group acceptance to the generic nonce ledger.
   * The caller holds the account mutex and has persisted the exact observation.
   * Saved venue IDs alone never invoke this handoff.
   * @param group - Scoped durable group with its complete fresh observation.
   * @param rows - Exact rows from this review, not persisted IDs.
   * @param generation - Issuing session.
   */
  readonly #settleObservedAttachedAcceptance = async (
    group: LighterAttachedGroup,
    rows: (LighterApiOrder | null)[],
    generation: number,
  ): Promise<void> => {
    if (
      rows.length !== group.orders.length ||
      rows.some((row) => row === null) ||
      group.txHash === null ||
      group.nonce === null ||
      group.expiresAt === null ||
      group.acceptanceReviewedAt === undefined
    ) {
      return;
    }
    const transaction = await this.#clientService.getTx(group.txHash);
    this.#assertSession(generation);
    // Exact transaction outcomes retain their existing generic settlement path.
    // Mismatched, pending or failed hash responses never borrow leg evidence.
    if (transaction !== null) {
      return;
    }
    const nonce = await this.#clientService.getNextNonce(
      group.accountIndex,
      group.apiKeyIndex,
    );
    this.#assertSession(generation);
    if (!Number.isSafeInteger(nonce.nonce) || nonce.nonce <= group.nonce) {
      return;
    }
    await this.#withLedgerLock(
      group.accountIndex,
      async () => {
        const doc = await this.#readNonceLedger(
          group.accountIndex,
          group.apiKeyIndex,
        );
        this.#assertSession(generation);
        const entry = doc.entries.find(
          (candidate) =>
            candidate.owner === null &&
            candidate.intent === `placeAttached:${group.groupId}` &&
            candidate.kind === LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS &&
            candidate.nonce === group.nonce &&
            candidate.txHash === group.txHash &&
            candidate.expiresAt === group.expiresAt,
        );
        if (!entry) {
          return;
        }
        this.#appendRecoveredDispatch(doc, {
          recoveryId: `${entry.nonce}:${entry.txHash}`,
          kind: entry.kind,
          intent: entry.intent,
          txHash: entry.txHash,
          outcome: 'succeeded',
          evidence: 'fresh-exact-attached-legs',
        });
        doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
        doc.entries = doc.entries.filter((candidate) => candidate !== entry);
        await this.#writeNonceLedger(
          group.accountIndex,
          doc,
          group.apiKeyIndex,
        );
        this.#assertSession(generation);
        const reservationKey = `${group.accountIndex}:${group.apiKeyIndex}`;
        this.#nonceReservations.set(
          reservationKey,
          Math.max(
            this.#nonceReservations.get(reservationKey) ?? 0,
            entry.nonce + 1,
          ),
        );
      },
      group.apiKeyIndex,
    );
  };

  /**
   * Check terminal status only on an exactly correlated owned leg.
   *
   * @param row - Exact venue leg.
   * @param symbol - Group symbol.
   * @returns Whether the leg cannot execute again.
   */
  readonly #isAttachedOrderTerminal = (
    row: LighterApiOrder,
    symbol: string,
  ): boolean => {
    if (row.status === 'rejected') {
      return true;
    }
    const order = adaptOrderFromLighter(row, symbol);
    return (
      order.status === 'canceled' ||
      (order.status === 'filled' &&
        parseStrictDecimal(row.remainingBaseAmount) === 0)
    );
  };

  /**
   * Review exact signed identities using registered local read authority.
   *
   * @returns Venue observations; missing rows and linkage remain unknown.
   */
  async reviewAttachedOrderGroups(): Promise<AttachedOrderGroup[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const key = this.#attachedKey(accountIndex);
    return await withProcessMutex(
      `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
      async () => {
        this.#assertSession(generation);
        const groups = await this.#readAttachedGroups(key);
        this.#assertSession(generation);
        const pendingGroups = new Set<string>();
        for (const group of groups) {
          const ledger = await this.#readNonceLedger(
            accountIndex,
            group.apiKeyIndex,
          );
          this.#assertSession(generation);
          if (
            ledger.entries.some(
              (entry) => entry.intent === `placeAttached:${group.groupId}`,
            )
          ) {
            pendingGroups.add(group.groupId);
          }
        }
        if (
          groups.every(
            (group) =>
              (group.submission === 'canceled' ||
                group.submission === 'completed') &&
              !pendingGroups.has(group.groupId),
          )
        ) {
          return groups.map(toAttachedOrderGroup);
        }
        const { token } = await this.#getRecoveryReadToken(
          accountIndex,
          generation,
        );
        this.#assertSession(generation);
        const results: AttachedOrderGroup[] = [];
        const snapshots = new Map<number, LighterAttachedOrderSnapshot>();
        for (const group of groups) {
          if (
            (group.submission === 'canceled' ||
              group.submission === 'completed') &&
            !pendingGroups.has(group.groupId)
          ) {
            results.push(toAttachedOrderGroup(group));
            continue;
          }
          const marketIndex = group.orders[0][0];
          let snapshot = snapshots.get(marketIndex);
          if (!snapshot) {
            snapshot = await this.#readAttachedOrders(
              accountIndex,
              token,
              marketIndex,
              generation,
              groups.filter(
                (candidate) =>
                  candidate.orders[0][0] === marketIndex &&
                  ((candidate.submission !== 'canceled' &&
                    candidate.submission !== 'completed') ||
                    pendingGroups.has(candidate.groupId)),
              ),
            );
            snapshots.set(marketIndex, snapshot);
          }
          const rows = correlateLighterAttachedOrders(group, snapshot.rows);
          for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            if (row) {
              group.venueIds[index] = String(row.orderIndex);
            }
          }
          const hasLegs = rows.some((row) => row !== null);
          const allLegs = rows.every((row) => row !== null);
          if (allLegs) {
            delete group.nonAcceptance;
            group.submission = 'accepted';
            if (pendingGroups.has(group.groupId)) {
              group.acceptanceReviewedAt = Date.now();
            }
          }
          if (hasLegs && group.nonAcceptance !== undefined) {
            delete group.nonAcceptance;
            group.submission = 'accepted';
          }
          if (
            (group.submission === 'unknown' ||
              (group.submission === 'accepted' && !hasLegs)) &&
            group.txHash !== null
          ) {
            const transaction = await this.#clientService.getTx(group.txHash);
            this.#assertSession(generation);
            if (
              transaction &&
              typeof transaction.hash === 'string' &&
              transaction.hash.toLowerCase().replace(/^0x/u, '') ===
                group.txHash.toLowerCase().replace(/^0x/u, '') &&
              transaction.accountIndex === accountIndex &&
              transaction.apiKeyIndex === group.apiKeyIndex &&
              transaction.nonce === group.nonce
            ) {
              const outcome = getLighterTransactionOutcome(transaction.status);
              if (outcome === 'executed') {
                delete group.nonAcceptance;
                group.submission = 'accepted';
              } else if (
                outcome === 'failed' &&
                !hasLegs &&
                snapshot.complete &&
                group.venueIds.every((id) => id === null)
              ) {
                group.nonAcceptance = 'failed';
                group.submission = 'canceled';
              }
            }
          }
          const parent = rows[0];
          const children = rows.slice(1);
          const linked =
            parent !== null &&
            children.every((child) => {
              if (child === null) {
                return false;
              }
              const parentIds = [
                String(parent.orderIndex),
                parent.orderId,
              ].filter((id): id is string => id !== undefined);
              const childIds = [String(child.orderIndex), child.orderId].filter(
                (id): id is string => id !== undefined,
              );
              const childReferences = [
                child.parentOrderIndex === undefined
                  ? undefined
                  : String(child.parentOrderIndex),
                child.parentOrderId,
              ].filter(
                (id): id is string =>
                  id !== undefined && id !== '' && id !== '0',
              );
              const parentReferences = [
                parent.toTriggerOrderId0,
                parent.toTriggerOrderId1,
              ].filter(
                (id): id is string =>
                  id !== undefined && id !== '' && id !== '0',
              );
              return (
                childReferences.every((id) => parentIds.includes(id)) &&
                (childReferences.length > 0 ||
                  parentReferences.some((id) => childIds.includes(id))) &&
                (parentReferences.length === 0 ||
                  parentReferences.some((id) => childIds.includes(id)))
              );
            });
          const orders: NonNullable<AttachedOrderGroup['orders']> = rows.map(
            (row, index) => {
              if (!row) {
                return {
                  clientOrderId: String(group.orders[index][1]),
                  status: 'unknown',
                };
              }
              const status =
                row.status === 'rejected'
                  ? 'rejected'
                  : adaptOrderFromLighter(row, group.symbol).status;
              const filled =
                row.filledBaseAmount === undefined
                  ? null
                  : parseStrictDecimal(row.filledBaseAmount);
              if (
                (row.filledBaseAmount !== undefined && filled === null) ||
                (filled !== null && (!Number.isFinite(filled) || filled < 0))
              ) {
                throw new Error(
                  'Lighter attached review has invalid fill quantity',
                );
              }
              let observedStatus: NonNullable<
                AttachedOrderGroup['orders']
              >[number]['status'] = 'unknown';
              if (status === 'open') {
                observedStatus = 'resting';
                if (row.status === 'pending') {
                  observedStatus = 'waiting';
                } else if (filled !== null && filled > 0) {
                  observedStatus = 'partially-filled';
                }
              } else if (
                status === 'filled' ||
                status === 'canceled' ||
                status === 'rejected'
              ) {
                observedStatus = status;
              }
              return {
                clientOrderId: String(row.clientOrderIndex),
                orderId: String(row.orderIndex),
                status: observedStatus,
                ...(filled === null ? {} : { filledSize: String(filled) }),
              };
            },
          );
          if (
            rows.every(
              (row) =>
                row !== null &&
                this.#isAttachedOrderTerminal(row, group.symbol),
            )
          ) {
            group.submission = 'completed';
          }
          await this.#writeAttachedGroup(key, group, generation);
          if (allLegs && pendingGroups.has(group.groupId)) {
            await this.#settleObservedAttachedAcceptance(
              group,
              rows,
              generation,
            );
          }
          results.push({
            ...toAttachedOrderGroup(group),
            orders,
            historyStatus:
              snapshot.complete || allLegs ? 'complete' : 'bounded',
            linkage: linked ? 'confirmed' : 'unknown',
          });
        }
        this.#assertSession(generation);
        return results;
      },
    );
  }

  /**
   * Cancel a recorded native group using exact venue/client identities only.
   *
   * @param params - Explicit group handle and symbol.
   * @param generation - Caller session.
   * @returns Success only after every owned order is proven terminal.
   */
  readonly #cancelAttachedGroup = async (
    params: CancelOrderParams,
    generation: number,
  ): Promise<CancelOrderResult> => {
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const key = this.#attachedKey(accountIndex);
    const lookup = async (): Promise<LighterAttachedGroup> => {
      const groups = await this.#readAttachedGroups(key);
      this.#assertSession(generation);
      const group = groups.find(
        (entry) =>
          entry.groupId === params.orderId &&
          entry.symbol === params.symbol &&
          entry.accountIndex === accountIndex,
      );
      if (!group) {
        throw new Error(
          'Unknown Lighter attached-order group for this account and symbol',
        );
      }
      return group;
    };
    await lookup();
    await this.#ensureSignerReady();
    this.#assertSession(generation);
    const authToken = await this.#getAuthToken();
    this.#assertSession(generation);
    return await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit) => {
        const group = await lookup();
        if (
          group.submission === 'canceled' ||
          group.submission === 'completed'
        ) {
          return {
            success: true,
            orderId: params.orderId,
            providerId: 'lighter',
          };
        }
        // Abandon only undispatched intent or durably proven non-acceptance.
        if (group.submission === 'prepared' && group.txHash === null) {
          group.submission = 'canceled';
          await this.#writeAttachedGroup(key, group, generation);
          return {
            success: true,
            orderId: params.orderId,
            providerId: 'lighter',
          };
        }
        const initialSnapshot = await this.#readAttachedOrders(
          accountIndex,
          authToken,
          group.orders[0][0],
          generation,
          [group],
        );
        const initialRows = correlateLighterAttachedOrders(
          group,
          initialSnapshot.rows,
        );
        const hasLegs = initialRows.some((row) => row !== null);
        if (hasLegs && group.nonAcceptance !== undefined) {
          delete group.nonAcceptance;
          group.submission = 'accepted';
          await this.#writeAttachedGroup(key, group, generation);
        }
        if (
          (group.submission === 'unknown' ||
            (group.submission === 'accepted' && !hasLegs)) &&
          group.txHash !== null
        ) {
          const transaction = await this.#clientService.getTx(group.txHash);
          this.#assertSession(generation);
          const matches =
            transaction !== null &&
            typeof transaction.hash === 'string' &&
            transaction.hash.toLowerCase().replace(/^0x/u, '') ===
              group.txHash.toLowerCase().replace(/^0x/u, '') &&
            transaction.accountIndex === accountIndex &&
            transaction.apiKeyIndex === group.apiKeyIndex &&
            transaction.nonce === group.nonce;
          const outcome = matches
            ? getLighterTransactionOutcome(transaction.status)
            : null;
          if (outcome === 'executed' && group.nonAcceptance !== undefined) {
            delete group.nonAcceptance;
            group.submission = 'accepted';
            await this.#writeAttachedGroup(key, group, generation);
          }
          const neverLanded =
            group.nonAcceptance !== undefined &&
            transaction === null &&
            group.expiresAt !== null &&
            Date.now() > group.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS;
          // Neither stale proof nor missing history can erase observed ownership.
          if (
            !hasLegs &&
            group.venueIds.every((id) => id === null) &&
            initialSnapshot.complete &&
            (outcome === 'failed' || neverLanded)
          ) {
            group.submission = 'canceled';
            await this.#writeAttachedGroup(key, group, generation);
            return {
              success: true,
              orderId: params.orderId,
              providerId: 'lighter',
            };
          }
        }
        const read = async (): Promise<LighterApiOrder[]> => {
          const snapshot = await this.#readAttachedOrders(
            accountIndex,
            authToken,
            group.orders[0][0],
            generation,
            [group],
          );
          const rows = correlateLighterAttachedOrders(group, snapshot.rows);
          if (rows.some((row) => row === null)) {
            throw new Error(
              'Lighter attached-order identity is unresolved; no cancellation guarantee',
            );
          }
          return rows.filter((row): row is LighterApiOrder => row !== null);
        };
        const terminal = (row: LighterApiOrder): boolean =>
          this.#isAttachedOrderTerminal(row, group.symbol);
        if (initialRows.some((row) => row === null)) {
          throw new Error(
            'Lighter attached-order identity is unresolved; no cancellation guarantee',
          );
        }
        const rows = initialRows.filter(
          (row): row is LighterApiOrder => row !== null,
        );
        group.venueIds = rows.map((row) => String(row.orderIndex));
        await this.#writeAttachedGroup(key, group, generation);
        // Re-read after parent cancellation: the venue may already have canceled
        // its children, or a fill may have made a leg terminal in the meantime.
        for (let index = 0; index < rows.length; index += 1) {
          const row = (index === 0 ? rows : await read())[index];
          if (terminal(row)) {
            continue;
          }
          const signed = await this.#getSignerBridge().execute({
            function: '_signCancelOrder',
            params: [
              accountIndex,
              row.marketIndex,
              String(row.orderIndex),
              await nextNonce(),
            ],
          });
          if (signed.error) {
            throw new Error(signed.error);
          }
          await submit(LIGHTER_TX_TYPE_CANCEL_ORDER, signed.txInfo, undefined, {
            ...extractDispatchIdentity(signed),
            intent: `cancelAttached:${group.groupId}:${row.orderIndex}`,
          });
        }
        if (!(await read()).every(terminal)) {
          throw new Error(
            'Lighter attached cancellation is pending; retained exact owned identities',
          );
        }
        group.submission = 'canceled';
        await this.#writeAttachedGroup(key, group, generation);
        return {
          success: true,
          orderId: params.orderId,
          providerId: 'lighter',
        };
      },
      generation,
    );
  };

  /**
   * Reject a crossing post-only intent using a bounded fresh public read.
   * TIF2 remains the venue-side crossing guard if the book moves after this read.
   *
   * @param marketId - Exact native market.
   * @param isBuy - Intent side.
   * @param price - Integerized wire price projected onto the native tick grid.
   * @param generation - Optional financial intent fence.
   */
  async #assertPostOnlyBook(
    marketId: number,
    isBuy: boolean,
    price: number,
    generation?: number,
  ): Promise<void> {
    const startedAt = Date.now();
    const book = await this.#clientService.getOrderBookOrders(marketId);
    if (generation !== undefined) {
      this.#assertSession(generation);
    }
    if (
      Date.now() < startedAt ||
      Date.now() - startedAt > LIGHTER_POST_ONLY_QUOTE_MAX_AGE_MS
    ) {
      throw new Error('Lighter post-only book is stale');
    }
    const opposing = isBuy ? book.asks : book.bids;
    const total = isBuy ? book.totalAsks : book.totalBids;
    if (total < opposing.length || (total > 0 && opposing.length === 0)) {
      throw new Error('Lighter post-only book is incomplete');
    }
    for (const row of opposing) {
      const restingPrice = parseFinitePositive(row.price);
      if (
        restingPrice === null ||
        parseFinitePositive(row.remainingBaseAmount) === null
      ) {
        throw new Error('Lighter post-only book is malformed');
      }
      if (isBuy ? price >= restingPrice : price <= restingPrice) {
        throw new Error('Lighter post-only order would cross the book');
      }
    }
  }

  async placeOrder(
    input: OrderParams,
    inheritedGeneration?: number,
    reportFailure = true,
  ): Promise<OrderResult> {
    const deferProviderErrorReport = input.deferProviderErrorReport === true;
    const params = { ...input };
    delete params.deferProviderErrorReport;
    const shouldReportFailure = reportFailure && !deferProviderErrorReport;
    if (
      params.expectedScaleLadder !== undefined &&
      params.orderType !== 'scale'
    ) {
      return {
        success: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_PREVIEW_STALE,
      };
    }
    // Tracks a COMMITTED leverage change so an order failing afterwards
    // reports the partial venue state explicitly instead of implying no
    // mutation happened.
    let leverageCommitted = false;
    let postOnlyClientOrderId: string | undefined;
    let attachedGroup: LighterAttachedGroup | undefined;
    let attachedGroupPersisted = false;
    if (params.orderType === 'scale') {
      return this.#placeScaleOrder(params, inheritedGeneration);
    }
    try {
      if (params.orderType === 'chase' && this.#chaseTestnetProbe) {
        return await this.#placeChaseProbe(params);
      }
      if (params.orderType === 'twap' && this.#nativeTwapTestnetProbe) {
        return await this.#placeNativeTwapProbe(params);
      }
      if (
        params.orderType !== 'limit' &&
        params.orderType !== 'market' &&
        !isTriggerOrderType(params.orderType)
      ) {
        return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
      }
      const triggerIntentError = getLighterTriggerIntentError(params);
      if (triggerIntentError) {
        return { success: false, error: triggerIntentError };
      }
      // User intent is never silently dropped: fields this venue path does
      // not execute are rejected so the caller can adapt, not surprised.
      const attachedIntentError = getLighterAttachedIntentError(params);
      if (attachedIntentError) {
        return { success: false, error: attachedIntentError };
      }
      const hasAttached =
        params.takeProfitPrice !== undefined ||
        params.stopLossPrice !== undefined;
      const postOnlyError = getLighterPostOnlyIntentError(params);
      if (postOnlyError) {
        return { success: false, error: postOnlyError };
      }
      const leverageError = lighterLeverageError(params.leverage);
      if (leverageError) {
        return { success: false, error: leverageError };
      }
      // Bind the write to the wallet account it was INITIATED under; if the
      // wallet switches before the queued critical section runs, it aborts.
      // A composite caller (closePosition) passes ITS generation so the
      // whole read-then-write sequence shares one intent identity.
      this.#ensureSessionBinding();
      const generationAtIntent = inheritedGeneration ?? this.#sessionGeneration;
      this.#assertSession(generationAtIntent);
      // All intent validation below uses PUBLIC market data only; signer
      // and account setup are deferred until it passes so invalid intent
      // causes zero bridge calls (no client creation or key registration
      // side effects).
      const markets = await this.#ensureMarkets(
        isTriggerOrderType(params.orderType) ||
          hasAttached ||
          params.timeInForce === 'ALO' ||
          params.marginMode !== undefined,
      );
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      if (
        params.timeInForce === 'ALO' &&
        (market.status !== 'active' || market.marketType !== 'perp')
      ) {
        return {
          success: false,
          error: 'Lighter post-only requires an active perpetual market',
        };
      }
      if (
        (isTriggerOrderType(params.orderType) || hasAttached) &&
        (market.status !== 'active' || market.marketType !== 'perp')
      ) {
        return {
          success: false,
          error: 'Lighter trigger orders require an active perpetual market',
        };
      }
      if (isLimitExecutionOrderType(params.orderType) && !params.price) {
        return { success: false, error: 'Limit order requires a price' };
      }
      if (params.leverage !== undefined) {
        // Authoritative metadata REQUIRED: the display fallback (global
        // 50x) must never approve leverage for a market whose published
        // bound is unavailable.
        const maxLeverage = await this.#requireMarketMaxLeverage(params.symbol);
        if (maxLeverage === null) {
          return {
            success: false,
            error: `Cannot validate leverage for ${params.symbol}: venue margin metadata unavailable`,
          };
        }
        if (params.leverage > maxLeverage) {
          return {
            success: false,
            error: `Invalid leverage ${params.leverage}: exceeds the ${params.symbol} maximum of ${maxLeverage}x`,
          };
        }
      }

      // Slippage tolerance: caller basis points win, then the deprecated
      // decimal field, then the venue-conventional 5%.
      const slippageFraction =
        params.maxSlippageBps === undefined
          ? (params.slippage ?? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000)
          : params.maxSlippageBps / 10_000;
      // The reference price sizes the order; market orders additionally get
      // a protection price offset by the slippage tolerance. They are kept
      // separate so usdAmount sizing is never distorted by the protection
      // offset.
      let referencePrice: number;
      const triggerPrices = isTriggerOrderType(params.orderType)
        ? resolveLighterTriggerPrices(params, market)
        : undefined;
      if (triggerPrices) {
        referencePrice = triggerPrices.referencePrice;
      } else if (params.orderType === 'limit') {
        // STRICT full-string parse: '90000USD' prefix-parses under
        // parseFloat and must never become signed intent.
        const parsedLimitPrice = parseFinitePositive(params.price ?? '');
        if (parsedLimitPrice === null) {
          return {
            success: false,
            error: `Invalid limit price ${params.price}: must be a positive number`,
          };
        }
        referencePrice = parsedLimitPrice;
      } else {
        referencePrice = parseFloat(
          params.price ?? String(params.currentPrice ?? 0),
        );
      }
      let executionPrice = triggerPrices?.executionPrice ?? referencePrice;
      if (params.orderType === 'market') {
        const resolved = await this.#resolveMarketReferencePrice(
          params.symbol,
          slippageFraction,
          params.priceAtCalculation,
        );
        if (resolved.error !== null) {
          return { success: false, error: resolved.error };
        }
        referencePrice = resolved.referencePrice;
        executionPrice = deriveLighterExecutionPrice(
          referencePrice,
          params.isBuy,
          slippageFraction,
        );
      }
      // Finite AND positive: 'Infinity' passes a bare > 0 check but would
      // corrupt integerization/signing downstream.
      if (
        !Number.isFinite(referencePrice) ||
        !(referencePrice > 0) ||
        !Number.isFinite(executionPrice) ||
        !(executionPrice > 0)
      ) {
        return {
          success: false,
          error: 'Unable to resolve a finite execution price for the order',
        };
      }
      // USD is the source of truth when provided (hybrid sizing contract),
      // converted at the reference price — not the protection price. A
      // provided-but-invalid usdAmount is an error, never a silent fallback
      // to the size field.
      let requestedSize: number;
      if (params.usdAmount === undefined) {
        const parsedSize = parseFinitePositive(params.size);
        if (parsedSize === null) {
          return { success: false, error: 'Order size must be positive' };
        }
        requestedSize = parsedSize;
      } else {
        const usdAmount = parseFinitePositive(params.usdAmount);
        if (usdAmount === null) {
          return {
            success: false,
            error: `Invalid usdAmount ${params.usdAmount}: must be a positive number`,
          };
        }
        // A USD amount is approximate by contract (converted at the
        // reference price), so it is snapped onto the venue size grid the
        // way wire integerization will round it — an explicit size string
        // is exact user intent and is never adjusted here.
        requestedSize = snapToLighterSizeGrid(
          usdAmount / referencePrice,
          market.supportedSizeDecimals,
        );
      }
      if (!(requestedSize > 0)) {
        return { success: false, error: 'Order size must be positive' };
      }
      if (params.usdAmount === undefined) {
        const requestedSizeInt = toSignerWireInteger(
          requestedSize,
          market.supportedSizeDecimals,
        );
        if (
          fromLighterInteger(requestedSizeInt, market.supportedSizeDecimals) !==
          requestedSize
        ) {
          return {
            success: false,
            error: `Order size ${params.size} does not align with the Lighter size grid`,
          };
        }
      }
      const minSize = isLighterMakerOrder(params)
        ? computeLighterMinOrderSize(market, referencePrice)
        : 0;
      if (minSize > 0 && requestedSize < minSize) {
        // Only a LIVE-VERIFIED full close may be bumped to the venue
        // minimum: reduce-only execution clamps to the position, so no
        // extra exposure results and dust positions stay closable. The
        // isFullClose flag is a hint, never trusted — a partial close
        // bumped to the minimum would close more than the caller asked.
        // A dormant trigger must retain its quantity even if the position
        // grows before activation; today's full-close proof cannot authorize
        // a larger future close.
        const verifiedFullClose =
          params.reduceOnly && !triggerPrices
            ? await this.#isVerifiedFullClose(params.symbol, requestedSize)
            : false;
        if (!verifiedFullClose) {
          return {
            success: false,
            error: `Order size ${requestedSize} is below the Lighter minimum of ${minSize} ${params.symbol}`,
          };
        }
      }
      const size =
        minSize > 0 ? Math.max(requestedSize, minSize) : requestedSize;

      // Wire-format integerization runs BEFORE signer setup: overflow and
      // sub-tick rejections throw here, still with zero bridge calls.
      const priceInt = toSignerWirePriceInteger(
        executionPrice,
        market.supportedPriceDecimals,
      );
      const sizeInt = toSignerWireInteger(size, market.supportedSizeDecimals);
      const timeInForce =
        params.timeInForce === 'ALO'
          ? LIGHTER_TIME_IN_FORCE_POST_ONLY
          : LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME;
      let orderTypeInt = LIGHTER_ORDER_TYPE_MARKET;
      if (isTriggerOrderType(params.orderType)) {
        orderTypeInt = LIGHTER_TRIGGER_WIRE_TYPES[params.orderType];
      } else if (params.orderType === 'limit') {
        orderTypeInt = LIGHTER_ORDER_TYPE_LIMIT;
      }

      const attachedChildren = resolveLighterAttachedChildren(
        params,
        market,
        referencePrice,
      );
      if (params.timeInForce === 'ALO') {
        await this.#assertPostOnlyBook(
          market.marketId,
          params.isBuy,
          fromLighterInteger(priceInt, market.supportedPriceDecimals),
          generationAtIntent,
        );
      }
      const explicitMarginMode = await this.#validateExplicitMarginMode(
        params,
        market,
        generationAtIntent,
      );
      const leverageImfHundredths =
        explicitMarginMode === null
          ? await this.#resolveLeverageIntent(params)
          : Math.round(10_000 / (params.leverage as number));
      // Margin mode is sent only with an explicit leverage update. An
      // omitted leverage leaves both leverage and margin mode unchanged;
      // an explicit update preserves an existing position's venue mode and
      // uses isolated only for a flat market.
      const leverageMarginMode =
        leverageImfHundredths === null
          ? null
          : (explicitMarginMode ??
            (await this.#resolveMarginModeForSymbol(params.symbol)));

      // Intent validated — only now do signer and account setup run.
      // Re-fence FIRST: the preflight awaited public/account reads during
      // which the wallet may have switched, and a stale intent must never
      // create or register the new account's venue key.
      this.#assertSession(generationAtIntent);
      if (hasAttached) {
        const preflightAccount = await this.#ensureAccountIndex();
        this.#assertSession(generationAtIntent);
        const priorGroups = await this.#readAttachedGroups(
          this.#attachedKey(preflightAccount),
        );
        this.#assertSession(generationAtIntent);
        if (
          priorGroups.some(
            (group) =>
              group.submission === 'prepared' || group.submission === 'unknown',
          )
        ) {
          throw new Error(
            'Lighter attached placement has unresolved intent; review or cancel its exact group before placing another',
          );
        }
      }
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generationAtIntent);
      const attachedKey = this.#attachedKey(accountIndex);
      if (hasAttached) {
        await this.#readAttachedGroups(attachedKey);
        this.#assertSession(generationAtIntent);
      }
      const [clientOrderIndex, ...attachedClientIds] =
        this.#allocateClientOrderIndexes(1 + attachedChildren.length);
      if (params.timeInForce === 'ALO') {
        postOnlyClientOrderId = String(clientOrderIndex);
      }

      // Leverage update and order placement share ONE lock acquisition so a
      // concurrent write can never interleave between the caller's leverage
      // intent and the order that depends on it.
      const result = await this.#withVenueWriteLock(
        accountIndex,
        async (nextNonce, submit) => {
          if (hasAttached) {
            const existing = await this.#readAttachedGroups(attachedKey);
            this.#assertSession(generationAtIntent);
            if (
              existing.some(
                (group) =>
                  group.submission === 'prepared' ||
                  group.submission === 'unknown',
              )
            ) {
              throw new Error(
                'Lighter attached placement has unresolved intent; review or cancel its exact group before placing another',
              );
            }
            const allocatedIds = new Set([
              clientOrderIndex,
              ...attachedClientIds,
            ]);
            if (
              existing.some((group) =>
                group.orders.some((order) => allocatedIds.has(order[1])),
              )
            ) {
              throw new Error(
                'Lighter attached client identity was allocated concurrently; refresh and retry',
              );
            }
          }
          if (params.timeInForce === 'ALO') {
            await this.#assertPostOnlyBook(
              market.marketId,
              params.isBuy,
              fromLighterInteger(priceInt, market.supportedPriceDecimals),
              generationAtIntent,
            );
          }
          await this.#validateExplicitMarginMode(
            params,
            market,
            generationAtIntent,
          );
          if (leverageImfHundredths !== null && leverageMarginMode !== null) {
            const signedLeverage = await this.#getSignerBridge().execute({
              function: '_signUpdateLeverage',
              // Contract: [accountIndex, marketId, imfHundredths,
              // marginMode, nonce] — exactly five params.
              params: [
                accountIndex,
                market.marketId,
                leverageImfHundredths,
                leverageMarginMode,
                await nextNonce(),
              ],
            });
            if (signedLeverage.error) {
              throw new Error(
                `Lighter leverage update failed: ${signedLeverage.error}`,
              );
            }
            await submit(
              LIGHTER_TX_TYPE_UPDATE_LEVERAGE,
              signedLeverage.txInfo,
              undefined,
              {
                ...extractDispatchIdentity(signedLeverage),
                intent: `${explicitMarginMode === null ? 'updateLeverage' : 'updateMarginMode'}:${params.symbol}:${String(params.leverage)}`,
                requireExecution: explicitMarginMode !== null,
                beforeDispatch: async () => {
                  await this.#validateExplicitMarginMode(
                    params,
                    market,
                    generationAtIntent,
                  );
                },
              },
            );
            leverageCommitted = true;
          }
          await this.#validateExplicitMarginMode(
            params,
            market,
            generationAtIntent,
            true,
          );
          const parent: LighterCreateOrderWireParams = [
            market.marketId,
            clientOrderIndex,
            String(sizeInt),
            String(priceInt),
            params.isBuy ? 0 : 1,
            orderTypeInt,
            isLighterMakerOrder(params)
              ? timeInForce
              : LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
            params.reduceOnly ? 1 : 0,
            String(triggerPrices?.triggerPriceInt ?? LIGHTER_NO_TRIGGER_PRICE),
            // Triggers remain pending even when they execute as IOC.
            // The signer expands -1 to its 28-day default expiry;
            // only ordinary immediate orders use a zero expiry.
            isTriggerOrderType(params.orderType) || isLighterMakerOrder(params)
              ? LIGHTER_ORDER_EXPIRY_NONE
              : 0,
          ];
          let signed: LighterTxResult;
          if (attachedChildren.length > 0) {
            const children = attachedChildren.map(
              (child, index): LighterCreateOrderWireParams => {
                const copy: LighterCreateOrderWireParams = [...child];
                copy[1] = attachedClientIds[index];
                return copy;
              },
            );
            const orders: LighterAttachedGroup['orders'] =
              children.length === 1
                ? [parent, children[0]]
                : [parent, children[0], children[1]];
            attachedGroup = {
              version: 1,
              preparedAt: Date.now(),
              groupId: `${LIGHTER_ATTACHED_HANDLE_PREFIX}${attachedKey.slice('lighterAttachedOrders:'.length)}:${market.marketId}:${clientOrderIndex}`,
              symbol: params.symbol,
              accountIndex,
              apiKeyIndex: this.#apiKeyIndex,
              submission: 'prepared',
              orders,
              txHash: null,
              nonce: null,
              expiresAt: null,
              venueIds: orders.map(() => null),
            };
            await this.#writeAttachedGroup(
              attachedKey,
              attachedGroup,
              generationAtIntent,
            );
            attachedGroupPersisted = true;
            const nonce = await nextNonce();
            attachedGroup.nonce = nonce;
            signed = await this.#getSignerBridge().execute({
              function: '_signCreateGroupedOrders',
              params:
                orders.length === 2
                  ? [
                      accountIndex,
                      LIGHTER_GROUPING_ONE_TRIGGERS_THE_OTHER,
                      2,
                      ...orders[0],
                      ...orders[1],
                      nonce,
                    ]
                  : [
                      accountIndex,
                      LIGHTER_GROUPING_ONE_TRIGGERS_OCO,
                      3,
                      ...orders[0],
                      ...orders[1],
                      ...orders[2],
                      nonce,
                    ],
            });
          } else {
            signed = await this.#getSignerBridge().execute({
              function: '_signCreateOrder',
              params: [accountIndex, ...parent, await nextNonce()],
            });
          }
          if (signed.error) {
            throw new Error(`Lighter order signing failed: ${signed.error}`);
          }
          const dispatchIdentity = extractDispatchIdentity(signed);
          if (attachedGroup) {
            this.#assertSession(generationAtIntent);
            if (
              dispatchIdentity.txHash === null ||
              dispatchIdentity.expiresAt === null
            ) {
              throw new Error(
                'Lighter attached signer omitted transaction identity',
              );
            }
            attachedGroup.orderExpiries = requireSignedOrderExpiries(
              signed,
              attachedGroup.orders.map((order) => order[1]),
              parent[9] === 0 ? [parent[1]] : [],
            );
            const childExpiries = attachedGroup.orderExpiries.slice(1);
            if (
              new Set(childExpiries).size !== 1 ||
              (parent[9] !== 0 &&
                attachedGroup.orderExpiries[0] !== childExpiries[0])
            ) {
              throw new Error(
                'Lighter attached signer changed grouped expiry compatibility',
              );
            }
            attachedGroup.txHash = dispatchIdentity.txHash;
            attachedGroup.expiresAt = dispatchIdentity.expiresAt;
            attachedGroup.submission = 'unknown';
            await this.#writeAttachedGroup(
              attachedKey,
              attachedGroup,
              generationAtIntent,
            );
          }
          const response = await submit(
            attachedGroup
              ? LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS
              : LIGHTER_TX_TYPE_CREATE_ORDER,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: attachedGroup
                ? `placeAttached:${attachedGroup.groupId}`
                : `placeOrder:${params.symbol}:${clientOrderIndex}`,
              beforeDispatch: async () => {
                await this.#validateExplicitMarginMode(
                  params,
                  market,
                  generationAtIntent,
                  true,
                );
              },
              onNotDispatched: async () => {
                if (attachedGroup) {
                  attachedGroup.submission = 'canceled';
                  attachedGroup.nonce = null;
                  attachedGroup.txHash = null;
                  attachedGroup.expiresAt = null;
                  delete attachedGroup.nonAcceptance;
                  await this.#writeAttachedGroup(
                    attachedKey,
                    attachedGroup,
                    generationAtIntent,
                  );
                }
              },
            },
          );
          if (attachedGroup) {
            attachedGroup.submission = 'accepted';
            await this.#writeAttachedGroup(
              attachedKey,
              attachedGroup,
              generationAtIntent,
            );
          }
          return response;
        },
        generationAtIntent,
      );

      this.#deps.debugLogger.log('[LighterProvider] Order placed', {
        symbol: params.symbol,
        clientOrderIndex,
        txHash: result.txHash,
      });

      return {
        success: true,
        orderId: String(clientOrderIndex),
        submittedSize: String(size),
        ...(attachedGroup && attachedGroupPersisted
          ? { attachedOrderGroup: toAttachedOrderGroup(attachedGroup) }
          : {}),
        providerId: 'lighter',
      };
    } catch (caughtError) {
      const wrappedError = shouldReportFailure
        ? this.#reportTradingError(
            caughtError,
            'placeOrder',
            {
              operation: PERPS_ERROR_OPERATION.OrderManagement,
              action: PERPS_ERROR_ACTION.PlaceOrder,
            },
            {
              symbol: params.symbol,
              orderType: params.orderType,
            },
          )
        : ensureError(caughtError, 'LighterProvider.placeOrder');
      this.#deps.debugLogger.log('[LighterProvider] placeOrder failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('placeOrder', { symbol: params.symbol }),
      });
      // PARTIAL VENUE STATE is contract-visible: a committed leverage
      // change followed by an order failure must never imply "nothing
      // happened".
      const partialPrefix = leverageCommitted
        ? `PARTIAL STATE: leverage for ${params.symbol} was already updated to ${String(params.leverage)}x before the order failed. `
        : '';
      const failureResult: OrderResult = {
        success: false,
        error: `${partialPrefix}${wrappedError.message}`,
        ...(attachedGroup && attachedGroupPersisted
          ? { attachedOrderGroup: toAttachedOrderGroup(attachedGroup) }
          : {}),
        ...(postOnlyClientOrderId
          ? { orderId: postOnlyClientOrderId, providerId: 'lighter' as const }
          : {}),
        ...(leverageCommitted
          ? { partialState: { leverageUpdated: Number(params.leverage) } }
          : {}),
      };
      const providerOwnsReporting = shouldReportFailure
        ? this.#reportedTradingErrors.has(wrappedError)
        : deferProviderErrorReport && this.#isSilentTradingError(wrappedError);
      return providerOwnsReporting
        ? markProviderErrorReported(failureResult)
        : failureResult;
    }
  }

  /**
   * Collect owned native schedules without registering keys or financial writes.
   * Raw observations preserve mapping uncertainty for the bounded runtime probe.
   *
   * @returns Exact owned records and parent/child execution observations.
   */
  async getNativeTwapObservations(): Promise<LighterTwapReadObservation[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const owner = this.#nativeTwapOwner(accountIndex);
    const records = await this.#nativeTwapService.list(owner);
    this.#assertSession(generation);
    if (records.length === 0) {
      return [];
    }
    const authority = await this.#getNativeProbeReadToken(
      accountIndex,
      generation,
    );
    this.#assertSession(generation);
    return await this.#nativeTwapService.observe(
      owner,
      this.#clientService,
      authority.token,
    );
  }

  async #withNativeProbeStart<Result>(
    owner: LighterTwapOwner,
    strategy: 'twap' | 'chase',
    generation: number,
    start: () => Promise<Result>,
  ): Promise<Result> {
    return await withProcessMutex(
      `lighterNativeProbe:${owner.network}:${owner.accountIndex}`,
      async () => {
        this.#assertSession(generation);
        if (strategy === 'chase') {
          const records = await this.#nativeTwapService.list(owner);
          this.#assertSession(generation);
          if (records.some((record) => record.placement.phase !== 'failed')) {
            throw new Error(
              'An earlier Lighter native probe remains unresolved for this account',
            );
          }
        } else {
          const records = await this.#chaseService.list(owner, {
            assertCurrent: () => this.#assertSession(generation),
          });
          this.#assertSession(generation);
          if (
            records.some(
              (record) =>
                record.status === 'active' ||
                record.status === 'termination_pending',
            )
          ) {
            throw new Error(
              'An earlier Lighter native probe remains unresolved for this account',
            );
          }
        }
        return await start();
      },
    );
  }

  async #getNativeProbeReadToken(
    accountIndex: number,
    generation: number,
  ): Promise<{ token: string; apiKeyIndex: number; publicKey: string }> {
    return await withProcessMutex(
      `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
      async () => await this.#getRecoveryReadToken(accountIndex, generation),
    );
  }

  #nativeTwapOwner(accountIndex: number): LighterTwapOwner {
    if (!this.#boundAddress) {
      throw new Error('Lighter TWAP wallet is unbound');
    }
    return {
      wallet: this.#boundAddress,
      network: this.#isTestnet ? 'testnet' : 'mainnet',
      accountIndex,
      apiKeyIndex: this.#apiKeyIndex,
    };
  }

  #interruptChase(reason?: ChaseOrderStatus): void {
    this.#chaseGeneration += 1;
    this.#chaseService.interrupt(reason);
    for (const timer of this.#chaseTimers.values()) {
      clearTimeout(timer);
    }
    this.#chaseTimers.clear();
  }

  #chaseOwner(accountIndex: number): LighterChaseOwner {
    if (!this.#boundAddress) {
      throw new Error('Lighter Chase wallet is unbound');
    }
    return {
      wallet: this.#boundAddress,
      network: this.#isTestnet ? 'testnet' : 'mainnet',
      accountIndex,
      apiKeyIndex: this.#apiKeyIndex,
    };
  }

  async #prepareChaseIntent(
    params: OrderParams,
    generation: number,
  ): Promise<LighterChaseIntent> {
    if (params.providerId !== undefined && params.providerId !== 'lighter') {
      throw new Error('Lighter Chase provider route mismatch');
    }
    if (!this.#chaseTestnetProbe || !this.#isTestnet) {
      throw new Error('Lighter Chase probe is unavailable');
    }
    const unsupported: (keyof OrderParams)[] = [
      'price',
      'triggerPrice',
      'timeInForce',
      'takeProfitPrice',
      'stopLossPrice',
      'takeProfitSize',
      'stopLossSize',
      'clientOrderId',
      'marginMode',
      'tpslLinkage',
      'grouping',
      'twapDuration',
      'twapRandomize',
      'scaleMinPrice',
      'scaleMaxPrice',
      'scaleNumOrders',
      'scaleSkew',
      'isFullClose',
    ];
    if (
      params.leverage !== 1 ||
      params.reduceOnly === true ||
      unsupported.some((key) => params[key] !== undefined)
    ) {
      throw new Error(
        'Lighter Chase probe requires exact opening size, existing 1x leverage and no unsupported fields',
      );
    }
    const intervalMs =
      params.chaseIntervalMs ?? LIGHTER_CHASE_DEFAULT_INTERVAL_MS;
    const maxDurationMs =
      params.chaseMaxDurationMs ?? LIGHTER_CHASE_DEFAULT_DURATION_MS;
    const maxRepricings =
      params.chaseMaxRepricings ?? LIGHTER_CHASE_DEFAULT_REPRICINGS;
    const maxDistanceBps =
      params.chaseMaxDistanceBps ?? LIGHTER_CHASE_DEFAULT_DISTANCE_BPS;
    if (
      !Number.isSafeInteger(intervalMs) ||
      intervalMs < LIGHTER_CHASE_MIN_INTERVAL_MS ||
      !Number.isSafeInteger(maxDurationMs) ||
      maxDurationMs < intervalMs ||
      maxDurationMs > LIGHTER_CHASE_MAX_DURATION_MS ||
      !Number.isSafeInteger(maxRepricings) ||
      maxRepricings < 0 ||
      maxRepricings > LIGHTER_CHASE_MAX_REPRICINGS ||
      !Number.isFinite(maxDistanceBps) ||
      maxDistanceBps <= 0 ||
      maxDistanceBps >= LIGHTER_CHASE_MAX_DISTANCE_BPS
    ) {
      throw new Error(
        'Lighter Chase probe requires bounded interval, duration, repricing and distance',
      );
    }
    const market = (await this.#ensureMarkets(true)).get(params.symbol);
    this.#assertSession(generation);
    if (market?.status !== 'active' || market.marketType !== 'perp') {
      throw new Error('Lighter Chase requires an active perpetual market');
    }
    if (!/^\d+(?:\.\d+)?$/u.test(params.size)) {
      throw new Error('Lighter Chase requires exact positive size');
    }
    const requestedSize = new BigNumber(params.size);
    const size =
      params.usdAmount === undefined
        ? requestedSize
        : requestedSize.decimalPlaces(
            market.supportedSizeDecimals,
            BigNumber.ROUND_DOWN,
          );
    const units = size.shiftedBy(market.supportedSizeDecimals);
    if (
      !units.isInteger() ||
      units.lt(1) ||
      units.gt(LIGHTER_MAX_BASE_AMOUNT)
    ) {
      throw new Error('Lighter Chase size is outside the native grid');
    }
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const startedAt = Date.now();
    const book = await this.#clientService.getOrderBookOrders(market.marketId);
    this.#assertSession(generation);
    if (
      Date.now() < startedAt ||
      Date.now() - startedAt > LIGHTER_CHASE_QUOTE_MAX_AGE_MS
    ) {
      throw new Error('Lighter Chase book is stale');
    }
    const arrivalPrice = readLighterChaseQuote(book, {
      isBuy: params.isBuy,
      accountIndex,
      priceDecimals: market.supportedPriceDecimals,
    });
    let maxNotional = String(LIGHTER_NATIVE_PROBE_MAX_NOTIONAL);
    if (params.usdAmount !== undefined) {
      const budget = new BigNumber(params.usdAmount);
      if (
        !/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(params.usdAmount) ||
        !budget.isFinite() ||
        !budget.gt(0) ||
        budget.gt(LIGHTER_NATIVE_PROBE_MAX_NOTIONAL)
      ) {
        throw new Error(
          'Lighter Chase USD amount must be positive and within the 20 USD cap',
        );
      }
      const referencePrices = [
        arrivalPrice,
        params.currentPrice,
        params.priceAtCalculation,
      ].filter((value) => value !== undefined);
      if (
        referencePrices.some((value) => {
          const price = new BigNumber(value);
          return (
            !price.isFinite() ||
            !price.gt(0) ||
            !budget
              .div(price)
              .decimalPlaces(market.supportedSizeDecimals, BigNumber.ROUND_DOWN)
              .eq(size)
          );
        })
      ) {
        throw new Error(
          'Lighter Chase size does not match its USD amount and current price',
        );
      }
      maxNotional = budget.toFixed();
    }
    if (
      size.times(arrivalPrice).gt(LIGHTER_NATIVE_PROBE_MAX_NOTIONAL) ||
      size.times(arrivalPrice).lt(market.minQuoteAmount) ||
      size.lt(market.minBaseAmount)
    ) {
      throw new Error(
        'Lighter Chase must fit native minimums and the aggregate 20 USD cap',
      );
    }
    const intent: LighterChaseIntent = {
      owner: this.#chaseOwner(accountIndex),
      handle: 'preflight',
      symbol: params.symbol,
      marketId: market.marketId,
      isBuy: params.isBuy,
      reduceOnly: false,
      originalSize: size.toFixed(),
      arrivalPrice,
      sizeDecimals: market.supportedSizeDecimals,
      priceDecimals: market.supportedPriceDecimals,
      startedAt: Date.now(),
      intervalMs,
      maxDurationMs,
      maxRepricings,
      maxDistanceBps,
      maxNotional,
      minBaseAmount: market.minBaseAmount,
      minQuoteAmount: market.minQuoteAmount,
    };
    await this.#assertChaseProbeExposure(intent, size.toFixed(), generation);
    return intent;
  }

  async #assertChaseProbeExposure(
    intent: LighterChaseIntent,
    remainingSize: string,
    generation: number,
    price = intent.arrivalPrice,
    token?: string,
  ): Promise<void> {
    const response = await this.#clientService.getAccountByIndex(
      intent.owner.accountIndex,
    );
    this.#assertSession(generation);
    if (response.accounts.length !== 1) {
      throw new Error('Lighter Chase account is ambiguous');
    }
    const account = response.accounts[0];
    this.#assertAccountOwnership(account);
    this.#assertStandardAccount(account.accountType);
    const rows = (account.positions ?? []).filter(
      (position) => position.marketId === intent.marketId,
    );
    const expectedFilled = new BigNumber(intent.originalSize).minus(
      remainingSize,
    );
    if (
      rows.length !== 1 ||
      !new BigNumber(rows[0].initialMarginFraction).eq(100) ||
      !new BigNumber(rows[0].position).abs().eq(expectedFilled) ||
      (!expectedFilled.isZero() && (rows[0].sign === 1) !== intent.isBuy) ||
      account.pendingOrderCount !== 0 ||
      (account.positions ?? []).some(
        (position) =>
          position.openOrderCount !== 0 ||
          (position.marketId !== intent.marketId &&
            !new BigNumber(position.position).isZero()),
      )
    ) {
      throw new Error(
        'Lighter Chase requires independently confirmed 1x and no unrelated exposure or orders',
      );
    }
    let exposure = new BigNumber(0);
    for (const position of account.positions ?? []) {
      const value = new BigNumber(position.positionValue);
      if (!value.isFinite()) {
        throw new Error('Lighter Chase account exposure is unavailable');
      }
      exposure = exposure.plus(value.abs());
    }
    if (
      exposure
        .plus(new BigNumber(remainingSize).times(price))
        .gt(LIGHTER_NATIVE_PROBE_MAX_NOTIONAL)
    ) {
      throw new Error(
        'Lighter Chase aggregate existing-plus-remaining exposure exceeds 20 USD',
      );
    }
    if (token === undefined) {
      return;
    }
    const active = await this.#clientService.getActiveOrders(
      intent.owner.accountIndex,
      token,
      intent.marketId,
    );
    this.#assertSession(generation);
    if (active.orders.length !== 0) {
      throw new Error(
        'Lighter Chase requires all prior children terminal before placement',
      );
    }
  }

  #chaseIo(intent: LighterChaseIntent, generation: number): LighterChaseIo {
    const assertCurrent = (): void => {
      this.#assertSession(generation);
      if (
        this.#boundAddress !== intent.owner.wallet ||
        this.#accountIndex !== intent.owner.accountIndex ||
        (this.#isTestnet ? 'testnet' : 'mainnet') !== intent.owner.network
      ) {
        throw new Error('Lighter Chase owner changed');
      }
    };
    const assertSigning = (): void => {
      assertCurrent();
      if (
        !this.#chaseTestnetProbe ||
        !this.#isTestnet ||
        this.#apiKeyIndex !== intent.owner.apiKeyIndex
      ) {
        throw new Error(
          'Lighter Chase original signing authority is unavailable',
        );
      }
    };
    const reconcileDispatch = async (
      dispatch: LighterChaseDispatch,
      child: LighterChaseChild,
      recordEvidence: Parameters<LighterChaseIo['observe']>[1],
    ): Promise<void> => {
      if (!dispatch.txHash || dispatch.phase === 'failed') {
        return;
      }
      const unacknowledged =
        dispatch.phase === 'attempted' && dispatch.acknowledged === false;
      if (unacknowledged) {
        // Clear retry eligibility before an awaited lookup can reveal a conflict
        // whose persistence fails or whose owner session has already changed.
        await recordEvidence(dispatch, undefined);
      }
      const transaction = await this.#clientService.getTx(dispatch.txHash);
      if (!transaction) {
        assertCurrent();
        if (unacknowledged) {
          await recordEvidence(dispatch, false);
          assertCurrent();
        }
        if (
          dispatch.phase !== 'attempted' ||
          dispatch.acknowledged !== false ||
          !isLighterTxExpiry(dispatch.expiresAt) ||
          !Number.isSafeInteger(dispatch.nonce) ||
          (dispatch.nonce ?? -1) < 0 ||
          Date.now() <= dispatch.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
        ) {
          return;
        }
        const nonce = await this.#clientService.getNextNonce(
          intent.owner.accountIndex,
          intent.owner.apiKeyIndex,
        );
        assertCurrent();
        if (
          !Number.isSafeInteger(nonce.nonce) ||
          nonce.nonce < 0 ||
          nonce.nonce > (dispatch.nonce ?? -1)
        ) {
          return;
        }
        const { token } = await this.#getNativeProbeReadToken(
          intent.owner.accountIndex,
          generation,
        );
        assertCurrent();
        const exact = await this.#clientService.getOrdersByClientIds(
          intent.owner.accountIndex,
          token,
          [child.clientOrderId],
        );
        assertCurrent();
        if (dispatch === child.placement) {
          if (!child.observation && exact.orders.length === 0) {
            dispatch.phase = 'failed';
          }
          return;
        }
        if (
          exact.orders.length !== 1 ||
          !child.observation ||
          child.observation.terminal
        ) {
          return;
        }
        const orderId = identifyLighterChaseChild(
          intent,
          { ...child, nonce: child.placement.nonce },
          exact.orders[0],
        );
        const remaining = parseStrictDecimal(
          exact.orders[0].remainingBaseAmount,
        );
        if (
          orderId === child.observation.orderId &&
          exact.orders[0].status === 'open' &&
          remaining !== null &&
          remaining > 0 &&
          new BigNumber(exact.orders[0].remainingBaseAmount).lte(child.size)
        ) {
          dispatch.phase = 'failed';
        }
        return;
      }
      if (
        transaction.hash.toLowerCase().replace(/^0x/u, '') !==
          dispatch.txHash.toLowerCase().replace(/^0x/u, '') ||
        transaction.accountIndex !== intent.owner.accountIndex ||
        transaction.apiKeyIndex !== intent.owner.apiKeyIndex ||
        transaction.nonce !== dispatch.nonce
      ) {
        await recordEvidence(dispatch, undefined);
        assertCurrent();
        throw new Error('Lighter Chase transaction identity mismatch');
      }
      if (getLighterTransactionOutcome(transaction.status) === 'failed') {
        assertCurrent();
        dispatch.phase = 'failed';
      } else {
        // Exact venue evidence survives later indexer loss, including restart.
        await recordEvidence(dispatch, true);
        assertCurrent();
      }
    };
    const quote = async (): Promise<string> => {
      assertCurrent();
      const started = Date.now();
      const book = await this.#clientService.getOrderBookOrders(
        intent.marketId,
      );
      assertCurrent();
      if (
        Date.now() < started ||
        Date.now() - started > LIGHTER_CHASE_QUOTE_MAX_AGE_MS ||
        Date.now() - started > LIGHTER_POST_ONLY_QUOTE_MAX_AGE_MS
      ) {
        throw new Error('Lighter Chase book is stale');
      }
      return readLighterChaseQuote(book, {
        isBuy: intent.isBuy,
        accountIndex: intent.owner.accountIndex,
        priceDecimals: intent.priceDecimals,
      });
    };
    return {
      assertCurrent,
      now: () => Date.now(),
      allocateClientId: () => String(this.#allocateClientOrderIndexes(1)[0]),
      quote,
      place: async (child, hooks) => {
        assertSigning();
        const market = (await this.#ensureMarkets(true)).get(intent.symbol);
        assertSigning();
        if (
          market?.status !== 'active' ||
          market.marketType !== 'perp' ||
          market.marketId !== intent.marketId ||
          market.supportedPriceDecimals !== intent.priceDecimals ||
          market.supportedSizeDecimals !== intent.sizeDecimals ||
          !new BigNumber(market.minBaseAmount).eq(intent.minBaseAmount) ||
          !new BigNumber(market.minQuoteAmount).eq(intent.minQuoteAmount)
        ) {
          throw new Error('Lighter Chase native market constraints changed');
        }
        const { token } = await this.#getNativeProbeReadToken(
          intent.owner.accountIndex,
          generation,
        );
        assertSigning();
        await this.#assertChaseProbeExposure(
          intent,
          child.size,
          generation,
          child.price,
          token,
        );
        assertSigning();
        await this.#withVenueNonce(
          intent.owner.accountIndex,
          async (nonce, submit) => {
            assertSigning();
            // Read only after preparation and nonce/bridge serialization. The
            // complete book validates both sides and selects a passive price;
            // the service persists its bounded final quote before signing.
            const price = await quote();
            assertSigning();
            await hooks.prepareQuote(price);
            assertSigning();
            const signed = await this.#getSignerBridge().execute({
              function: '_signCreateOrder',
              params: [
                intent.owner.accountIndex,
                intent.marketId,
                Number(child.clientOrderId),
                new BigNumber(child.size)
                  .shiftedBy(intent.sizeDecimals)
                  .toFixed(0),
                new BigNumber(child.price)
                  .shiftedBy(intent.priceDecimals)
                  .toFixed(0),
                intent.isBuy ? 0 : 1,
                LIGHTER_ORDER_TYPE_LIMIT,
                LIGHTER_TIME_IN_FORCE_POST_ONLY,
                intent.reduceOnly ? 1 : 0,
                '0',
                LIGHTER_ORDER_EXPIRY_NONE,
                nonce,
              ],
            });
            assertSigning();
            if (signed.error) {
              throw new Error(
                `Lighter Chase create signing failed: ${signed.error}`,
              );
            }
            const identity = requireSignedTxIdentity(signed);
            await hooks.signed({
              nonce,
              txHash: identity.txHash,
              expiresAt: identity.expiresAt,
            });
            assertSigning();
            await submit(
              LIGHTER_TX_TYPE_CREATE_ORDER,
              signed.txInfo,
              hooks.accepted,
              {
                ...identity,
                intent: `chaseCreate:${intent.symbol}:${child.clientOrderId}`,
                owner: intent.handle,
                beforeDispatch: async () => {
                  assertSigning();
                  await this.#assertChaseProbeExposure(
                    intent,
                    child.size,
                    generation,
                    child.price,
                    token,
                  );
                  assertSigning();
                  await hooks.beforeDispatch();
                },
                onNotDispatched: hooks.notDispatched,
                afterAccepted: hooks.afterAccepted,
              },
            );
          },
          generation,
        );
      },
      cancel: async (child, hooks) => {
        assertSigning();
        const { token } = await this.#getNativeProbeReadToken(
          intent.owner.accountIndex,
          generation,
        );
        assertSigning();
        const exact = await this.#clientService.getOrdersByClientIds(
          intent.owner.accountIndex,
          token,
          [child.clientOrderId],
        );
        assertSigning();
        if (exact.orders.length !== 1) {
          throw new Error(
            'Lighter Chase exact child is not visible for cancellation',
          );
        }
        const orderId = identifyLighterChaseChild(
          intent,
          { ...child, nonce: child.placement.nonce },
          exact.orders[0],
        );
        if (child.observation && child.observation.orderId !== orderId) {
          throw new Error(
            'Lighter Chase child identity changed before cancellation',
          );
        }
        await this.#ensureSignerReady();
        assertSigning();
        await this.#withVenueNonce(
          intent.owner.accountIndex,
          async (nonce, submit) => {
            assertSigning();
            const signed = await this.#getSignerBridge().execute({
              function: '_signCancelOrder',
              params: [
                intent.owner.accountIndex,
                intent.marketId,
                orderId,
                nonce,
              ],
            });
            assertSigning();
            if (signed.error) {
              throw new Error(
                `Lighter Chase cancel signing failed: ${signed.error}`,
              );
            }
            const identity = requireSignedTxIdentity(signed);
            await hooks.signed({
              nonce,
              txHash: identity.txHash,
              expiresAt: identity.expiresAt,
            });
            assertSigning();
            await submit(
              LIGHTER_TX_TYPE_CANCEL_ORDER,
              signed.txInfo,
              hooks.accepted,
              {
                ...identity,
                intent: `chaseCancel:${intent.symbol}:${child.clientOrderId}`,
                owner: intent.handle,
                beforeDispatch: async () => {
                  assertSigning();
                  await hooks.beforeDispatch();
                  assertSigning();
                },
                onNotDispatched: hooks.notDispatched,
                afterAccepted: hooks.afterAccepted,
              },
            );
          },
          generation,
        );
      },
      observe: async (child, recordEvidence) => {
        assertCurrent();
        const cancel = child.cancellations.at(-1);
        if (cancel) {
          await reconcileDispatch(cancel, child, recordEvidence);
        }

        const { token } = await this.#getNativeProbeReadToken(
          intent.owner.accountIndex,
          generation,
        );
        assertCurrent();
        const exact = await this.#clientService.getOrdersByClientIds(
          intent.owner.accountIndex,
          token,
          [child.clientOrderId],
        );
        assertCurrent();
        if (exact.orders.length === 0) {
          if (!child.observation) {
            await reconcileDispatch(child.placement, child, recordEvidence);
            if (child.placement.phase === 'failed') {
              return null;
            }
          }
          throw new LighterChaseObservationPendingError(
            'Lighter Chase exact child visibility remains pending',
          );
        }
        if (exact.orders.length !== 1) {
          throw new Error('Lighter Chase exact child visibility is uncertain');
        }
        identifyLighterChaseChild(
          intent,
          { ...child, nonce: child.placement.nonce },
          exact.orders[0],
        );
        const order = exact.orders[0];
        if (!Number.isSafeInteger(order.orderIndex) || order.orderIndex <= 0) {
          throw new Error('Lighter Chase exact order identity is unavailable');
        }
        const trades: LighterRestTrade[] = [];
        const cursors = new Set<string>();
        let cursor: string | undefined;
        let complete = false;
        for (let page = 0; page < LIGHTER_NATIVE_PROBE_PAGE_LIMIT; page += 1) {
          const result = await this.#clientService.getTrades(
            intent.owner.accountIndex,
            token,
            {
              marketId: intent.marketId,
              limit: LIGHTER_NATIVE_PROBE_PAGE_SIZE,
              orderIndex: String(order.orderIndex),
              aggregate: false,
              cursor,
            },
          );
          assertCurrent();
          trades.push(...result.trades);
          if (!result.nextCursor) {
            complete = true;
            break;
          }
          if (result.trades.length === 0 || cursors.has(result.nextCursor)) {
            throw new Error('Lighter Chase trade pagination is incomplete');
          }
          cursors.add(result.nextCursor);
          cursor = result.nextCursor;
        }
        if (!complete) {
          throw new Error(
            'Lighter Chase trade history exceeds the bounded collector',
          );
        }
        const final = await this.#clientService.getOrdersByClientIds(
          intent.owner.accountIndex,
          token,
          [child.clientOrderId],
        );
        assertCurrent();
        if (
          final.orders.length !== 1 ||
          JSON.stringify(final.orders[0]) !== JSON.stringify(order)
        ) {
          throw new Error('Lighter Chase child changed during fill collection');
        }
        const observation = reconcileLighterChaseChild(
          intent,
          { ...child, nonce: child.placement.nonce },
          order,
          trades,
        );
        return observation;
      },
    };
  }

  #scheduleChase(
    record: LighterChaseRecord,
    io: LighterChaseIo,
    generation: number,
  ): void {
    if (record.status !== 'active') {
      return;
    }
    const { handle } = record.intent;
    const timer = setTimeout(
      () => {
        this.#chaseTimers.delete(handle);
        this.#chaseService
          .tick(record.intent.owner, handle, io)
          .then((updated) => {
            this.#assertSession(generation);
            this.#scheduleChase(updated, io, generation);
          })
          .catch(async (error: unknown) => {
            this.#deps.debugLogger.log('[LighterProvider] Chase tick failed', {
              handle,
              error: ensureError(error, 'LighterProvider.chaseTick').message,
            });
            this.#interruptChase();
            try {
              await this.#chaseService.recordError(
                record.intent.owner,
                handle,
                io,
                ensureError(error, 'LighterProvider.chaseTick').message,
              );
            } catch (recordError) {
              this.#deps.debugLogger.log(
                '[LighterProvider] Chase failure persistence unavailable',
                { handle, error: String(recordError) },
              );
            }
          });
      },
      Math.max(
        0,
        Math.min(
          record.intent.startedAt + record.intent.maxDurationMs,
          record.lastTickAt + record.intent.intervalMs,
        ) - Date.now(),
      ),
    );
    this.#chaseTimers.set(handle, timer);
  }

  async #placeChaseProbe(input: OrderParams): Promise<OrderResult> {
    const params = { ...input };
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const chaseGeneration = this.#chaseGeneration;
    const assertStartCurrent = (): void => {
      this.#assertSession(generation);
      if (chaseGeneration !== this.#chaseGeneration) {
        throw new Error('Lighter Chase start interrupted during preparation');
      }
    };
    const intent = await this.#prepareChaseIntent({ ...params }, generation);
    assertStartCurrent();
    await this.#ensureSignerReady();
    assertStartCurrent();
    // Read the reference, clock and exposure only after signing readiness.
    const freshIntent = await this.#prepareChaseIntent(
      { ...params },
      generation,
    );
    assertStartCurrent();
    Object.assign(intent, freshIntent);
    intent.owner = this.#chaseOwner(intent.owner.accountIndex);
    intent.handle = `lighter-chase:${this.#allocateClientOrderIndexes(1)[0]}`;
    const io = this.#chaseIo(intent, generation);
    try {
      const record = await this.#withNativeProbeStart(
        intent.owner,
        'chase',
        generation,
        async () => {
          assertStartCurrent();
          return await this.#chaseService.start(intent, io);
        },
      );
      assertStartCurrent();
      this.#scheduleChase(record, io, generation);
      const current = record.children.at(-1);
      const filled = new BigNumber(record.executedSize);
      return {
        success: record.status === 'active' || record.status === 'filled',
        orderId: intent.handle,
        providerId: 'lighter',
        submittedSize: current ? intent.originalSize : undefined,
        childOrderIds:
          current?.observation && !current.observation.terminal
            ? [current.observation.orderId]
            : [],
        ...(filled.gt(0)
          ? {
              filledSize: filled.toFixed(),
              averagePrice: new BigNumber(record.executedNotional)
                .div(filled)
                .toFixed(),
            }
          : {}),
        ...(record.status !== 'active' && record.status !== 'filled'
          ? {
              error:
                record.error ??
                'Lighter Chase is interrupted; reconcile its exact handle, never replay placement',
            }
          : {}),
      };
    } catch (error) {
      return {
        success: false,
        orderId: intent.handle,
        providerId: 'lighter',
        error: ensureError(error, 'LighterProvider.placeChase').message,
      };
    }
  }

  /**
   * Read every durable child for one exact handle without acquiring venue authority.
   * Does not bind a session, initialize signing, use transport or alter storage.
   * Original account/key identities remain visible after authority disappears.
   *
   * @param input - Explicit handle/route and optional original owner.
   * @returns Validated local history, or explicit absence. Corrupt storage rejects.
   */
  async getChaseOrderOwnership(
    input: GetChaseOrderOwnershipParams,
  ): Promise<PerpsChaseOrderOwnership> {
    const params = {
      ...input,
      owner: input.owner ? { ...input.owner } : undefined,
    };
    if (params.providerId !== 'lighter' || !params.handle) {
      throw new Error(
        'Chase ownership requires an exact handle and matching provider',
      );
    }
    const wallet = this.#walletService.getUserAddress().toLowerCase();
    const network = this.#isTestnet ? 'testnet' : 'mainnet';
    const generation = this.#sessionGeneration;
    const accountIndex = this.#accountIndex;
    const apiKeyIndex = this.#apiKeyIndex;
    const assertCurrent = (): void => {
      // The usual session fence may rebind streams. This observation must only
      // reject stale context, including a switch no other operation has noticed.
      if (
        this.#isDisconnected ||
        generation !== this.#sessionGeneration ||
        wallet !== this.#walletService.getUserAddress().toLowerCase() ||
        network !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
        accountIndex !== this.#accountIndex ||
        apiKeyIndex !== this.#apiKeyIndex
      ) {
        throw new Error('Lighter Chase ownership context changed during read');
      }
    };
    assertCurrent();
    const unavailable = (
      reason: 'not_found' | 'owner_mismatch',
    ): PerpsChaseOrderOwnership => ({
      status: 'unavailable',
      providerId: 'lighter',
      handle: params.handle,
      reason,
    });
    if (
      params.owner &&
      (params.owner.providerId !== 'lighter' ||
        params.owner.walletAddress.toLowerCase() !== wallet ||
        params.owner.network !== network)
    ) {
      return unavailable('owner_mismatch');
    }
    const accounts = await this.#readRememberedRecoveryAccounts(
      `lighterRecoveryAccounts:${network}:${wallet}`,
    );
    assertCurrent();
    let found: LighterChaseRecord | undefined;
    for (const index of accounts) {
      const record = await this.#chaseService.inspect(
        { wallet, network, accountIndex: index, apiKeyIndex },
        params.handle,
        { assertCurrent },
      );
      assertCurrent();
      if (record) {
        if (found) {
          throw new Error(
            'Lighter Chase handle has ambiguous durable ownership',
          );
        }
        found = record;
      }
    }
    if (!found) {
      return unavailable('not_found');
    }
    const { intent } = found;
    if (
      params.owner &&
      (params.owner.accountIndex !== intent.owner.accountIndex ||
        params.owner.apiKeyIndex !== intent.owner.apiKeyIndex)
    ) {
      return unavailable('owner_mismatch');
    }
    // Explicit projections prevent private journal extensions from leaking into
    // the public contract. Transaction identity is public; signed payloads and
    // raw signer/transport error messages are not.
    const dispatch = (
      value: LighterChaseDispatch,
    ): PerpsChaseOrderDispatch => ({
      phase: value.phase,
      ...(value.nonce === undefined ? {} : { nonce: value.nonce }),
      ...(value.txHash === undefined ? {} : { txHash: value.txHash }),
      ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
    });
    return {
      status: 'available',
      providerId: 'lighter',
      handle: intent.handle,
      owner: {
        providerId: 'lighter',
        walletAddress: intent.owner.wallet,
        network: intent.owner.network,
        accountIndex: intent.owner.accountIndex,
        apiKeyIndex: intent.owner.apiKeyIndex,
      },
      order: toLighterChaseOrder(found),
      executedSize: found.executedSize,
      executedNotional: found.executedNotional,
      lastTickAt: found.lastTickAt,
      ...(found.stopReason ? { stopReason: found.stopReason } : {}),
      children: found.children.map((child) => ({
        clientOrderId: child.clientOrderId,
        size: child.size,
        price: child.price,
        quotedAt: child.quotedAt,
        placement: dispatch(child.placement),
        cancellations: child.cancellations.map(dispatch),
        ...(child.observation
          ? {
              observation: {
                orderId: child.observation.orderId,
                terminal: child.observation.terminal,
                filledSize: child.observation.filledSize,
                filledNotional: child.observation.filledNotional,
                remainingSize: child.observation.remainingSize,
              },
            }
          : {}),
      })),
    };
  }

  /**
   * Read durable local Chase ownership without resuming a financial loop.
   *
   * @returns Exact recorded cleanup identities and public observation state.
   */
  async getNativeChaseRecords(): Promise<LighterChaseRecord[]> {
    return (await this.#chaseInventory()).records;
  }

  /**
   * Keep remembered local obligations visible when current venue authority is absent.
   *
   * @returns Wallet/network-scoped records and availability of current venue authority.
   */
  async #chaseInventory(): Promise<{
    records: LighterChaseRecord[];
    canReconcile: boolean;
  }> {
    this.#ensureSessionBinding();
    if (!this.#boundAddress) {
      return { records: [], canReconcile: false };
    }
    const generation = this.#sessionGeneration;
    let account: number;
    try {
      account = await this.#ensureAccountIndex();
    } catch (error) {
      if (error instanceof LighterAccountNotFoundError) {
        this.#assertSession(generation);
        const remembered = await this.#readRememberedRecoveryAccounts();
        this.#assertSession(generation);
        const records: LighterChaseRecord[] = [];
        for (const index of remembered) {
          if (
            this.#configuredAccountIndex !== undefined &&
            index !== this.#configuredAccountIndex
          ) {
            continue;
          }
          records.push(
            ...(await this.#chaseService.list(this.#chaseOwner(index), {
              assertCurrent: () => this.#assertSession(generation),
            })),
          );
          this.#assertSession(generation);
        }
        return { records, canReconcile: false };
      }
      throw error;
    }
    this.#assertSession(generation);
    const records = await this.#chaseService.list(this.#chaseOwner(account), {
      assertCurrent: () => this.#assertSession(generation),
    });
    return { records, canReconcile: true };
  }

  /**
   * Persist local stop intent without inventing venue authority or signing access.
   *
   * @param intent - Exact validated remembered record.
   * @param generation - Issuing wallet/network session.
   * @returns Current local storage authority without venue operations.
   */
  #chaseManagementIo(
    intent: LighterChaseIntent,
    generation: number,
  ): Pick<LighterChaseIo, 'assertCurrent'> {
    const assertCurrent = (): void => {
      this.#assertSession(generation);
      if (
        this.#boundAddress !== intent.owner.wallet ||
        (this.#isTestnet ? 'testnet' : 'mainnet') !== intent.owner.network
      ) {
        throw new Error('Lighter Chase remembered owner changed');
      }
    };
    return { assertCurrent };
  }

  /**
   * @param intent - Exact validated owned record.
   * @param generation - Issuing wallet/network session.
   * @param canReconcile - Whether current venue account authority is available.
   * @param reason - Requested stop cause.
   * @returns Confirmed settlement or explicit unresolved cleanup.
   */
  async #stopChase(
    intent: LighterChaseIntent,
    generation: number,
    canReconcile: boolean,
    reason: ChaseOrderStatus,
  ): Promise<LighterChaseRecord> {
    return canReconcile
      ? await this.#chaseService.stop(
          intent.owner,
          intent.handle,
          this.#chaseIo(intent, generation),
          reason,
        )
      : await this.#chaseService.stopLocally(
          intent.owner,
          intent.handle,
          this.#chaseManagementIo(intent, generation),
          reason,
          'Lighter Chase current venue authority is unavailable; remembered cleanup remains pending',
        );
  }

  /** @returns Provider-bound management state, including interrupted ownership. */
  async getChaseOrders(): Promise<ChaseOrder[]> {
    return (await this.getNativeChaseRecords()).map(toLighterChaseOrder);
  }

  /** @returns Backgrounded sessions, or visible pending cleanup when uncertain. */
  async suspendChaseOrders(): Promise<ChaseOrder[]> {
    this.#interruptChase('backgrounded');
    const { records, canReconcile } = await this.#chaseInventory();
    const generation = this.#sessionGeneration;
    const result: ChaseOrder[] = [];
    for (const record of records) {
      if (
        record.status === 'active' ||
        record.status === 'termination_pending'
      ) {
        result.push(
          toLighterChaseOrder(
            await this.#stopChase(
              record.intent,
              generation,
              canReconcile,
              'backgrounded',
            ),
          ),
        );
      } else {
        result.push(toLighterChaseOrder(record));
      }
    }
    return result;
  }

  async #cancelChase(params: CancelOrderParams): Promise<CancelOrderResult> {
    if (params.providerId !== undefined && params.providerId !== 'lighter') {
      throw new Error('Lighter Chase provider route mismatch');
    }
    this.#chaseService.interruptHandle(params.orderId, params.symbol);
    const timer = this.#chaseTimers.get(params.orderId);
    if (timer) {
      clearTimeout(timer);
      this.#chaseTimers.delete(params.orderId);
    }
    const { records, canReconcile } = await this.#chaseInventory();
    const record = records.find(
      (entry) =>
        entry.intent.handle === params.orderId &&
        entry.intent.symbol === params.symbol,
    );
    if (!record) {
      throw new Error('Unknown owned Lighter Chase handle');
    }
    const result = await this.#stopChase(
      record.intent,
      this.#sessionGeneration,
      canReconcile,
      'canceled',
    );
    const settled =
      result.status !== 'active' &&
      result.status !== 'termination_pending' &&
      toLighterChaseOrder(result).restingOrderId === null;
    return {
      success: settled,
      orderId: record.intent.handle,
      providerId: 'lighter',
      ...(settled
        ? {}
        : { error: result.error ?? 'Lighter Chase cleanup remains pending' }),
    };
  }

  /**
   * Reconcile an original owned Chase cancellation using existing read authority.
   * Never initialize a financial signer, allocate a nonce or submit a new cancel.
   *
   * @param input - Captured original owner, handle, child and cancellation identity.
   * @returns Terminal management state or explicit unresolved cleanup.
   */
  async reconcileChaseOrderCancellation(
    input: ReconcileChaseOrderCancellationParams,
  ): Promise<ReconcileChaseOrderCancellationResult> {
    const params = {
      ...input,
      owner: { ...input.owner },
      cancellation: { ...input.cancellation },
    };
    if (
      params.providerId !== 'lighter' ||
      params.owner.providerId !== 'lighter' ||
      !params.handle ||
      !params.clientOrderId
    ) {
      throw new Error(
        'Lighter Chase cancellation reconciliation requires an exact owner and provider route',
      );
    }
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const owner: LighterChaseOwner = {
      wallet: params.owner.walletAddress.toLowerCase(),
      network: params.owner.network,
      accountIndex: params.owner.accountIndex,
      apiKeyIndex: params.owner.apiKeyIndex,
    };
    if (
      owner.wallet !== this.#boundAddress ||
      owner.network !== (this.#isTestnet ? 'testnet' : 'mainnet')
    ) {
      throw new Error(
        'Lighter Chase original cancellation owner does not match the current context',
      );
    }
    const record = await this.#chaseService.inspect(owner, params.handle, {
      assertCurrent: () => this.#assertSession(generation),
    });
    this.#assertSession(generation);
    if (!record || record.intent.owner.apiKeyIndex !== owner.apiKeyIndex) {
      throw new Error('Unknown original owned Lighter Chase cancellation');
    }
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    if (accountIndex !== owner.accountIndex) {
      throw new Error(
        'Lighter Chase original cancellation account does not match the current context',
      );
    }
    const io = this.#chaseIo(record.intent, generation);
    const result = await this.#chaseService.reconcileCancellation(
      owner,
      params.handle,
      params.clientOrderId,
      params.cancellation,
      { assertCurrent: io.assertCurrent, now: io.now, observe: io.observe },
    );
    this.#assertSession(generation);
    const timer = this.#chaseTimers.get(params.handle);
    if (timer) {
      clearTimeout(timer);
      this.#chaseTimers.delete(params.handle);
    }
    const order = toLighterChaseOrder(result);
    return {
      status:
        order.status !== 'active' &&
        order.status !== 'termination_pending' &&
        order.restingOrderId === null
          ? 'settled'
          : 'unresolved',
      providerId: 'lighter',
      handle: params.handle,
      order,
    };
  }

  async #placeNativeTwapProbe(input: OrderParams): Promise<OrderResult> {
    const params = { ...input };
    if (!this.#isTestnet || !this.#nativeTwapTestnetProbe) {
      throw new Error('Lighter native TWAP lifecycle is unavailable');
    }
    const unsupportedFields = [
      'scaleMinPrice',
      'scaleMaxPrice',
      'scaleNumOrders',
      'scaleSkew',
      'chaseIntervalMs',
      'chaseMaxDurationMs',
      'chaseMaxRepricings',
      'chaseMaxDistanceBps',
      'takeProfitSize',
      'stopLossSize',
      'clientOrderId',
      'tpslLinkage',
      'grouping',
      'isFullClose',
    ] as const;
    if (
      unsupportedFields.some((field) => params[field] !== undefined) ||
      params.leverage !== 1 ||
      params.marginMode !== undefined ||
      params.usdAmount !== undefined ||
      params.price !== undefined ||
      params.triggerPrice !== undefined ||
      params.timeInForce !== undefined ||
      params.takeProfitPrice !== undefined ||
      params.stopLossPrice !== undefined
    ) {
      throw new Error(
        'Native TWAP probe requires exact size, existing 1x leverage and no unsupported order fields',
      );
    }
    if (
      params.twapDuration === undefined ||
      !Number.isSafeInteger(params.twapDuration) ||
      params.twapDuration <= 0
    ) {
      throw new Error('Native TWAP probe requires a positive integer duration');
    }
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const market = (await this.#ensureMarkets(true)).get(params.symbol);
    this.#assertSession(generation);
    if (market?.status !== 'active' || market.marketType !== 'perp') {
      throw new Error('Native TWAP probe requires an active perpetual market');
    }
    const slippage =
      params.maxSlippageBps === undefined
        ? (params.slippage ?? LIGHTER_NATIVE_PROBE_DEFAULT_SLIPPAGE)
        : params.maxSlippageBps / 10_000;
    const resolved = await this.#resolveMarketReferencePrice(
      params.symbol,
      slippage,
      params.priceAtCalculation,
    );
    if (resolved.error !== null) {
      throw new Error(resolved.error);
    }
    const durationMinutes = params.twapDuration;
    const prepare = (
      referencePrice: number,
      nowMilliseconds: number,
    ): ReturnType<typeof prepareLighterTwapOrder> => {
      const maximumNotional = new BigNumber(params.size)
        .times(referencePrice)
        .times(new BigNumber(1).plus(slippage));
      if (
        maximumNotional.gt(LIGHTER_NATIVE_PROBE_MAX_NOTIONAL) ||
        new BigNumber(params.size)
          .times(referencePrice)
          .times(new BigNumber(1).minus(slippage))
          .lt(market.minQuoteAmount) ||
        new BigNumber(params.size).lt(market.minBaseAmount)
      ) {
        throw new Error(
          'Native TWAP probe must fit venue parent minimums and the 20 USD limit',
        );
      }
      return prepareLighterTwapOrder({
        size: params.size,
        referencePrice: String(referencePrice),
        sizeDecimals: market.supportedSizeDecimals,
        priceDecimals: market.supportedPriceDecimals,
        isBuy: params.isBuy,
        slippage: String(slippage),
        durationMinutes,
        nowMilliseconds,
        randomize: params.twapRandomize ?? false,
        reduceOnly: params.reduceOnly ?? false,
      });
    };
    prepare(resolved.referencePrice, Date.now());
    const accountIndex = await this.#ensureAccountIndex();
    const response = await this.#clientService.getAccountByIndex(accountIndex);
    this.#assertSession(generation);
    if (response.accounts.length !== 1) {
      throw new Error('Native TWAP probe account is ambiguous');
    }
    const account = response.accounts[0];
    this.#assertAccountOwnership(account);
    this.#assertStandardAccount(account.accountType);
    const positions = (account.positions ?? []).filter(
      (position) => position.marketId === market.marketId,
    );
    if (
      positions.length !== 1 ||
      !new BigNumber(positions[0].initialMarginFraction).eq(100)
    ) {
      throw new Error(
        'Native TWAP probe requires independently confirmed existing 1x leverage',
      );
    }
    this.#assertSession(generation);
    await this.#ensureSignerReady();
    this.#assertSession(generation);
    const refreshed = await this.#resolveMarketReferencePrice(
      params.symbol,
      slippage,
      params.priceAtCalculation,
    );
    this.#assertSession(generation);
    if (refreshed.error !== null) {
      throw new Error(refreshed.error);
    }
    const startedAt = Date.now();
    const prepared = prepare(refreshed.referencePrice, startedAt);
    const owner = this.#nativeTwapOwner(accountIndex);
    const [clientId] = this.#allocateClientOrderIndexes(1);
    const intent = {
      owner,
      symbol: params.symbol,
      marketId: market.marketId,
      clientOrderId: String(clientId),
      size: params.size,
      price: new BigNumber(prepared.price)
        .shiftedBy(-market.supportedPriceDecimals)
        .toFixed(),
      isBuy: params.isBuy,
      reduceOnly: params.reduceOnly ?? false,
      sizeDecimals: market.supportedSizeDecimals,
      priceDecimals: market.supportedPriceDecimals,
      durationMinutes: params.twapDuration,
      startedAt,
      orderExpiry: prepared.orderExpiry,
    };
    try {
      await this.#withNativeProbeStart(
        owner,
        'twap',
        generation,
        async () =>
          await this.#nativeTwapService.place(intent, async (hooks) => {
            await this.#withVenueNonce(
              accountIndex,
              async (nonce, submit) => {
                this.#assertSession(generation);
                if (
                  this.#apiKeyIndex !== owner.apiKeyIndex ||
                  Date.now() >= intent.orderExpiry
                ) {
                  throw new Error('Native TWAP intent became stale');
                }
                const signed = await this.#getSignerBridge().execute({
                  function: '_signCreateOrder',
                  params: [
                    accountIndex,
                    market.marketId,
                    clientId,
                    prepared.baseAmount,
                    prepared.price,
                    prepared.isAsk,
                    prepared.orderType,
                    prepared.timeInForce,
                    prepared.reduceOnly,
                    prepared.triggerPrice,
                    prepared.orderExpiry,
                    nonce,
                  ],
                });
                if (signed.error) {
                  throw new Error('Native TWAP signer refused the placement');
                }
                const identity = requireSignedTxIdentity(signed);
                await hooks.signed({
                  nonce,
                  txHash: identity.txHash,
                  expiresAt: identity.expiresAt,
                });
                await submit(
                  LIGHTER_TX_TYPE_CREATE_ORDER,
                  signed.txInfo,
                  undefined,
                  {
                    ...identity,
                    intent: `nativeTwap:${params.symbol}:${clientId}`,
                    beforeDispatch: hooks.beforeDispatch,
                    onNotDispatched: hooks.notDispatched,
                  },
                );
              },
              generation,
            );
          }),
      );
    } catch (error) {
      return {
        success: false,
        orderId: String(clientId),
        providerId: 'lighter',
        error: `Native TWAP placement did not complete; reconcile this client order before retrying: ${ensureError(error, 'LighterProvider.nativeTwap').message}`,
      };
    }
    let observations: LighterTwapReadObservation[];
    try {
      observations = await this.getNativeTwapObservations();
    } catch (error) {
      return {
        success: false,
        orderId: String(clientId),
        providerId: 'lighter',
        error: `Native TWAP submitted; parent observation failed. Do not replay: ${ensureError(error, 'LighterProvider.nativeTwapRead').message}`,
      };
    }
    const observed = observations.find(
      (entry) => entry.record.intent.clientOrderId === String(clientId),
    );
    if (!observed?.observation) {
      return {
        success: false,
        orderId: String(clientId),
        providerId: 'lighter',
        error:
          'Native TWAP submitted; exact parent or fill mapping remains unresolved. Do not replay.',
      };
    }
    return {
      success: true,
      orderId: observed.observation.parentOrderId,
      submittedSize: params.size,
      providerId: 'lighter',
    };
  }

  async #cancelNativeTwapProbe(
    input: CancelOrderParams,
  ): Promise<CancelOrderResult> {
    const params = { ...input };
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const records = await this.#nativeTwapService.list(
      this.#nativeTwapOwner(accountIndex),
    );
    this.#assertSession(generation);
    const owned = records.filter(
      (record) =>
        record.intent.symbol === params.symbol &&
        (record.intent.clientOrderId === params.orderId ||
          record.parentOrderId === params.orderId),
    );
    if (owned.length !== 1) {
      throw new Error(
        'Native TWAP cancellation requires an exact owned visible parent',
      );
    }
    const record = owned[0];
    const authority = await this.#getNativeProbeReadToken(
      accountIndex,
      generation,
    );
    this.#assertSession(generation);
    const exact = await this.#clientService.getOrdersByClientIds(
      accountIndex,
      authority.token,
      [record.intent.clientOrderId],
    );
    this.#assertSession(generation);
    if (exact.orders.length !== 1) {
      throw new Error(
        'Native TWAP cancellation requires an exact owned visible parent',
      );
    }
    const parentOrderId = identifyLighterTwapParent(record, exact.orders[0]);
    await this.#ensureSignerReady();
    this.#assertSession(generation);
    if (this.#apiKeyIndex !== record.intent.owner.apiKeyIndex) {
      throw new Error(
        'Native TWAP cancellation requires the original signing slot',
      );
    }
    await this.#nativeTwapService.cancel(
      record.intent.owner,
      record.intent.clientOrderId,
      async (hooks) => {
        await this.#withVenueNonce(
          record.intent.owner.accountIndex,
          async (nonce, submit) => {
            this.#assertSession(generation);
            if (this.#apiKeyIndex !== record.intent.owner.apiKeyIndex) {
              throw new Error(
                'Native TWAP cancellation requires the original signing slot',
              );
            }
            const signed = await this.#getSignerBridge().execute({
              function: '_signCancelOrder',
              params: [
                record.intent.owner.accountIndex,
                record.intent.marketId,
                parentOrderId,
                nonce,
              ],
            });
            if (signed.error) {
              throw new Error('Native TWAP signer refused cancellation');
            }
            const identity = requireSignedTxIdentity(signed);
            await hooks.signed({
              nonce,
              txHash: identity.txHash,
              expiresAt: identity.expiresAt,
            });
            await submit(
              LIGHTER_TX_TYPE_CANCEL_ORDER,
              signed.txInfo,
              undefined,
              {
                ...identity,
                intent: `cancelNativeTwap:${record.intent.symbol}:${record.intent.clientOrderId}`,
                beforeDispatch: async () => {
                  this.#assertSession(generation);
                  if (this.#apiKeyIndex !== record.intent.owner.apiKeyIndex) {
                    throw new Error(
                      'Native TWAP cancellation requires the original signing slot',
                    );
                  }
                  await hooks.beforeDispatch();
                },
                onNotDispatched: hooks.notDispatched,
              },
            );
          },
          generation,
        );
      },
    );
    let readIssue = '';
    try {
      await this.getNativeTwapObservations();
    } catch (error) {
      readIssue = `; observation failed: ${ensureError(error, 'LighterProvider.nativeTwapCancelRead').message}`;
    }
    return {
      success: false,
      orderId: parentOrderId,
      providerId: 'lighter',
      error: `Native TWAP cancellation submitted; authoritative schedule termination remains unverified${readIssue}`,
    };
  }

  /**
   * Refuse a management read until native parent execution totals and terminal
   * schedule semantics can be established from authoritative venue evidence.
   * An empty result would incorrectly imply that no native schedules exist.
   *
   * @returns No schedule snapshot while the lifecycle contract is unavailable.
   */
  async getTwapOrders(): Promise<TwapOrder[]> {
    throw new Error(
      'Lighter native TWAP lifecycle is unavailable: authoritative parent fills and termination are not established',
    );
  }

  async cancelOrder(
    params: CancelOrderParams,
    inheritedGeneration?: number,
  ): Promise<CancelOrderResult> {
    if (params.orderType === 'chase') {
      try {
        return await this.#cancelChase(params);
      } catch (error) {
        return {
          success: false,
          orderId: params.orderId,
          providerId: 'lighter',
          error: ensureError(error, 'LighterProvider.cancelChase').message,
        };
      }
    }
    // A generic cancel acknowledgment does not establish that a native
    // schedule is terminal or that no further slices can execute.
    if (params.orderType === 'twap' && this.#nativeTwapTestnetProbe) {
      try {
        return await this.#cancelNativeTwapProbe(params);
      } catch (error) {
        return {
          success: false,
          error: ensureError(error, 'LighterProvider.cancelNativeTwap').message,
        };
      }
    }
    if (params.orderType === 'twap') {
      return {
        success: false,
        error:
          'Lighter native TWAP lifecycle is unavailable: authoritative schedule termination is not established',
      };
    }
    try {
      this.#ensureSessionBinding();
      const generationAtIntent = inheritedGeneration ?? this.#sessionGeneration;
      this.#assertSession(generationAtIntent);
      if (params.orderId.startsWith(LIGHTER_ATTACHED_HANDLE_PREFIX)) {
        return await this.#cancelAttachedGroup(params, generationAtIntent);
      }
      if (
        params.orderType === 'scale' ||
        params.orderId.startsWith(LIGHTER_SCALE_PREFIX)
      ) {
        return await this.#cancelScaleOrder(params, generationAtIntent);
      }
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }

      await this.#withVenueNonce(
        accountIndex,
        async (nonce, submit) => {
          const signed = await this.#getSignerBridge().execute({
            function: '_signCancelOrder',
            params: [accountIndex, market.marketId, params.orderId, nonce],
          });
          if (signed.error) {
            throw new Error(`Lighter cancel signing failed: ${signed.error}`);
          }
          return await submit(
            LIGHTER_TX_TYPE_CANCEL_ORDER,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: `cancelOrder:${params.symbol}:${params.orderId}`,
            },
          );
        },
        generationAtIntent,
      );

      return {
        success: true,
        orderId: params.orderId,
        providerId: 'lighter',
      };
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.cancelOrder',
      );
      this.#deps.debugLogger.log('[LighterProvider] cancelOrder failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('cancelOrder', { symbol: params.symbol }),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  // ============================================================================
  // Trading Operations (POC: stubbed)
  // ============================================================================

  /**
   * Modify a verified ordinary resting limit in place. Acceptance remains
   * pending until exact transaction and order observations agree. The native
   * ABI has no order version, so the final venue race cannot be eliminated.
   *
   * @param params - Exact venue order ID and explicit price/size intent.
   * @returns Truthful durable same-order outcome, never a placement receipt.
   */
  async editOrder(params: EditOrderParams): Promise<OrderResult> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const orderId = lighterEditOrderId(params.orderId);
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generation);
      if (!this.#boundAddress) {
        throw new Error('Lighter native edit wallet is unbound');
      }
      const scope = {
        wallet: this.#boundAddress,
        network: this.#isTestnet ? ('testnet' as const) : ('mainnet' as const),
        accountIndex,
        orderId,
      };
      const key = `${LIGHTER_EDIT_JOURNAL_PREFIX}${JSON.stringify([scope.network, scope.wallet, accountIndex, orderId])}`;
      // Process-wide per-order ownership excludes duplicate live providers as
      // well as a restarted caller. No other operation takes this lock.
      return await withProcessMutex(key, async () => {
        let journal: LighterNativeEditJournal | null = null;
        const read = async (): Promise<LighterNativeEditJournal | null> => {
          this.#assertSession(generation);
          const raw = await this.#deps.diskCache.getItem(key);
          this.#assertSession(generation);
          return parseLighterNativeEditJournal(raw, scope);
        };
        const save = async (
          record: LighterNativeEditJournal,
        ): Promise<void> => {
          this.#assertSession(generation);
          const raw = JSON.stringify(record);
          const snapshot = parseLighterNativeEditJournal(raw, scope);
          await this.#deps.diskCache.setItem(key, raw);
          this.#assertSession(generation);
          journal = snapshot;
        };
        journal = await read();
        // Restore read authority in the original slot before any financial
        // signer setup. Slot changes must not bypass a pending edit.
        const authority = await withProcessMutex(
          `lighterVenueWrite:${scope.network}:${accountIndex}`,
          async () =>
            await this.#getRecoveryReadToken(
              accountIndex,
              generation,
              journal?.apiKeyIndex,
            ),
        );
        this.#assertSession(generation);
        const exactRow = async (
          clientId?: string,
        ): Promise<LighterEditableOrder | null> => {
          const response = await this.#clientService.getEditableOrders(
            accountIndex,
            authority.token,
            clientId ? [clientId] : undefined,
          );
          this.#assertSession(generation);
          const candidates = response.orders.filter(
            (row) =>
              lighterEditOrderId(row.orderIndex) === orderId ||
              (clientId !== undefined &&
                String(row.clientOrderIndex) === clientId),
          );
          if (candidates.length > 1) {
            throw new Error('Lighter native edit target is ambiguous');
          }
          return candidates[0] ?? null;
        };
        // Only this operation's exact owned ledger entry may be retired.
        // Unknown or unrelated dispatches keep their existing safeguards.
        const retire = async (
          record: LighterNativeEditJournal,
          consumed: boolean,
        ): Promise<void> => {
          const { nonce, txHash } = record;
          if (nonce === undefined || txHash === undefined) {
            return;
          }
          await this.#withLedgerLock(
            accountIndex,
            async () => {
              this.#assertSession(generation);
              const doc = await this.#readNonceLedger(
                accountIndex,
                record.apiKeyIndex,
              );
              this.#assertSession(generation);
              const entries = doc.entries.filter(
                (entry) =>
                  entry.owner !== key ||
                  entry.nonce !== nonce ||
                  entry.txHash !== txHash ||
                  entry.kind !== LIGHTER_TX_TYPE_MODIFY_ORDER,
              );
              if (entries.length !== doc.entries.length || consumed) {
                await this.#writeNonceLedger(
                  accountIndex,
                  {
                    ...doc,
                    entries,
                    consumedFloor: consumed
                      ? Math.max(doc.consumedFloor, nonce + 1)
                      : doc.consumedFloor,
                  },
                  record.apiKeyIndex,
                );
                this.#assertSession(generation);
              }
              if (!consumed && nonce >= doc.consumedFloor) {
                this.#releaseNonceReservation(
                  accountIndex,
                  nonce,
                  record.apiKeyIndex,
                );
              }
            },
            record.apiKeyIndex,
          );
        };
        const reconcile = async (
          record: LighterNativeEditJournal,
        ): Promise<OrderResult> => {
          if (record.status !== 'pending') {
            return lighterNativeEditResult(record, params.newOrder);
          }
          if (record.phase === 'prepared' || record.phase === 'signed') {
            // Account lock and durable attempted-before-transport boundary
            // prove this interrupted attempt never reached transport.
            record.status = 'failed';
            record.resolution = 'unsent';
            await save(record);
            await retire(record, false);
            return lighterNativeEditResult(record, params.newOrder);
          }
          let transaction: LighterTxLookupResponse | null;
          try {
            transaction = await this.#clientService.getTx(record.txHash ?? '');
          } catch {
            this.#assertSession(generation);
            if (record.resolution !== 'executed') {
              return lighterNativeEditResult(record, params.newOrder);
            }
            transaction = null;
          }
          this.#assertSession(generation);
          const row = await exactRow(record.original.clientOrderId);
          if (row) {
            record.observation = observeLighterNativeEdit(row, record);
          }
          if (transaction !== null) {
            const matches =
              typeof transaction.hash === 'string' &&
              transaction.hash.toLowerCase().replace(/^0x/u, '') ===
                record.txHash?.toLowerCase().replace(/^0x/u, '') &&
              transaction.accountIndex === accountIndex &&
              transaction.apiKeyIndex === record.apiKeyIndex &&
              transaction.nonce === record.nonce;
            if (!matches) {
              throw new Error(
                'Lighter native edit transaction identity mismatch',
              );
            }
            const outcome = getLighterTransactionOutcome(transaction.status);
            if (outcome === 'failed') {
              record.status = 'failed';
              record.resolution = 'failed';
            } else if (outcome === 'executed') {
              record.resolution = 'executed';
            }
          } else if (
            record.phase !== 'accepted' &&
            record.resolution !== 'executed' &&
            Date.now() >
              (record.expiresAt ?? Number.MAX_SAFE_INTEGER) +
                LIGHTER_TX_EXPIRY_SLACK_MS &&
            row
          ) {
            // Confirmed exact-hash absence after expiry is retry-safe only
            // without prior acceptance/execution. The target is reread too.
            const ledger = await this.#readNonceLedger(
              accountIndex,
              record.apiKeyIndex,
            );
            this.#assertSession(generation);
            // A durable consumed floor may retain an acceptance whose edit
            // journal update failed. Never turn that evidence into absence.
            if (ledger.consumedFloor <= (record.nonce ?? -1)) {
              record.status = 'failed';
              record.resolution = 'expired';
            }
          }
          // An earlier exact execution proof survives later lookup loss. Its
          // order obligation still needs a fresh exact observation.
          if (record.resolution === 'executed' && row && record.observation) {
            const status = adaptOrderStatus(row.status);
            if (['filled', 'canceled'].includes(status)) {
              record.status = 'terminal';
            } else if (
              status === 'open' &&
              new BigNumber(row.price).eq(record.intent.price) &&
              new BigNumber(row.initialBaseAmount).eq(record.intent.size) &&
              new BigNumber(row.remainingBaseAmount).eq(record.intent.size) &&
              new BigNumber(record.observation.filledSize).isZero()
            ) {
              record.status = 'settled';
            }
          }
          await save(record);
          if (
            record.resolution === 'executed' ||
            record.resolution === 'failed'
          ) {
            await retire(record, true);
          } else if (record.resolution === 'expired') {
            await retire(record, false);
          }
          return lighterNativeEditResult(record, params.newOrder);
        };
        if (
          journal?.status === 'pending' ||
          journal?.status === 'terminal' ||
          (journal?.status === 'settled' &&
            lighterNativeEditResult(journal, params.newOrder).success)
        ) {
          const retained = journal;
          return await this.#withVenueWriteLock(
            accountIndex,
            async () => {
              throw new Error('Lighter native edit recovery cannot dispatch');
            },
            generation,
            retained.apiKeyIndex,
            async () => ({ result: await reconcile(retained) }),
          );
        }
        const preflight = async (): Promise<{
          row: LighterEditableOrder;
          intent: LighterNativeEditJournal['intent'];
        }> => {
          const row = await exactRow();
          if (!row) {
            throw new Error(
              'Lighter native edit target is not an active exact order',
            );
          }
          const markets = await this.#clientService.getOrderBooks(true);
          this.#assertSession(generation);
          const matches = markets.filter(
            (market) =>
              market.marketId === row.marketIndex &&
              market.symbol === params.newOrder.symbol,
          );
          if (matches.length !== 1) {
            throw new Error(
              'Lighter native edit market identity is unavailable',
            );
          }
          const intent = prepareLighterNativeEdit(
            params.newOrder,
            row,
            matches[0],
            accountIndex,
          );
          const scale = await this.#readScaleGroups(
            this.#scaleKey(accountIndex),
            accountIndex,
          );
          const attached = await this.#readAttachedGroups(
            this.#attachedKey(accountIndex),
          );
          const protection = await this.#readManagedTpsl(
            `${scope.wallet}:${accountIndex}:${authority.apiKeyIndex}:${intent.symbol}`,
          );
          const chase = await this.#chaseService.hasRecordedChild(
            this.#chaseOwner(accountIndex),
            String(row.clientOrderIndex),
            { assertCurrent: () => this.#assertSession(generation) },
          );
          this.#assertSession(generation);
          if (
            chase ||
            protection.some(
              (order) =>
                order.clientId === String(row.clientOrderIndex) ||
                order.orderId === orderId,
            ) ||
            scale.some((group) =>
              group.rungs.some(
                (rung) => rung.clientOrderId === row.clientOrderIndex,
              ),
            ) ||
            attached.some((group) =>
              group.orders.some(
                (order) =>
                  order[0] === row.marketIndex &&
                  order[1] === row.clientOrderIndex,
              ),
            )
          ) {
            throw new Error(
              'Lighter native edit cannot modify a recorded strategy or protection child',
            );
          }
          return { row, intent };
        };
        await preflight();
        await this.#ensureSignerReady();
        this.#assertSession(generation);
        if (this.#apiKeyIndex !== authority.apiKeyIndex) {
          throw new Error(
            'Lighter native edit signing key changed after preflight',
          );
        }
        try {
          return await this.#withVenueWriteLock(
            accountIndex,
            async (nextNonce, submit) => {
              const { row, intent } = await preflight();
              const record: LighterNativeEditJournal = {
                version: 1,
                wallet: scope.wallet,
                network: scope.network,
                accountIndex,
                apiKeyIndex: authority.apiKeyIndex,
                startedAt: Date.now(),
                original: lighterNativeEditTarget(row),
                intent,
                phase: 'prepared',
                status: 'pending',
              };
              await save(record);
              const nonce = await nextNonce();
              const tuple: LighterSignModifyOrderWireParams = [
                accountIndex,
                intent.marketIndex,
                orderId,
                intent.sizeInt,
                intent.priceInt,
                0,
                nonce,
              ];
              const startedAt = Date.now();
              const signed = await this.#getSignerBridge().execute({
                function: '_signModifyOrder',
                params: tuple,
              });
              this.#assertSession(generation);
              const decoded = decodeLighterModifyOrder(
                signed,
                tuple,
                record.apiKeyIndex,
                startedAt,
                Date.now(),
              );
              Object.assign(record, {
                phase: 'signed',
                nonce,
                txHash: decoded.txHash,
                expiresAt: decoded.expiresAt,
              });
              await save(record);
              await submit(
                LIGHTER_TX_TYPE_MODIFY_ORDER,
                decoded.txInfo,
                undefined,
                {
                  txHash: decoded.txHash,
                  expiresAt: decoded.expiresAt,
                  intent: `editOrder:${intent.symbol}:${orderId}`,
                  owner: key,
                  beforeDispatch: async () => {
                    const finalTarget = await preflight();
                    if (
                      JSON.stringify(
                        lighterNativeEditTarget(finalTarget.row),
                      ) !== JSON.stringify(record.original) ||
                      JSON.stringify(finalTarget.intent) !==
                        JSON.stringify(record.intent)
                    ) {
                      throw new Error(
                        'Lighter native edit target changed before dispatch',
                      );
                    }
                    record.phase = 'attempted';
                    await save(record);
                  },
                  onNotDispatched: async () => {
                    record.status = 'failed';
                    record.resolution = 'unsent';
                    await save(record);
                  },
                },
              );
              record.phase = 'accepted';
              await save(record);
              // A normal accepted edit can precede transaction or order indexer
              // visibility. Poll only its exact durable identity; replayed
              // pending edits above remain a single read-only reconciliation.
              let result = await reconcile(record);
              this.#assertSession(generation);
              for (
                let attempt = 1;
                attempt < LIGHTER_EDIT_SETTLE_ATTEMPTS &&
                result.orderEdit?.status === 'pending';
                attempt += 1
              ) {
                await new Promise((resolve) =>
                  setTimeout(resolve, LIGHTER_EDIT_SETTLE_POLL_MS),
                );
                this.#assertSession(generation);
                result = await reconcile(record);
                this.#assertSession(generation);
              }
              return result;
            },
            generation,
            authority.apiKeyIndex,
            async () => {
              const current = await read();
              if (current?.status === 'pending') {
                return { result: await reconcile(current) };
              }
              // Inspecting this order must not bypass other-slot quarantine.
              for (
                let slot = LIGHTER_MIN_TRADING_API_KEY_INDEX;
                slot <= LIGHTER_MAX_TRADING_API_KEY_INDEX;
                slot += 1
              ) {
                if (slot !== authority.apiKeyIndex) {
                  await this.#resolveNonceLedger(accountIndex, slot);
                }
              }
            },
          );
        } catch (error) {
          this.#reportTradingError(
            error,
            'editOrder',
            {
              operation: PERPS_ERROR_OPERATION.OrderManagement,
              action: PERPS_ERROR_ACTION.EditOrder,
            },
            {
              symbol: params.newOrder.symbol,
              orderId: params.orderId,
            },
          );
          // Project only retained intent and observations. Do not leak signer
          // or transport failures, or mutate a cancelled issuing session.
          if (journal) {
            return {
              ...lighterNativeEditResult(journal, params.newOrder),
              success: false,
            };
          }
          throw new Error('Lighter native edit could not dispatch');
        }
      });
    } catch {
      return {
        success: false,
        error:
          'Lighter native edit refused: exact ordinary resting order, supported fields and original read authority are required',
        providerId: 'lighter',
      };
    }
  }

  /**
   * Resolve the FRESH venue reference price for a market-order sizing,
   * with the same fail-closed and drift semantics as execution — shared
   * by placement and close validation so they can never disagree.
   *
   * @param symbol - Market symbol.
   * @param slippageFraction - Caller slippage tolerance (fraction).
   * @param priceAtCalculation - Caller's sizing snapshot, if any.
   * @returns The fresh reference price, or the exact execution error.
   */
  readonly #resolveMarketReferencePrice = async (
    symbol: string,
    slippageFraction: number,
    priceAtCalculation?: number,
  ): Promise<
    | { referencePrice: number; error: null }
    | { referencePrice: null; error: string }
  > => {
    // Numeric intent validates fail-closed BEFORE any drift math. A
    // non-finite/non-positive snapshot makes the drift comparison NaN
    // (silently bypassing protection), and a tolerance at or above 100%
    // derives a zero-or-negative protection price on sells.
    if (
      !Number.isFinite(slippageFraction) ||
      slippageFraction < 0 ||
      slippageFraction >= 1
    ) {
      return {
        referencePrice: null,
        error: `Invalid slippage tolerance ${slippageFraction * 10_000} bps: must be at least 0 and below 10000`,
      };
    }
    if (
      priceAtCalculation !== undefined &&
      (!Number.isFinite(priceAtCalculation) || !(priceAtCalculation > 0))
    ) {
      return {
        referencePrice: null,
        error: `Invalid price snapshot ${priceAtCalculation}: must be a positive finite number`,
      };
    }
    // Always a FRESH venue price: the caller's currentPrice is the same
    // snapshot as priceAtCalculation, and a drift check that compares a
    // snapshot to itself would never fire.
    const details = await this.#clientService.getOrderBookDetails();
    const freshPrice =
      details.orderBookDetails.find((entry) => entry.symbol === symbol)
        ?.lastTradePrice ?? 0;
    if (!Number.isFinite(freshPrice) || !(freshPrice > 0)) {
      // Fail closed: falling back to the caller's snapshot would let the
      // drift check compare that snapshot to itself.
      return {
        referencePrice: null,
        error: `No live venue price available for ${symbol}; refusing to size a market order`,
      };
    }
    if (
      priceAtCalculation !== undefined &&
      priceAtCalculation > 0 &&
      Math.abs(freshPrice - priceAtCalculation) / priceAtCalculation >
        slippageFraction
    ) {
      return {
        referencePrice: null,
        error: `Price moved beyond the ${(slippageFraction * 100).toFixed(2)}% slippage tolerance since sizing`,
      };
    }
    return { referencePrice: freshPrice, error: null };
  };

  /**
   * Validate the shape of a close request (shared by validateClosePosition
   * and closePosition so validation can never approve a close the
   * execution path refuses).
   *
   * @param params - Close request.
   * @returns Error message, or null when the shape is acceptable.
   */
  /**
   * The mobile close sheet sends a FULL close as an EMPTY size string
   * (`size: sizeToClose || ''`); HyperLiquid and TradingService treat a
   * falsy size as "no explicit size", so this venue honors the same
   * contract — an empty/whitespace size or usdAmount means full close,
   * never a validation failure.
   *
   * @param params - Raw close request.
   * @returns The request with empty-string sizing normalized to absent.
   */
  readonly #normalizeCloseParams = (
    params: ClosePositionParams,
  ): ClosePositionParams => ({
    ...params,
    size: params.size?.trim() ? params.size : undefined,
    usdAmount: params.usdAmount?.trim() ? params.usdAmount : undefined,
  });

  readonly #validateCloseShape = (
    params: ClosePositionParams,
  ): string | null => {
    const closeOrderType = params.orderType ?? 'market';
    if (closeOrderType !== 'market' && closeOrderType !== 'limit') {
      return `Lighter cannot close with a ${closeOrderType} order; use market or limit`;
    }
    if (closeOrderType === 'limit' && !params.price) {
      return 'Limit close requires a price';
    }
    if (
      params.usdAmount !== undefined &&
      parseFinitePositive(params.usdAmount) === null
    ) {
      // Finite REQUIRED: a non-finite usdAmount must never fall back to
      // held-size validation while execution forwards the infinite USD
      // into placement.
      return `Invalid usdAmount ${params.usdAmount}: must be a positive number`;
    }
    // closePosition forwards an explicit size to placement, which rejects
    // non-finite or non-positive values; validation must match.
    if (
      params.usdAmount === undefined &&
      params.size !== undefined &&
      parseFinitePositive(params.size) === null
    ) {
      return 'Order size must be positive';
    }
    return null;
  };

  /**
   * Live check whether a below-minimum reduce-only request is actually a
   * full close of the held position (shared by placement and validation).
   *
   * @param symbol - Market symbol.
   * @param requestedSize - Requested base size.
   * @returns True when the live position verifies a full close.
   */
  readonly #isVerifiedFullClose = async (
    symbol: string,
    requestedSize: number,
  ): Promise<boolean> => {
    const positions = await this.getPositions();
    const held = Math.abs(
      parseFloat(
        positions.find((entry) => entry.symbol === symbol)?.size ?? '0',
      ),
    );
    // Exact match (float epsilon only): closePosition forwards the precise
    // live size, and anything less is a deliberate partial that a min-size
    // bump would silently over-close.
    return held > 0 && requestedSize >= held * (1 - 1e-9);
  };

  async closePosition(rawParams: ClosePositionParams): Promise<OrderResult> {
    const params = this.#normalizeCloseParams(rawParams);
    try {
      // One intent identity from the position read through the final write:
      // an account switch mid-sequence aborts instead of trading the new
      // account with sizing derived from the old one.
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
      const closeOrderType = params.orderType ?? 'market';
      const shapeError = this.#validateCloseShape(params);
      if (shapeError) {
        return { success: false, error: shapeError };
      }
      const positions = await this.getPositions();
      this.#assertSession(generationAtIntent);
      const position = positions.find(
        (entry) => entry.symbol === params.symbol,
      );
      if (!position) {
        return {
          success: false,
          error: `No open Lighter position for ${params.symbol}`,
        };
      }
      const signedSize = parseFloat(position.size);
      const explicitSizing =
        params.size !== undefined || params.usdAmount !== undefined;
      const closeSize = params.size ?? String(Math.abs(signedSize));
      // Reduce-only order on the opposite side; the caller's full sizing
      // and protection intent (usdAmount, slippage, price snapshot, limit
      // price) rides through the placement path unchanged.
      return await this.placeOrder(
        {
          symbol: params.symbol,
          isBuy: signedSize < 0,
          size: closeSize,
          usdAmount: params.usdAmount,
          orderType: closeOrderType,
          price: params.price,
          reduceOnly: true,
          // Without explicit sizing this is a full close and must never be
          // rejected by the minimum-notional check on a dust position.
          isFullClose: !explicitSizing,
          currentPrice: params.currentPrice,
          priceAtCalculation: params.priceAtCalculation,
          maxSlippageBps: params.maxSlippageBps,
        },
        generationAtIntent,
        false,
      );
    } catch (error) {
      const wrappedError = ensureError(error, 'LighterProvider.closePosition');
      this.#deps.debugLogger.log('[LighterProvider] closePosition failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('closePosition'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  async updatePositionTPSL(
    params: UpdatePositionTPSLParams,
  ): Promise<OrderResult> {
    return this.#updatePositionTPSL(params);
  }

  /**
   * Submit a separately selected protection intent for an exact durable source.
   * Reconcile original-slot attempts, then use a matching current registered key.
   *
   * @param params - New protection intent and opaque source identity.
   * @returns Settled successor result; failure retains the source obligation.
   */
  async resolveRecoveryProtection(
    params: ResolveRecoveryProtectionParams,
  ): Promise<PerpsRecoveryProtectionResult> {
    const result = await this.#resolveRecoveryProtection(params);
    return {
      ...result,
      status: result.success ? 'settled' : 'unresolved',
      providerId: 'lighter',
    };
  }

  readonly #resolveRecoveryProtection = async (
    params: ResolveRecoveryProtectionParams,
  ): Promise<OrderResult> => {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      this.#assertSession(generation);
      if (!params.recoveryId.startsWith('lighter-protection:')) {
        throw new Error('Invalid Lighter recovery source identity');
      }
      const parsed: unknown = JSON.parse(
        params.recoveryId.slice('lighter-protection:'.length),
      );
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 6 ||
        parsed[0] !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
        parsed[1] !== this.#boundAddress ||
        !Number.isSafeInteger(parsed[2]) ||
        !Number.isSafeInteger(parsed[3]) ||
        parsed[3] < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
        parsed[3] > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
        parsed[4] !== params.symbol ||
        typeof parsed[5] !== 'string'
      ) {
        throw new Error('Invalid Lighter recovery source scope');
      }
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generation);
      if (accountIndex !== parsed[2]) {
        throw new Error('Lighter recovery source account changed');
      }
      const slot = parsed[3] as number;
      const settlementKey = `${this.#boundAddress}:${accountIndex}:${slot}:${params.symbol}`;
      const operationId = parsed[5];
      const manual = await this.#loadTpslManualRecovery(settlementKey);
      this.#assertSession(generation);
      const journal = await this.#loadTpslJournal(settlementKey);
      this.#assertSession(generation);
      const successor = await this.#loadRecoverySuccessor(
        settlementKey,
        operationId,
      );
      this.#assertSession(generation);
      if (successor?.state === 'settled') {
        await withProcessMutex(
          `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
          async () => this.#finalizeRecoverySuccessor(successor, generation),
        );
        this.#assertSession(generation);
        return { success: true };
      }
      if ((manual?.operationId ?? journal?.operationId) !== operationId) {
        throw new Error('Lighter recovery source operation changed');
      }
      return this.#updatePositionTPSL(params, {
        settlementKey,
        operationId,
        slot,
        generation,
      });
    } catch (error) {
      return {
        success: false,
        error: ensureError(error, 'LighterProvider.resolveRecoveryProtection')
          .message,
      };
    }
  };

  readonly #updatePositionTPSL = async (
    params: UpdatePositionTPSLParams,
    sourceRecovery?: {
      settlementKey: string;
      operationId: string;
      slot: number;
      generation: number;
    },
  ): Promise<OrderResult> => {
    let positionProtection: OrderResult['positionProtection'];
    let expectedPosition =
      params.expectedPosition === undefined
        ? undefined
        : { ...params.expectedPosition };
    try {
      if (sourceRecovery) {
        this.#assertSession(sourceRecovery.generation);
      }
      const partialRequested =
        params.takeProfitSize !== undefined ||
        params.stopLossSize !== undefined;
      if (
        params.partialPairLinkage !== undefined &&
        (!partialRequested ||
          !params.takeProfitPrice ||
          !params.stopLossPrice ||
          !['equal-quantity-oco', 'independent'].includes(
            params.partialPairLinkage,
          ))
      ) {
        throw new Error(
          'Partial pair linkage requires a supported explicitly sized TP/SL pair',
        );
      }
      if (
        (params.takeProfitSize !== undefined && !params.takeProfitPrice) ||
        (params.stopLossSize !== undefined && !params.stopLossPrice)
      ) {
        throw new Error('A partial protection size requires its trigger price');
      }
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      // The lifecycle boundary is captured BEFORE the position read: a
      // fill landing DURING the read belongs to the operation's window
      // and must count as lifecycle evidence.
      const lifecycleBoundary = Date.now();
      const positions = await this.#getPositions(partialRequested);
      const position = positions.find(
        (entry) => entry.symbol === params.symbol,
      );
      this.#assertSession(generationAtIntent);
      assertExpectedPosition(expectedPosition, position);
      if (partialRequested && position && expectedPosition === undefined) {
        expectedPosition = {
          size: position.size,
          entryPrice: position.entryPrice,
        };
      }
      let wantsReplacement =
        Boolean(params.takeProfitPrice) || Boolean(params.stopLossPrice);
      if (!position && (!sourceRecovery || wantsReplacement)) {
        const previous = sourceRecovery
          ? await this.#loadRecoverySuccessor(
              sourceRecovery.settlementKey,
              sourceRecovery.operationId,
            )
          : null;
        this.#assertSession(generationAtIntent);
        // A prior dispatched intent may have completed by filling the position.
        // Reconcile it before rejecting a new replacement on an empty position.
        if (
          !previous ||
          (previous.state !== 'pending' &&
            previous.retainedReplacementGroups === undefined)
        ) {
          return {
            success: false,
            error: `No open Lighter position for ${params.symbol}`,
          };
        }
      }

      // FULL local preflight: construct the entire deterministic
      // replacement payload BEFORE signer setup, the open-orders read and
      // any cancellation. Everything that can fail locally — venue
      // position-size parsing/integerization, trigger/execution price
      // parsing/integerization, bounded client-id allocation — must fail
      // while the existing protection is still in place.
      let partialIntent: PartialTpslIntent | undefined;
      let singleOrderPayload: LighterCreateOrderWireParams | null = null;
      let groupedOrderPayload: LighterGroupedOrderWireParams | null = null;
      let createdClientIds: number[] = [];
      let childOrderIds: string[] | undefined = wantsReplacement
        ? undefined
        : [];
      const createdIdsNeedingFinalCheck: number[] = [];
      let preflightPositionWireSize: number | null = null;
      let preflightPositionSign: 1 | -1 | null = null;
      if (wantsReplacement && position) {
        // getPositions does not validate venue sizes; a non-finite or
        // sub-tick size must abort here, not after the cancels.
        const signedSize = parseFloat(position.size);
        if (!Number.isFinite(signedSize) || signedSize === 0) {
          return {
            success: false,
            error: `Invalid live position size ${position.size} for ${params.symbol}`,
          };
        }
        const isLong = signedSize > 0;
        const coverSize = Math.abs(signedSize);
        const sizeInt = toSignerWireInteger(
          coverSize,
          market.supportedSizeDecimals,
        );
        preflightPositionWireSize = sizeInt;
        preflightPositionSign = isLong ? 1 : -1;
        // Closing side is opposite the position; trigger market orders
        // execute at a protection price 5% beyond the trigger in the taker
        // direction.
        const isAsk = isLong ? 1 : 0;
        const orderIntents: {
          orderType: number;
          raw: string;
          label: string;
        }[] = [];
        if (params.takeProfitPrice) {
          orderIntents.push({
            orderType: LIGHTER_ORDER_TYPE_TAKE_PROFIT,
            raw: params.takeProfitPrice,
            label: 'takeProfitPrice',
          });
        }
        if (params.stopLossPrice) {
          orderIntents.push({
            orderType: LIGHTER_ORDER_TYPE_STOP_LOSS,
            raw: params.stopLossPrice,
            label: 'stopLossPrice',
          });
        }
        const validatedOrders: {
          orderType: number;
          execInt: number;
          triggerInt: number;
        }[] = [];
        for (const intent of orderIntents) {
          const trigger = parseFinitePositive(intent.raw);
          if (trigger === null) {
            return {
              success: false,
              error: `Invalid ${intent.label} ${intent.raw}: must be a positive number`,
            };
          }
          const execution = isLong ? trigger * 0.95 : trigger * 1.05;
          validatedOrders.push({
            orderType: intent.orderType,
            execInt: toSignerWirePriceInteger(
              execution,
              market.supportedPriceDecimals,
            ),
            triggerInt: toSignerWirePriceInteger(
              trigger,
              market.supportedPriceDecimals,
            ),
          });
        }
        // Only the ids actually required: allocation attempts are bounded
        // and a degenerate RNG must exhaust BEFORE any cancellation.
        const clientOrderIds = this.#allocateClientOrderIndexes(
          validatedOrders.length,
        );
        createdClientIds = clientOrderIds;
        // VENUE CONTRACT (proven live: 'GroupingType is not valid'):
        // CreateGroupedOrders only accepts grouping types 1/2/3 and OCO
        // requires two siblings, so a SINGLE TP or SL must be an ordinary
        // CreateOrder trigger; grouped OCO is reserved for both together.
        const partialSizes = validatedOrders.map((entry) => {
          const raw =
            entry.orderType === LIGHTER_ORDER_TYPE_TAKE_PROFIT
              ? params.takeProfitSize
              : params.stopLossSize;
          if (!partialRequested || raw === undefined) {
            return params.partialPairLinkage === 'independent'
              ? new BigNumber(position.size)
                  .abs()
                  .shiftedBy(market.supportedSizeDecimals)
                  .integerValue(BigNumber.ROUND_DOWN)
                  .toNumber()
              : sizeInt;
          }
          // Preserve decimal intent through the bounds check and downward grid
          // normalization; binary conversion can widen a requested quantity.
          const value = new BigNumber(raw);
          const positionAmount = new BigNumber(position.size).abs();
          if (
            !/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(raw) ||
            !value.isFinite() ||
            !value.gt(0) ||
            !positionAmount.isFinite() ||
            value.gt(positionAmount)
          ) {
            throw new Error(
              'Partial protection quantity must be positive and no greater than the position',
            );
          }
          const wire = value
            .shiftedBy(market.supportedSizeDecimals)
            .integerValue(BigNumber.ROUND_DOWN);
          if (wire.lt(1) || wire.gt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(
              'Partial protection quantity is outside the size grid',
            );
          }
          const normalized = wire.toNumber();
          return normalized;
        });
        if (
          partialRequested &&
          params.partialPairLinkage !== 'independent' &&
          partialSizes.length === 2 &&
          (params.takeProfitSize === undefined ||
            params.stopLossSize === undefined ||
            partialSizes[0] !== partialSizes[1])
        ) {
          throw new Error(
            'Partial OCO protection requires equal normalized quantities',
          );
        }
        const wireOrders = validatedOrders.map(
          (entry, index): LighterCreateOrderWireParams => {
            const clientOrderIndex = clientOrderIds[index];
            if (clientOrderIndex === undefined) {
              throw new Error(
                'Lighter TP/SL preflight did not allocate a client order id',
              );
            }
            return [
              market.marketId,
              clientOrderIndex,
              String(partialSizes[index]),
              String(entry.execInt),
              isAsk,
              entry.orderType,
              LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
              1,
              String(entry.triggerInt),
              // Trigger orders rest until fired: the signer expands the -1
              // sentinel to the 28-day default expiry.
              LIGHTER_ORDER_EXPIRY_NONE,
            ];
          },
        );
        if (partialRequested) {
          partialIntent = {
            ...(params.partialPairLinkage === 'independent'
              ? {
                  version: 2 as const,
                  linkage: 'independent' as const,
                  positionSize: new BigNumber(position.size).abs().toFixed(),
                  requestedSizes: [
                    params.takeProfitSize ?? null,
                    params.stopLossSize ?? null,
                  ],
                }
              : {
                  version: 1 as const,
                  linkage:
                    wireOrders.length === 2
                      ? ('oco' as const)
                      : ('single' as const),
                }),
            positionSign: isLong ? 1 : -1,
            positionWireSize:
              params.partialPairLinkage === 'independent'
                ? new BigNumber(position.size)
                    .abs()
                    .shiftedBy(market.supportedSizeDecimals)
                    .integerValue(BigNumber.ROUND_DOWN)
                    .toNumber()
                : sizeInt,
            sizeDecimals: market.supportedSizeDecimals,
            orders: wireOrders,
          };
          if (!isPartialTpslIntent(partialIntent)) {
            throw new Error('Invalid fixed partial protection intent');
          }
        }
        if (partialIntent?.version === 2) {
          positionProtection = {
            linkage: partialIntent.linkage,
            legs: wireOrders.map((order) => ({
              role:
                order[5] === LIGHTER_ORDER_TYPE_TAKE_PROFIT
                  ? 'take-profit'
                  : 'stop-loss',
              requestedSize:
                order[5] === LIGHTER_ORDER_TYPE_TAKE_PROFIT
                  ? params.takeProfitSize
                  : params.stopLossSize,
              normalizedSize: new BigNumber(order[2])
                .shiftedBy(-market.supportedSizeDecimals)
                .toFixed(),
              status: 'unknown',
            })),
          };
        }
        const [first, second] = wireOrders;
        if (first === undefined) {
          throw new Error('Lighter TP/SL preflight produced no trigger order');
        }
        if (second === undefined) {
          singleOrderPayload = first;
        } else {
          groupedOrderPayload = [...first, ...second];
        }
      }

      // Re-fence BEFORE signer setup: the preflight awaited public reads
      // during which the wallet may have switched, and a stale intent must
      // never create or register the new account's venue key.
      this.#assertSession(generationAtIntent);
      if (!sourceRecovery) {
        await this.#ensureSignerReady();
      }
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generationAtIntent);
      const recoveryAuthority = sourceRecovery
        ? await withProcessMutex(
            `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
            async () =>
              this.#getRecoveryReadToken(
                accountIndex,
                generationAtIntent,
                this.#readyApiKeyIndex ?? undefined,
              ),
          )
        : undefined;
      this.#assertSession(generationAtIntent);
      // Pre-mint the auth token OUTSIDE the write lock: #getAuthToken can
      // trigger signer setup, and signer setup queues on the write chain —
      // calling any setup-capable helper from inside the held section
      // would self-deadlock after a bridge reset or unobserved switch.
      const authToken =
        recoveryAuthority?.token ?? (await this.#getAuthToken());
      this.#assertSession(generationAtIntent);
      const successorSlot = recoveryAuthority?.apiKeyIndex ?? this.#apiKeyIndex;
      let selectedSuccessor: TpslRecoverySuccessor | null = null;
      // Settlement identity: pending expectations are keyed by the
      // captured normalized address + account index + symbol so another
      // account can never consume (or be blocked by) this account's ids,
      // while a same-account bridge reset or switch-away-and-back retains
      // the reconciliation obligation.
      // Includes the API KEY SLOT: nonces are per key slot, so a journal
      // recorded under one slot must never be reconciled under another.
      const settlementKey = `${this.#boundAddress ?? 'unbound'}:${accountIndex}:${successorSlot}:${params.symbol}`;

      // The ENTIRE snapshot -> create -> cancel lifecycle runs as ONE
      // serialized transition on the account's write chain. Two concurrent
      // replacements would otherwise both snapshot the same old trigger,
      // each create a new set, and each cancel only the original — leaving
      // both protection sets live; a concurrent remove could miss a
      // just-created replacement. Cancels are INLINED (not this.cancelOrder)
      // so no nested lock acquisition can deadlock; nonce serialization is
      // preserved because every nonce comes from this section's nextNonce.
      await this.#withVenueWriteLock(
        accountIndex,
        async (nextNonce, submit) => {
          if (recoveryAuthority) {
            if (
              this.#readyApiKeyIndex !== null &&
              this.#readyApiKeyIndex !== successorSlot
            ) {
              throw new Error(
                'Lighter recovery signing key changed while queued',
              );
            }
            const registrations =
              await this.#clientService.getApiKeys(accountIndex);
            this.#assertSession(generationAtIntent);
            const matching = registrations.apiKeys.filter(
              (entry) =>
                entry.accountIndex === accountIndex &&
                entry.apiKeyIndex === successorSlot &&
                entry.publicKey.replace(/^0x/u, '').toLowerCase() ===
                  recoveryAuthority.publicKey.replace(/^0x/u, '').toLowerCase(),
            );
            if (matching.length !== 1) {
              throw new Error(
                'Lighter recovery successor registered key changed',
              );
            }
            const bridge = this.#getSignerBridge();
            const created = await bridge.createClient({
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
              apiKeyIndex: successorSlot,
              nonce: await nextNonce(),
              walletAddress: this.#boundAddress ?? undefined,
            });
            this.#assertSession(generationAtIntent);
            if (
              !created.success ||
              created.error ||
              created.pk?.replace(/^0x/u, '').toLowerCase() !==
                recoveryAuthority.publicKey.replace(/^0x/u, '').toLowerCase()
            ) {
              throw new Error('Lighter recovery successor local key changed');
            }
            this.#venuePublicKey = recoveryAuthority.publicKey;
            this.#authToken = null;
            this.#signerIdentity = `${this.#clientService.network}:${accountIndex}:${successorSlot}`;
            this.#signerRecreateParams = {
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
            };
            bridgeClientOwners.set(
              this.#rawSignerBridge(),
              this.#signerIdentity,
            );
          }
          const assertLiveExpected = async (): Promise<void> => {
            if (sourceRecovery) {
              this.#assertSession(generationAtIntent);
              const manualSource = await this.#loadTpslManualRecovery(
                sourceRecovery.settlementKey,
              );
              this.#assertSession(generationAtIntent);
              const journalSource = await this.#loadTpslJournal(
                sourceRecovery.settlementKey,
              );
              this.#assertSession(generationAtIntent);
              if (
                manualSource?.operationId !== sourceRecovery.operationId &&
                journalSource?.operationId !== sourceRecovery.operationId
              ) {
                throw new Error('Lighter recovery source operation changed');
              }
            }
            if (expectedPosition === undefined) {
              return;
            }
            this.#assertSession(generationAtIntent);
            const account =
              await this.#clientService.getAccountByIndex(accountIndex);
            this.#assertSession(generationAtIntent);
            const currentPositions =
              Array.isArray(account.accounts) &&
              account.accounts.length === 1 &&
              account.accounts[0]?.index === accountIndex &&
              Array.isArray(account.accounts[0].positions)
                ? account.accounts[0].positions
                : undefined;
            const current = currentPositions?.find(
              (entry) => entry.symbol === params.symbol,
            );
            assertExpectedPosition(
              expectedPosition,
              current && (current.sign === 1 || current.sign === -1)
                ? {
                    size: `${current.sign === -1 ? '-' : ''}${current.position}`,
                    entryPrice: current.avgEntryPrice,
                  }
                : undefined,
            );
          };
          await assertLiveExpected();
          // STRICT direct read with the CAPTURED account/auth/generation:
          // a swallowed [] would make remove "succeed" cancelling nothing;
          // a setup-capable helper here could self-deadlock (see auth
          // pre-mint above). Session fences on every read.
          const readActiveRaw = async (): Promise<LighterApiOrder[]> => {
            this.#assertSession(generationAtIntent);
            const response = await this.#clientService.getActiveOrders(
              accountIndex,
              authToken,
            );
            this.#assertSession(generationAtIntent);
            if (
              !Array.isArray(response.orders) ||
              (sourceRecovery !== undefined &&
                response.orders.some(
                  (row) => row.ownerAccountIndex !== accountIndex,
                ))
            ) {
              throw new Error(
                'Invalid Lighter protection recovery order envelope',
              );
            }
            return response.orders;
          };
          // Shared targeted inactive reader (cached, active-first callers,
          // one bounded deep cursor walk per section, market-scoped).
          const readInactiveFor = this.#makeInactiveReader(
            accountIndex,
            authToken,
            generationAtIntent,
            market.marketId,
          );

          const collectRetainedReceipt = async (
            groups: number[][],
          ): Promise<void> => {
            // The current preflight IDs are unsent; they cannot describe an earlier intent.
            positionProtection = undefined;
            childOrderIds = undefined;
            const ids = groups.flat();
            if (ids.length === 0) {
              return;
            }
            const active = await readActiveRaw();
            const missing = ids.filter(
              (id) => !active.some((row) => row.clientOrderIndex === id),
            );
            const inactive =
              missing.length > 0 ? await readInactiveFor(missing) : [];
            this.#assertSession(generationAtIntent);
            const receipt: string[] = [];
            for (const id of ids) {
              const activeRows = active.filter(
                (row) => row.clientOrderIndex === id,
              );
              const rows =
                activeRows.length > 0
                  ? activeRows
                  : inactive.filter((row) => row.clientOrderIndex === id);
              const [row] = rows;
              if (
                rows.length !== 1 ||
                !row ||
                row.ownerAccountIndex !== accountIndex ||
                row.marketIndex !== market.marketId ||
                !Number.isSafeInteger(row.orderIndex) ||
                row.orderIndex <= 0 ||
                receipt.includes(String(row.orderIndex))
              ) {
                return;
              }
              receipt.push(String(row.orderIndex));
            }
            childOrderIds = receipt;
          };
          const replacementGroups = (journal: TpslJournalState): number[][] =>
            journal.retainedReplacementGroups ??
            journal.attempts
              .filter(
                (attempt): attempt is TpslCreateAttempt =>
                  attempt.kind === 'create' &&
                  attempt.role === 'replacement' &&
                  attempt.neverLanded !== true &&
                  getLighterTransactionOutcome(attempt.terminalStatus) !==
                    'failed',
              )
              .map((attempt) => attempt.clientIds);

          if (sourceRecovery) {
            selectedSuccessor = await this.#loadRecoverySuccessor(
              sourceRecovery.settlementKey,
              sourceRecovery.operationId,
            );
            this.#assertSession(generationAtIntent);
            if (selectedSuccessor?.state === 'settled') {
              childOrderIds = undefined;
              positionProtection = undefined;
              return;
            }
            if (selectedSuccessor?.state === 'failed') {
              // A crash may leave the exact retired journal after its failure
              // marker. Complete cleanup before preparing the next intent.
              const failedJournal = await this.#loadTpslJournal(
                selectedSuccessor.successorSettlementKey,
              );
              this.#assertSession(generationAtIntent);
              if (failedJournal === null) {
                if (
                  !(await this.#clearTpslJournal(
                    selectedSuccessor.successorSettlementKey,
                    null,
                  ))
                ) {
                  throw new Error('Lighter failed successor operation changed');
                }
                this.#assertSession(generationAtIntent);
              } else if (
                failedJournal.operationId ===
                selectedSuccessor.successorOperationId
              ) {
                if (
                  !(await this.#clearTpslJournal(
                    selectedSuccessor.successorSettlementKey,
                    failedJournal.operationId,
                    await readActiveRaw(),
                  ))
                ) {
                  throw new Error('Lighter failed successor operation changed');
                }
                this.#assertSession(generationAtIntent);
              }
            }
            if (selectedSuccessor && selectedSuccessor.state !== 'failed') {
              const pendingSuccessor = await this.#loadTpslJournal(
                selectedSuccessor.successorSettlementKey,
              );
              this.#assertSession(generationAtIntent);
              if (
                pendingSuccessor?.operationId ===
                selectedSuccessor.successorOperationId
              ) {
                if (
                  selectedSuccessor.successorSettlementKey === settlementKey
                ) {
                  const settled = await this.#settleTpslObligation({
                    settlementKey,
                    symbol: params.symbol,
                    journalEntry: pendingSuccessor,
                    market,
                    accountIndex,
                    authToken,
                    generation: generationAtIntent,
                    readActiveRaw,
                    readInactiveFor,
                    nextNonce,
                    submit,
                  });
                  const after = await this.#loadRecoverySuccessor(
                    sourceRecovery.settlementKey,
                    sourceRecovery.operationId,
                  );
                  this.#assertSession(generationAtIntent);
                  if (settled && after?.state === 'settled') {
                    if (
                      pendingSuccessor.intent === 'remove' &&
                      pendingSuccessor.retainedReplacementGroups === undefined
                    ) {
                      childOrderIds = [];
                      positionProtection = undefined;
                    } else {
                      await collectRetainedReceipt(
                        replacementGroups(pendingSuccessor),
                      );
                    }
                    return;
                  }
                  throw new Error(
                    'Lighter recovery successor remains unresolved; review its durable outcome before another intent',
                  );
                } else {
                  const oldSlot = Number(
                    selectedSuccessor.successorSettlementKey.split(':')[2],
                  );
                  if (
                    !Number.isSafeInteger(oldSlot) ||
                    oldSlot < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
                    oldSlot > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
                    (await this.#reconcilePriorTpsl(
                      readActiveRaw,
                      readInactiveFor,
                      accountIndex,
                      pendingSuccessor,
                      oldSlot,
                    )) !== 'resolved'
                  ) {
                    throw new Error(
                      'Lighter previous successor submissions remain unresolved',
                    );
                  }
                  this.#assertSession(generationAtIntent);
                  await this.#verifyRetainedRecoveryCoverage(
                    pendingSuccessor,
                    readActiveRaw,
                    readInactiveFor,
                  );
                  await this.#discardManagedTpslIds(
                    selectedSuccessor.successorSettlementKey,
                    pendingSuccessor.attempts.flatMap((attempt) =>
                      attempt.kind === 'create' &&
                      (attempt.neverLanded === true ||
                        getLighterTransactionOutcome(attempt.terminalStatus) ===
                          'failed')
                        ? attempt.clientIds.map(String)
                        : [],
                    ),
                  );
                  this.#assertSession(generationAtIntent);
                  const groups =
                    pendingSuccessor.retainedReplacementGroups ??
                    pendingSuccessor.attempts
                      .filter(
                        (attempt): attempt is TpslCreateAttempt =>
                          attempt.kind === 'create' &&
                          attempt.role === 'replacement' &&
                          attempt.neverLanded !== true &&
                          getLighterTransactionOutcome(
                            attempt.terminalStatus,
                          ) !== 'failed',
                      )
                      .map((attempt) => attempt.clientIds);
                  const coverage =
                    groups.length === 0
                      ? { outcome: 'created-terminal-failed' as const }
                      : await this.#awaitTpslVisibility(
                          readActiveRaw,
                          readInactiveFor,
                          {
                            createdClientIds: groups.flat(),
                            cancelledOrderIds: [],
                          },
                          { createdGroups: groups },
                        );
                  if (coverage.outcome === 'timeout') {
                    throw new Error(
                      'Lighter previous successor coverage remains unresolved',
                    );
                  }
                  const active = await readActiveRaw();
                  const priorIds = pendingSuccessor.priorTriggers.map(
                    (prior) => prior.orderId,
                  );
                  const priorGone = priorIds.every(
                    (id) =>
                      !active.some((row) => String(row.orderIndex) === id),
                  );
                  const alreadyWon =
                    pendingSuccessor.intent === 'remove' ||
                    (groups.length > 0 &&
                      coverage.outcome === 'settled' &&
                      (pendingSuccessor.partialIntent?.version !== 2 ||
                        pendingSuccessor.partialIntent.orders.every((order) =>
                          groups.flat().includes(order[1]),
                        )));
                  if (alreadyWon && priorGone) {
                    if (
                      pendingSuccessor.intent === 'remove' &&
                      pendingSuccessor.retainedReplacementGroups === undefined
                    ) {
                      childOrderIds = [];
                      positionProtection = undefined;
                    } else {
                      await collectRetainedReceipt(groups);
                    }
                    await this.#finishRecoverySuccessor(
                      pendingSuccessor,
                      'settled',
                      active,
                      generationAtIntent,
                    );
                    return;
                  }
                  // Persist the original created coverage before retiring its
                  // journal. Continuing with the current key only cancels its
                  // exact prior orders; it must never create the same intent again.
                  selectedSuccessor = {
                    ...selectedSuccessor,
                    state: 'prepared',
                    retainedReplacementGroups: alreadyWon ? groups : undefined,
                    ownedOrderIds: alreadyWon
                      ? priorIds
                      : [
                          ...new Set([
                            ...selectedSuccessor.ownedOrderIds,
                            ...active
                              .filter((row) =>
                                groups.flat().includes(row.clientOrderIndex),
                              )
                              .map((row) => String(row.orderIndex)),
                          ]),
                        ],
                  };
                  await this.#persistRecoverySuccessor(
                    selectedSuccessor,
                    generationAtIntent,
                  );
                  if (
                    !(await this.#clearTpslJournal(
                      selectedSuccessor.successorSettlementKey,
                      pendingSuccessor.operationId,
                      active,
                    ))
                  ) {
                    throw new Error(
                      'Lighter previous successor operation changed',
                    );
                  }
                  this.#assertSession(generationAtIntent);
                }
              }
              if (selectedSuccessor.state === 'pending') {
                throw new Error(
                  'Lighter recovery successor journal is unavailable',
                );
              }
            }
            if (selectedSuccessor?.retainedReplacementGroups !== undefined) {
              await collectRetainedReceipt(
                selectedSuccessor.retainedReplacementGroups,
              );
              wantsReplacement = false;
            }
            if (!position && wantsReplacement) {
              throw new Error(`No open Lighter position for ${params.symbol}`);
            }
            const sourceJournal = await this.#loadTpslJournal(
              sourceRecovery.settlementKey,
            );
            this.#assertSession(generationAtIntent);
            const manualSource = await this.#loadTpslManualRecovery(
              sourceRecovery.settlementKey,
            );
            this.#assertSession(generationAtIntent);
            if (
              sourceJournal &&
              sourceJournal.operationId !== sourceRecovery.operationId
            ) {
              throw new Error(
                'Lighter recovery source journal operation changed',
              );
            }
            if (
              sourceJournal &&
              (await this.#reconcilePriorTpsl(
                readActiveRaw,
                readInactiveFor,
                accountIndex,
                sourceJournal,
                sourceRecovery.slot,
              )) !== 'resolved'
            ) {
              throw new Error(
                'Lighter original protection submissions remain unresolved',
              );
            }
            this.#assertSession(generationAtIntent);
            const sourceActive = await readActiveRaw();
            const ownedOrderIds = [
              ...new Set([
                ...(selectedSuccessor?.ownedOrderIds ?? []),
                ...(manualSource?.survivingOrderIds ?? []),
                ...(manualSource?.priorTriggers.map((prior) => prior.orderId) ??
                  []),
                ...(sourceJournal?.priorTriggers.map(
                  (prior) => prior.orderId,
                ) ?? []),
                ...sourceActive
                  .filter((row) =>
                    sourceJournal?.attempts.some(
                      (attempt) =>
                        attempt.kind === 'create' &&
                        attempt.clientIds.includes(row.clientOrderIndex),
                    ),
                  )
                  .map((row) => String(row.orderIndex)),
              ]),
            ];
            selectedSuccessor = {
              version: 1,
              sourceSettlementKey: sourceRecovery.settlementKey,
              sourceOperationId: sourceRecovery.operationId,
              successorSettlementKey: settlementKey,
              successorOperationId:
                selectedSuccessor?.state === 'prepared'
                  ? selectedSuccessor.successorOperationId
                  : `op-${Date.now().toString(36)}-${(this.#tpslOperationCounter += 1).toString(36)}-${randomIdSuffix()}`,
              state: 'prepared',
              ownedOrderIds,
              retainedReplacementGroups:
                selectedSuccessor?.retainedReplacementGroups,
            };
            await this.#persistRecoverySuccessor(
              selectedSuccessor,
              generationAtIntent,
            );
            await assertLiveExpected();
            if (!manualSource && sourceJournal) {
              await this.#writeTpslManualRecovery({
                settlementKey: sourceRecovery.settlementKey,
                symbol: params.symbol,
                reason:
                  'Explicit protection successor awaiting authoritative settlement',
                partialIntent: sourceJournal.partialIntent,
                priorIntent: sourceJournal.intent,
                priorTriggers: sourceJournal.priorTriggers,
                survivingOrderIds: ownedOrderIds,
                operationId: sourceRecovery.operationId,
                recordedAt: sourceJournal.recordedAt,
              });
              this.#assertSession(generationAtIntent);
            }
            if (
              sourceJournal &&
              !(await this.#clearTpslJournal(
                sourceRecovery.settlementKey,
                sourceRecovery.operationId,
                sourceActive,
              ))
            ) {
              throw new Error(
                'Lighter recovery source operation changed during transfer',
              );
            }
            this.#assertSession(generationAtIntent);
          }

          if (!sourceRecovery) {
            const sourceKeys = [
              ...new Set([
                ...(await this.#readTpslManualIndex()),
                ...(await this.#readTpslJournalIndex()),
              ]),
            ];
            this.#assertSession(generationAtIntent);
            for (const sourceKey of sourceKeys) {
              const [sourceAddress, sourceAccount, , ...sourceSymbol] =
                sourceKey.split(':');
              if (
                sourceAddress !== this.#boundAddress ||
                sourceAccount !== String(accountIndex) ||
                sourceSymbol.join(':') !== params.symbol
              ) {
                continue;
              }
              const manual = await this.#loadTpslManualRecovery(sourceKey);
              this.#assertSession(generationAtIntent);
              if (manual?.partialIntent) {
                throw new Error(
                  'Partial protection requires explicit recovery resolution by recovery ID',
                );
              }
              const sourceJournal = await this.#loadTpslJournal(sourceKey);
              this.#assertSession(generationAtIntent);
              if (sourceJournal?.partialIntent && sourceKey !== settlementKey) {
                const transfer = await this.#loadRecoverySuccessor(
                  sourceKey,
                  sourceJournal.operationId,
                );
                this.#assertSession(generationAtIntent);
                if (
                  sourceJournal.attempts.length === 0 &&
                  sourceJournal.sourceRecoveryOperationId === undefined &&
                  sourceJournal.sourceRecoverySettlementKey === undefined &&
                  (!transfer || transfer.state === 'failed')
                ) {
                  try {
                    const cleared = await this.#clearTpslJournal(
                      sourceKey,
                      sourceJournal.operationId,
                    );
                    this.#assertSession(generationAtIntent);
                    if (cleared) {
                      continue;
                    }
                  } catch (cleanupError) {
                    this.#assertSession(generationAtIntent);
                    this.#deps.debugLogger.log(
                      '[LighterProvider] Older-slot protection cleanup remains pending',
                      { error: String(cleanupError) },
                    );
                  }
                }
                throw new Error(
                  'Partial protection requires explicit recovery resolution by recovery ID',
                );
              }
              const sourceOperationId =
                manual?.operationId ?? sourceJournal?.operationId;
              if (!sourceOperationId) {
                continue;
              }
              const transfer = await this.#loadRecoverySuccessor(
                sourceKey,
                sourceOperationId,
              );
              this.#assertSession(generationAtIntent);
              if (
                transfer &&
                transfer.state !== 'failed' &&
                transfer.state !== 'settled'
              ) {
                throw new Error(
                  'Selected protection recovery is pending; resume its explicit successor',
                );
              }
            }
          }
          // An accepted create can leave the nonce ledger before its trigger
          // is visible. Another slot may still own settlement for this symbol.
          // Reconcile only its original-slot proof; never sign its follow-up
          // under the selected key. Refuse while any attempt is unresolved.
          const journalIndex = await this.#readTpslJournalIndex();
          this.#assertSession(generationAtIntent);
          for (const previousKey of journalIndex) {
            const [address, account, slot, ...symbol] = previousKey.split(':');
            if (
              previousKey === settlementKey ||
              address !== this.#boundAddress ||
              account !== String(accountIndex) ||
              symbol.join(':') !== params.symbol
            ) {
              continue;
            }
            const previousJournal = await this.#loadTpslJournal(previousKey);
            this.#assertSession(generationAtIntent);
            if (
              previousJournal &&
              !(await this.#settleTpslObligation({
                settlementKey: previousKey,
                symbol: params.symbol,
                journalEntry: previousJournal,
                readOnlyApiKeyIndex: Number(slot),
                market,
                accountIndex,
                authToken,
                generation: generationAtIntent,
                readActiveRaw,
                readInactiveFor,
                nextNonce,
                submit,
              }))
            ) {
              throw new Error(
                `Lighter TP/SL settlement for ${params.symbol} is still settling under its original API key slot ${String(slot)}; retry after the venue shows its outcome`,
              );
            }
          }
          // VENUE LINEARIZABILITY: if a previous TP/SL transition's
          // settlement never became visible, run it through the SAME
          // obligation state machine as startup recovery — a pending
          // 'cancelling'/'restoring' journal may owe a rollback or a
          // RESTORE, and merely reconciling-then-clearing it here would
          // erase that obligation and leave the position naked.
          // Pending obligations survive provider death via the durable
          // journal. DISK IS AUTHORITATIVE: absence means the obligation
          // was resolved (possibly by another provider) — a stale
          // in-memory copy is dropped, never resurrected.
          const unsettled = await this.#loadTpslJournal(settlementKey);
          if (unsettled === null) {
            this.#tpslUnsettled.delete(settlementKey);
          }
          if (unsettled) {
            const hadPartialAttempts = Boolean(
              unsettled.partialIntent && unsettled.attempts.length > 0,
            );
            const resolved = await this.#settleTpslObligation({
              settlementKey,
              symbol: params.symbol,
              journalEntry: unsettled,
              market,
              accountIndex,
              authToken,
              generation: generationAtIntent,
              readActiveRaw,
              readInactiveFor,
              nextNonce,
              submit,
            });
            if (!resolved) {
              // Keep both records for the next attempt.
              this.#tpslUnsettled.set(settlementKey, unsettled);
              throw new Error(
                `Lighter TP/SL settlement for ${params.symbol} is unresolved; refusing further protection changes until the venue reflects the previous update`,
              );
            }
            if (hadPartialAttempts) {
              const parked = await this.#loadTpslManualRecovery(settlementKey);
              throw new Error(
                parked
                  ? 'Prior partial protection requires resolveRecoveryProtection with its exact pending recovery ID and fresh current-position intent'
                  : 'Prior partial protection settled; re-read orders before submitting a new intent',
              );
            }
            // The machine may have PARKED the obligation into the
            // durable manual-recovery doc (releasing the journal slot).
            // The doc is NOT cleared here: only this operation's own
            // SUCCESS — the successor protection authoritatively in
            // force — clears the warning below.
            this.#assertSession(generationAtIntent);
          }

          const rawOrders = await readActiveRaw();
          await this.#pruneManagedTpsl(settlementKey, rawOrders, async () => {
            this.#assertSession(generationAtIntent);
            const response = await this.#clientService.getInactiveOrders(
              accountIndex,
              authToken,
              LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE,
              undefined,
              market.marketId,
            );
            this.#assertSession(generationAtIntent);
            if (
              response.orders.length > LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE
            ) {
              throw new Error('Lighter ownership history exceeded one page');
            }
            return response.orders.filter(
              (row) =>
                row.ownerAccountIndex === accountIndex &&
                row.marketIndex === market.marketId,
            );
          });
          const attachedGroups = await this.#readAttachedGroups(
            this.#attachedKey(accountIndex),
          );
          this.#assertSession(generationAtIntent);
          const attachedClientIds = new Set(
            attachedGroups.flatMap((group) =>
              group.orders.map((order) => String(order[1])),
            ),
          );
          const managed = await this.#readManagedTpsl(settlementKey);
          this.#assertSession(generationAtIntent);
          // The public preflight position read occurred before signer
          // setup and write serialization. Re-read the raw venue position
          // inside the held transition immediately before any create or
          // cancel signature: an intervening fill or side flip would make
          // the captured cover payload under-sized or wrong-sided.
          const liveAccount =
            await this.#clientService.getAccountByIndex(accountIndex);
          this.#assertSession(generationAtIntent);
          if (
            !Array.isArray(liveAccount.accounts) ||
            liveAccount.accounts.length !== 1 ||
            liveAccount.accounts[0]?.index !== accountIndex ||
            !Array.isArray(liveAccount.accounts[0].positions)
          ) {
            throw new Error(
              'Invalid Lighter account position envelope before TP/SL signing',
            );
          }
          const livePosition = liveAccount.accounts[0].positions.find(
            (entry) => entry.symbol === params.symbol,
          );
          const liveMagnitude = livePosition
            ? parseStrictDecimal(livePosition.position)
            : null;
          let liveWireSize: number | null = null;
          if (
            liveMagnitude !== null &&
            Number.isFinite(liveMagnitude) &&
            liveMagnitude > 0 &&
            (livePosition?.sign === 1 || livePosition?.sign === -1)
          ) {
            try {
              liveWireSize = toSignerWireInteger(
                liveMagnitude,
                market.supportedSizeDecimals,
              );
            } catch {
              liveWireSize = null;
            }
          }
          assertExpectedPosition(
            expectedPosition,
            livePosition &&
              (livePosition.sign === 1 || livePosition.sign === -1)
              ? {
                  size: `${livePosition.sign === -1 ? '-' : ''}${livePosition.position}`,
                  entryPrice: livePosition.avgEntryPrice,
                }
              : undefined,
          );
          if (
            wantsReplacement &&
            (liveWireSize === null ||
              liveWireSize !== preflightPositionWireSize ||
              livePosition?.sign !== preflightPositionSign)
          ) {
            throw new Error(
              `Lighter position changed before TP/SL signing for ${params.symbol}; refresh and retry protection against the current position`,
            );
          }
          const openOrders = rawOrders.map((order) =>
            adaptOrderFromLighter(
              order,
              this.#marketsById.get(order.marketIndex)?.symbol ??
                String(order.marketIndex),
            ),
          );
          const staleTriggers = openOrders.filter((order) => {
            const raw = rawOrders.find(
              (row) => String(row.orderIndex) === order.orderId,
            );
            // Attached children belong to their opening group, not this position update.
            if (raw && attachedClientIds.has(String(raw.clientOrderIndex))) {
              return false;
            }
            // Core-owned IDs survive resizing, restart and key-slot recovery.
            // Legacy unrecorded full-quantity closing trigger markets retain
            // their historical protection contract, using the in-lock position.
            // Independent partial and limit triggers are preserved.
            const isManaged =
              raw !== undefined &&
              managed.some(
                (entry) =>
                  entry.clientId === String(raw.clientOrderIndex) ||
                  entry.orderId === order.orderId,
              );
            const isSelected =
              selectedSuccessor?.ownedOrderIds.includes(order.orderId) ?? false;
            const isLegacyProtection =
              sourceRecovery === undefined &&
              !partialRequested &&
              liveWireSize !== null &&
              order.side === (livePosition?.sign === 1 ? 'sell' : 'buy') &&
              parseFinitePositive(order.size) === liveMagnitude;
            return (
              order.symbol === params.symbol &&
              order.reduceOnly &&
              (raw?.type === 'stop-loss' || raw?.type === 'take-profit') &&
              (sourceRecovery ? isSelected : isManaged || isLegacyProtection)
            );
          });
          // The prior triggers' EXACT wire intents ride along with the
          // journal: a crash can still restore/rollback faithfully. A
          // stale trigger that CANNOT be faithfully restored (unknown
          // venue type/TIF) refuses the whole mutation BEFORE any cancel
          // or create — coercing its semantics on restore is worse than
          // rejecting the update.
          const priorTriggers: TpslPriorTrigger[] = [];
          for (const stale of staleTriggers) {
            const rawRow = rawOrders.find(
              (order) => String(order.orderIndex) === stale.orderId,
            );
            const priorIntent = rawRow
              ? mapRawTriggerToPriorIntent(rawRow, market)
              : null;
            if (!priorIntent) {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} refused: existing trigger order ${stale.orderId} cannot be faithfully restored (unsupported type/time-in-force), so it will not be cancelled`,
              );
            }
            priorTriggers.push(priorIntent);
          }
          // OCO grouping is decided by the VENUE'S OWN linkage fields —
          // never inferred from "one TP plus one SL". Linkage FAILS
          // CLOSED: ANY dangling or one-sided linkage (parent, to_cancel
          // or to_trigger references that do not form an exact mutual
          // two-leg pair among the triggers being replaced) is an order
          // relationship this integration cannot faithfully re-establish
          // — the mutation is refused BEFORE anything is touched, never
          // classified independent.
          const staleRawRows = staleTriggers.map((stale) =>
            rawOrders.find(
              (order) => String(order.orderIndex) === stale.orderId,
            ),
          );
          // LIVE-VENUE contract (probed): ABSENT linkage is the string
          // sentinel '0' (parent_order_id, to_trigger_order_id_*), never
          // an empty string.
          const linkageSet = (value: string | undefined): boolean =>
            typeof value === 'string' && value.length > 0 && value !== '0';
          const hasAnyLinkage = (row: LighterApiOrder | undefined): boolean =>
            row !== undefined &&
            (linkageSet(row.toCancelOrderId0) ||
              linkageSet(row.parentOrderId) ||
              (typeof row.parentOrderIndex === 'number' &&
                row.parentOrderIndex > 0) ||
              linkageSet(row.toTriggerOrderId0) ||
              linkageSet(row.toTriggerOrderId1));
          const rowLinksTo = (
            source: LighterApiOrder | undefined,
            target: LighterApiOrder | undefined,
          ): boolean =>
            source !== undefined &&
            target !== undefined &&
            linkageSet(source.toCancelOrderId0) &&
            [String(target.orderIndex), target.orderId ?? ''].includes(
              source.toCancelOrderId0 as string,
            );
          const mutualPair =
            priorTriggers.length === 2 &&
            rowLinksTo(staleRawRows[0], staleRawRows[1]) &&
            rowLinksTo(staleRawRows[1], staleRawRows[0]) &&
            // A mutual pair must not ALSO carry parent/OTO relations.
            staleRawRows.every(
              (row) =>
                row !== undefined &&
                !(
                  linkageSet(row.parentOrderId) ||
                  (typeof row.parentOrderIndex === 'number' &&
                    row.parentOrderIndex > 0) ||
                  linkageSet(row.toTriggerOrderId0) ||
                  linkageSet(row.toTriggerOrderId1)
                ),
            );
          if (!mutualPair && staleRawRows.some(hasAnyLinkage)) {
            throw new Error(
              `Lighter TP/SL update for ${params.symbol} refused: an existing trigger carries venue linkage (OCO/OTO/parent) this integration cannot faithfully re-establish, so it will not be cancelled`,
            );
          }
          const priorGrouping: 'oco' | 'independent' = mutualPair
            ? 'oco'
            : 'independent';
          if (priorGrouping === 'oco') {
            // Pinned grouped invariants (same closing side, size AND
            // expiry): a linked pair violating them cannot be faithfully
            // re-signed as one group — refuse BEFORE touching it.
            if (
              priorTriggers[0].side !== priorTriggers[1].side ||
              parseStrictDecimal(priorTriggers[0].remainingSize) !==
                parseStrictDecimal(priorTriggers[1].remainingSize) ||
              priorTriggers[0].orderExpiry !== priorTriggers[1].orderExpiry
            ) {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} refused: the existing linked OCO pair cannot be faithfully restored as a group, so it will not be cancelled`,
              );
            }
          }
          // Per-attempt mutation journal, persisted incrementally.
          // RESPONSE-LOSS safety: every attempt is recorded UNKNOWN with
          // its own venue nonce BEFORE submission (the venue may commit
          // even when the response is lost), flips to accepted inside
          // onAccepted (pre-fence), and reconciliation disambiguates each
          // attempt individually via books + nonce.
          await assertLiveExpected();
          let initialPhase: TpslJournalState['phase'] = partialIntent
            ? 'cancelling'
            : 'creating';
          if (!wantsReplacement && expectedPosition !== undefined) {
            initialPhase = 'manual';
          }
          const journal: TpslJournalState = {
            partialIntent,
            attempts: [],
            recordedAt: Date.now(),
            // Collision-resistant across processes: time + counter + two
            // independent random draws (~104 bits of entropy).
            operationId:
              selectedSuccessor?.successorOperationId ??
              `op-${Date.now().toString(36)}-${(this.#tpslOperationCounter += 1).toString(36)}-${randomIdSuffix()}`,
            sourceRecoveryOperationId: sourceRecovery?.operationId,
            sourceRecoverySettlementKey: sourceRecovery?.settlementKey,
            retainedReplacementGroups:
              selectedSuccessor?.retainedReplacementGroups,
            createdAt: lifecycleBoundary,
            nextAttemptId: 1,
            intent: wantsReplacement ? 'replace' : 'remove',
            // A guard belongs only to this foreground session. Persist its
            // non-resumable authority before the first dispatch, so a failed
            // refusal write cannot reauthorize later recovery cancellations.
            phase: initialPhase,
            priorGrouping,
            priorTriggers,
          };
          const persistJournal = async (): Promise<void> => {
            journal.recordedAt = Date.now();
            await this.#persistTpslJournal(settlementKey, journal);
            this.#assertSession(generationAtIntent);
            if (selectedSuccessor) {
              selectedSuccessor = { ...selectedSuccessor, state: 'pending' };
              await this.#persistRecoverySuccessor(
                selectedSuccessor,
                generationAtIntent,
              );
            }
          };
          const discardUnsentAttempt = async (
            attempt: TpslJournalState['attempts'][number],
          ): Promise<void> => {
            this.#assertSession(generationAtIntent);
            const remaining = journal.attempts.filter(
              (entry) => entry.attemptId !== attempt.attemptId,
            );
            if (attempt.kind === 'create') {
              await this.#discardManagedTpslIds(
                settlementKey,
                attempt.clientIds.map(String),
              );
            }
            this.#assertSession(generationAtIntent);
            if (remaining.length === 0) {
              await this.#finishRecoverySuccessor(
                journal,
                'failed',
                journal.sourceRecoveryOperationId ? await readActiveRaw() : [],
                generationAtIntent,
              );
              await this.#clearTpslJournal(settlementKey, journal.operationId);
            } else {
              // Dispatched attempts still require reconciliation, but a
              // refused removal no longer authorizes recovery to cancel
              // the surviving protection against a changed position.
              if (journal.intent === 'remove') {
                journal.phase = 'manual';
              }
              await this.#persistTpslJournal(settlementKey, {
                ...journal,
                attempts: remaining,
              });
            }
            journal.attempts = remaining;
          };
          // Sign+journal+submit one tracked cancel (stale protection or a
          // rollback of a surviving replacement leg).
          const submitTrackedCancel = async (
            orderId: string,
            role: 'stale' | 'rollback',
          ): Promise<void> => {
            if (role === 'stale' && journal.intent === 'replace') {
              // Persist the phase before touching old protection; interruption
              // from this point may require explicit manual recovery.
              journal.phase = 'cancelling';
            }
            await this.#assertRecoverySource(journal, generationAtIntent);
            const cancelNonce = await nextNonce();
            const signedCancel = await this.#getSignerBridge().execute({
              function: '_signCancelOrder',
              params: [accountIndex, market.marketId, orderId, cancelNonce],
            });
            if (signedCancel.error) {
              throw new Error(
                `Failed to cancel trigger order ${orderId}: ${signedCancel.error}`,
              );
            }
            const cancelIdentity = requireSignedTxIdentity(signedCancel);
            const cancelAttempt: TpslCancelAttempt = {
              kind: 'cancel',
              attemptId: nextAttemptIdFor(journal),
              nonce: cancelNonce,
              outcome: 'unknown',
              orderId,
              txHash: cancelIdentity.txHash,
              expiresAt: cancelIdentity.expiresAt,
              role,
            };
            journal.attempts.push(cancelAttempt);
            this.#tpslUnsettled.set(settlementKey, journal);
            await persistJournal();
            await submit(
              LIGHTER_TX_TYPE_CANCEL_ORDER,
              signedCancel.txInfo,
              () => {
                cancelAttempt.outcome = 'accepted';
              },
              {
                txHash: cancelIdentity.txHash,
                expiresAt: cancelIdentity.expiresAt,
                owner: journal.operationId,
                ...(journal.intent === 'remove' ||
                sourceRecovery ||
                partialIntent
                  ? {
                      beforeDispatch:
                        sourceRecovery && !partialIntent
                          ? async (): Promise<void> =>
                              this.#assertRecoverySource(
                                journal,
                                generationAtIntent,
                              )
                          : assertLiveExpected,
                      onNotDispatched: async (): Promise<void> =>
                        discardUnsentAttempt(cancelAttempt),
                    }
                  : {}),
              },
            );
          };

          const observeProtection = async (): Promise<void> => {
            if (!positionProtection) {
              return;
            }
            this.#assertSession(generationAtIntent);
            const active = await readActiveRaw();
            const missing = createdClientIds.filter(
              (id) =>
                positionProtection?.legs.some(
                  (leg) => leg.clientOrderId === String(id),
                ) &&
                !active.some(
                  (row) => String(row.clientOrderIndex) === String(id),
                ),
            );
            const inactive =
              missing.length > 0 ? await readInactiveFor(missing) : [];
            this.#assertSession(generationAtIntent);
            for (const leg of positionProtection.legs) {
              if (!leg.clientOrderId) {
                continue;
              }
              leg.status = 'unknown';
              const activeRows = active.filter(
                (row) => String(row.clientOrderIndex) === leg.clientOrderId,
              );
              const rows =
                activeRows.length > 0
                  ? activeRows
                  : inactive.filter(
                      (row) =>
                        String(row.clientOrderIndex) === leg.clientOrderId,
                    );
              const [row] = rows;
              if (
                rows.length !== 1 ||
                !row ||
                row.ownerAccountIndex !== accountIndex ||
                row.marketIndex !== market.marketId ||
                !Number.isSafeInteger(row.orderIndex) ||
                row.orderIndex <= 0
              ) {
                continue;
              }
              if (
                leg.orderId !== undefined &&
                leg.orderId !== String(row.orderIndex)
              ) {
                throw new Error('Lighter protection receipt identity changed');
              }
              leg.orderId = String(row.orderIndex);
              const remaining = new BigNumber(row.remainingBaseAmount);
              const initial = new BigNumber(row.initialBaseAmount);
              const status = row.status.toLowerCase();
              leg.status = 'unknown';
              if (
                activeRows.length > 0 &&
                remaining.isFinite() &&
                remaining.gt(0) &&
                remaining.lte(initial)
              ) {
                leg.status = remaining.lt(initial)
                  ? 'partially-filled'
                  : 'resting';
              } else if (
                (status === 'filled' || status === 'executed') &&
                remaining.eq(0)
              ) {
                leg.status = 'filled';
              } else if (status === 'canceled' || status === 'cancelled') {
                leg.status = 'canceled';
              } else if (status === 'rejected') {
                leg.status = 'rejected';
              }
            }
          };

          try {
            if (partialIntent) {
              await persistJournal();
              for (const order of staleTriggers) {
                await submitTrackedCancel(order.orderId, 'stale');
              }
              // No replacement dispatch until exact cancellation transactions and books settle.
              const reconciled = await this.#reconcilePriorTpsl(
                readActiveRaw,
                readInactiveFor,
                accountIndex,
                journal,
              );
              const cancellation = await this.#awaitTpslVisibility(
                readActiveRaw,
                readInactiveFor,
                {
                  createdClientIds: [],
                  cancelledOrderIds: staleTriggers.map(
                    (order) => order.orderId,
                  ),
                },
              );
              if (
                reconciled !== 'resolved' ||
                cancellation.outcome !== 'settled'
              ) {
                throw new Error(
                  'Partial protection cancellation is unresolved; replacement was not sent',
                );
              }
              await assertLiveExpected();
            }

            // Snapshot-sized protection retains create-before-cancel behavior.
            // Fixed partial protection has already proven its old set cancelled.
            if (
              wantsReplacement &&
              (singleOrderPayload !== null || groupedOrderPayload !== null)
            ) {
              const batches =
                partialIntent?.version === 2
                  ? partialIntent.orders.map((order) => ({
                      single: order,
                      grouped: null,
                      clientIds: [order[1]],
                    }))
                  : [
                      {
                        single: singleOrderPayload,
                        grouped: groupedOrderPayload,
                        clientIds: createdClientIds,
                      },
                    ];
              const independentPair = partialIntent?.version === 2;
              const receipt = positionProtection;
              const allClientIds = createdClientIds;
              for (const batch of batches) {
                const assertCreateCurrent = async (): Promise<void> => {
                  await assertLiveExpected();
                  if (independentPair && batch !== batches[0]) {
                    await observeProtection();
                    if (receipt?.legs[0].status !== 'resting') {
                      throw new Error(
                        'Independent protection first leg changed; the stale sibling was not sent',
                      );
                    }
                  }
                };
                if (independentPair) {
                  await assertCreateCurrent();
                }
                const createNonce = await nextNonce();
                // A lone trigger is an ordinary CreateOrder (same wire
                // layout); only a TP+SL pair uses the grouped OCO transaction.
                let signed: LighterTxResult;
                let isSingleTrigger = false;
                if (batch.single === null) {
                  if (batch.grouped === null) {
                    throw new Error(
                      'Lighter TP/SL preflight payload is missing',
                    );
                  }
                  signed = await this.#getSignerBridge().execute({
                    function: '_signCreateGroupedOrders',
                    params: [
                      accountIndex,
                      LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER,
                      2,
                      ...batch.grouped,
                      createNonce,
                    ],
                  });
                } else {
                  isSingleTrigger = true;
                  signed = await this.#getSignerBridge().execute({
                    function: '_signCreateOrder',
                    params: [accountIndex, ...batch.single, createNonce],
                  });
                }
                if (signed.error) {
                  throw new Error(signed.error);
                }
                // UNKNOWN recorded BEFORE the wire — in memory AND durably
                // (awaited): a transport failure after venue commit, or
                // provider/process death, must still leave a reconciliation
                // obligation resolvable by EXACT tx hash. A failed durable
                // write, or a signing result without hash/expiry, aborts the
                // mutation before submission.
                const createIdentity = requireSignedTxIdentity(signed);
                const createAttempt: TpslCreateAttempt = {
                  kind: 'create',
                  attemptId: nextAttemptIdFor(journal),
                  nonce: createNonce,
                  outcome: 'unknown',
                  clientIds: [...batch.clientIds],
                  orderExpiries: requireSignedOrderExpiries(
                    signed,
                    batch.clientIds,
                  ),
                  txHash: createIdentity.txHash,
                  expiresAt: createIdentity.expiresAt,
                  role: 'replacement',
                };
                journal.attempts.push(createAttempt);
                this.#tpslUnsettled.set(settlementKey, journal);
                await persistJournal();
                await submit(
                  isSingleTrigger
                    ? LIGHTER_TX_TYPE_CREATE_ORDER
                    : LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
                  signed.txInfo,
                  () => {
                    // Acceptance OBSERVED (pre-fence): absence from the books
                    // can now only mean visibility lag, never never-landed.
                    createAttempt.outcome = 'accepted';
                  },
                  {
                    txHash: createIdentity.txHash,
                    expiresAt: createIdentity.expiresAt,
                    owner: journal.operationId,
                    beforeDispatch: assertCreateCurrent,
                    onDispatch: () => {
                      for (const clientId of batch.clientIds) {
                        const leg =
                          receipt?.legs[allClientIds.indexOf(clientId)];
                        if (leg) {
                          leg.clientOrderId = String(clientId);
                        }
                      }
                    },
                    onNotDispatched: async (): Promise<void> =>
                      discardUnsentAttempt(createAttempt),
                  },
                );

                // PHASE BARRIER: prove the replacement is on the venue's books
                // BEFORE touching the old protection. An accepted create can
                // be asynchronously rejected/venue-cancelled; cancelling stale
                // triggers first would strip valid protection and discover it
                // afterwards.
                const createVisibility = await this.#awaitTpslVisibility(
                  readActiveRaw,
                  readInactiveFor,
                  {
                    createdClientIds: batch.clientIds,
                    cancelledOrderIds: [],
                  },
                  {
                    receiptIdentity: {
                      accountIndex,
                      marketIndex: market.marketId,
                    },
                  },
                );
                await observeProtection();
                if (createVisibility.outcome === 'timeout') {
                  throw new Error(
                    `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
                  );
                }
                if (createVisibility.outcome === 'created-terminal-failed') {
                  if (partialIntent) {
                    throw new Error(
                      'Partial replacement failed after cancellation; explicit recovery is required',
                    );
                  }
                  // The replacement (or one OCO leg) failed before the old
                  // protection was touched. ROLL BACK any leg still resting
                  // active so the venue returns to exactly the prior
                  // protection, then resolve the obligation for a retry.
                  if (createVisibility.survivingActiveClientIds.length > 0) {
                    const activeNow = await readActiveRaw();
                    const survivorOrderIds: string[] = [];
                    for (const clientId of createVisibility.survivingActiveClientIds) {
                      const survivor = activeNow.find(
                        (order) =>
                          String(order.clientOrderIndex) === String(clientId),
                      );
                      if (survivor) {
                        survivorOrderIds.push(String(survivor.orderIndex));
                        await submitTrackedCancel(
                          String(survivor.orderIndex),
                          'rollback',
                        );
                      }
                    }
                    const rollback = await this.#awaitTpslVisibility(
                      readActiveRaw,
                      readInactiveFor,
                      {
                        createdClientIds: [],
                        cancelledOrderIds: survivorOrderIds,
                      },
                    );
                    if (rollback.outcome === 'timeout') {
                      throw new Error(
                        `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
                      );
                    }
                  }
                  await this.#finishRecoverySuccessor(
                    journal,
                    'failed',
                    await readActiveRaw(),
                    generationAtIntent,
                  );
                  await this.#clearTpslJournal(
                    settlementKey,
                    journal.operationId,
                    await readActiveRaw(),
                  );
                  throw new Error(
                    `Lighter replacement TP/SL for ${params.symbol} was cancelled or rejected by the venue before becoming active; the existing protection was left untouched`,
                  );
                }
                // Barrier-proved TERMINAL success is immutable: skip those ids
                // in the final settlement check (no duplicate high-weight
                // inactive read); active-at-barrier ids are still re-verified
                // there (they can terminal-fail before the cancels settle).
                childOrderIds = [
                  ...(childOrderIds ?? []),
                  ...createVisibility.childOrderIds,
                ];
                if (!createVisibility.executedCreated) {
                  createdIdsNeedingFinalCheck.push(...batch.clientIds);
                }
                if (
                  independentPair &&
                  batch !== batches.at(-1) &&
                  (createVisibility.executedCreated ||
                    receipt?.legs[0].status !== 'resting')
                ) {
                  throw new Error(
                    'Independent protection first leg executed; the stale sibling was not sent',
                  );
                }
                if (createVisibility.executedCreated) {
                  // The trigger EXECUTED before activation was observed (an
                  // immediate/crossed TP/SL): not a failure — the position may
                  // already be closed. Stale triggers below are still cleaned
                  // up as reduce-only leftovers.
                  this.#deps.debugLogger.log(
                    '[LighterProvider] replacement trigger executed immediately',
                    { symbol: params.symbol },
                  );
                }
              }
            }

            if (!partialIntent) {
              for (const order of staleTriggers) {
                await submitTrackedCancel(order.orderId, 'stale');
              }
            }

            // Await authoritative visibility of the CANCELS before releasing
            // the lock (created ids were proven at the phase barrier): the
            // next queued transition must never snapshot a stale book.
            if (journal.attempts.length > 0) {
              const settled = await this.#awaitTpslVisibility(
                readActiveRaw,
                readInactiveFor,
                {
                  // Barrier-proved terminal successes are immutable and
                  // excluded; active-at-barrier ids are re-verified.
                  createdClientIds: createdIdsNeedingFinalCheck,
                  cancelledOrderIds: journal.attempts
                    .filter(
                      (attempt): attempt is TpslCancelAttempt =>
                        attempt.kind === 'cancel',
                    )
                    .map((attempt) => attempt.orderId),
                },
                {
                  ...(partialIntent?.version === 2
                    ? {
                        createdGroups: createdIdsNeedingFinalCheck.map((id) => [
                          id,
                        ]),
                      }
                    : {}),
                  receiptIdentity: {
                    accountIndex,
                    marketIndex: market.marketId,
                  },
                },
              );
              if (settled.outcome === 'timeout') {
                throw new Error(
                  `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
                );
              }
              if (settled.outcome === 'created-terminal-failed') {
                // Active at the phase barrier but venue-cancelled/rejected
                // AFTER the old protection was already cancelled. The
                // venue exposes no atomic primitive that could prove a
                // re-created trigger attaches to the same position
                // lifecycle, so nothing is auto-restored: the warning
                // parks DURABLY in the manual-recovery doc (surfaced via
                // getPendingManualRecoveries) and any surviving leg is
                // deliberately left as the only remaining protection.
                const rawNow = await readActiveRaw();
                const survivingOrderIds = rawNow
                  .filter((order) =>
                    journal.attempts.some(
                      (attempt) =>
                        attempt.kind === 'create' &&
                        attempt.clientIds.some(
                          (clientId) =>
                            String(order.clientOrderIndex) === String(clientId),
                        ),
                    ),
                  )
                  .map((order) => String(order.orderIndex));
                if (sourceRecovery) {
                  await this.#finishRecoverySuccessor(
                    journal,
                    'failed',
                    rawNow,
                    generationAtIntent,
                  );
                } else {
                  await this.#writeTpslManualRecovery({
                    settlementKey,
                    symbol: params.symbol,
                    reason:
                      'Replacement TP/SL order was cancelled or rejected by the venue after the previous protection was already removed',
                    partialIntent: journal.partialIntent,
                    priorIntent: journal.intent,
                    priorTriggers: journal.priorTriggers,
                    survivingOrderIds,
                    operationId: journal.operationId,
                    recordedAt: Date.now(),
                  });
                }
                await this.#clearTpslJournal(
                  settlementKey,
                  journal.operationId,
                  await readActiveRaw(),
                );
                this.#assertSession(generationAtIntent);
                throw new Error(
                  partialIntent
                    ? `Lighter partial replacement for ${params.symbol} failed after prior protection was removed; list the pending obligation and call resolveRecoveryProtection with its exact recovery ID and fresh current-position intent`
                    : `Lighter replacement TP/SL for ${params.symbol} was cancelled or rejected by the venue after the previous protection was already removed; the position's protection could NOT be safely re-established automatically — MANUAL re-establishment is required (a new explicit TP/SL update resolves this state)`,
                );
              }
              if (
                createdIdsNeedingFinalCheck.length > 0 &&
                (settled.childOrderIds.length !==
                  createdIdsNeedingFinalCheck.length ||
                  settled.childOrderIds.some(
                    (id, index) =>
                      id !==
                      childOrderIds?.[
                        createdClientIds.indexOf(
                          createdIdsNeedingFinalCheck[index],
                        )
                      ],
                  ))
              ) {
                throw new Error(
                  'Lighter TP/SL receipt identity changed during settlement',
                );
              }
              await this.#verifyRetainedRecoveryCoverage(
                journal,
                readActiveRaw,
                readInactiveFor,
              );
              await this.#finishRecoverySuccessor(
                journal,
                'settled',
                await readActiveRaw(),
                generationAtIntent,
              );
              await this.#clearTpslJournal(
                settlementKey,
                journal.operationId,
                await readActiveRaw(),
              );
              // A switch DURING the final journal-clear await must not let
              // stale A protection report success under B.
              this.#assertSession(generationAtIntent);
            }
            // ONLY here — the successor protection intent authoritatively
            // in force (created and settled, or removal completed) — may a
            // parked manual-recovery warning for this symbol be cleared. A
            // failed successor leaves the warning untouched.
            if (sourceRecovery) {
              await this.#verifyRetainedRecoveryCoverage(
                journal,
                readActiveRaw,
                readInactiveFor,
              );
              await this.#finishRecoverySuccessor(
                journal,
                'settled',
                await readActiveRaw(),
                generationAtIntent,
              );
            } else {
              await this.#clearTpslManualRecovery(settlementKey);
            }
            this.#assertSession(generationAtIntent);
          } catch (error) {
            try {
              await observeProtection();
            } catch (observationError) {
              this.#deps.debugLogger.log(
                '[LighterProvider] Protection receipt observation unavailable',
                { error: String(observationError) },
              );
            }
            try {
              if (partialIntent && journal.attempts.length === 0) {
                this.#assertSession(generationAtIntent);
                await this.#finishRecoverySuccessor(
                  journal,
                  'failed',
                  journal.sourceRecoveryOperationId
                    ? await readActiveRaw()
                    : [],
                  generationAtIntent,
                );
                await this.#clearTpslJournal(
                  settlementKey,
                  journal.operationId,
                );
              }
            } catch (cleanupError) {
              this.#deps.debugLogger.log(
                '[LighterProvider] Proven-unsent protection cleanup remains pending',
                { error: String(cleanupError) },
              );
            }
            throw error;
          }
          try {
            await this.#clearSettledPreviousSlotWarnings(
              settlementKey,
              accountIndex,
              params.symbol,
              generationAtIntent,
              readActiveRaw,
            );
          } catch (error) {
            if (error instanceof LighterSessionCancelledError) {
              throw error;
            }
            this.#deps.debugLogger.log(
              '[LighterProvider] Previous-slot warning cleanup remains pending',
              { error: String(error), symbol: params.symbol },
            );
          }
          this.#assertSession(generationAtIntent);
        },
        generationAtIntent,
        successorSlot,
      );
      return {
        success: true,
        ...(childOrderIds === undefined ? {} : { childOrderIds }),
        ...(positionProtection ? { positionProtection } : {}),
      };
    } catch (error) {
      const wrappedError = this.#reportTradingError(
        error,
        'updatePositionTPSL',
        {
          operation: PERPS_ERROR_OPERATION.PositionManagement,
          action: PERPS_ERROR_ACTION.PositionTpslUpdate,
        },
        {
          symbol: params.symbol,
          hasTakeProfit: params.takeProfitPrice !== undefined,
          hasStopLoss: params.stopLossPrice !== undefined,
        },
      );
      this.#deps.debugLogger.log(
        '[LighterProvider] updatePositionTPSL failed',
        {
          error: String(wrappedError),
          ...this.#getErrorContext('updatePositionTPSL'),
        },
      );
      return {
        success: false,
        error: wrappedError.message,
        ...(positionProtection ? { positionProtection } : {}),
      };
    }
  };

  /** Validate isolated collateral against a fresh, uniquely identified position.
   * @param symbol - Requested market symbol.
   * @param market - Native market identity.
   * @param amount - Signed collateral adjustment.
   * @param generation - Original session generation.
   * @param expected - Original position identity, when rechecking a queued intent.
   * @returns The captured position identity.
   */
  readonly #validateIsolatedMargin = async (
    symbol: string,
    market: LighterOrderBookMeta,
    amount: number,
    generation: number,
    expected?: Pick<LighterApiPosition, 'position' | 'sign' | 'avgEntryPrice'>,
  ): Promise<
    Pick<LighterApiPosition, 'position' | 'sign' | 'avgEntryPrice'>
  > => {
    if (market.status !== 'active' || market.marketType !== 'perp') {
      throw new Error(
        'Lighter margin adjustment requires an active perpetual market',
      );
    }
    this.#assertSession(generation);
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const response = await this.#clientService.getAccountByIndex(accountIndex);
    this.#assertSession(generation);
    const accounts = Array.isArray(response.accounts) ? response.accounts : [];
    const account = accounts.length === 1 ? accounts[0] : undefined;
    if (
      !account ||
      account.index !== accountIndex ||
      account.accountType !== 0 ||
      typeof account.l1Address !== 'string' ||
      account.l1Address.toLowerCase() !== this.#boundAddress ||
      !Array.isArray(account.positions)
    ) {
      throw new Error('Lighter margin account state is not authoritative');
    }
    const rows = account.positions.filter(
      (row) => row.marketId === market.marketId || row.symbol === symbol,
    );
    const row = rows.length === 1 ? rows[0] : undefined;
    if (
      !row ||
      row.marketId !== market.marketId ||
      row.symbol !== symbol ||
      row.marginMode !== LIGHTER_MARGIN_MODE_ISOLATED ||
      (row.sign !== 1 && row.sign !== -1) ||
      parseFinitePositive(row.position) === null ||
      parseFinitePositive(row.avgEntryPrice) === null
    ) {
      throw new Error(
        'Lighter margin adjustment requires an open isolated position',
      );
    }
    if (
      expected &&
      (row.sign !== expected.sign ||
        !new BigNumber(row.position).eq(expected.position) ||
        !new BigNumber(row.avgEntryPrice).eq(expected.avgEntryPrice))
    ) {
      throw new Error(
        'Lighter margin position changed; refresh before adjusting collateral',
      );
    }
    const available = parseStrictDecimal(account.availableBalance);
    const allocated =
      row.allocatedMargin === undefined
        ? null
        : parseStrictDecimal(row.allocatedMargin);
    if (
      amount > 0 &&
      (available === null ||
        available < 0 ||
        new BigNumber(amount).gt(account.availableBalance))
    ) {
      throw new Error('Lighter margin addition exceeds available collateral');
    }
    if (
      amount < 0 &&
      (allocated === null ||
        allocated < 0 ||
        new BigNumber(-amount).gt(row.allocatedMargin ?? '0'))
    ) {
      throw new Error(
        'Lighter margin removal exceeds authoritative allocated collateral',
      );
    }
    return {
      position: row.position,
      sign: row.sign,
      avgEntryPrice: row.avgEntryPrice,
    };
  };

  async updateMargin(input: UpdateMarginParams): Promise<MarginResult> {
    const params = { ...input };
    try {
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
      const markets = await this.#ensureMarkets(true);
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      // Strict full-string parse: '5USD' must not prefix-parse into
      // signed intent. Signed values are meaningful here (add/remove).
      const amount = parseStrictDecimal(params.amount) ?? Number.NaN;
      if (!Number.isFinite(amount) || amount === 0) {
        return {
          success: false,
          error: 'updateMargin requires a non-zero amount',
        };
      }
      // USDC uses 6 decimals. Integerize BEFORE signer setup so a huge
      // finite amount fails closed with zero bridge calls instead of
      // raw-scaling to an unsafe integer inside signer params.
      const marginAmountInt = toSignerWireInteger(Math.abs(amount), 6);
      if (
        !new BigNumber(params.amount).abs().shiftedBy(6).eq(marginAmountInt)
      ) {
        throw new Error(
          'Lighter margin adjustment requires exact micro-USDC precision',
        );
      }
      // Re-fence before signer setup: the market lookup above awaited, and
      // a stale intent must never initialize the new account's signer.
      this.#assertSession(generationAtIntent);
      const position = await this.#validateIsolatedMargin(
        params.symbol,
        market,
        amount,
        generationAtIntent,
      );
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      // USDC uses 6 decimals; direction 1 adds isolated margin, 0 removes it
      // (types/txtypes/constants.go: RemoveFromIsolatedMargin=0, Add=1).
      await this.#withVenueNonce(
        accountIndex,
        async (nonce, submit) => {
          await this.#validateIsolatedMargin(
            params.symbol,
            market,
            amount,
            generationAtIntent,
            position,
          );
          const signed = await this.#getSignerBridge().execute({
            function: '_signUpdateMargin',
            params: [
              accountIndex,
              market.marketId,
              marginAmountInt,
              amount > 0 ? 1 : 0,
              nonce,
            ],
          });
          if (signed.error) {
            throw new Error(signed.error);
          }
          return await submit(
            LIGHTER_TX_TYPE_UPDATE_MARGIN,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: `updateMargin:${params.symbol}:${params.amount}`,
              requireExecution: true,
              beforeDispatch: async () => {
                await this.#validateIsolatedMargin(
                  params.symbol,
                  market,
                  amount,
                  generationAtIntent,
                  position,
                );
              },
            },
          );
        },
        generationAtIntent,
      );
      return { success: true };
    } catch (error) {
      const wrappedError = this.#reportTradingError(
        error,
        'updateMargin',
        {
          operation: PERPS_ERROR_OPERATION.PositionManagement,
          action: PERPS_ERROR_ACTION.UpdateMargin,
        },
        {
          symbol: params.symbol,
          amount: params.amount,
        },
      );
      this.#deps.debugLogger.log('[LighterProvider] updateMargin failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('updateMargin'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    try {
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
      const amount = parseFinitePositive(params.amount);
      if (amount === null) {
        return { success: false, error: 'withdraw requires a positive amount' };
      }
      // Enforce the advertised route minimum: getWithdrawalRoutes reports
      // minWithdrawUsdc, and signing below it would either burn a nonce on
      // a venue rejection or strand dust.
      const minWithdraw = parseFloat(
        LIGHTER_BRIDGE_CONFIG[this.#isTestnet ? 'testnet' : 'mainnet']
          .minWithdrawUsdc,
      );
      if (amount < minWithdraw) {
        return {
          success: false,
          error: `Withdrawal amount ${params.amount} is below the Lighter minimum of ${minWithdraw} USDC`,
        };
      }
      // USDC uses 6 decimals on zkLighter. Integerize BEFORE signer setup:
      // overflow/sub-tick amounts fail closed with zero bridge calls,
      // matching validateWithdrawal exactly.
      const assetAmount = String(toSignerWireInteger(amount, 6));
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      const result = await this.#withVenueNonce(
        accountIndex,
        async (nonce, submit) => {
          const signed = await this.#getSignerBridge().execute({
            function: '_signWithdraw',
            params: [
              accountIndex,
              LIGHTER_USDC_ASSET_INDEX,
              0,
              assetAmount,
              nonce,
            ],
          });
          if (signed.error) {
            throw new Error(signed.error);
          }
          return await submit(
            LIGHTER_TX_TYPE_WITHDRAW,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: `withdraw:${params.amount}`,
            },
          );
        },
        generationAtIntent,
      );
      return { success: true, txHash: result.txHash };
    } catch (error) {
      const wrappedError = ensureError(error, 'LighterProvider.withdraw');
      this.#deps.debugLogger.log('[LighterProvider] withdraw failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('withdraw'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  // ============================================================================
  // History Operations (POC: stubbed)
  // ============================================================================

  async getOrderFills(
    params?: GetOrderFillsParams,
    _options?: PerpsReadOptions,
  ): Promise<OrderFill[]> {
    return await this.#getOrderFillsForQuery(params);
  }

  readonly #getOrderFillsForQuery = async (
    params?: LighterFillQuery,
  ): Promise<OrderFill[]> => {
    const selectedAddress = this.#walletService.getUserAddress().toLowerCase();
    const requestedAddress =
      params?.user?.toLowerCase() ??
      params?.accountId?.split(':').at(-1)?.toLowerCase();
    if (requestedAddress && requestedAddress !== selectedAddress) {
      throw new Error(
        'Lighter fill history can only query the selected wallet account',
      );
    }
    if (params?.aggregateByTime) {
      throw new Error('Lighter fill history does not support aggregateByTime');
    }
    if (
      params?.startTime !== undefined &&
      params.endTime !== undefined &&
      params.startTime > params.endTime
    ) {
      throw new Error('Lighter fill history startTime must not exceed endTime');
    }
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const token = await this.#getAuthToken();
      const markets = await this.#ensureMarkets();
      const requestedLimit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
      const marketId = params?.symbol
        ? markets.get(params.symbol)?.marketId
        : undefined;
      if (params?.symbol && marketId === undefined) {
        return [];
      }
      const needsPaging =
        params?.startTime !== undefined ||
        params?.endTime !== undefined ||
        params?.symbol !== undefined;
      const pageLimit = needsPaging ? 100 : requestedLimit;
      const fills: OrderFill[] = [];
      let cursor: string | undefined;
      let reachedStartBoundary = false;
      for (let page = 0; page < 100; page += 1) {
        const { trades, nextCursor } = await this.#clientService.getTrades(
          accountIndex,
          token,
          { limit: pageLimit, cursor, marketId },
        );
        this.#assertSession(generation);
        for (const trade of trades) {
          const fill = adaptFillFromLighterTrade(
            trade,
            this.#marketsById.get(trade.marketId)?.symbol ??
              String(trade.marketId),
            accountIndex,
          );
          if (
            (params?.startTime === undefined ||
              fill.timestamp >= params.startTime) &&
            (params?.endTime === undefined || fill.timestamp <= params.endTime)
          ) {
            fills.push(fill);
          }
          if (
            params?.startTime !== undefined &&
            fill.timestamp < params.startTime
          ) {
            reachedStartBoundary = true;
          }
        }
        cursor = nextCursor;
        if (
          fills.length >= requestedLimit ||
          cursor === undefined ||
          trades.length === 0 ||
          reachedStartBoundary
        ) {
          return fills.slice(0, requestedLimit);
        }
      }
      throw new Error(
        `${LIGHTER_DATA_INTEGRITY_PREFIX} fill history pagination did not reach the requested boundary`,
      );
    } catch (error) {
      this.#deps.debugLogger.log('[LighterProvider] getOrderFills failed', {
        error: String(error),
      });
      throw error;
    }
  };

  async getOrFetchFills(params?: GetOrFetchFillsParams): Promise<OrderFill[]> {
    return await this.#getOrderFillsForQuery(params);
  }

  async getHistoricalPortfolio(
    _params?: GetHistoricalPortfolioParams,
  ): Promise<HistoricalPortfolioResult> {
    // Capability-gated: the venue's PnLEntry carries trade, pool, spot, and
    // staking flows; reconstructing account value from the trade flows
    // alone is materially wrong for accounts using the other routes, and
    // no captured payload proves the full-flow semantics. Reporting a
    // plausible number would show false daily history — fail explicitly.
    throw new Error(
      'Historical portfolio is unavailable for Lighter: account-value reconstruction requires pool/spot/staking flow semantics that are not yet verified against the venue',
    );
  }

  async getFunding(
    _params?: GetFundingParams,
    _options?: PerpsReadOptions,
  ): Promise<Funding[]> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const token = await this.#getAuthToken();
      await this.#ensureMarkets();
      const response = await this.#clientService.getPositionFundings(
        accountIndex,
        token,
      );
      this.#assertSession(generation);
      return response.positionFundings.map((entry) => ({
        symbol:
          this.#marketsById.get(entry.marketId)?.symbol ??
          String(entry.marketId),
        // `change` is the signed USDC funding flow for the account's side.
        amountUsd: entry.change,
        rate: entry.rate,
        timestamp: entry.timestamp * 1000,
      }));
    } catch (error) {
      if (this.#mustSurfaceReadError(error)) {
        // Capability gates must surface, never degrade into empty state.
        throw error;
      }
      this.#deps.debugLogger.log('[LighterProvider] getFunding failed', {
        error: String(error),
      });
      return [];
    }
  }

  async getUserNonFundingLedgerUpdates(params?: {
    accountId?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<RawLedgerUpdate[]> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      const l1Address = this.#walletService.getUserAddress();
      const [deposits, withdraws, transfers] = await Promise.all([
        this.#clientService.getDepositHistory(
          accountIndex,
          l1Address,
          authToken,
        ),
        this.#clientService.getWithdrawHistory(accountIndex, authToken),
        this.#clientService.getTransferHistory(accountIndex, authToken),
      ]);
      const updates: RawLedgerUpdate[] = [
        ...(deposits.deposits ?? []).map((entry) => ({
          hash: entry.l1TxHash,
          time: entry.timestamp,
          delta: { type: 'deposit', usdc: entry.amount },
        })),
        ...(withdraws.withdraws ?? []).map((entry) => ({
          hash: entry.l1TxHash,
          time: entry.timestamp,
          delta: { type: 'withdraw', usdc: `-${entry.amount}` },
        })),
        ...(transfers.transfers ?? []).map((entry) => ({
          hash: entry.txHash,
          time: entry.timestamp,
          delta: adaptLighterTransferDelta(entry),
        })),
      ].sort((first, second) => second.time - first.time);
      const { startTime, endTime } = params ?? {};
      this.#assertSession(generation);
      return updates.filter(
        (update) =>
          (startTime === undefined || update.time >= startTime) &&
          (endTime === undefined || update.time <= endTime),
      );
    } catch (error) {
      if (this.#mustSurfaceReadError(error)) {
        // Capability gates must surface, never degrade into empty state.
        throw error;
      }
      this.#deps.debugLogger.log(
        '[LighterProvider] getUserNonFundingLedgerUpdates failed',
        { error: String(error) },
      );
      return [];
    }
  }

  async getUserHistory(params?: {
    accountId?: CaipAccountId;
    startTime?: number;
    endTime?: number;
  }): Promise<UserHistoryItem[]> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      const l1Address = this.#walletService.getUserAddress();
      const [deposits, withdraws] = await Promise.all([
        this.#clientService.getDepositHistory(
          accountIndex,
          l1Address,
          authToken,
        ),
        this.#clientService.getWithdrawHistory(accountIndex, authToken),
      ]);
      const toStatus = (venueStatus: string): UserHistoryItem['status'] => {
        if (venueStatus === 'completed') {
          return 'completed';
        }
        return venueStatus === 'failed' ? 'failed' : 'pending';
      };
      const items: UserHistoryItem[] = [
        ...(deposits.deposits ?? []).map((entry) => ({
          id: `deposit-${entry.id}`,
          timestamp: entry.timestamp,
          type: 'deposit' as const,
          amount: entry.amount,
          asset: 'USDC',
          txHash: entry.l1TxHash,
          status: toStatus(entry.status),
          details: { source: 'lighter' },
        })),
        ...(withdraws.withdraws ?? []).map((entry) => ({
          id: `withdrawal-${entry.id}`,
          timestamp: entry.timestamp,
          type: 'withdrawal' as const,
          amount: entry.amount,
          asset: 'USDC',
          txHash: entry.l1TxHash,
          status: toStatus(entry.status),
          details: { source: 'lighter' },
        })),
      ].sort((first, second) => second.timestamp - first.timestamp);
      const { startTime, endTime } = params ?? {};
      this.#assertSession(generation);
      return items.filter(
        (item) =>
          (startTime === undefined || item.timestamp >= startTime) &&
          (endTime === undefined || item.timestamp <= endTime),
      );
    } catch (error) {
      if (this.#mustSurfaceReadError(error)) {
        // Capability gates must surface, never degrade into empty state.
        throw error;
      }
      this.#deps.debugLogger.log('[LighterProvider] getUserHistory failed', {
        error: String(error),
      });
      return [];
    }
  }

  // ============================================================================
  // Validation (POC: minimal)
  // ============================================================================

  async validateDeposit(
    _params: DepositParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  async validateOrder(
    params: OrderParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    // ONE error-to-invalid boundary: a validator RESOLVES, never rejects,
    // whichever awaited venue read fails (markets, margin metadata, fresh
    // price, live positions, data integrity).
    try {
      this.#ensureSessionBinding();
      if (
        params.expectedScaleLadder !== undefined &&
        params.orderType !== 'scale'
      ) {
        return {
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_SCALE_PREVIEW_STALE,
        };
      }
      const intent = {
        ...params,
        expectedScaleLadder: captureExpectedScaleLadder(
          params.expectedScaleLadder,
        ),
      };
      if (intent.orderType === 'scale') {
        this.#ensureSessionBinding();
        await this.#prepareScaleOrder(intent, this.#sessionGeneration);
        return { isValid: true };
      }
      return await this.#validateOrderChecks(intent);
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateOrder').message,
      };
    }
  }

  readonly #validateOrderChecks = async (
    params: OrderParams,
  ): Promise<{ isValid: boolean; error?: string }> => {
    if (params.orderType === 'chase' && this.#chaseTestnetProbe) {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      await this.#prepareChaseIntent(params, generation);
      this.#assertSession(generation);
      return { isValid: true };
    }
    // Mirrors placeOrder's own rejections so validation never approves an
    // order shape the placement path would refuse.
    if (
      params.orderType !== 'limit' &&
      params.orderType !== 'market' &&
      !isTriggerOrderType(params.orderType)
    ) {
      return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
    }
    const triggerIntentError = getLighterTriggerIntentError(params);
    if (triggerIntentError) {
      return { isValid: false, error: triggerIntentError };
    }
    const attachedIntentError = getLighterAttachedIntentError(params);
    if (attachedIntentError) {
      return { isValid: false, error: attachedIntentError };
    }
    const hasAttached =
      params.takeProfitPrice !== undefined ||
      params.stopLossPrice !== undefined;
    const postOnlyError = getLighterPostOnlyIntentError(params);
    if (postOnlyError) {
      return { isValid: false, error: postOnlyError };
    }
    if (isLimitExecutionOrderType(params.orderType) && !params.price) {
      return { isValid: false, error: 'Limit order requires a price' };
    }
    if (
      isLimitExecutionOrderType(params.orderType) &&
      params.price !== undefined
    ) {
      // Strict finite parity with placement, LIMIT ONLY: 'Infinity' and
      // prefix-numeric strings ('90000USD') both parse under a bare
      // parseFloat check but placement refuses them. Market placement
      // ignores params.price entirely (fresh venue price), so rejecting
      // it here would fail orders placement accepts.
      if (parseFinitePositive(params.price) === null) {
        return {
          isValid: false,
          error: `Invalid limit price ${params.price}: must be a positive number`,
        };
      }
    }
    const leverageError = lighterLeverageError(params.leverage);
    if (leverageError) {
      return { isValid: false, error: leverageError };
    }
    let usdAmount: number | undefined;
    if (params.usdAmount !== undefined) {
      const parsedUsd = parseFinitePositive(params.usdAmount);
      if (parsedUsd === null) {
        return {
          isValid: false,
          error: `Invalid usdAmount ${params.usdAmount}: must be a positive number`,
        };
      }
      usdAmount = parsedUsd;
    }
    const hasUsdSizing = usdAmount !== undefined;
    if (!hasUsdSizing && parseFinitePositive(params.size) === null) {
      return { isValid: false, error: 'Order size must be positive' };
    }
    const markets = await this.#ensureMarkets(
      isTriggerOrderType(params.orderType) ||
        hasAttached ||
        params.timeInForce === 'ALO' ||
        params.marginMode !== undefined,
    );
    const market = markets.get(params.symbol);
    if (!market) {
      return {
        isValid: false,
        error: `Unknown Lighter market: ${params.symbol}`,
      };
    }
    if (
      params.timeInForce === 'ALO' &&
      (market.status !== 'active' || market.marketType !== 'perp')
    ) {
      return {
        isValid: false,
        error: 'Lighter post-only requires an active perpetual market',
      };
    }
    if (
      (isTriggerOrderType(params.orderType) || hasAttached) &&
      (market.status !== 'active' || market.marketType !== 'perp')
    ) {
      return {
        isValid: false,
        error: 'Lighter trigger orders require an active perpetual market',
      };
    }
    await this.#validateExplicitMarginMode(
      params,
      market,
      this.#sessionGeneration,
    );
    if (params.leverage !== undefined) {
      // Same authoritative-metadata requirement as placement.
      const maxLeverage = await this.#requireMarketMaxLeverage(params.symbol);
      if (maxLeverage === null) {
        return {
          isValid: false,
          error: `Cannot validate leverage for ${params.symbol}: venue margin metadata unavailable`,
        };
      }
      if (params.leverage > maxLeverage) {
        return {
          isValid: false,
          error: `Invalid leverage ${params.leverage}: exceeds the ${params.symbol} maximum of ${maxLeverage}x`,
        };
      }
    }
    // Reference-price parity with placement: a MARKET order sizes at the
    // FRESH venue price through the SAME resolver (fail-closed missing
    // price, snapshot and slippage intent validation, drift) — the
    // caller's price/currentPrice is never trusted for min-size. A LIMIT
    // order sizes at the caller's (finite-validated) price. The EXECUTION
    // price is derived through the same helper placement signs with, so
    // the wire-range check below inspects the exact signed value.
    let referencePrice: number;
    let executionPrice: number;
    if (isTriggerOrderType(params.orderType)) {
      const resolved = resolveLighterTriggerPrices(params, market);
      referencePrice = resolved.referencePrice;
      executionPrice = resolved.executionPrice;
    } else if (params.orderType === 'market') {
      const slippageFraction =
        params.maxSlippageBps === undefined
          ? (params.slippage ?? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000)
          : params.maxSlippageBps / 10_000;
      // A validator must RESOLVE to an invalid result, never reject: the
      // fresh-price lookup can throw on REST failure.
      let resolved:
        | { referencePrice: number; error: null }
        | { referencePrice: null; error: string };
      try {
        resolved = await this.#resolveMarketReferencePrice(
          params.symbol,
          slippageFraction,
          params.priceAtCalculation,
        );
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateOrder').message,
        };
      }
      if (resolved.error !== null) {
        return { isValid: false, error: resolved.error };
      }
      referencePrice = resolved.referencePrice;
      executionPrice = deriveLighterExecutionPrice(
        referencePrice,
        params.isBuy,
        slippageFraction,
      );
    } else {
      referencePrice = parseFloat(
        params.price ?? String(params.currentPrice ?? 0),
      );
      executionPrice = referencePrice;
    }
    resolveLighterAttachedChildren(params, market, referencePrice);
    if (referencePrice > 0) {
      // USD-derived sizes snap onto the venue grid (placement parity);
      // explicit size strings stay verbatim.
      const requestedSize =
        usdAmount === undefined
          ? parseFloat(params.size)
          : snapToLighterSizeGrid(
              usdAmount / referencePrice,
              market.supportedSizeDecimals,
            );
      if (usdAmount === undefined) {
        try {
          const requestedSizeInt = toSignerWireInteger(
            requestedSize,
            market.supportedSizeDecimals,
          );
          if (
            fromLighterInteger(
              requestedSizeInt,
              market.supportedSizeDecimals,
            ) !== requestedSize
          ) {
            return {
              isValid: false,
              error: `Order size ${params.size} does not align with the Lighter size grid`,
            };
          }
        } catch (error) {
          return {
            isValid: false,
            error: ensureError(error, 'LighterProvider.validateOrder').message,
          };
        }
      }
      const minSize = isLighterMakerOrder(params)
        ? computeLighterMinOrderSize(market, referencePrice)
        : 0;
      if (minSize > 0 && requestedSize < minSize) {
        // EXACTLY the placement rule: only reduce-only orders may bump to
        // the venue minimum, and only when the live position verifies a
        // full close; isFullClose remains an untrusted hint. The live read
        // can THROW (capability gates, venue-data integrity): a validator
        // must resolve to an explicit invalid result, never reject.
        let verifiedFullClose = false;
        if (params.reduceOnly && !isTriggerOrderType(params.orderType)) {
          try {
            verifiedFullClose = await this.#isVerifiedFullClose(
              params.symbol,
              requestedSize,
            );
          } catch (error) {
            return {
              isValid: false,
              error: ensureError(error, 'LighterProvider.validateOrder')
                .message,
            };
          }
        }
        if (!verifiedFullClose) {
          return {
            isValid: false,
            error: `Order size ${requestedSize} is below the Lighter minimum of ${minSize} ${params.symbol}`,
          };
        }
      }
      // Wire-format parity: placement integerizes size and the
      // slippage-adjusted EXECUTION price; toLighterInteger throws on
      // safe-integer overflow and wire-zero there; surface the identical
      // error here so validation never approves an order the signer path
      // refuses (a safe reference can still overflow after +5%).
      try {
        toSignerWireInteger(requestedSize, market.supportedSizeDecimals);
        toSignerWirePriceInteger(executionPrice, market.supportedPriceDecimals);
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateOrder').message,
        };
      }
    }
    if (params.timeInForce === 'ALO') {
      await this.#assertPostOnlyBook(
        market.marketId,
        params.isBuy,
        fromLighterInteger(
          toSignerWirePriceInteger(
            executionPrice,
            market.supportedPriceDecimals,
          ),
          market.supportedPriceDecimals,
        ),
      );
    }
    return { isValid: true };
  };

  async validateClosePosition(
    params: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    // Same single error-to-invalid boundary as validateOrder.
    try {
      return await this.#validateClosePositionChecks(params);
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateClosePosition')
          .message,
      };
    }
  }

  readonly #validateClosePositionChecks = async (
    rawParams: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> => {
    const params = this.#normalizeCloseParams(rawParams);
    // Same shape rules the execution path enforces.
    const shapeError = this.#validateCloseShape(params);
    if (shapeError) {
      return { isValid: false, error: shapeError };
    }
    const markets = await this.#ensureMarkets();
    const market = markets.get(params.symbol);
    if (!market) {
      return {
        isValid: false,
        error: `Unknown Lighter market ${params.symbol}`,
      };
    }
    // Live sizing parity with closePosition→placeOrder: a validator that
    // approves a close the execution path rejects is worse than none.
    // Capability and data-integrity errors from the read surface as an
    // explicit invalid result, never an exception or a silent empty.
    let positions: Position[];
    try {
      positions = await this.getPositions();
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateClosePosition')
          .message,
      };
    }
    const signedHeld = parseFloat(
      positions.find((entry) => entry.symbol === params.symbol)?.size ?? '0',
    );
    const held = Math.abs(signedHeld);
    if (held === 0) {
      return {
        isValid: false,
        error: `No open Lighter position for ${params.symbol}`,
      };
    }
    // Order-type-specific pricing, matching execution exactly: a LIMIT
    // close is sized at the caller's price (which must be a finite
    // positive number — never silently replaced by a live price the
    // execution path would not use); a MARKET close resolves the FRESH
    // venue price through the SAME helper as placement, inheriting its
    // fail-closed missing-price and drift semantics.
    let referencePrice: number;
    let executionPrice: number;
    if ((params.orderType ?? 'market') === 'limit') {
      const parsedLimitPrice = parseFinitePositive(params.price ?? '');
      if (parsedLimitPrice === null) {
        return {
          isValid: false,
          error: `Invalid limit price ${params.price}: must be a positive number`,
        };
      }
      referencePrice = parsedLimitPrice;
      executionPrice = referencePrice;
    } else {
      const slippageFraction =
        params.maxSlippageBps === undefined
          ? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000
          : params.maxSlippageBps / 10_000;
      // Same validator contract as validateOrder: REST failures resolve.
      let resolved:
        | { referencePrice: number; error: null }
        | { referencePrice: null; error: string };
      try {
        resolved = await this.#resolveMarketReferencePrice(
          params.symbol,
          slippageFraction,
          params.priceAtCalculation,
        );
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateClosePosition')
            .message,
        };
      }
      if (resolved.error !== null) {
        return { isValid: false, error: resolved.error };
      }
      referencePrice = resolved.referencePrice;
      // Closing is the opposite side: a SHORT closes with a BUY, whose
      // +slippage protection price is what placement actually signs.
      executionPrice = deriveLighterExecutionPrice(
        referencePrice,
        signedHeld < 0,
        slippageFraction,
      );
    }
    if (referencePrice > 0) {
      const usdAmount = parseFloat(params.usdAmount ?? '');
      // USD-derived sizes snap onto the venue grid (placement parity);
      // explicit size strings stay verbatim.
      const requestedSize =
        Number.isFinite(usdAmount) && usdAmount > 0
          ? snapToLighterSizeGrid(
              usdAmount / referencePrice,
              market.supportedSizeDecimals,
            )
          : parseFloat(params.size ?? String(held));
      const hasExplicitSize =
        params.usdAmount === undefined && params.size !== undefined;
      // Wire-format parity with the placement path closePosition uses:
      // the EXECUTION price is what gets integerized and signed.
      try {
        const requestedSizeInt = toSignerWireInteger(
          requestedSize,
          market.supportedSizeDecimals,
        );
        if (
          hasExplicitSize &&
          fromLighterInteger(requestedSizeInt, market.supportedSizeDecimals) !==
            requestedSize
        ) {
          return {
            isValid: false,
            error: `Order size ${params.size} does not align with the Lighter size grid`,
          };
        }
        toSignerWirePriceInteger(executionPrice, market.supportedPriceDecimals);
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateClosePosition')
            .message,
        };
      }
    }
    return { isValid: true };
  };

  async validateWithdrawal(
    params: WithdrawParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    const amount = parseFinitePositive(params.amount ?? '');
    if (amount === null) {
      return { isValid: false, error: 'Withdrawal amount must be positive' };
    }
    // Advertised route-minimum parity with withdraw.
    const minWithdraw = parseFloat(
      LIGHTER_BRIDGE_CONFIG[this.#isTestnet ? 'testnet' : 'mainnet']
        .minWithdrawUsdc,
    );
    if (amount < minWithdraw) {
      return {
        isValid: false,
        error: `Withdrawal amount ${params.amount} is below the Lighter minimum of ${minWithdraw} USDC`,
      };
    }
    // Scaled wire-range parity with withdraw's own integerization.
    try {
      toSignerWireInteger(amount, 6);
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateWithdrawal').message,
      };
    }
    return { isValid: true };
  }

  // ============================================================================
  // Calculations (POC: coarse)
  // ============================================================================

  async calculateLiquidationPrice(
    params: LiquidationPriceParams,
  ): Promise<string> {
    // Cross liquidation is account-wide and cannot be derived truthfully
    // from this per-position input. Live positions carry the venue's
    // authoritative liquidationPrice; previews support isolated only.
    if (params.marginType === 'cross') {
      throw new Error(
        'Lighter cross-margin liquidation previews require account-wide collateral and position inputs that are unavailable',
      );
    }
    const { entryPrice, leverage, direction } = params;
    if (
      !isFinite(entryPrice) ||
      !isFinite(leverage) ||
      entryPrice <= 0 ||
      leverage <= 0
    ) {
      return '0.00';
    }
    const maintenanceFraction = await this.calculateMaintenanceMargin({
      asset: params.asset ?? '',
    });
    const initialMargin = 1 / leverage;
    if (initialMargin <= maintenanceFraction) {
      throw new Error(
        `Invalid leverage: ${leverage}x cannot cover the ${maintenanceFraction * 100}% maintenance requirement`,
      );
    }
    const side = direction === 'long' ? 1 : -1;
    const marginAvailable = initialMargin - maintenanceFraction;
    const denominator = 1 - maintenanceFraction * side;
    if (Math.abs(denominator) < 0.0001) {
      return String(entryPrice);
    }
    const liquidationPrice =
      entryPrice - (side * marginAvailable * entryPrice) / denominator;
    return String(Math.max(0, liquidationPrice));
  }

  async calculateMaintenanceMargin(
    params: MaintenanceMarginParams,
  ): Promise<number> {
    // The venue publishes per-market maintenance margin fractions
    // (hundredths of a percent, e.g. 240 = 2.4%) in orderBookDetails.
    await this.#ensureMarketMargins();
    const maintenance = this.#marginBySymbol.get(params.asset)?.maintenance;
    if (maintenance && maintenance > 0) {
      return maintenance / 10_000;
    }
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} maintenance margin metadata unavailable for ${params.asset || 'unknown market'}`,
    );
  }

  /**
   * Validate an explicit collateral mode from authoritative account rows.
   * No signer setup or default-mode fallback is permitted for this request.
   * @param params - Requested order intent; explicit mode requires leverage.
   * @param market - Refreshed public market metadata.
   * @param generation - Session captured before the reads.
   * @param requireSelectedMode - Require the executed selection to be visible before exposure.
   * @returns Wire mode, or null for the unchanged omitted-mode behavior.
   */
  readonly #validateExplicitMarginMode = async (
    params: OrderParams,
    market: LighterOrderBookMeta,
    generation: number,
    requireSelectedMode = false,
  ): Promise<number | null> => {
    if (params.marginMode === undefined) {
      return null;
    }
    if (params.marginMode !== 'cross' && params.marginMode !== 'isolated') {
      throw new Error(PERPS_ERROR_CODES.ORDER_MARGIN_MODE_INVALID);
    }
    if (!Number.isInteger(params.leverage) || (params.leverage ?? 0) < 1) {
      throw new Error(PERPS_ERROR_CODES.ORDER_LEVERAGE_INVALID);
    }
    if (market.status !== 'active' || market.marketType !== 'perp') {
      throw new Error(PERPS_ERROR_CODES.ORDER_MARGIN_MODE_UNSUPPORTED);
    }
    this.#assertSession(generation);
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const response = await this.#clientService.getAccountByIndex(accountIndex);
    this.#assertSession(generation);
    const accounts = Array.isArray(response.accounts) ? response.accounts : [];
    const account = accounts.length === 1 ? accounts[0] : undefined;
    if (
      !account ||
      account.index !== accountIndex ||
      account.accountType !== 0 ||
      typeof account.l1Address !== 'string' ||
      account.l1Address.toLowerCase() !== this.#boundAddress ||
      !Array.isArray(account.positions)
    ) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
    }
    const rows = account.positions.filter(
      (row) => row.marketId === market.marketId || row.symbol === params.symbol,
    );
    const row = rows.length === 1 ? rows[0] : undefined;
    if (
      rows.length > 1 ||
      (row &&
        (row.marketId !== market.marketId || row.symbol !== params.symbol))
    ) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
    }
    // Counts are the account endpoint's authoritative resting/pending order
    // inventory. Without a target row, any order makes its mode unprovable.
    if (
      !Number.isSafeInteger(account.totalOrderCount) ||
      account.totalOrderCount < 0 ||
      !Number.isSafeInteger(account.pendingOrderCount) ||
      account.pendingOrderCount < 0 ||
      (!row && (account.totalOrderCount > 0 || account.pendingOrderCount > 0))
    ) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
    }
    const requested =
      params.marginMode === 'cross'
        ? LIGHTER_MARGIN_MODE_CROSS
        : LIGHTER_MARGIN_MODE_ISOLATED;
    if (row) {
      const size = parseStrictDecimal(row.position);
      const mode = row.marginMode ?? LIGHTER_MARGIN_MODE_CROSS;
      const pending = row.pendingOrderCount ?? account.pendingOrderCount;
      const tied = row.positionTiedOrderCount ?? account.totalOrderCount;
      if (
        size === null ||
        size < 0 ||
        (size > 0 && row.sign !== 1 && row.sign !== -1) ||
        !Number.isSafeInteger(pending) ||
        pending < 0 ||
        !Number.isSafeInteger(tied) ||
        tied < 0 ||
        !Number.isSafeInteger(row.openOrderCount) ||
        row.openOrderCount < 0 ||
        (mode !== LIGHTER_MARGIN_MODE_CROSS &&
          mode !== LIGHTER_MARGIN_MODE_ISOLATED)
      ) {
        throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
      }
      if (
        mode !== requested &&
        (size !== 0 || row.openOrderCount > 0 || pending > 0 || tied > 0)
      ) {
        throw new Error(
          size === 0
            ? PERPS_ERROR_CODES.ORDER_MARGIN_MODE_ORDER_OPEN
            : PERPS_ERROR_CODES.ORDER_MARGIN_MODE_POSITION_OPEN,
        );
      }
    }
    if (requireSelectedMode && (!row || row.marginMode !== requested)) {
      throw new Error(
        'Lighter selected margin mode is not visible; refresh before placing exposure',
      );
    }
    return requested;
  };

  /**
   * Margin mode the venue will accept for a leverage update on this
   * market: an existing position's current mode (the venue refuses mode
   * changes while a position is open; a missing field means the venue
   * default, cross), otherwise ISOLATED — the only mode the app manages.
   *
   * @param symbol - Market symbol.
   * @returns The wire margin mode for UpdateLeverage.
   */
  readonly #resolveMarginModeForSymbol = async (
    symbol: string,
  ): Promise<number> => {
    try {
      const positionMarginMode = await this.#readPositionMarginMode(symbol);
      if (positionMarginMode !== null) {
        return positionMarginMode;
      }
    } catch {
      // Fall through: prefer isolated; a wrong guess surfaces as an
      // explicit venue rejection of the leverage update, never as state.
    }
    return LIGHTER_MARGIN_MODE_ISOLATED;
  };

  /**
   * Wire margin mode of the open position on this market, if any. A missing
   * `marginMode` field means the venue default, cross.
   *
   * @param symbol - Market symbol.
   * @returns The position's wire margin mode, or null when flat.
   * @throws When the account or its positions cannot be read, including an
   * account response without the account or its positions array.
   */
  readonly #readPositionMarginMode = async (
    symbol: string,
  ): Promise<number | null> => {
    const accountIndex = await this.#ensureAccountIndex();
    const response = await this.#clientService.getAccountByIndex(accountIndex);
    const positions = response.accounts?.[0]?.positions;
    // A missing account or positions array is not proof of a flat account.
    if (!Array.isArray(positions)) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
    }
    const row = positions.find(
      (position) =>
        position.symbol === symbol && parseFloat(position.position) !== 0,
    );
    return row ? (row.marginMode ?? LIGHTER_MARGIN_MODE_CROSS) : null;
  };

  /** Per-market margin fractions + last price from orderBookDetails. */
  readonly #marginBySymbol = new Map<string, LighterMarginMetadata>();

  /**
   * Synchronous per-market max leverage from the authoritative margin cache.
   *
   * Inactive markets cannot increase exposure. When Lighter has retired their
   * risk metadata, the position's current leverage is therefore the highest
   * leverage that can be reported without inventing a tradable venue limit.
   *
   * @param position - Position carrying the market id and current margin.
   * @returns Max leverage for the market.
   * @throws If the market identity or margin metadata is unavailable.
   */
  readonly #maxLeverageForPosition = (
    position: Pick<LighterApiPosition, 'marketId' | 'initialMarginFraction'>,
  ): number => {
    const { marketId } = position;
    const symbol = this.#marketsById.get(marketId)?.symbol;
    const metadata =
      (symbol ? this.#marginBySymbol.get(symbol) : undefined) ??
      [...this.#marginBySymbol.values()].find(
        (entry) => entry.marketId === marketId,
      );
    if (metadata) {
      return deriveLighterMaxLeverage(metadata.minInitial, marketId);
    }
    if (this.#marketsById.get(marketId)?.status === 'inactive') {
      const marginFraction = parseStrictDecimal(position.initialMarginFraction);
      const currentLeverage =
        marginFraction !== null && marginFraction > 0
          ? Math.round(100 / marginFraction)
          : 0;
      if (Number.isSafeInteger(currentLeverage) && currentLeverage > 0) {
        return currentLeverage;
      }
    }
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} margin metadata unavailable for market ${marketId}`,
    );
  };

  /**
   * Authoritative per-market max leverage for trading validation. This returns
   * null when venue metadata is missing or unreadable so placement can return
   * its validation result instead of throwing.
   *
   * @param symbol - Market symbol.
   * @returns The published max leverage, or null when unavailable.
   */
  readonly #requireMarketMaxLeverage = async (
    symbol: string,
  ): Promise<number | null> => {
    try {
      await this.#ensureMarketMargins();
    } catch {
      return null;
    }
    const metadata = this.#marginBySymbol.get(symbol);
    if (!metadata) {
      return null;
    }
    try {
      return deriveLighterMaxLeverage(metadata.minInitial, symbol);
    } catch {
      return null;
    }
  };

  /** When the margin-metadata cache was last refreshed (0 = never). */
  #marginFetchedAt = 0;

  /** In-flight authoritative margin refresh, shared by the stale epoch. */
  #marginRefreshInFlight: Promise<void> | null = null;

  readonly #ensureMarketMargins = async (): Promise<void> => {
    // TTL refresh: metadata cached once for the whole session would keep
    // validating leverage against a stale (possibly higher) max. On
    // expiry the fetch re-runs; if it fails, the throw propagates and
    // every authoritative risk caller fails closed until a later retry.
    if (
      this.#marginBySymbol.size > 0 &&
      Date.now() - this.#marginFetchedAt < LIGHTER_MARGIN_METADATA_TTL_MS
    ) {
      return;
    }
    // ONE authoritative request per stale epoch: overlapping independent
    // fetches can resolve out of order, letting a DELAYED older payload
    // overwrite a fresher cap for a full TTL. A rejection propagates to
    // every waiter of this epoch (fail closed) and clears the in-flight
    // slot in finally so a later call can retry.
    if (!this.#marginRefreshInFlight) {
      this.#marginRefreshInFlight = (async (): Promise<void> => {
        try {
          const details = await this.#clientService.getOrderBookDetails();
          if (this.#isDisconnected) {
            return;
          }
          // Atomic replacement: set()-ing into the old map would let a
          // symbol REMOVED from fresh metadata keep its stale cap forever.
          // The timestamp only advances on success.
          const fresh = new Map<string, LighterMarginMetadata>();
          for (const detail of details.orderBookDetails) {
            if (isInactiveMarketWithoutUsableRiskMetadata(detail)) {
              continue;
            }
            if (detail.minInitialMarginFraction !== undefined) {
              deriveLighterMaxLeverage(
                detail.minInitialMarginFraction,
                detail.symbol,
              );
            }
            if (
              detail.maintenanceMarginFraction !== undefined &&
              (!Number.isSafeInteger(detail.maintenanceMarginFraction) ||
                detail.maintenanceMarginFraction < 1 ||
                detail.maintenanceMarginFraction > 10_000)
            ) {
              throw new Error(
                `${LIGHTER_DATA_INTEGRITY_PREFIX} invalid maintenance margin fraction for market ${detail.symbol}`,
              );
            }
            fresh.set(detail.symbol, {
              marketId: detail.marketId,
              minInitial: detail.minInitialMarginFraction,
              defaultInitial: detail.defaultInitialMarginFraction,
              maintenance: detail.maintenanceMarginFraction,
              lastTradePrice: detail.lastTradePrice,
            });
          }
          this.#marginBySymbol.clear();
          for (const [symbol, entry] of fresh) {
            this.#marginBySymbol.set(symbol, entry);
          }
          this.#marginFetchedAt = Date.now();
        } finally {
          this.#marginRefreshInFlight = null;
        }
      })();
    }
    await this.#marginRefreshInFlight;
  };

  async getMaxLeverage(asset: string): Promise<number> {
    // The venue publishes per-market minimum initial margin fractions
    // (hundredths of a percent): 400 → 25x. Missing metadata is unavailable,
    // never evidence that the global maximum applies to this market.
    await this.#ensureMarketMargins();
    const metadata = this.#marginBySymbol.get(asset);
    if (metadata) {
      return deriveLighterMaxLeverage(metadata.minInitial, asset);
    }
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} margin metadata unavailable for ${asset}`,
    );
  }

  async calculateFees(
    params: FeeCalculationParams,
  ): Promise<FeeCalculationResult> {
    // The market metadata's zero fee is only true for Standard accounts —
    // resolve and gate the account tier first so a Premium account can
    // never be quoted a false zero (throws for Premium/unverified).
    await this.#ensureAccountIndex();
    // Sourced from the venue's own per-market metadata rather than assumed:
    // Lighter standard accounts currently report 0 maker/taker fees.
    const markets = await this.#ensureMarkets();
    const market = markets.get(params.symbol);
    const feeRate = parseFloat(
      (params.isMaker ? market?.makerFee : market?.takerFee) ?? '0',
    );
    const amount = parseFloat(params.amount ?? '0');
    return {
      feeRate,
      feeAmount: Number.isFinite(amount) ? amount * feeRate : 0,
      protocolFeeRate: feeRate,
      metamaskFeeRate: 0,
      // Structurally zero on this venue, not a waiver applied to a real fee.
      chargesMetamaskBuilderFee: false,
    };
  }

  async previewPositionModify(
    _params: PositionModifyPreviewParams,
  ): Promise<PositionModifyPreviewResult> {
    return { status: 'unsupported', reason: 'provider' };
  }

  // ============================================================================
  // Live subscriptions over Lighter WebSocket channels, with REST polling
  // only as the price-stream fallback when no WebSocket transport exists.
  // ============================================================================

  subscribeToPrices(params: SubscribePricesParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#priceSubscribers.add(params);
    if (this.#lastPriceBySymbol.size > 0) {
      this.#deliverPrices(params, [...this.#lastPriceBySymbol.values()]);
    }
    this.#requestChannel('market_stats/all');
    this.#ensureStream();
    return () => {
      this.#priceSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToOICaps(params: SubscribeOICapsParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#oiCapSubscribers.add(params);
    this.#requestChannel('market_stats/all');
    this.#ensureStream();
    return () => {
      this.#oiCapSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToAccount(params: SubscribeAccountParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#accountSubscribers.add(params);
    this.#ensureAccountChannels();
    return () => {
      this.#accountSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToPositions(params: SubscribePositionsParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#positionSubscribers.add(params);
    if (this.#wsPositions.size > 0) {
      params.callback([...this.#wsPositions.values()]);
    }
    this.#ensureAccountChannels();
    return () => {
      this.#positionSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToOrders(params: SubscribeOrdersParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#orderSubscribers.add(params);
    if (this.#hasOrdersSnapshot || this.#wsOrders.size > 0) {
      params.callback([...this.#wsOrders.values()]);
    }
    this.#ensureAccountChannels();
    return () => {
      this.#orderSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToOrderFills(params: SubscribeOrderFillsParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#fillSubscribers.add(params);
    this.#ensureAccountChannels();
    const generation = this.#sessionGeneration;
    const channelsPromise = this.#accountChannelsPromise;
    // A late subscriber may join after the venue's one initial trade snapshot.
    // Replay only after authentication succeeds for the same channel session.
    channelsPromise
      ?.then(() => {
        this.#assertSession(generation);
        if (
          this.#accountChannelsPromise === channelsPromise &&
          this.#fillSubscribers.has(params) &&
          this.#wsFills !== null
        ) {
          params.callback([...this.#wsFills], true);
        }
      })
      .catch(() => undefined);
    return () => {
      this.#fillSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  // ============================================================================
  // Shared WebSocket stream manager (market_stats / user_stats /
  // account_all_positions / account_all_orders), REST polling fallback for
  // prices when no WebSocket implementation is available.
  // ============================================================================

  /**
   * Notify each order/fill subscriber without allowing one listener to stop others.
   *
   * @param error - Account channel setup failure.
   */
  readonly #notifySubscriptionError = (error: Error): void => {
    for (const [label, subscribers] of [
      ['orders', this.#orderSubscribers],
      ['fills', this.#fillSubscribers],
    ] as const) {
      for (const subscriber of subscribers) {
        try {
          subscriber.onError?.(error);
        } catch (subscriberError) {
          this.#logSubscriberError(label, subscriberError);
        }
      }
    }
  };

  /**
   * Resolve the Lighter account index and request the account-scoped
   * channels. When the venue definitively reports no Lighter account,
   * account-scoped subscribers receive an empty emission.
   */
  readonly #ensureAccountChannels = (): void => {
    if (this.#isDisconnected) {
      return;
    }
    if (this.#accountChannelsPromise) {
      this.#ensureStream();
      return;
    }
    const generation = this.#sessionGeneration;
    let channelsRequested = false;
    // Auth setup crosses awaits before consulting this promise identity.
    let setupPromise: Promise<void> | undefined = undefined;
    setupPromise = (async (): Promise<void> => {
      try {
        // Warm the margin cache before any WS position frame is adapted.
        await this.#ensureMarketMargins().catch(() => undefined);
        const accountIndex = await this.#ensureAccountIndex();
        // Address-aware: an EXTERNAL switch during the lookup (with no other
        // provider call to advance the generation) must also stop these
        // channels from being requested for the old account. The rebind
        // inside the binding call triggers its own rebuild for the new one.
        // Fails closed when no wallet account is bound — a configured
        // account index alone must never subscribe user channels.
        this.#assertSession(generation);
        this.#requestChannel(`user_stats/${accountIndex}`);
        this.#requestChannel(`account_all_positions/${accountIndex}`);
        this.#requestChannel(`account_all_trades/${accountIndex}`);
        channelsRequested = true;
        const channelAddress = this.#boundAddress;
        try {
          const auth = await this.#getAuthToken();
          this.#assertSession(generation);
          this.#requestChannel(`account_all_orders/${accountIndex}`, auth);
        } catch (error) {
          this.#deps.debugLogger.log(
            '[LighterProvider] orders channel skipped (no auth token)',
            { error: String(error) },
          );
          this.#ensureSessionBinding();
          // Signer failure retires the write generation, but this channel
          // still owns its wallet's error. A replaced channel or wallet does not.
          if (
            !this.#isDisconnected &&
            channelAddress !== null &&
            channelAddress === this.#boundAddress &&
            this.#accountChannelsPromise === setupPromise
          ) {
            this.#notifySubscriptionError(ensureError(error));
          }
          // Setup failures are not authoritative empty order state. Account
          // switches and deselection already emit their synchronous reset.
          channelsRequested = false;
        }
      } catch (error) {
        this.#deps.debugLogger.log(
          '[LighterProvider] account channels unavailable',
          { error: String(error) },
        );
        // A venue-confirmed absent account is authoritative empty state for
        // this exact wallet binding. It must settle initial subscribers so
        // clients do not render loading skeletons forever. All other failures
        // preserve the last snapshot: transport, malformed data, auth and
        // capability errors cannot prove that the account is empty.
        this.#ensureSessionBinding();
        if (
          error instanceof LighterAccountNotFoundError &&
          generation === this.#sessionGeneration
        ) {
          this.#emitAccountBindingReset();
        } else if (
          !this.#isDisconnected &&
          this.#boundAddress !== null &&
          generation === this.#sessionGeneration &&
          this.#accountChannelsPromise === setupPromise
        ) {
          this.#notifySubscriptionError(ensureError(error));
        }
        // An aborted previous-account setup has no authority over the new
        // session. Current-session failures also preserve the last known data.
        // Transport, auth, capability, and integrity failures are not
        // authoritative empty account state. Explicit account switches and
        // deselection already emit their synchronous reset.
      }
    })();
    this.#accountChannelsPromise = setupPromise;
    // A setup that never requested channels (no wallet account yet, or an
    // aborted switch) must not satisfy future ensure calls — clear it so
    // the next bind retries, without clobbering a newer session's promise.
    setupPromise
      .then(() => {
        if (
          !channelsRequested &&
          this.#accountChannelsPromise === setupPromise
        ) {
          this.#accountChannelsPromise = null;
        }
      })
      .catch(() => undefined);
    this.#ensureStream();
  };

  readonly #hasAnySubscriber = (): boolean => {
    return (
      this.#priceSubscribers.size > 0 ||
      this.#oiCapSubscribers.size > 0 ||
      this.#accountSubscribers.size > 0 ||
      this.#positionSubscribers.size > 0 ||
      this.#orderSubscribers.size > 0 ||
      this.#fillSubscribers.size > 0 ||
      [...this.#orderBookSubscribers.values()].some(
        (subscribers) => subscribers.size > 0,
      ) ||
      [...this.#candleSubscribers.values()].some(
        (subscribers) => subscribers.size > 0,
      )
    );
  };

  readonly #requestChannel = (channel: string, auth?: string): void => {
    if (this.#isDisconnected) {
      return;
    }
    if (this.#wsWantedChannels.has(channel)) {
      return;
    }
    this.#wsWantedChannels.set(channel, { auth });
    if (this.#priceWs?.readyState === 1) {
      this.#sendSubscribe(channel, auth);
    }
  };

  readonly #sendSubscribe = (channel: string, auth?: string): void => {
    this.#priceWs?.send(
      JSON.stringify(
        auth
          ? { type: 'subscribe', channel, auth }
          : { type: 'subscribe', channel },
      ),
    );
  };

  readonly #releaseChannelIfUnused = (): void => {
    if (!this.#hasAnySubscriber()) {
      this.#teardownStream();
    }
  };

  readonly #ensureStream = (): void => {
    if (this.#isDisconnected || this.#priceWs || this.#pricePollTimer) {
      return;
    }
    if (this.#webSocketCtor) {
      this.#connectWs();
    } else {
      this.#startPricePolling();
    }
  };

  readonly #connectWs = (): void => {
    if (this.#isDisconnected || !this.#webSocketCtor) {
      return;
    }
    const url = getLighterWsEndpoint(this.#isTestnet ? 'testnet' : 'mainnet');
    const WebSocketCtor = this.#webSocketCtor;
    const ws = new WebSocketCtor(url);
    this.#priceWs = ws;
    this.#setConnectionState(WebSocketConnectionState.Connecting);

    ws.onopen = (): void => {
      if (this.#isDisconnected) {
        try {
          ws.close();
        } catch {
          // The transport may already have closed during disconnect.
        }
        return;
      }
      // Observe any external switch first, then drop if this socket was
      // replaced (by that rebind or an earlier one).
      this.#ensureSessionBinding();
      if (this.#priceWs !== ws) {
        return;
      }
      const generationAtOpen = this.#sessionGeneration;
      this.#wsReconnectAttempts = 0;
      this.#setConnectionState(WebSocketConnectionState.Connected);
      for (const [channel, meta] of this.#wsWantedChannels) {
        if (meta.auth) {
          // Auth tokens are short-lived; a reconnect after the deadline must
          // re-mint instead of replaying the token captured at subscribe
          // time. #getAuthToken reuses the cached token while it is fresh.
          this.#getAuthToken()
            .then((freshToken) => {
              // The async continuation may resolve after an account switch
              // replaced the socket or the channel set: never reinsert a
              // stale channel or pair it with the new session's token.
              if (
                this.#priceWs !== ws ||
                generationAtOpen !== this.#sessionGeneration ||
                !this.#wsWantedChannels.has(channel)
              ) {
                return;
              }
              this.#wsWantedChannels.set(channel, { auth: freshToken });
              this.#sendSubscribe(channel, freshToken);
            })
            .catch((error) => {
              this.#deps.debugLogger.log(
                '[LighterProvider] auth channel resubscribe failed',
                { channel, error: String(error) },
              );
            });
        } else {
          this.#sendSubscribe(channel, meta.auth);
        }
      }
      // The server closes idle sockets; any frame under 2 minutes keeps it up.
      // Unconditional replacement: `??=` would keep a timer bound to a dead
      // socket when a new one opens before the old socket's onclose fired.
      this.#clearKeepalive();
      this.#wsKeepaliveTimer = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // Socket closing; onclose handles recovery.
        }
      }, 60_000);
      this.#deps.debugLogger.log(
        '[LighterProvider] price stream connected (ws)',
        { url, channels: [...this.#wsWantedChannels.keys()] },
      );
    };

    ws.onmessage = (event: { data: unknown }): void => {
      try {
        if (this.#isDisconnected) {
          return;
        }
        // Re-run the live binding first: an EXTERNAL account switch that no
        // provider call has observed yet must tear this socket down (the
        // rebind replaces it) before any frame routes into current UI.
        this.#ensureSessionBinding();
        // Frames from a socket that was replaced (account rebind, reconnect)
        // must never reach the router — they carry the previous session's data.
        if (this.#priceWs !== ws) {
          return;
        }
        this.#handleWsMessage(String(event.data));
      } catch (error) {
        // WebSocket callbacks run on the host event loop. Venue-data
        // integrity failures (and any other malformed frame failure) must
        // drop the whole frame rather than throw globally or emit partial
        // account/position state.
        this.#deps.debugLogger.log(
          '[LighterProvider] dropped malformed WebSocket frame',
          { error: String(error) },
        );
      }
    };

    ws.onclose = (): void => {
      if (this.#priceWs !== ws) {
        return;
      }
      this.#priceWs = null;
      this.#clearKeepalive();
      this.#setConnectionState(WebSocketConnectionState.Disconnected);
      if (this.#hasAnySubscriber()) {
        this.#deps.debugLogger.log(
          '[LighterProvider] price stream closed; reconnecting in 5s',
        );
        this.#wsReconnectAttempts += 1;
        this.#wsReconnectTimer = setTimeout((): void => {
          this.#wsReconnectTimer = null;
          this.#ensureStream();
        }, 5_000);
      }
    };

    ws.onerror = (): void => {
      this.#deps.debugLogger.log('[LighterProvider] price stream ws error');
    };
  };

  readonly #handleWsMessage = (raw: string): void => {
    let message: LighterWsMarketStatsMessage & LighterWsAccountMessage;
    try {
      message = convertKeysToCamelCase(JSON.parse(raw)) as typeof message;
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] price stream message parse failed',
        { error: String(error) },
      );
      return;
    }
    const type = message.type ?? '';
    if (type.includes('market_stats') && message.marketStats) {
      const timestamp = message.timestamp ?? Date.now();
      const updates = Object.values(message.marketStats).map((stat) =>
        adaptPriceUpdateFromLighterWsStat(stat, timestamp),
      );
      this.#dispatchPriceUpdates(updates);
      this.#dispatchOICaps(Object.values(message.marketStats));
      return;
    }
    if (type.includes('user_stats') && message.stats) {
      const accountState = adaptAccountStateFromLighterUserStats(message.stats);
      for (const subscriber of this.#accountSubscribers) {
        try {
          subscriber.callback(accountState);
        } catch (error) {
          this.#logSubscriberError('account', error);
        }
      }
      return;
    }
    if (type.includes('account_all_positions') && message.positions) {
      const isSnapshot = type.startsWith('subscribed');
      const nextPositions = isSnapshot
        ? new Map<number, Position>()
        : new Map(this.#wsPositions);
      for (const [marketId, position] of Object.entries(message.positions)) {
        const adapted = adaptPositionFromLighter(
          position,
          this.#maxLeverageForPosition(position),
        );
        if (parseFloat(adapted.size) === 0) {
          nextPositions.delete(Number(marketId));
        } else {
          nextPositions.set(Number(marketId), adapted);
        }
      }
      this.#wsPositions.clear();
      for (const [marketId, position] of nextPositions) {
        this.#wsPositions.set(marketId, position);
      }
      const positions = [...this.#wsPositions.values()];
      for (const subscriber of this.#positionSubscribers) {
        try {
          subscriber.callback(positions);
        } catch (error) {
          this.#logSubscriberError('positions', error);
        }
      }
      return;
    }
    if (type.includes('order_book')) {
      this.#handleOrderBookMessage(type, message);
      return;
    }
    if (type.includes('candle')) {
      this.#handleCandleMessage(message);
      return;
    }
    if (type.includes('account_all_trades')) {
      this.#handleTradesMessage(message);
      return;
    }
    if (type.includes('account_all_orders')) {
      if (message.orders === undefined) {
        return;
      }
      try {
        if (
          message.orders === null ||
          typeof message.orders !== 'object' ||
          Array.isArray(message.orders) ||
          !Object.values(message.orders).every(
            (rows) =>
              Array.isArray(rows) &&
              rows.every(
                (row) =>
                  row !== null &&
                  typeof row === 'object' &&
                  !Array.isArray(row),
              ),
          )
        ) {
          throw new Error(
            'Invalid Lighter venue data: malformed orders container',
          );
        }
        const isSnapshot = type.startsWith('subscribed');
        const nextOrders = isSnapshot
          ? new Map<string, Order>()
          : new Map(this.#wsOrders);
        for (const marketOrders of Object.values(message.orders)) {
          for (const order of marketOrders) {
            const adapted = adaptOrderFromLighter(
              order,
              this.#marketsById.get(order.marketIndex)?.symbol ??
                String(order.marketIndex),
            );
            const isOpen =
              adapted.status === 'queued' || adapted.status === 'open';
            if (isOpen) {
              nextOrders.set(adapted.orderId, adapted);
            } else {
              nextOrders.delete(adapted.orderId);
            }
          }
        }
        if (isSnapshot) {
          this.#hasOrdersSnapshot = true;
        }
        this.#wsOrders.clear();
        for (const [orderId, order] of nextOrders) {
          this.#wsOrders.set(orderId, order);
        }
        this.#emitToOrderSubscribers([...this.#wsOrders.values()]);
      } catch (error) {
        this.#hasOrdersSnapshot = false;
        throw error;
      }
    }
  };

  /**
   * Apply an order_book snapshot/delta and fan the assembled book out.
   *
   * @param type - Message type (subscribed = full snapshot, update = delta).
   * @param message - Camelized order_book payload.
   */
  readonly #handleOrderBookMessage = (
    type: string,
    message: LighterWsOrderBookMessage,
  ): void => {
    const channel = message.channel ?? '';
    const marketId = Number(channel.split(':')[1] ?? Number.NaN);
    if (!Number.isFinite(marketId) || !message.orderBook) {
      return;
    }
    const { nonce, beginNonce } = message.orderBook;
    if (typeof nonce !== 'number' || !Number.isSafeInteger(nonce)) {
      return;
    }
    const currentState = this.#orderBookState.get(marketId);
    let nextState: LighterOrderBookState;
    if (type.startsWith('subscribed')) {
      nextState = { bids: new Map(), asks: new Map(), nonce };
    } else if (
      !currentState ||
      typeof beginNonce !== 'number' ||
      !Number.isSafeInteger(beginNonce) ||
      beginNonce !== currentState.nonce
    ) {
      // A delta cannot be applied to an unknown or discontinuous base.
      // Drop the local book and request a new subscribed snapshot.
      this.#orderBookState.delete(marketId);
      const channelName = `order_book/${marketId}`;
      if (this.#priceWs?.readyState === 1) {
        this.#priceWs.send(
          JSON.stringify({ type: 'unsubscribe', channel: channelName }),
        );
        this.#sendSubscribe(channelName);
      }
      return;
    } else {
      nextState = {
        bids: new Map(currentState.bids),
        asks: new Map(currentState.asks),
        nonce: currentState.nonce,
      };
    }
    for (const side of ['bids', 'asks'] as const) {
      for (const level of message.orderBook[side] ?? []) {
        const price = parseStrictDecimal(level?.price);
        const size = parseStrictDecimal(level?.size);
        if (
          price === null ||
          !Number.isFinite(price) ||
          price <= 0 ||
          size === null ||
          !Number.isFinite(size) ||
          size < 0
        ) {
          throw new Error(
            `${LIGHTER_DATA_INTEGRITY_PREFIX} malformed order-book level`,
          );
        }
        if (size === 0) {
          nextState[side].delete(level.price);
        } else {
          nextState[side].set(level.price, level.size);
        }
      }
    }
    nextState.nonce = nonce;
    this.#orderBookState.set(marketId, nextState);
    const subscribers = this.#orderBookSubscribers.get(marketId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    // Levels must carry the FULL OrderBookLevel contract. The depth chart
    // draws Y-coordinates from parseFloat(level.total): a bare {price, size}
    // level renders as an SVG path full of NaN and crashes the native path
    // parser (found live on device, RNSVGPathParser InvalidNumber).
    const toContractLevels = (
      entries: [string, string][],
    ): OrderBookLevel[] => {
      let cumulativeSize = 0;
      let cumulativeNotional = 0;
      return entries.map(([price, size]) => {
        const sizeNum = Number(size);
        const notional = Number(price) * sizeNum;
        cumulativeSize += sizeNum;
        cumulativeNotional += notional;
        return {
          price,
          size,
          total: String(cumulativeSize),
          notional: String(notional),
          totalNotional: String(cumulativeNotional),
        };
      });
    };
    for (const subscriber of subscribers) {
      const levels = subscriber.levels ?? 10;
      const bids = toContractLevels(
        [...nextState.bids.entries()]
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .slice(0, levels),
      );
      const asks = toContractLevels(
        [...nextState.asks.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .slice(0, levels),
      );
      const bestBid = Number(bids[0]?.price ?? '0');
      const bestAsk = Number(asks[0]?.price ?? '0');
      const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
      const maxTotal = Math.max(
        Number(bids[bids.length - 1]?.total ?? '0'),
        Number(asks[asks.length - 1]?.total ?? '0'),
      );
      const book: OrderBookData = {
        bids,
        asks,
        spread: String(bestAsk - bestBid),
        spreadPercentage:
          mid > 0 ? String(((bestAsk - bestBid) / mid) * 100) : '0',
        midPrice: String(mid),
        lastUpdated: Date.now(),
        maxTotal: String(maxTotal),
      };
      try {
        subscriber.callback(book);
      } catch (error) {
        this.#logSubscriberError('orderBook', error);
      }
    }
  };

  /**
   * Merge live candle updates into the cached series and fan out.
   *
   * @param message - Camelized candle payload.
   */
  readonly #handleCandleMessage = (message: LighterWsCandleMessage): void => {
    const channel = message.channel ?? '';
    const [, marketIdRaw, resolution] = channel.split(':');
    const key = `${marketIdRaw}:${resolution}`;
    const series = this.#candleSeries.get(key);
    const subscribers = this.#candleSubscribers.get(key);
    if (!series || !subscribers || subscribers.size === 0) {
      return;
    }
    for (const candle of message.candles ?? []) {
      const mapped = toFiniteCandle(candle);
      if (mapped) {
        series.set(mapped.time, mapped);
      }
    }
    const candles = [...series.values()].sort((a, b) => a.time - b.time);
    for (const subscriber of subscribers) {
      try {
        subscriber.callback({
          symbol: subscriber.symbol,
          interval: subscriber.interval,
          candles,
        });
      } catch (error) {
        this.#logSubscriberError('candles', error);
      }
    }
  };

  /**
   * Adapt live account trades into OrderFill emissions.
   *
   * @param message - Camelized account_all_trades payload.
   */
  readonly #handleTradesMessage = (message: LighterWsTradesMessage): void => {
    if (message.trades === undefined) {
      return;
    }
    const isSnapshot = (message.type ?? '').startsWith('subscribed');
    if (
      message.trades === null ||
      typeof message.trades !== 'object' ||
      Array.isArray(message.trades) ||
      !Object.values(message.trades).every(
        (rows) =>
          Array.isArray(rows) &&
          rows.every(
            (row) =>
              row !== null && typeof row === 'object' && !Array.isArray(row),
          ),
      )
    ) {
      this.#wsFills = null;
      throw new Error('Invalid Lighter venue data: malformed trades container');
    }
    const fills: OrderFill[] = [];
    let droppedUnsupportedFill = false;
    for (const marketTrades of Object.values(message.trades)) {
      for (const trade of marketTrades) {
        const symbol =
          this.#marketsById.get(trade.marketId)?.symbol ??
          String(trade.marketId);
        // One adapter serves REST history and the live stream so pnl,
        // fees, and direction vocabulary can never diverge between them.
        // A capability-refused fill (unverified nonzero fee) must never be
        // rendered with a false zero fee, nor crash the event handler.
        try {
          fills.push(
            adaptFillFromLighterTrade(trade, symbol, this.#accountIndex ?? -1),
          );
        } catch (error) {
          droppedUnsupportedFill = true;
          this.#deps.debugLogger.log(
            '[LighterProvider] dropped unsupported fill from stream',
            { tradeId: trade.tradeId, error: String(error) },
          );
        }
      }
    }
    // A cache is replayable only after a complete validated snapshot.
    // Missing even one fill invalidates that authority until a new snapshot.
    if (droppedUnsupportedFill) {
      this.#wsFills = null;
    }
    if (fills.length === 0 && !isSnapshot) {
      return;
    }
    // A snapshot that lost fills to a capability refusal is PARTIAL:
    // emitting it would overwrite valid cached history with false
    // emptiness. Preserve what subscribers already have; REST reads
    // surface the capability error explicitly.
    if (isSnapshot && droppedUnsupportedFill) {
      this.#deps.debugLogger.log(
        '[LighterProvider] withholding partial fills snapshot (unsupported fills present)',
      );
      return;
    }
    if (isSnapshot || this.#wsFills !== null) {
      const history = isSnapshot ? fills : [...fills, ...(this.#wsFills ?? [])];
      const seen = new Set<string>();
      this.#wsFills = history
        .filter((fill) => {
          const id = fill.fillId;
          if (id === undefined) {
            throw new Error('Lighter fill is missing its venue trade identity');
          }
          if (seen.has(id)) {
            return false;
          }
          seen.add(id);
          return true;
        })
        .sort((first, second) => second.timestamp - first.timestamp)
        .slice(0, LIGHTER_FILL_REPLAY_LIMIT);
    }
    for (const subscriber of this.#fillSubscribers) {
      try {
        subscriber.callback(fills, isSnapshot);
      } catch (error) {
        this.#logSubscriberError('fills', error);
      }
    }
  };

  readonly #dispatchOICaps = (stats: LighterWsMarketStat[]): void => {
    if (this.#oiCapSubscribers.size === 0) {
      return;
    }
    const capped = stats
      .filter((stat) => {
        const openInterest = parseFloat(stat.openInterest ?? '0');
        const limit = parseFloat(
          (stat as { openInterestLimit?: string }).openInterestLimit ?? '0',
        );
        return limit > 0 && openInterest >= limit;
      })
      .map((stat) => stat.symbol);
    for (const subscriber of this.#oiCapSubscribers) {
      try {
        subscriber.callback(capped);
      } catch (error) {
        this.#logSubscriberError('oiCaps', error);
      }
    }
  };

  readonly #emitToOrderSubscribers = (orders: Order[]): void => {
    if (this.#isDisconnected) {
      return;
    }
    for (const subscriber of this.#orderSubscribers) {
      try {
        subscriber.callback(orders);
      } catch (error) {
        this.#logSubscriberError('orders', error);
      }
    }
  };

  readonly #logSubscriberError = (channel: string, error: unknown): void => {
    this.#deps.debugLogger.log(
      `[LighterProvider] ${channel} subscriber callback failed`,
      { error: String(error) },
    );
  };

  readonly #startPricePolling = (): void => {
    if (this.#isDisconnected || this.#pricePollTimer) {
      return;
    }
    const poll = (): void => {
      this.#emitPolledPrices().catch((error: unknown) => {
        this.#deps.debugLogger.log('[LighterProvider] price poll failed', {
          error: String(error),
        });
      });
    };
    this.#pricePollTimer = setInterval(poll, LIGHTER_PRICE_POLLING_INTERVAL_MS);
    this.#setConnectionState(WebSocketConnectionState.Connected);
    poll();
  };

  /**
   * REST fallback: fetch market stats once and fan them out.
   */
  readonly #emitPolledPrices = async (): Promise<void> => {
    if (this.#priceSubscribers.size === 0) {
      return;
    }
    const response = await this.#clientService.getOrderBookDetails();
    if (this.#isDisconnected) {
      return;
    }
    const timestamp = Date.now();
    const updates = (response.orderBookDetails ?? []).map((detail) =>
      adaptPriceUpdateFromLighter(detail, timestamp),
    );
    this.#dispatchPriceUpdates(updates);
  };

  /**
   * Fan price updates out to every subscriber, honoring symbol filters.
   *
   * @param updates - Adapted price updates for this cycle.
   */
  readonly #dispatchPriceUpdates = (updates: PriceUpdate[]): void => {
    if (this.#isDisconnected || updates.length === 0) {
      return;
    }
    for (const update of updates) {
      this.#lastPriceBySymbol.set(update.symbol, update);
    }
    for (const subscriber of this.#priceSubscribers) {
      this.#deliverPrices(subscriber, updates);
    }
  };

  readonly #deliverPrices = (
    subscriber: SubscribePricesParams,
    updates: PriceUpdate[],
  ): void => {
    if (this.#isDisconnected) {
      return;
    }
    const filtered =
      subscriber.symbols.length > 0
        ? updates.filter((update) => subscriber.symbols.includes(update.symbol))
        : updates;
    if (filtered.length === 0) {
      return;
    }
    try {
      subscriber.callback(filtered);
    } catch (error) {
      this.#logSubscriberError('prices', error);
    }
  };

  readonly #clearKeepalive = (): void => {
    if (this.#wsKeepaliveTimer) {
      clearInterval(this.#wsKeepaliveTimer);
      this.#wsKeepaliveTimer = null;
    }
  };

  readonly #teardownStream = (): void => {
    if (this.#pricePollTimer) {
      clearInterval(this.#pricePollTimer);
      this.#pricePollTimer = null;
    }
    if (this.#wsReconnectTimer) {
      clearTimeout(this.#wsReconnectTimer);
      this.#wsReconnectTimer = null;
    }
    this.#clearKeepalive();
    this.#wsWantedChannels.clear();
    this.#accountChannelsPromise = null;
    this.#wsPositions.clear();
    this.#hasOrdersSnapshot = false;
    this.#wsFills = null;
    this.#wsOrders.clear();
    this.#orderBookState.clear();
    this.#candleSeries.clear();
    this.#lastPriceBySymbol.clear();
    if (this.#priceWs) {
      const ws = this.#priceWs;
      this.#priceWs = null;
      try {
        ws.close();
      } catch {
        // Socket may already be closed.
      }
    }
    this.#setConnectionState(WebSocketConnectionState.Disconnected);
  };

  subscribeToCandles(params: SubscribeCandlesParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    let released = false;
    let seriesKey: string | null = null;
    const resolution = LIGHTER_SUPPORTED_RESOLUTIONS.has(params.interval)
      ? params.interval
      : '15m';
    this.#ensureMarkets()
      .then(async (markets) => {
        const market = markets.get(params.symbol);
        if (this.#isDisconnected || !market || released) {
          return;
        }
        seriesKey = `${market.marketId}:${resolution}`;
        // Seed with history so charts render immediately, then let the WS
        // candle channel keep the series live.
        const seeded = await this.fetchHistoricalCandles({
          symbol: params.symbol,
          interval: params.interval,
          limit: 120,
        });
        if (this.#isDisconnected || released) {
          return;
        }
        const series = new Map<number, CandleStick>();
        for (const candle of seeded.candles) {
          series.set(candle.time, candle);
        }
        this.#candleSeries.set(seriesKey, series);
        let subscribers = this.#candleSubscribers.get(seriesKey);
        if (!subscribers) {
          subscribers = new Set();
          this.#candleSubscribers.set(seriesKey, subscribers);
        }
        subscribers.add(params);
        params.callback(seeded);
        this.#requestChannel(`candle/${market.marketId}/${resolution}`);
        this.#ensureStream();
      })
      .catch((error: unknown) => {
        this.#deps.debugLogger.log('[LighterProvider] candle seed failed', {
          error: String(error),
        });
      });
    return () => {
      released = true;
      if (seriesKey !== null) {
        this.#candleSubscribers.get(seriesKey)?.delete(params);
      }
      this.#releaseChannelIfUnused();
    };
  }

  readonly fetchHistoricalCandles = async (options: {
    symbol: string;
    interval: CandlePeriod;
    limit?: number;
    endTime?: number;
  }): Promise<CandleData> => {
    const empty: CandleData = {
      symbol: options.symbol,
      interval: options.interval,
      candles: [],
    };
    try {
      const markets = await this.#ensureMarkets();
      const market = markets.get(options.symbol);
      if (!market) {
        return empty;
      }
      const resolution = LIGHTER_SUPPORTED_RESOLUTIONS.has(options.interval)
        ? options.interval
        : '15m';
      const intervalMs =
        LIGHTER_RESOLUTION_MS[resolution] ?? LIGHTER_RESOLUTION_MS['15m'];
      const limit = options.limit ?? 120;
      const endTimestamp = options.endTime ?? Date.now();
      const startTimestamp = endTimestamp - intervalMs * limit;
      const response = await this.#clientService.getCandles(
        market.marketId,
        resolution,
        startTimestamp,
        endTimestamp,
        limit,
      );
      return {
        symbol: options.symbol,
        interval: options.interval,
        candles: (response.c ?? []).flatMap((candle) => {
          const mapped = toFiniteCandle(candle);
          return mapped ? [mapped] : [];
        }),
      };
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] fetchHistoricalCandles failed',
        { error: String(error) },
      );
      return empty;
    }
  };

  subscribeToOrderBook(params: SubscribeOrderBookParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    let released = false;
    let marketId: number | null = null;
    this.#ensureMarkets()
      .then((markets) => {
        const market = markets.get(params.symbol);
        if (this.#isDisconnected || !market || released) {
          return;
        }
        marketId = market.marketId;
        let subscribers = this.#orderBookSubscribers.get(marketId);
        if (!subscribers) {
          subscribers = new Set();
          this.#orderBookSubscribers.set(marketId, subscribers);
        }
        subscribers.add(params);
        this.#requestChannel(`order_book/${marketId}`);
        this.#ensureStream();
      })
      .catch((error: unknown) => {
        if (!this.#isDisconnected && !released) {
          params.onError?.(ensureError(error));
        }
      });
    return () => {
      released = true;
      if (marketId !== null) {
        this.#orderBookSubscribers.get(marketId)?.delete(params);
      }
      this.#releaseChannelIfUnused();
    };
  }

  setLiveDataConfig(_config: Partial<LiveDataConfig>): void {
    // POC: no live data configuration
  }

  getWebSocketConnectionState(): WebSocketConnectionState {
    // REST-polling transport has no socket to report on; treat an active
    // poll loop as connected so callers don't tear down live subscriptions.
    if (!this.#webSocketCtor) {
      return this.#pricePollTimer
        ? WebSocketConnectionState.Connected
        : WebSocketConnectionState.Disconnected;
    }
    return this.#connectionState;
  }

  subscribeToConnectionState(
    listener: (
      state: WebSocketConnectionState,
      reconnectionAttempt: number,
    ) => void,
  ): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#connectionListeners.add(listener);
    listener(this.getWebSocketConnectionState(), this.#wsReconnectAttempts);
    return (): void => {
      this.#connectionListeners.delete(listener);
    };
  }

  async reconnect(): Promise<void> {
    if (this.#isDisconnected) {
      return;
    }
    const ws = this.#priceWs;
    if (ws) {
      // Detach first so the onclose handler's 5s backoff never races the
      // immediate reconnect below.
      this.#priceWs = null;
      this.#clearKeepalive();
      try {
        ws.close();
      } catch {
        // Socket may already be closed.
      }
      this.#setConnectionState(WebSocketConnectionState.Disconnected);
    }
    if (this.#wsReconnectTimer) {
      clearTimeout(this.#wsReconnectTimer);
      this.#wsReconnectTimer = null;
    }
    if (this.#hasAnySubscriber()) {
      this.#ensureStream();
    }
  }

  // ============================================================================
  // Asset Routes
  // ============================================================================

  /**
   * The venue's USDC bridge route for the active network, in AssetRoute
   * shape. Facts sourced live from `layer1BasicInfo` + venue docs (see
   * LIGHTER_BRIDGE_CONFIG).
   *
   * @param minAmount - Which venue minimum applies (deposit vs withdrawal).
   * @returns Single-element route list.
   */
  readonly #bridgeRoute = (minAmount: string): AssetRoute[] => {
    // Only the MAINNET bridge is ever advertised: the effective-testnet
    // branches return [] before reaching here (devnet L1 unreachable).
    const bridge = LIGHTER_BRIDGE_CONFIG.mainnet;
    return [
      {
        assetId: `${bridge.chainId}/erc20:${bridge.usdcContract}/default`,
        chainId: bridge.chainId,
        contractAddress: bridge.bridgeContract,
        constraints: { minAmount },
      },
    ];
  };

  getDepositRoutes(_params?: GetSupportedPathsParams): AssetRoute[] {
    // DepositService currently builds an ERC-20 transfer, while Lighter
    // requires approval plus a call to the bridge proxy's deposit method.
    // Do not advertise a route until that provider-owned transaction builder
    // exists and has integration coverage.
    return [];
  }

  getWithdrawalRoutes(params?: GetSupportedPathsParams): AssetRoute[] {
    // Same devnet-L1 reality and fail-closed network binding as deposits.
    const isTestnet = this.#isTestnet || params?.isTestnet === true;
    if (isTestnet) {
      return [];
    }
    return this.#bridgeRoute(LIGHTER_BRIDGE_CONFIG.mainnet.minWithdrawUsdc);
  }

  // ============================================================================
  // Block Explorer
  // ============================================================================

  getBlockExplorerUrl(address?: string): string {
    const baseUrl = this.#isTestnet
      ? LIGHTER_TESTNET_EXPLORER_URL
      : LIGHTER_MAINNET_EXPLORER_URL;
    return address ? `${baseUrl}/address/${address}` : baseUrl;
  }
}
