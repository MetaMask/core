import {
  assert,
  object,
  string,
  number,
  boolean,
  enums,
  optional,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { base64ToBytes, bytesToBase64 } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  LIGHTER_MAX_BASE_AMOUNT,
  LIGHTER_MAX_ORDER_ID,
  LIGHTER_MAX_WIRE_PRICE,
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
} from '../constants/lighterConfig.js';
import { isLighterTxHash } from '../services/lighterDispatchIdentity.js';
import type { OrderParams, OrderResult } from '../types/index.js';
import type {
  LighterEditableOrder,
  LighterOrderBookMeta,
  LighterSignModifyOrderWireParams,
} from '../types/lighter-types.js';
import { adaptOrderStatus } from './lighterAdapter.js';
import { parseLighterLosslessJson } from './lighterLosslessJson.js';

const MODIFY_MARKET_MAX = 32_767;
const MODIFY_EXPIRY_OFFSET_MS = 599_000;
const MODIFY_SIGNATURE_BYTES = 80;
export const LIGHTER_EDIT_JOURNAL_PREFIX = 'lighterNativeEdit:';

/** Exact order identity accepted by the embedded int64 signer.
 * @param value - Caller or venue identity.
 * @returns Canonical positive decimal identity.
 */
export function lighterEditOrderId(value: unknown): string {
  if (
    typeof value === 'number' &&
    (!Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new Error('Lighter edit requires a lossless order identity');
  }
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^[1-9]\d*$/u.test(String(value)) ||
    String(value).length > 19 ||
    BigInt(value) > BigInt(LIGHTER_MAX_ORDER_ID)
  ) {
    throw new Error('Lighter edit order identity is invalid');
  }
  return String(value);
}

/** Strict fixed-grid integerization without truncation or unsigned wrapping.
 * @param value - Exact decimal quantity or price.
 * @param decimals - Current venue grid.
 * @param maximum - Embedded signer width.
 * @returns Exact integer accepted by the JavaScript ABI.
 */
function units(
  value: string,
  decimals: number,
  maximum: string | number,
): number {
  if (
    typeof value !== 'string' ||
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    !/^\d+(?:\.\d+)?$/u.test(value)
  ) {
    throw new Error('Lighter edit grid or decimal is invalid');
  }
  const result = new BigNumber(value).shiftedBy(decimals);
  if (
    !result.isInteger() ||
    result.lt(1) ||
    result.gt(maximum) ||
    result.gt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error('Lighter edit value is outside its exact native grid');
  }
  return result.toNumber();
}

/** Validated immutable edit intent; no signature or secret is persisted. */
export type LighterNativeEditIntent = {
  symbol: string;
  orderId: string;
  marketIndex: number;
  price: string;
  size: string;
  priceInt: number;
  sizeInt: number;
  isAsk: boolean;
  reduceOnly: boolean;
  timeInForce: string;
};

/** Refuse unsupported order identities or mutations the ABI cannot encode.
 * @param params - Explicit replacement fields.
 * @param row - Fresh exact ordinary resting target.
 * @param market - Refreshed active perpetual metadata.
 * @param accountIndex - Captured venue account.
 * @returns Exact unsigned edit intent.
 */
