import {
  LIGHTER_ORDER_TYPE_LIMIT,
  LIGHTER_ORDER_TYPE_MARKET,
  LIGHTER_ORDER_TYPE_STOP_LOSS,
  LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
  LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME,
  LIGHTER_ORDER_EXPIRY_NONE,
  LIGHTER_MAX_WIRE_PRICE,
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
} from '../constants/lighterConfig.js';
import type { AttachedOrderGroup } from '../types/index.js';
import type {
  LighterApiOrder,
  LighterCreateOrderWireParams,
} from '../types/lighter-types.js';

/** Account-scoped immutable unsigned intent; no signed payloads or keys. */
export type LighterAttachedGroup = {
  version: 1;
  groupId: string;
  symbol: string;
  accountIndex: number;
  apiKeyIndex: number;
  submission: AttachedOrderGroup['submission'];
  orders:
    | [LighterCreateOrderWireParams, LighterCreateOrderWireParams]
    | [
        LighterCreateOrderWireParams,
        LighterCreateOrderWireParams,
        LighterCreateOrderWireParams,
      ];
  txHash: string | null;
  nonce: number | null;
  orderExpiries?: number[];
  expiresAt: number | null;
  venueIds: (string | null)[];
  /** Exact nonce-ledger settlement persisted before its evidence is retired. */
  nonAcceptance?: 'failed' | 'expired' | 'nonce-consumed';
};

/** Bounded local history; unresolved groups are never evicted. */
export const LIGHTER_ATTACHED_MAX_GROUPS = 64;
export const LIGHTER_ATTACHED_HANDLE_PREFIX = 'lighter-attached:';

const venueOrderTypes: Record<number, string> = {
  [LIGHTER_ORDER_TYPE_LIMIT]: 'limit',
  [LIGHTER_ORDER_TYPE_MARKET]: 'market',
  [LIGHTER_ORDER_TYPE_STOP_LOSS]: 'stop-loss',
  [LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT]: 'stop-loss-limit',
  [LIGHTER_ORDER_TYPE_TAKE_PROFIT]: 'take-profit',
  [LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT]: 'take-profit-limit',
};

const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isWireDecimal = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(?:0|[1-9]\d*)$/u.test(value) &&
  Number.isSafeInteger(Number(value));

const isWireOrder = (value: unknown): value is LighterCreateOrderWireParams =>
  Array.isArray(value) &&
  value.length === 10 &&
  isInteger(value[0]) &&
  isInteger(value[1]) &&
  value[1] > 0 &&
  value[1] < 2 ** 48 &&
  isWireDecimal(value[2]) &&
  isWireDecimal(value[3]) &&
  Number(value[3]) > 0 &&
  Number(value[3]) <= LIGHTER_MAX_WIRE_PRICE &&
  (value[4] === 0 || value[4] === 1) &&
  isInteger(value[5]) &&
  Object.hasOwn(venueOrderTypes, value[5]) &&
  (value[6] === LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL ||
    value[6] === LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME) &&
  (value[7] === 0 || value[7] === 1) &&
  isWireDecimal(value[8]) &&
  Number(value[8]) <= LIGHTER_MAX_WIRE_PRICE &&
  (value[9] === LIGHTER_ORDER_EXPIRY_NONE || isInteger(value[9]));

/**
 * Parse local ownership without treating corrupt storage as an empty account.
 *
 * @param raw - Serialized account journal.
 * @returns Strictly validated groups with unchanged unsigned order intent.
 */
