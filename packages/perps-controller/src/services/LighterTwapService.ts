import {
  assert,
  type,
  array,
  string,
  number,
  boolean,
  enums,
  optional,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import {
  LIGHTER_MAX_MARKET_ID,
  LIGHTER_MAX_BASE_AMOUNT,
  LIGHTER_MAX_CLIENT_ORDER_INDEX,
  LIGHTER_MAX_ORDER_PRICE,
  LIGHTER_MAX_DECIMALS,
  LIGHTER_MINUTE_MS,
  LIGHTER_NATIVE_PROBE_RECORD_LIMIT,
  LIGHTER_NATIVE_PROBE_CANCEL_LIMIT,
  LIGHTER_NATIVE_PROBE_PAGE_LIMIT,
  LIGHTER_NATIVE_PROBE_PAGE_SIZE,
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
  LIGHTER_TX_EXPIRY_SLACK_MS,
  getLighterTransactionOutcome,
} from '../constants/lighterConfig.js';
import type { PerpsPlatformDependencies } from '../types/index.js';
import type {
  LighterApiOrder,
  LighterRestTrade,
} from '../types/lighter-types.js';
import { reconcileLighterTwapObservation } from '../utils/lighterTwapReconciliation.js';
import type { LighterTwapObservation } from '../utils/lighterTwapReconciliation.js';
import type { LighterClientService } from './LighterClientService.js';
import {
  isLighterTxHash,
  isLighterTxExpiry,
} from './lighterDispatchIdentity.js';

const OwnerStruct = type({
  wallet: string(),
  network: enums(['testnet', 'mainnet']),
  accountIndex: number(),
  apiKeyIndex: number(),
});
const IntentStruct = type({
  owner: OwnerStruct,
  symbol: string(),
  marketId: number(),
  clientOrderId: string(),
  size: string(),
  price: string(),
  isBuy: boolean(),
  reduceOnly: boolean(),
  sizeDecimals: number(),
  priceDecimals: number(),
  durationMinutes: number(),
  startedAt: number(),
  orderExpiry: number(),
});
const DispatchStruct = type({
  phase: enums([
    'prepared',
    'signed',
    'attempted',
    'acknowledged',
    'succeeded',
    'failed',
  ]),
  nonce: optional(number()),
  txHash: optional(string()),
  expiresAt: optional(number()),
});
const RecordStruct = type({
  intent: IntentStruct,
  placement: DispatchStruct,
  cancellations: array(DispatchStruct),
  terminalConfirmed: boolean(),
  parentOrderId: optional(string()),
  terminalEvidence: optional(
    type({ parentOrderId: string(), status: string(), observedAt: number() }),
  ),
});
const JournalStruct = type({
  version: enums([1]),
  records: array(RecordStruct),
});

export type LighterTwapOwner = Infer<typeof OwnerStruct>;
export type LighterTwapIntent = Infer<typeof IntentStruct>;
export type LighterTwapDispatch = Infer<typeof DispatchStruct>;
export type LighterTwapRecord = Infer<typeof RecordStruct>;
export type LighterTwapDispatchIdentity = {
  nonce: number;
  txHash: string;
  expiresAt: number;
};
export type LighterTwapDispatchHooks = {
  signed: (identity: LighterTwapDispatchIdentity) => Promise<void>;
  beforeDispatch: () => Promise<void>;
  notDispatched: () => Promise<void>;
};
type Send = (hooks: LighterTwapDispatchHooks) => Promise<void>;
type Journal = Infer<typeof JournalStruct>;
export type LighterTwapReadObservation = {
  record: LighterTwapRecord;
  orders: LighterApiOrder[];
  trades: LighterRestTrade[];
  observation?: LighterTwapObservation;
  issue?: string;
};
type ReadClient = Pick<
  LighterClientService,
  | 'getOrdersByClientIds'
  | 'getActiveOrders'
  | 'getInactiveOrders'
  | 'getTrades'
  | 'getTx'
>;

const queues = new Map<string, Promise<unknown>>();

/**
 * @param row - Venue row with numeric and optional exact client ID.
 * @param clientOrderId - Persisted canonical client identity.
 * @returns Whether both available counterparts identify this schedule.
 */
function matchesClientId(row: LighterApiOrder, clientOrderId: string): boolean {
  if (
    !Number.isSafeInteger(row.clientOrderIndex) ||
    row.clientOrderIndex < 0 ||
    (row.clientOrderId !== undefined &&
      row.clientOrderId !== String(row.clientOrderIndex))
  ) {
    throw new Error('Lighter TWAP order identity is unsafe or inconsistent');
  }
  return String(row.clientOrderIndex) === clientOrderId;
}

/**
 * Validate immutable venue ownership and exact native intent, including stored
 * records. Storage corruption must never become an empty inventory.
 *
 * @param intent - New or persisted immutable intent.
 */
function validateIntent(intent: LighterTwapIntent): void {
  assert(intent, IntentStruct);
  const { owner } = intent;
  if (
    !owner.wallet ||
    owner.wallet !== owner.wallet.toLowerCase() ||
    !Number.isSafeInteger(owner.accountIndex) ||
    owner.accountIndex < 0 ||
    !Number.isSafeInteger(owner.apiKeyIndex) ||
    owner.apiKeyIndex < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
    owner.apiKeyIndex > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
    !Number.isSafeInteger(intent.marketId) ||
    intent.marketId < 0 ||
    intent.marketId > LIGHTER_MAX_MARKET_ID ||
    !/^[1-9]\d*$/u.test(intent.clientOrderId) ||
    BigInt(intent.clientOrderId) > BigInt(LIGHTER_MAX_CLIENT_ORDER_INDEX) ||
    !intent.symbol ||
    !Number.isSafeInteger(intent.startedAt) ||
    intent.startedAt <= 0 ||
    !Number.isSafeInteger(intent.durationMinutes) ||
    intent.durationMinutes <= 0 ||
    !Number.isSafeInteger(intent.orderExpiry) ||
    intent.orderExpiry !==
      intent.startedAt + intent.durationMinutes * LIGHTER_MINUTE_MS
  ) {
    throw new Error('Invalid Lighter TWAP ownership or immutable intent');
  }
  for (const [value, decimals, maximum] of [
    [intent.size, intent.sizeDecimals, LIGHTER_MAX_BASE_AMOUNT],
    [intent.price, intent.priceDecimals, LIGHTER_MAX_ORDER_PRICE],
  ] as const) {
    const integer = new BigNumber(value).shiftedBy(decimals);
    if (
      !/^\d+(?:\.\d+)?$/u.test(value) ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > LIGHTER_MAX_DECIMALS ||
      !integer.isInteger() ||
      integer.lt(1) ||
      integer.gt(maximum)
    ) {
      throw new Error('Invalid Lighter TWAP exact wire intent');
    }
  }
}

/**
 * @param owner - Durable scope.
 * @returns A delimiter-safe local journal key.
 */
function ownerKey(owner: LighterTwapOwner): string {
  return `lighterNativeTwap:${JSON.stringify([owner.network, owner.wallet, owner.accountIndex])}`;
}

/** Durable native schedules. Dispatch is supplied by the existing venue lock. */
export class LighterTwapService {
  readonly #storage: Pick<
    PerpsPlatformDependencies['diskCache'],
    'getItem' | 'setItem'
  >;
  readonly #assertCurrent: (owner: LighterTwapOwner) => void;
  readonly #terminalMappingVerified: boolean;

  constructor(options: {
    storage: Pick<
      PerpsPlatformDependencies['diskCache'],
      'getItem' | 'setItem'
    >;
    assertCurrent: (owner: LighterTwapOwner) => void;
    /** Internal rollout gate; the provider keeps this false pending venue proof. */
    terminalMappingVerified?: boolean;
  }) {
    this.#storage = options.storage;
    this.#assertCurrent = options.assertCurrent;
    this.#terminalMappingVerified = options.terminalMappingVerified ?? false;
  }

  async #locked<Result>(
    owner: LighterTwapOwner,
    action: () => Promise<Result>,
  ): Promise<Result> {
    const key = ownerKey(owner);
    const previous = queues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(action);
    queues.set(key, pending);
    try {
      return await pending;
    } finally {
      if (queues.get(key) === pending) {
        queues.delete(key);
      }
    }
  }

  async #read(owner: LighterTwapOwner): Promise<Journal> {
    this.#assertCurrent(owner);
    const raw = await this.#storage.getItem(ownerKey(owner));
    this.#assertCurrent(owner);
    if (raw === null) {
      return { version: 1, records: [] };
    }
    const parsed: unknown = JSON.parse(raw);
    assert(parsed, JournalStruct);
    const seen = new Set<string>();
    if (parsed.records.length > LIGHTER_NATIVE_PROBE_RECORD_LIMIT) {
      throw new Error('Lighter TWAP journal capacity exceeded');
    }
    for (const record of parsed.records) {
      validateIntent(record.intent);
      if (
        ownerKey(record.intent.owner) !== ownerKey(owner) ||
        seen.has(record.intent.clientOrderId)
      ) {
        throw new Error('Lighter TWAP persisted ownership mismatch');
      }
      seen.add(record.intent.clientOrderId);
      if (
        record.terminalConfirmed &&
        (!record.terminalEvidence ||
          record.terminalEvidence.parentOrderId !== record.parentOrderId ||
          !['filled', 'canceled', 'canceled-expired'].includes(
            record.terminalEvidence.status,
          ) ||
          !Number.isSafeInteger(record.terminalEvidence.observedAt) ||
          record.placement.phase !== 'succeeded')
      ) {
        throw new Error('Lighter TWAP terminal ownership evidence is invalid');
      }
      for (const dispatch of [record.placement, ...record.cancellations]) {
        if (dispatch.phase !== 'prepared' && dispatch.phase !== 'failed') {
          if (
            dispatch.nonce === undefined ||
            dispatch.txHash === undefined ||
            dispatch.expiresAt === undefined
          ) {
            throw new Error('Lighter TWAP persisted dispatch identity missing');
          }
          this.#validateIdentity({
            nonce: dispatch.nonce,
            txHash: dispatch.txHash,
            expiresAt: dispatch.expiresAt,
          });
        }
      }
    }
    return parsed;
  }

  async #write(owner: LighterTwapOwner, journal: Journal): Promise<void> {
    this.#assertCurrent(owner);
    await this.#storage.setItem(ownerKey(owner), JSON.stringify(journal));
    this.#assertCurrent(owner);
  }

  #validateIdentity(identity: LighterTwapDispatchIdentity): void {
    if (
      !Number.isSafeInteger(identity.nonce) ||
      identity.nonce < 0 ||
      !isLighterTxHash(identity.txHash) ||
      !isLighterTxExpiry(identity.expiresAt)
    ) {
      throw new Error('Invalid Lighter TWAP signed dispatch identity');
    }
  }

  async #dispatch(
    owner: LighterTwapOwner,
    journal: Journal,
    dispatch: LighterTwapDispatch,
    send: Send,
  ): Promise<void> {
    const hooks: LighterTwapDispatchHooks = {
      signed: async (identity) => {
        this.#validateIdentity(identity);
        if (dispatch.phase !== 'prepared') {
          throw new Error('Lighter TWAP dispatch already signed');
        }
        Object.assign(dispatch, identity, { phase: 'signed' });
        await this.#write(owner, journal);
      },
      beforeDispatch: async () => {
        this.#assertCurrent(owner);
        if (
          dispatch.phase !== 'signed' ||
          (dispatch.expiresAt ?? 0) <= Date.now()
        ) {
          throw new Error('Lighter TWAP signed dispatch is stale or missing');
        }
        dispatch.phase = 'attempted';
        await this.#write(owner, journal);
      },
      notDispatched: async () => {
        if (
          dispatch.phase === 'acknowledged' ||
          dispatch.phase === 'succeeded'
        ) {
          throw new Error(
            'Lighter TWAP acknowledged dispatch cannot become unsent',
          );
        }
        dispatch.phase = 'failed';
        await this.#write(owner, journal);
      },
    };
    try {
      await send(hooks);
      if (dispatch.phase !== 'attempted') {
        throw new Error('Lighter TWAP transport did not record dispatch');
      }
      dispatch.phase = 'acknowledged';
      await this.#write(owner, journal);
    } catch (error) {
      if (dispatch.phase === 'prepared' || dispatch.phase === 'signed') {
        dispatch.phase = 'failed';
        await this.#write(owner, journal);
      }
      // Attempted records survive ambiguous transport errors and restart.
      throw error;
    }
  }

  /**
   * @param owner - Current wallet/network/account scope.
   * @returns Durable records across every original signing slot, without writes.
   */
  async list(owner: LighterTwapOwner): Promise<LighterTwapRecord[]> {
    return await this.#locked(
      owner,
      async () => (await this.#read(owner)).records,
    );
  }

  /**
   * @param intent - Immutable exact schedule intent, persisted before signing.
   * @param send - Existing venue-lock transport with durable pre-send hooks.
   * @returns Recorded acknowledgment, which is not schedule completion.
   */
  async place(
    intent: LighterTwapIntent,
    send: Send,
  ): Promise<LighterTwapRecord> {
    validateIntent(intent);
    // Copy before the first await so caller mutation cannot change ownership.
    const frozenIntent: LighterTwapIntent = {
      ...intent,
      owner: { ...intent.owner },
    };
    return await this.#locked(frozenIntent.owner, async () => {
      const journal = await this.#read(frozenIntent.owner);
      if (
        journal.records.some(
          (record) =>
            record.intent.clientOrderId === frozenIntent.clientOrderId,
        )
      ) {
        throw new Error(
          'Lighter TWAP client order ID is already tracked; never replay schedules',
        );
      }
      if (journal.records.length >= LIGHTER_NATIVE_PROBE_RECORD_LIMIT) {
        throw new Error('Lighter TWAP journal capacity exceeded');
      }
      if (
        journal.records.some(
          (record) =>
            !(this.#terminalMappingVerified && record.terminalConfirmed) &&
            record.placement.phase !== 'failed',
        )
      ) {
        throw new Error(
          'An earlier Lighter TWAP schedule remains unresolved for this account',
        );
      }
      const record: LighterTwapRecord = {
        intent: frozenIntent,
        placement: { phase: 'prepared' },
        cancellations: [],
        terminalConfirmed: false,
      };
      journal.records.push(record);
      await this.#write(frozenIntent.owner, journal);
      await this.#dispatch(frozenIntent.owner, journal, record.placement, send);
      return record;
    });
  }

  /**
   * @param owner - Current account scope; original signing slot stays recorded.
   * @param clientOrderId - Exact persisted schedule identity.
   * @param send - Exact-parent cancellation transport under the venue lock.
   * @returns Cancel-requested state; acknowledgment is never terminal proof.
   */
  async cancel(
    owner: LighterTwapOwner,
    clientOrderId: string,
    send: Send,
  ): Promise<LighterTwapRecord> {
    return await this.#locked(owner, async () => {
      const journal = await this.#read(owner);
      const record = journal.records.find(
        (entry) => entry.intent.clientOrderId === clientOrderId,
      );
      if (!record) {
        throw new Error('Unknown owned Lighter TWAP schedule');
      }
      if (this.#terminalMappingVerified && record.terminalConfirmed) {
        return record;
      }
      const latest = record.cancellations.at(-1);
      if (latest && latest.phase !== 'failed') {
        throw new Error('Lighter TWAP cancellation remains unresolved');
      }
      if (record.cancellations.length >= LIGHTER_NATIVE_PROBE_CANCEL_LIMIT) {
        throw new Error('Lighter TWAP cancel attempt limit reached');
      }
      const dispatch: LighterTwapDispatch = { phase: 'prepared' };
      record.cancellations.push(dispatch);
      await this.#write(owner, journal);
      await this.#dispatch(owner, journal, dispatch, send);
      return record;
    });
  }
  /**
   * Collect read-only exact-parent, child and transaction evidence. This never
   * signs, submits, replays or treats absent orders as terminated schedules.
   *
   * @param owner - Current account ownership, fenced after every network await.
   * @param client - Validating venue read client.
   * @param token - Read token owned by this account, never persisted or returned.
   * @returns Complete observations or explicit per-record mapping uncertainty.
   */
  async observe(
    owner: LighterTwapOwner,
    client: ReadClient,
    token: string,
  ): Promise<LighterTwapReadObservation[]> {
    return await this.#locked(owner, async () => {
      const journal = await this.#read(owner);
      const results: LighterTwapReadObservation[] = [];
      for (const record of journal.records) {
        const result: LighterTwapReadObservation = {
          record,
          orders: [],
          trades: [],
        };
        results.push(result);
        const previousPlacement = { ...record.placement };
        try {
          const account = record.intent.owner.accountIndex;
          for (const dispatch of [record.placement, ...record.cancellations]) {
            if (dispatch.phase === 'prepared' || dispatch.phase === 'signed') {
              // Transport can start only after attempted is persisted.
              dispatch.phase = 'failed';
            }
            if (
              dispatch.txHash === undefined ||
              dispatch.phase === 'failed' ||
              dispatch.phase === 'succeeded'
            ) {
              continue;
            }
            const transaction = await client.getTx(dispatch.txHash);
            this.#assertCurrent(owner);
            if (transaction === null) {
              if (
                dispatch.expiresAt !== undefined &&
                Date.now() > dispatch.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
              ) {
                dispatch.phase = 'failed';
              }
              continue;
            }
            if (
              transaction.hash.toLowerCase().replace(/^0x/u, '') !==
                dispatch.txHash.toLowerCase().replace(/^0x/u, '') ||
              transaction.accountIndex !== account ||
              transaction.apiKeyIndex !== record.intent.owner.apiKeyIndex ||
              transaction.nonce !== dispatch.nonce
            ) {
              throw new Error('Lighter TWAP transaction identity mismatch');
            }
            const outcome = getLighterTransactionOutcome(transaction.status);
            if (outcome === 'executed') {
              dispatch.phase = 'succeeded';
            } else if (outcome === 'failed') {
              dispatch.phase = 'failed';
            }
          }
          const exact = await client.getOrdersByClientIds(account, token, [
            record.intent.clientOrderId,
          ]);
          this.#assertCurrent(owner);
          const active = await client.getActiveOrders(
            account,
            token,
            record.intent.marketId,
          );
          this.#assertCurrent(owner);
          const history: LighterApiOrder[] = [];
          let cursor: string | undefined;
          const cursors = new Set<string>();
          let complete = false;
          for (
            let page = 0;
            page < LIGHTER_NATIVE_PROBE_PAGE_LIMIT;
            page += 1
          ) {
            const response = await client.getInactiveOrders(
              account,
              token,
              LIGHTER_NATIVE_PROBE_PAGE_SIZE,
              cursor,
              record.intent.marketId,
            );
            this.#assertCurrent(owner);
            history.push(...response.orders);
            if (!response.nextCursor) {
              complete = true;
              break;
            }
            if (
              cursors.has(response.nextCursor) ||
              response.orders.length === 0
            ) {
              throw new Error(
                'Lighter TWAP order history pagination is incomplete',
              );
            }
            cursors.add(response.nextCursor);
            cursor = response.nextCursor;
          }
          if (!complete) {
            throw new Error(
              'Lighter TWAP order history pagination limit reached',
            );
          }
          const allRows = [...exact.orders, ...active.orders, ...history];
          const parentCandidates = allRows.filter((row) =>
            matchesClientId(row, record.intent.clientOrderId),
          );
          const parentIds = new Set(
            parentCandidates.map(
              (row) => row.orderId ?? String(row.orderIndex),
            ),
          );
          const byId = new Map<string, LighterApiOrder>();
          for (const row of allRows.filter(
            (candidate) =>
              parentCandidates.includes(candidate) ||
              parentIds.has(candidate.parentOrderId ?? '') ||
              parentIds.has(String(candidate.parentOrderIndex)),
          )) {
            const id = row.orderId ?? String(row.orderIndex);
            const previous = byId.get(id);
            if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
              throw new Error(
                'Lighter TWAP order changed during snapshot collection',
              );
            }
            byId.set(id, row);
          }
          result.orders = [...byId.values()];
          const parents = result.orders.filter((row) =>
            matchesClientId(row, record.intent.clientOrderId),
          );
          if (parents.length === 0 && record.placement.phase === 'failed') {
            result.issue =
              'Native TWAP placement definitively failed; no matching parent observed';
            continue;
          }
          if (parents.length !== 1) {
            throw new Error(
              'Lighter TWAP parent unavailable within queried history; retain obligation',
            );
          }
          const parent = parents[0];
          const parentId = parent.orderId ?? String(parent.orderIndex);
          if (record.placement.phase === 'failed') {
            throw new Error(
              'Lighter TWAP failed transaction conflicts with a visible parent',
            );
          }
          const children = result.orders.filter(
            (row) =>
              row.parentOrderId === parentId ||
              row.parentOrderIndex === parent.orderIndex,
          );
          for (const child of children) {
            const orderIndex = child.orderId ?? String(child.orderIndex);
            let tradeCursor: string | undefined;
            const tradeCursors = new Set<string>();
            let tradesComplete = false;
            for (
              let page = 0;
              page < LIGHTER_NATIVE_PROBE_PAGE_LIMIT;
              page += 1
            ) {
              const response = await client.getTrades(account, token, {
                marketId: record.intent.marketId,
                orderIndex,
                aggregate: false,
                limit: LIGHTER_NATIVE_PROBE_PAGE_SIZE,
                cursor: tradeCursor,
              });
              this.#assertCurrent(owner);
              result.trades.push(...response.trades);
              if (!response.nextCursor) {
                tradesComplete = true;
                break;
              }
              if (
                tradeCursors.has(response.nextCursor) ||
                response.trades.length === 0
              ) {
                throw new Error('Lighter TWAP trade pagination is incomplete');
              }
              tradeCursors.add(response.nextCursor);
              tradeCursor = response.nextCursor;
            }
            if (!tradesComplete) {
              throw new Error('Lighter TWAP trade pagination limit reached');
            }
          }
          const finalParent = await client.getOrdersByClientIds(
            account,
            token,
            [record.intent.clientOrderId],
          );
          this.#assertCurrent(owner);
          if (
            finalParent.orders.length !== 1 ||
            JSON.stringify(finalParent.orders[0]) !== JSON.stringify(parent)
          ) {
            throw new Error(
              'Lighter TWAP parent changed during fill collection',
            );
          }
          result.observation = reconcileLighterTwapObservation(
            record,
            result.orders,
            result.trades,
            Date.now(),
          );
          record.parentOrderId = result.observation.parentOrderId;
          if (
            this.#terminalMappingVerified &&
            result.observation.terminalObserved &&
            record.placement.phase === 'succeeded'
          ) {
            const latestCancel = record.cancellations.at(-1);
            const cancellationSettled =
              parent.status !== 'canceled' ||
              latestCancel?.phase === 'succeeded';
            const expirySettled =
              parent.status !== 'canceled-expired' ||
              Date.now() >= record.intent.orderExpiry;
            if (cancellationSettled && expirySettled) {
              record.terminalEvidence = {
                parentOrderId: parentId,
                status: parent.status,
                observedAt: Date.now(),
              };
              record.terminalConfirmed = true;
            }
          }
          // Without the verified mapping gate, retain the cleanup obligation
          // even when the native parent currently appears terminal.
        } catch (error) {
          this.#assertCurrent(owner);
          // An inconsistent/incomplete snapshot must not release an obligation
          // based on only the earlier transaction half of the observation.
          // Required order reads did not complete consistently. Transaction
          // failure alone cannot release placement while a parent may exist.
          // Cancellation outcomes remain independent and are preserved.
          record.placement = previousPlacement;
          result.issue = error instanceof Error ? error.message : String(error);
        }
      }
      await this.#write(owner, journal);
      return results;
    });
  }
}