export function prepareLighterNativeEdit(
  params: OrderParams,
  row: LighterEditableOrder,
  market: LighterOrderBookMeta,
  accountIndex: number,
): LighterNativeEditIntent {
  const allowed = new Set([
    'symbol',
    'isBuy',
    'size',
    'price',
    'orderType',
    'reduceOnly',
    'timeInForce',
    'providerId',
    'trackingData',
  ]);
  if (
    Object.entries(params).some(
      ([key, value]) => value !== undefined && !allowed.has(key),
    )
  ) {
    throw new Error('Lighter native edit contains unsupported order fields');
  }
  const orderId = lighterEditOrderId(row.orderIndex);
  if (
    !Number.isSafeInteger(accountIndex) ||
    accountIndex < 0 ||
    accountIndex > Number(LIGHTER_MAX_BASE_AMOUNT) ||
    !Number.isSafeInteger(row.clientOrderIndex) ||
    row.clientOrderIndex <= 0 ||
    row.clientOrderIndex > Number(LIGHTER_MAX_BASE_AMOUNT) ||
    !Number.isSafeInteger(row.orderExpiry) ||
    row.orderExpiry < 0 ||
    (row.orderExpiry !== 0 && row.orderExpiry <= Date.now())
  ) {
    throw new Error('Lighter editable target identity or expiry is invalid');
  }
  if (
    row.orderId !== undefined &&
    lighterEditOrderId(row.orderId) !== orderId
  ) {
    throw new Error('Lighter edit order identities disagree');
  }
  const reduceOnly = row.reduceOnly === true || row.reduceOnly === 1;
  if (
    (params.providerId !== undefined && params.providerId !== 'lighter') ||
    typeof params.isBuy !== 'boolean' ||
    typeof row.isAsk !== 'boolean' ||
    market.status !== 'active' ||
    market.marketType !== 'perp' ||
    !Number.isSafeInteger(market.marketId) ||
    market.marketId < 0 ||
    market.marketId > MODIFY_MARKET_MAX ||
    market.marketId === 255 ||
    row.marketIndex !== market.marketId ||
    row.ownerAccountIndex !== accountIndex ||
    params.symbol !== market.symbol ||
    params.orderType !== 'limit' ||
    row.type !== 'limit' ||
    row.status !== 'open' ||
    params.isBuy === row.isAsk ||
    ![0, 1, false, true].includes(row.reduceOnly) ||
    (params.reduceOnly !== undefined && params.reduceOnly !== reduceOnly)
  ) {
    throw new Error(
      'Lighter edit requires the same active ordinary limit identity',
    );
  }
  const tifByVenue: Record<string, string> = {
    'good-till-time': 'GTC',
    'post-only': 'ALO',
  };
  const tif = tifByVenue[row.timeInForce] ?? null;
  if (
    tif === null ||
    (params.timeInForce !== undefined && params.timeInForce !== tif) ||
    [
      row.parentOrderId,
      row.toCancelOrderId0,
      row.toTriggerOrderId0,
      row.toTriggerOrderId1,
    ].some((id) => id !== undefined && id !== '' && id !== '0') ||
    (row.parentOrderIndex !== undefined &&
      String(row.parentOrderIndex) !== '0') ||
    (row.triggerPrice !== undefined &&
      !new BigNumber(row.triggerPrice).isZero())
  ) {
    throw new Error(
      'Lighter native edit cannot change linked or trigger protection',
    );
  }
  // The pinned ABI has no order-version input. Refuse prior fills rather than
  // guessing whether its amount would replace total or remaining exposure.
  if (
    !new BigNumber(row.initialBaseAmount).eq(row.remainingBaseAmount) ||
    row.filledBaseAmount === undefined ||
    !new BigNumber(row.filledBaseAmount).isZero()
  ) {
    throw new Error('Lighter edit requires an unfilled resting order');
  }
  const price = params.price ?? row.price;
  const size = params.size ?? row.remainingBaseAmount;
  const priceInt = units(
    price,
    market.supportedPriceDecimals,
    LIGHTER_MAX_WIRE_PRICE,
  );
  const sizeInt = units(
    size,
    market.supportedSizeDecimals,
    LIGHTER_MAX_BASE_AMOUNT,
  );
  if (
    !new BigNumber(market.minBaseAmount).gt(0) ||
    !new BigNumber(market.minQuoteAmount).gt(0) ||
    new BigNumber(size).lt(market.minBaseAmount) ||
    new BigNumber(size).times(price).lt(market.minQuoteAmount)
  ) {
    throw new Error('Lighter edited order is below venue minimums');
  }
  if (
    new BigNumber(price).eq(row.price) &&
    new BigNumber(size).eq(row.initialBaseAmount)
  ) {
    throw new Error('Lighter native edit requires a changed price or size');
  }
  return {
    symbol: market.symbol,
    orderId,
    marketIndex: market.marketId,
    price: new BigNumber(price).toFixed(),
    size: new BigNumber(size).toFixed(),
    priceInt,
    sizeInt,
    isAsk: row.isAsk,
    reduceOnly,
    timeInForce: row.timeInForce,
  };
}

/** Validate the actual signed response while preserving original transport bytes.
 * @param result - Untrusted bridge result.
 * @param tuple - Exact seven-position request.
 * @param apiKeyIndex - Captured initialized signer slot.
 * @param startedAt - Host time before signing.
 * @param completedAt - Host time after signing.
 * @returns Exact original payload plus validated dispatch identity.
 */