export function parseLighterAttachedGroups(
  raw: string | null,
): LighterAttachedGroup[] {
  if (raw === null) {
    return [];
  }
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > LIGHTER_ATTACHED_MAX_GROUPS) {
    throw new Error('Invalid Lighter attached-order journal');
  }
  const ids = new Set<string>();
  const clientIds = new Set<number>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Invalid Lighter attached-order journal');
    }
    const group = item as Partial<LighterAttachedGroup>;
    if (
      group.version !== 1 ||
      typeof group.groupId !== 'string' ||
      !group.groupId.startsWith(LIGHTER_ATTACHED_HANDLE_PREFIX) ||
      typeof group.symbol !== 'string' ||
      !group.symbol ||
      !isInteger(group.accountIndex) ||
      !isInteger(group.apiKeyIndex) ||
      group.apiKeyIndex < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
      group.apiKeyIndex > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
      !['prepared', 'unknown', 'accepted', 'canceled', 'completed'].includes(
        group.submission ?? '',
      ) ||
      !Array.isArray(group.orders) ||
      ![2, 3].includes(group.orders.length) ||
      !group.orders.every(isWireOrder) ||
      !(
        group.txHash === null ||
        (typeof group.txHash === 'string' && /^[\da-f]+$/iu.test(group.txHash))
      ) ||
      !(
        group.expiresAt === null ||
        (isInteger(group.expiresAt) && group.expiresAt > 0)
      ) ||
      !Array.isArray(group.venueIds) ||
      group.venueIds.length !== group.orders.length ||
      !group.venueIds.every(
        (id) =>
          id === null || (typeof id === 'string' && /^\d{1,20}$/u.test(id)),
      )
    ) {
      throw new Error('Invalid Lighter attached-order journal');
    }
    if (
      group.nonAcceptance !== undefined &&
      (!['failed', 'expired', 'nonce-consumed'].includes(group.nonAcceptance) ||
        !['unknown', 'canceled'].includes(group.submission ?? '') ||
        group.txHash === null ||
        group.nonce === null ||
        group.expiresAt === null)
    ) {
      throw new Error('Invalid Lighter attached non-acceptance proof');
    }
    if (
      !(group.nonce === null || isInteger(group.nonce)) ||
      ((group.submission === 'unknown' ||
        group.submission === 'accepted' ||
        group.submission === 'completed') &&
        (group.txHash === null ||
          group.expiresAt === null ||
          group.nonce === null))
    ) {
      throw new Error('Invalid Lighter attached dispatch identity');
    }
    if (
      group.orderExpiries !== undefined &&
      (!Array.isArray(group.orderExpiries) ||
        group.orderExpiries.length !== group.orders.length ||
        !group.orderExpiries.every(isInteger))
    ) {
      throw new Error('Invalid Lighter attached order expiries');
    }
    if (
      (group.submission === 'unknown' ||
        group.submission === 'accepted' ||
        group.submission === 'completed') &&
      (group.orderExpiries === undefined ||
        group.orderExpiries.some((expiry, index) =>
          group.orders?.[index][9] === 0 ? expiry !== 0 : expiry <= 0,
        ))
    ) {
      throw new Error('Invalid Lighter attached signed expiries');
    }
    if (
      group.submission === 'completed' &&
      group.venueIds.some((id) => id === null)
    ) {
      throw new Error('Invalid Lighter attached completed identity');
    }
    const [parent, ...children] = group.orders;
    if (
      !parent ||
      Number(parent[2]) <= 0 ||
      ![LIGHTER_ORDER_TYPE_LIMIT, LIGHTER_ORDER_TYPE_MARKET].includes(
        parent[5],
      ) ||
      parent[7] !== 0 ||
      parent[8] !== '0' ||
      children.some(
        (child) =>
          child[0] !== parent[0] ||
          child[2] !== '0' ||
          child[4] === parent[4] ||
          child[7] !== 1 ||
          ![
            LIGHTER_ORDER_TYPE_STOP_LOSS,
            LIGHTER_ORDER_TYPE_TAKE_PROFIT,
          ].includes(child[5]) ||
          child[6] !== LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL ||
          Number(child[8]) <= 0 ||
          child[9] !== LIGHTER_ORDER_EXPIRY_NONE,
      ) ||
      new Set(group.orders.map((order) => order[1])).size !==
        group.orders.length ||
      new Set(children.map((child) => child[5])).size !== children.length ||
      ids.has(group.groupId)
    ) {
      throw new Error('Invalid Lighter attached-order intent');
    }
    for (const order of group.orders) {
      if (clientIds.has(order[1])) {
        throw new Error('Duplicate Lighter attached client identity');
      }
      clientIds.add(order[1]);
    }
    ids.add(group.groupId);
  }
  return value as LighterAttachedGroup[];
}

/**
 * Project durable intent without representing client IDs as venue IDs.
 *
 * @param group - Account-owned durable group.
 * @returns Consumer-safe identities and the last observed submission state.
 */
export function toAttachedOrderGroup(
  group: LighterAttachedGroup,
): AttachedOrderGroup {
  const [parentId, ...childIds] = group.venueIds;
  return {
    groupId: group.groupId,
    providerId: 'lighter',
    symbol: group.symbol,
    submission: group.submission,
    parentClientOrderId: String(group.orders[0][1]),
    childClientOrderIds: group.orders.slice(1).map((order) => String(order[1])),
    ...(parentId === null ? {} : { parentOrderId: parentId }),
    ...(childIds.every((id): id is string => id !== null)
      ? { childOrderIds: childIds }
      : {}),
    cancellation: 'explicit-exact-owned-orders',
  };
}

/**
 * Correlate native children by signed client IDs, never by new-book differences.
 *
 * @param group - Durable unsigned identities.
 * @param rows - Bounded authoritative active and inactive observations.
 * @returns One exact venue observation or unknown for each signed leg.
 */
export function correlateLighterAttachedOrders(
  group: LighterAttachedGroup,
  rows: LighterApiOrder[],
): (LighterApiOrder | null)[] {
  return group.orders.map((wire, index) => {
    const matches = rows.filter(
      (row) =>
        row.ownerAccountIndex === group.accountIndex &&
        row.marketIndex === wire[0] &&
        String(row.clientOrderIndex) === String(wire[1]),
    );
    if (matches.length === 0) {
      return null;
    }
    const row = matches[0];
    const id = String(row.orderIndex);
    if (
      matches.length !== 1 ||
      !/^\d{1,20}$/u.test(id) ||
      (group.venueIds[index] !== null && group.venueIds[index] !== id) ||
      row.isAsk !== (wire[4] === 1) ||
      ![0, 1, false, true].includes(row.reduceOnly) ||
      Boolean(row.reduceOnly) !== (wire[7] === 1) ||
      row.type !== venueOrderTypes[wire[5]]
    ) {
      throw new Error(
        'Lighter attached-order identity does not match signed intent',
      );
    }
    return row;
  });
}