export function decodeLighterModifyOrder(
  result: unknown,
  tuple: LighterSignModifyOrderWireParams,
  apiKeyIndex: number,
  startedAt: number,
  completedAt: number,
): { txInfo: string; txHash: string; expiresAt: number } {
  const fail = (): never => {
    throw new Error('Lighter native edit signer response is invalid');
  };
  if (
    !Array.isArray(tuple) ||
    tuple.length !== 7 ||
    !Number.isSafeInteger(tuple[0]) ||
    tuple[0] < 0 ||
    tuple[0] > Number(LIGHTER_MAX_BASE_AMOUNT) ||
    !Number.isSafeInteger(tuple[1]) ||
    tuple[1] < 0 ||
    tuple[1] > MODIFY_MARKET_MAX ||
    tuple[1] === 255 ||
    lighterEditOrderId(tuple[2]) !== tuple[2] ||
    !Number.isSafeInteger(tuple[3]) ||
    tuple[3] <= 0 ||
    tuple[3] > Number(LIGHTER_MAX_BASE_AMOUNT) ||
    !Number.isSafeInteger(tuple[4]) ||
    tuple[4] <= 0 ||
    tuple[4] > LIGHTER_MAX_WIRE_PRICE ||
    tuple[5] !== 0 ||
    !Number.isSafeInteger(tuple[6]) ||
    tuple[6] < 0 ||
    !Number.isSafeInteger(apiKeyIndex) ||
    apiKeyIndex < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
    apiKeyIndex > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
    !Number.isSafeInteger(startedAt) ||
    startedAt <= 0 ||
    !Number.isSafeInteger(completedAt) ||
    completedAt < startedAt
  ) {
    return fail();
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return fail();
  }
  const response = result as Record<string, unknown>;
  if (
    Object.keys(response).sort().join(',') !== 'txHash,txInfo' ||
    typeof response.txInfo !== 'string' ||
    !isLighterTxHash(response.txHash)
  ) {
    return fail();
  }
  const decoded = parseLighterLosslessJson(response.txInfo);
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return fail();
  }
  const tx = decoded as Record<string, unknown>;
  const expected = {
    AccountIndex: tuple[0],
    ApiKeyIndex: apiKeyIndex,
    MarketIndex: tuple[1],
    Index: tuple[2],
    BaseAmount: tuple[3],
    Price: tuple[4],
    TriggerPrice: tuple[5],
    Nonce: tuple[6],
  };
  if (
    Object.keys(tx).sort().join(',') !==
      [...Object.keys(expected), 'ExpiredAt', 'Sig', 'L2TxAttributes']
        .sort()
        .join(',') ||
    tx.L2TxAttributes !== null
  ) {
    return fail();
  }
  for (const [key, wanted] of Object.entries(expected)) {
    const actual = tx[key];
    if (
      !(
        (typeof actual === 'number' &&
          Number.isSafeInteger(actual) &&
          actual >= 0) ||
        (typeof actual === 'string' && /^(?:0|[1-9]\d*)$/u.test(actual))
      ) ||
      BigInt(actual) !== BigInt(wanted)
    ) {
      return fail();
    }
  }
  if (
    typeof tx.ExpiredAt !== 'number' ||
    !Number.isSafeInteger(tx.ExpiredAt) ||
    tx.ExpiredAt < startedAt + MODIFY_EXPIRY_OFFSET_MS ||
    tx.ExpiredAt > completedAt + MODIFY_EXPIRY_OFFSET_MS ||
    typeof tx.Sig !== 'string'
  ) {
    return fail();
  }
  try {
    const bytes = base64ToBytes(tx.Sig);
    if (
      bytes.length !== MODIFY_SIGNATURE_BYTES ||
      bytesToBase64(bytes) !== tx.Sig
    ) {
      return fail();
    }
  } catch {
    return fail();
  }
  return {
    txInfo: response.txInfo,
    txHash: response.txHash,
    expiresAt: tx.ExpiredAt,
  };
}

const TargetStruct = object({
  orderId: string(),
  clientOrderId: string(),
  marketIndex: number(),
  accountIndex: number(),
  price: string(),
  size: string(),
  isAsk: boolean(),
  reduceOnly: boolean(),
  timeInForce: string(),
  orderExpiry: number(),
});
const IntentStruct = object({
  symbol: string(),
  orderId: string(),
  marketIndex: number(),
  price: string(),
  size: string(),
  priceInt: number(),
  sizeInt: number(),
  isAsk: boolean(),
  reduceOnly: boolean(),
  timeInForce: string(),
});
const EditJournalStruct = object({
  version: enums([1]),
  wallet: string(),
  network: enums(['testnet', 'mainnet']),
  accountIndex: number(),
  apiKeyIndex: number(),
  startedAt: number(),
  original: TargetStruct,
  intent: IntentStruct,
  phase: enums(['prepared', 'signed', 'attempted', 'accepted']),
  status: enums(['pending', 'settled', 'failed', 'terminal']),
  nonce: optional(number()),
  txHash: optional(string()),
  expiresAt: optional(number()),
  resolution: optional(enums(['executed', 'failed', 'expired', 'unsent'])),
  observation: optional(
    object({
      price: string(),
      size: string(),
      remainingSize: string(),
      filledSize: string(),
      status: string(),
    }),
  ),
});
export type LighterNativeEditJournal = Infer<typeof EditJournalStruct>;
export type LighterNativeEditTarget = Infer<typeof TargetStruct>;

/** Capture only plain immutable target fields; never persist raw venue data or signed payloads.
 * @param row - Verified active target.
 * @returns Exact original fingerprint.
 */
export function lighterNativeEditTarget(
  row: LighterEditableOrder,
): LighterNativeEditTarget {
  return {
    orderId: lighterEditOrderId(row.orderIndex),
    clientOrderId: String(row.clientOrderIndex),
    marketIndex: row.marketIndex,
    accountIndex: row.ownerAccountIndex,
    price: row.price,
    size: row.initialBaseAmount,
    isAsk: row.isAsk,
    reduceOnly: row.reduceOnly === 1 || row.reduceOnly === true,
    timeInForce: row.timeInForce,
    orderExpiry: row.orderExpiry,
  };
}

/** Reject malformed or foreign durable attempts instead of clearing retry obligations.
 * @param raw - Local journal text.
 * @param scope - Issuing wallet/network/account/order identity.
 * @returns Validated retained obligation, or null for absent storage.
 */
export function parseLighterNativeEditJournal(
  raw: string | null,
  scope: {
    wallet: string;
    network: 'testnet' | 'mainnet';
    accountIndex: number;
    orderId: string;
  },
): LighterNativeEditJournal | null {
  if (raw === null) {
    return null;
  }
  const record: unknown = parseLighterLosslessJson(raw);
  assert(record, EditJournalStruct);
  if (
    record.wallet !== scope.wallet ||
    record.network !== scope.network ||
    record.accountIndex !== scope.accountIndex ||
    !Number.isSafeInteger(scope.accountIndex) ||
    scope.accountIndex < 0 ||
    scope.accountIndex > Number(LIGHTER_MAX_BASE_AMOUNT) ||
    record.intent.symbol.length === 0 ||
    record.intent.symbol.length > 100 ||
    record.original.accountIndex !== scope.accountIndex ||
    record.original.orderId !== scope.orderId ||
    record.intent.orderId !== scope.orderId ||
    record.intent.marketIndex !== record.original.marketIndex ||
    record.intent.isAsk !== record.original.isAsk ||
    record.intent.reduceOnly !== record.original.reduceOnly ||
    record.intent.timeInForce !== record.original.timeInForce ||
    !Number.isSafeInteger(record.startedAt) ||
    record.startedAt <= 0 ||
    !Number.isSafeInteger(record.apiKeyIndex) ||
    record.apiKeyIndex < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
    record.apiKeyIndex > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
    !/^[1-9]\d*$/u.test(record.original.clientOrderId) ||
    record.original.clientOrderId.length > 15 ||
    BigInt(record.original.clientOrderId) > BigInt(LIGHTER_MAX_BASE_AMOUNT) ||
    !Number.isSafeInteger(record.intent.marketIndex) ||
    record.intent.marketIndex < 0 ||
    record.intent.marketIndex > MODIFY_MARKET_MAX ||
    record.intent.marketIndex === 255 ||
    !Number.isSafeInteger(record.original.orderExpiry) ||
    record.original.orderExpiry < 0 ||
    !['good-till-time', 'post-only'].includes(record.original.timeInForce)
  ) {
    throw new Error('Lighter native edit journal ownership is corrupt');
  }
  lighterEditOrderId(scope.orderId);
  for (const value of [
    record.original.price,
    record.original.size,
    record.intent.price,
    record.intent.size,
  ]) {
    if (
      !/^\d+(?:\.\d+)?$/u.test(value) ||
      !new BigNumber(value).gt(0) ||
      !new BigNumber(value).isFinite()
    ) {
      throw new Error('Lighter native edit journal quantity is corrupt');
    }
  }
  if (
    !Number.isSafeInteger(record.intent.priceInt) ||
    record.intent.priceInt <= 0 ||
    record.intent.priceInt > LIGHTER_MAX_WIRE_PRICE ||
    !Number.isSafeInteger(record.intent.sizeInt) ||
    record.intent.sizeInt <= 0 ||
    record.intent.sizeInt > Number(LIGHTER_MAX_BASE_AMOUNT) ||
    (record.phase !== 'prepared' &&
      (!Number.isSafeInteger(record.nonce) ||
        (record.nonce ?? -1) < 0 ||
        !isLighterTxHash(record.txHash) ||
        !Number.isSafeInteger(record.expiresAt) ||
        (record.expiresAt ?? 0) <= record.startedAt))
  ) {
    throw new Error('Lighter native edit journal dispatch is corrupt');
  }
  if (record.observation) {
    adaptOrderStatus(record.observation.status);
    for (const value of [
      record.observation.price,
      record.observation.size,
      record.observation.remainingSize,
      record.observation.filledSize,
    ]) {
      if (
        !/^\d+(?:\.\d+)?$/u.test(value) ||
        !new BigNumber(value).isFinite() ||
        new BigNumber(value).isNegative()
      ) {
        throw new Error('Lighter native edit observation is corrupt');
      }
    }
  }
  if (
    (record.phase === 'prepared' &&
      (record.nonce !== undefined ||
        record.txHash !== undefined ||
        record.expiresAt !== undefined)) ||
    (record.status === 'pending' &&
      record.resolution !== undefined &&
      record.resolution !== 'executed') ||
    (record.status === 'failed' &&
      !['failed', 'expired', 'unsent'].includes(record.resolution ?? '')) ||
    (['settled', 'terminal'].includes(record.status) &&
      (record.resolution !== 'executed' ||
        !['attempted', 'accepted'].includes(record.phase)))
  ) {
    throw new Error('Lighter native edit resolution is corrupt');
  }
  if (
    (record.status === 'settled' &&
      (record.observation?.status !== 'open' ||
        !new BigNumber(record.observation.price).eq(record.intent.price) ||
        !new BigNumber(record.observation.size).eq(record.intent.size) ||
        !new BigNumber(record.observation.filledSize).isZero() ||
        !new BigNumber(record.observation.remainingSize).eq(
          record.intent.size,
        ))) ||
    (record.status === 'terminal' &&
      (!record.observation ||
        !['filled', 'canceled', 'rejected'].includes(
          adaptOrderStatus(record.observation.status),
        )))
  ) {
    throw new Error('Lighter native edit settlement is corrupt');
  }
  return record;
}

/**
 * Validate an exact same-order observation without inventing missing fills.
 * @param row - Exact client lookup result.
 * @param record - Original edit ownership and immutable target.
 * @returns Safe observed fields, independent of transaction settlement.
 */
export function observeLighterNativeEdit(
  row: LighterEditableOrder,
  record: LighterNativeEditJournal,
): NonNullable<LighterNativeEditJournal['observation']> {
  const { original } = record;
  if (
    lighterEditOrderId(row.orderIndex) !== original.orderId ||
    (row.orderId !== undefined &&
      lighterEditOrderId(row.orderId) !== original.orderId) ||
    String(row.clientOrderIndex) !== original.clientOrderId ||
    row.ownerAccountIndex !== original.accountIndex ||
    row.marketIndex !== original.marketIndex ||
    row.isAsk !== original.isAsk ||
    ![0, 1, false, true].includes(row.reduceOnly) ||
    (row.reduceOnly === 1 || row.reduceOnly === true) !== original.reduceOnly ||
    row.timeInForce !== original.timeInForce ||
    row.orderExpiry !== original.orderExpiry ||
    row.type !== 'limit' ||
    [
      row.parentOrderId,
      row.toCancelOrderId0,
      row.toTriggerOrderId0,
      row.toTriggerOrderId1,
    ].some((id) => id !== undefined && id !== '' && id !== '0') ||
    (row.parentOrderIndex !== undefined &&
      String(row.parentOrderIndex) !== '0') ||
    (row.triggerPrice !== undefined &&
      !new BigNumber(row.triggerPrice).isZero())
  ) {
    throw new Error('Lighter native edit observation has a different identity');
  }
  for (const value of [
    row.price,
    row.initialBaseAmount,
    row.remainingBaseAmount,
    row.filledBaseAmount,
  ]) {
    if (
      typeof value !== 'string' ||
      !/^\d+(?:\.\d+)?$/u.test(value) ||
      !new BigNumber(value).isFinite() ||
      new BigNumber(value).isNegative()
    ) {
      throw new Error('Lighter native edit observation is incomplete');
    }
  }
  const status = adaptOrderStatus(row.status);
  if (
    !new BigNumber(row.price).gt(0) ||
    !new BigNumber(row.initialBaseAmount).gt(0) ||
    new BigNumber(row.remainingBaseAmount)
      .plus(row.filledBaseAmount ?? '')
      .gt(row.initialBaseAmount) ||
    (status === 'open' &&
      !new BigNumber(row.remainingBaseAmount)
        .plus(row.filledBaseAmount ?? '')
        .eq(row.initialBaseAmount)) ||
    (status === 'filled' &&
      (!new BigNumber(row.remainingBaseAmount).isZero() ||
        !new BigNumber(row.filledBaseAmount ?? '').eq(row.initialBaseAmount)))
  ) {
    throw new Error('Lighter native edit observation quantities disagree');
  }
  return {
    price: row.price,
    size: row.initialBaseAmount,
    remainingSize: row.remainingBaseAmount,
    filledSize: row.filledBaseAmount ?? '',
    status: row.status,
  };
}

/**
 * Project only the edit intent and verified observation. A retry may request
 * different fields; resolving earlier intent must not report that new intent done.
 * @param record - Validated durable outcome.
 * @param params - Current caller request.
 * @returns Existing order result with additive edit state.
 */
export function lighterNativeEditResult(
  record: LighterNativeEditJournal,
  params: OrderParams,
): OrderResult {
  const allowed = new Set([
    'symbol',
    'isBuy',
    'size',
    'price',
    'orderType',
    'reduceOnly',
    'timeInForce',
    'providerId',
    'trackingData',
  ]);
  const sameIntent =
    params.symbol === record.intent.symbol &&
    (params.providerId === undefined || params.providerId === 'lighter') &&
    !Object.entries(params).some(
      ([key, value]) => value !== undefined && !allowed.has(key),
    ) &&
    params.orderType === 'limit' &&
    params.isBuy === !record.intent.isAsk &&
    (params.price === undefined ||
      new BigNumber(params.price).eq(record.intent.price)) &&
    (params.size === undefined ||
      new BigNumber(params.size).eq(record.intent.size)) &&
    (params.reduceOnly === undefined ||
      params.reduceOnly === record.intent.reduceOnly) &&
    (params.timeInForce === undefined ||
      params.timeInForce ===
        (record.intent.timeInForce === 'post-only' ? 'ALO' : 'GTC'));
  const success = record.status === 'settled' && sameIntent;
  return {
    success,
    orderId: record.original.orderId,
    providerId: 'lighter',
    orderEdit: {
      status: record.status,
      requestedPrice: record.intent.price,
      requestedSize: record.intent.size,
      ...(record.observation
        ? {
            observation: {
              ...record.observation,
              status: adaptOrderStatus(record.observation.status),
            },
          }
        : {}),
    },
    ...(success
      ? {}
      : {
          error: sameIntent
            ? `Lighter native edit is ${record.status}; refresh this exact order before retrying`
            : 'An earlier Lighter edit was reconciled; the different requested edit was not submitted',
        }),
  };
}
