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

import { BASIS_POINTS_DIVISOR } from '../constants/hyperLiquidConfig.js';
import {
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_MARKET_ID,
  LIGHTER_MAX_DECIMALS,
  LIGHTER_MAX_BASE_AMOUNT,
  LIGHTER_MAX_ORDER_PRICE,
  LIGHTER_MAX_CLIENT_ORDER_INDEX,
  LIGHTER_NATIVE_PROBE_RECORD_LIMIT,
  LIGHTER_NATIVE_PROBE_CANCEL_LIMIT,
  LIGHTER_NATIVE_PROBE_MAX_NOTIONAL,
  LIGHTER_CHASE_MIN_INTERVAL_MS,
  LIGHTER_CHASE_MAX_DURATION_MS,
  LIGHTER_CHASE_MAX_REPRICINGS,
  LIGHTER_CHASE_MAX_DISTANCE_BPS,
  LIGHTER_CHASE_QUOTE_MAX_AGE_MS,
  LIGHTER_CHASE_HANDLE_MAX_LENGTH,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
} from '../constants/lighterConfig.js';
import type {
  ChaseOrder,
  ChaseOrderStatus,
  PerpsPlatformDependencies,
} from '../types/index.js';
import type { LighterChaseChildObservation } from '../utils/lighterChase.js';
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
  handle: string(),
  symbol: string(),
  marketId: number(),
  isBuy: boolean(),
  reduceOnly: boolean(),
  originalSize: string(),
  arrivalPrice: string(),
  sizeDecimals: number(),
  priceDecimals: number(),
  startedAt: number(),
  intervalMs: number(),
  maxDurationMs: number(),
  maxRepricings: number(),
  maxDistanceBps: number(),
  maxNotional: string(),
  minBaseAmount: string(),
  minQuoteAmount: string(),
});
const DispatchStruct = type({
  phase: enums(['prepared', 'signed', 'attempted', 'acknowledged', 'failed']),
  nonce: optional(number()),
  txHash: optional(string()),
  expiresAt: optional(number()),
});
const ObservationStruct = type({
  orderId: string(),
  terminal: boolean(),
  filledSize: string(),
  filledNotional: string(),
  remainingSize: string(),
});
const ChildStruct = type({
  clientOrderId: string(),
  size: string(),
  price: string(),
  quotedAt: number(),
  placement: DispatchStruct,
  cancellations: array(DispatchStruct),
  observation: optional(ObservationStruct),
});
const StatusStruct = enums([
  'active',
  'termination_pending',
  'backgrounded',
  'max_distance_reached',
  'duration_reached',
  'repricing_limit_reached',
  'filled',
  'canceled',
  'failed',
]);
const RecordStruct = type({
  intent: IntentStruct,
  children: array(ChildStruct),
  status: StatusStruct,
  stopReason: optional(StatusStruct),
  repricings: number(),
  lastTickAt: number(),
  executedSize: string(),
  executedNotional: string(),
  error: optional(string()),
});
const JournalStruct = type({
  version: enums([1]),
  records: array(RecordStruct),
});

export type LighterChaseOwner = Infer<typeof OwnerStruct>;
export type LighterChaseIntent = Infer<typeof IntentStruct>;
export type LighterChaseDispatch = Infer<typeof DispatchStruct>;
export type LighterChaseChild = Infer<typeof ChildStruct>;
export type LighterChaseRecord = Infer<typeof RecordStruct>;
type Journal = Infer<typeof JournalStruct>;
export type LighterChaseDispatchHooks = {
  signed: (identity: {
    nonce: number;
    txHash: string;
    expiresAt: number;
  }) => Promise<void>;
  beforeDispatch: () => Promise<void>;
  notDispatched: () => Promise<void>;
};
export type LighterChaseIo = {
  assertCurrent: () => void;
  now: () => number;
  allocateClientId: () => string;
  quote: () => Promise<string>;
  place: (
    child: LighterChaseChild,
    hooks: LighterChaseDispatchHooks,
  ) => Promise<void>;
  cancel: (
    child: LighterChaseChild,
    hooks: LighterChaseDispatchHooks,
  ) => Promise<void>;
  observe: (
    child: LighterChaseChild,
  ) => Promise<LighterChaseChildObservation | null>;
};
/** Accepted dispatches may precede their exact order snapshot. */
export class LighterChaseObservationPendingError extends Error {}

const queues = new Map<string, Promise<unknown>>();

/**
 * @param owner - Durable account scope; each record separately binds its original key.
 * @returns Collision-safe storage/lock key.
 */
function ownerKey(owner: LighterChaseOwner): string {
  return `lighterChase:${JSON.stringify([owner.network, owner.wallet, owner.accountIndex])}`;
}

/**
 * @param value - Exact decimal string.
 * @returns Finite nonnegative decimal, never a coerced zero.
 */
function amount(value: string): BigNumber {
  if (!/^\d+(?:\.\d+)?$/u.test(value)) {
    throw new Error('Invalid Lighter Chase amount');
  }
  const result = new BigNumber(value);
  if (!result.isFinite() || result.isNegative()) {
    throw new Error('Invalid Lighter Chase amount');
  }
  return result;
}

/**
 * @param value - Native exact value.
 * @param decimals - Native fixed precision.
 * @param maximum - Native integer upper bound.
 */
function validateWire(value: string, decimals: number, maximum: string): void {
  const units = amount(value).shiftedBy(decimals);
  if (
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > LIGHTER_MAX_DECIMALS ||
    !units.isInteger() ||
    units.lt(1) ||
    units.gt(maximum)
  ) {
    throw new Error('Invalid Lighter Chase wire amount');
  }
}

/**
 * @param intent - Immutable new or persisted intent.
 */
function validateIntent(intent: LighterChaseIntent): void {
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
    !intent.handle ||
    intent.handle.length > LIGHTER_CHASE_HANDLE_MAX_LENGTH ||
    !intent.symbol ||
    !Number.isSafeInteger(intent.marketId) ||
    intent.marketId < 0 ||
    intent.marketId > LIGHTER_MAX_MARKET_ID ||
    !Number.isSafeInteger(intent.startedAt) ||
    intent.startedAt <= 0 ||
    !Number.isSafeInteger(intent.intervalMs) ||
    intent.intervalMs < LIGHTER_CHASE_MIN_INTERVAL_MS ||
    !Number.isSafeInteger(intent.maxDurationMs) ||
    intent.maxDurationMs < intent.intervalMs ||
    intent.maxDurationMs > LIGHTER_CHASE_MAX_DURATION_MS ||
    !Number.isSafeInteger(intent.maxRepricings) ||
    intent.maxRepricings < 0 ||
    intent.maxRepricings > LIGHTER_CHASE_MAX_REPRICINGS ||
    !Number.isFinite(intent.maxDistanceBps) ||
    intent.maxDistanceBps <= 0 ||
    intent.maxDistanceBps >= LIGHTER_CHASE_MAX_DISTANCE_BPS ||
    amount(intent.maxNotional).lte(0) ||
    amount(intent.maxNotional).gt(LIGHTER_NATIVE_PROBE_MAX_NOTIONAL)
  ) {
    throw new Error('Invalid bounded Lighter Chase ownership or intent');
  }
  validateWire(
    intent.originalSize,
    intent.sizeDecimals,
    LIGHTER_MAX_BASE_AMOUNT,
  );
  validateWire(
    intent.arrivalPrice,
    intent.priceDecimals,
    LIGHTER_MAX_ORDER_PRICE,
  );
  if (
    amount(intent.minBaseAmount).lte(0) ||
    amount(intent.minQuoteAmount).lte(0)
  ) {
    throw new Error('Invalid Lighter Chase venue minimum');
  }
}

/** Dedicated bounded Chase ownership and serial cancel/replace lifecycle. */
export class LighterChaseService {
  readonly #storage: Pick<
    PerpsPlatformDependencies['diskCache'],
    'getItem' | 'setItem'
  >;
  readonly #active = new Map<string, { epoch: number; symbol: string }>();
  #epoch = 0;
  readonly #stopRequests = new Map<string, ChaseOrderStatus>();

  constructor(options: {
    storage: Pick<
      PerpsPlatformDependencies['diskCache'],
      'getItem' | 'setItem'
    >;
  }) {
    this.#storage = options.storage;
  }

  /**
   * Stop all financial continuation synchronously, including in-flight starts.
   *
   * @param reason - Optional explicit suspension cause for active handles.
   */
  interrupt(reason?: ChaseOrderStatus): void {
    if (reason) {
      for (const handle of this.#active.keys()) {
        if (!this.#stopRequests.has(handle)) {
          this.#stopRequests.set(handle, reason);
        }
      }
    }
    this.#epoch += 1;
    this.#active.clear();
  }

  /**
   * Disable this handle's continuation before queued discovery or cleanup.
   *
   * @param handle - Requested exact handle; ownership is validated by stop.
   * @param symbol - Optional requested symbol, checked against active metadata before interruption.
   */
  interruptHandle(handle: string, symbol?: string): void {
    const active = this.#active.get(handle);
    if (active && symbol !== undefined && active.symbol !== symbol) {
      throw new Error('Lighter Chase active handle symbol mismatch');
    }
    if (this.#active.has(handle) && !this.#stopRequests.has(handle)) {
      this.#stopRequests.set(handle, 'canceled');
    }
    this.#active.delete(handle);
  }

  async #locked<Result>(
    owner: LighterChaseOwner,
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

  async #read(
    owner: LighterChaseOwner,
    io: Pick<LighterChaseIo, 'assertCurrent'>,
  ): Promise<Journal> {
    io.assertCurrent();
    const raw = await this.#storage.getItem(ownerKey(owner));
    io.assertCurrent();
    if (raw === null) {
      return { version: 1, records: [] };
    }
    const parsed: unknown = JSON.parse(raw);
    assert(parsed, JournalStruct);
    if (parsed.records.length > LIGHTER_NATIVE_PROBE_RECORD_LIMIT) {
      throw new Error('Lighter Chase journal capacity exceeded');
    }
    const handles = new Set<string>();
    const ids = new Set<string>();
    for (const record of parsed.records) {
      validateIntent(record.intent);
      if (
        ownerKey(owner) !== ownerKey(record.intent.owner) ||
        handles.has(record.intent.handle) ||
        record.children.length > record.intent.maxRepricings + 1 ||
        !Number.isSafeInteger(record.repricings) ||
        record.repricings !== Math.max(0, record.children.length - 1) ||
        !Number.isSafeInteger(record.lastTickAt) ||
        record.lastTickAt < record.intent.startedAt
      ) {
        throw new Error('Lighter Chase persisted ownership is invalid');
      }
      handles.add(record.intent.handle);
      for (const child of record.children) {
        if (
          !/^[1-9]\d*$/u.test(child.clientOrderId) ||
          BigInt(child.clientOrderId) >
            BigInt(LIGHTER_MAX_CLIENT_ORDER_INDEX) ||
          ids.has(child.clientOrderId) ||
          child.cancellations.length > LIGHTER_NATIVE_PROBE_CANCEL_LIMIT ||
          !Number.isSafeInteger(child.quotedAt) ||
          child.quotedAt < record.intent.startedAt
        ) {
          throw new Error('Lighter Chase persisted child identity is invalid');
        }
        ids.add(child.clientOrderId);
        validateWire(
          child.size,
          record.intent.sizeDecimals,
          LIGHTER_MAX_BASE_AMOUNT,
        );
        validateWire(
          child.price,
          record.intent.priceDecimals,
          LIGHTER_MAX_ORDER_PRICE,
        );
        for (const dispatch of [child.placement, ...child.cancellations]) {
          if (dispatch.phase !== 'prepared' && dispatch.phase !== 'failed') {
            if (
              !Number.isSafeInteger(dispatch.nonce) ||
              (dispatch.nonce ?? -1) < 0 ||
              !isLighterTxHash(dispatch.txHash) ||
              !isLighterTxExpiry(dispatch.expiresAt)
            ) {
              throw new Error('Lighter Chase persisted dispatch is invalid');
            }
          }
        }
      }
      this.#totals(record);
      if (
        record.status !== 'active' &&
        record.status !== 'termination_pending' &&
        !this.#settled(record)
      ) {
        throw new Error('Lighter Chase terminal journal lacks child evidence');
      }
    }
    return parsed;
  }

  async #write(
    owner: LighterChaseOwner,
    journal: Journal,
    io: Pick<LighterChaseIo, 'assertCurrent'>,
  ): Promise<void> {
    io.assertCurrent();
    await this.#storage.setItem(ownerKey(owner), JSON.stringify(journal));
    io.assertCurrent();
  }

  #running(record: LighterChaseRecord): void {
    if (
      record.status !== 'active' ||
      this.#active.get(record.intent.handle)?.epoch !== this.#epoch
    ) {
      throw new Error(
        'Lighter Chase session was interrupted; never resume automatically',
      );
    }
  }

  #settled(record: LighterChaseRecord): boolean {
    return record.children.every(
      (child) =>
        child.placement.phase === 'failed' ||
        child.observation?.terminal === true,
    );
  }

  #totals(record: LighterChaseRecord): void {
    let filled = new BigNumber(0);
    let notional = new BigNumber(0);
    const orderIds = new Set<string>();
    for (const child of record.children) {
      if (!child.observation) {
        continue;
      }
      const observed = child.observation;
      if (
        !/^[1-9]\d*$/u.test(observed.orderId) ||
        orderIds.has(observed.orderId) ||
        child.placement.phase === 'failed' ||
        !amount(observed.filledSize)
          .plus(amount(observed.remainingSize))
          .eq(child.size)
      ) {
        throw new Error('Lighter Chase observed child is invalid');
      }
      orderIds.add(observed.orderId);
      filled = filled.plus(amount(observed.filledSize));
      notional = notional.plus(amount(observed.filledNotional));
    }
    if (
      filled.gt(record.intent.originalSize) ||
      notional.gt(record.intent.maxNotional)
    ) {
      throw new Error(
        'Lighter Chase cumulative execution exceeds immutable budget',
      );
    }
    record.executedSize = filled.toFixed();
    record.executedNotional = notional.toFixed();
  }

  async #observe(
    record: LighterChaseRecord,
    child: LighterChaseChild,
    io: LighterChaseIo,
  ): Promise<void> {
    const observed = await io.observe(child);
    io.assertCurrent();
    if (!observed) {
      if (child.placement.phase !== 'failed' || child.observation) {
        throw new Error(
          'Lighter Chase absent observation lacks definitive placement failure',
        );
      }
      return;
    }
    const previous = child.observation;
    if (
      previous &&
      (previous.orderId !== observed.orderId ||
        amount(observed.filledSize).lt(previous.filledSize) ||
        amount(observed.filledNotional).lt(previous.filledNotional) ||
        (previous.terminal && !observed.terminal))
    ) {
      throw new Error(
        'Lighter Chase authoritative child observation regressed',
      );
    }
    child.observation = observed;
    this.#totals(record);
  }

  async #dispatch(
    record: LighterChaseRecord,
    journal: Journal,
    dispatch: LighterChaseDispatch,
    io: LighterChaseIo,
    financialContinuation: boolean,
    send: (hooks: LighterChaseDispatchHooks) => Promise<void>,
  ): Promise<void> {
    const guard = (): void => {
      io.assertCurrent();
      if (financialContinuation) {
        this.#running(record);
        const quotedAt = record.children.at(-1)?.quotedAt;
        if (
          quotedAt === undefined ||
          io.now() < quotedAt ||
          io.now() - quotedAt > LIGHTER_CHASE_QUOTE_MAX_AGE_MS
        ) {
          throw new Error('Lighter Chase quote is stale before dispatch');
        }
        if (io.now() >= record.intent.startedAt + record.intent.maxDurationMs) {
          throw new Error('Lighter Chase duration elapsed before dispatch');
        }
      }
    };
    const hooks: LighterChaseDispatchHooks = {
      signed: async (identity) => {
        guard();
        if (
          dispatch.phase !== 'prepared' ||
          !Number.isSafeInteger(identity.nonce) ||
          identity.nonce < 0 ||
          !isLighterTxHash(identity.txHash) ||
          !isLighterTxExpiry(identity.expiresAt) ||
          identity.expiresAt <= io.now()
        ) {
          throw new Error('Invalid Lighter Chase signing identity');
        }
        Object.assign(dispatch, identity, { phase: 'signed' });
        await this.#write(record.intent.owner, journal, io);
      },
      beforeDispatch: async () => {
        guard();
        if (
          dispatch.phase !== 'signed' ||
          (dispatch.expiresAt ?? 0) <= io.now()
        ) {
          throw new Error('Lighter Chase signed transaction is stale');
        }
        dispatch.phase = 'attempted';
        await this.#write(record.intent.owner, journal, io);
        guard();
      },
      notDispatched: async () => {
        io.assertCurrent();
        if (dispatch.phase === 'acknowledged') {
          throw new Error(
            'Acknowledged Lighter Chase dispatch cannot be unsent',
          );
        }
        dispatch.phase = 'failed';
        await this.#write(record.intent.owner, journal, io);
      },
    };
    try {
      guard();
      await send(hooks);
      io.assertCurrent();
      if (dispatch.phase !== 'attempted') {
        throw new Error('Lighter Chase transport did not persist its dispatch');
      }
      dispatch.phase = 'acknowledged';
      await this.#write(record.intent.owner, journal, io);
    } catch (error) {
      if (dispatch.phase === 'prepared' || dispatch.phase === 'signed') {
        dispatch.phase = 'failed';
        await this.#write(record.intent.owner, journal, io);
      }
      throw error;
    }
  }

  #checkQuote(record: LighterChaseRecord, price: string, size: string): void {
    validateWire(price, record.intent.priceDecimals, LIGHTER_MAX_ORDER_PRICE);
    validateWire(size, record.intent.sizeDecimals, LIGHTER_MAX_BASE_AMOUNT);
    const original = amount(record.intent.arrivalPrice);
    const quote = amount(price);
    const adverse = record.intent.isBuy
      ? quote.minus(original)
      : original.minus(quote);
    if (
      adverse
        .times(BASIS_POINTS_DIVISOR)
        .gt(original.times(record.intent.maxDistanceBps))
    ) {
      throw new Error('Lighter Chase maximum distance reached');
    }
    const notional = quote.times(size);
    if (
      amount(size).lt(record.intent.minBaseAmount) ||
      notional.lt(record.intent.minQuoteAmount)
    ) {
      throw new Error('Lighter Chase remainder is below venue minimum');
    }
    if (
      amount(record.executedSize).plus(size).gt(record.intent.originalSize) ||
      amount(record.executedNotional)
        .plus(notional)
        .gt(record.intent.maxNotional)
    ) {
      throw new Error('Lighter Chase replacement exceeds aggregate budget');
    }
  }

  async #place(
    record: LighterChaseRecord,
    journal: Journal,
    price: string,
    io: LighterChaseIo,
  ): Promise<void> {
    this.#running(record);
    this.#totals(record);
    const size = amount(record.intent.originalSize)
      .minus(record.executedSize)
      .toFixed();
    this.#checkQuote(record, price, size);
    if (!this.#settled(record)) {
      throw new Error('Lighter Chase previous child remains unresolved');
    }
    const clientOrderId = io.allocateClientId();
    if (
      !/^[1-9]\d*$/u.test(clientOrderId) ||
      BigInt(clientOrderId) > BigInt(LIGHTER_MAX_CLIENT_ORDER_INDEX) ||
      journal.records.some((entry) =>
        entry.children.some((child) => child.clientOrderId === clientOrderId),
      )
    ) {
      throw new Error('Lighter Chase client identity is invalid or reused');
    }
    const child: LighterChaseChild = {
      clientOrderId,
      size,
      price,
      quotedAt: io.now(),
      placement: { phase: 'prepared' },
      cancellations: [],
    };
    record.children.push(child);
    record.repricings = record.children.length - 1;
    await this.#write(record.intent.owner, journal, io);
    await this.#dispatch(
      record,
      journal,
      child.placement,
      io,
      true,
      async (hooks) => await io.place(child, hooks),
    );
    try {
      await this.#observe(record, child, io);
    } catch (error) {
      if (!(error instanceof LighterChaseObservationPendingError)) {
        throw error;
      }
      record.error = error.message;
    }
    await this.#write(record.intent.owner, journal, io);
    if (child.placement.phase === 'failed') {
      this.#active.delete(record.intent.handle);
      record.status = 'failed';
    } else if (child.observation?.terminal) {
      this.#active.delete(record.intent.handle);
      record.status = amount(record.executedSize).eq(record.intent.originalSize)
        ? 'filled'
        : 'failed';
    }
  }

  async #cancel(
    record: LighterChaseRecord,
    journal: Journal,
    io: LighterChaseIo,
  ): Promise<void> {
    const child = record.children.at(-1);
    if (!child || child.placement.phase === 'failed') {
      return;
    }
    let visibilityPending = false;
    try {
      await this.#observe(record, child, io);
    } catch (error) {
      io.assertCurrent();
      visibilityPending = error instanceof LighterChaseObservationPendingError;
      // Mutable fill reads must not prevent exact immutable-child cleanup.
      // The provider cancel path independently validates the owned child.
      record.error = error instanceof Error ? error.message : String(error);
    }
    await this.#write(record.intent.owner, journal, io);
    if (this.#settled(record) || child.observation?.terminal) {
      return;
    }
    if (!child.observation && visibilityPending) {
      throw new LighterChaseObservationPendingError(
        'Lighter Chase placement visibility remains pending',
      );
    }
    const previous = child.cancellations.at(-1);
    if (previous && previous.phase !== 'failed') {
      throw new LighterChaseObservationPendingError(
        'Lighter Chase exact cancellation remains unresolved',
      );
    }
    if (child.cancellations.length >= LIGHTER_NATIVE_PROBE_CANCEL_LIMIT) {
      throw new Error('Lighter Chase cancellation attempt limit reached');
    }
    const dispatch: LighterChaseDispatch = { phase: 'prepared' };
    child.cancellations.push(dispatch);
    await this.#write(record.intent.owner, journal, io);
    let dispatchError: Error | undefined;
    try {
      await this.#dispatch(
        record,
        journal,
        dispatch,
        io,
        false,
        async (hooks) => await io.cancel(child, hooks),
      );
    } catch (error) {
      io.assertCurrent();
      dispatchError = error instanceof Error ? error : new Error(String(error));
    }
    // A fill can win even when the cancellation transport rejects or loses
    // its response. Always reread the exact child before deciding cleanup.
    await this.#observe(record, child, io);
    await this.#write(record.intent.owner, journal, io);
    if (dispatchError && !child.observation?.terminal) {
      throw dispatchError;
    }
    if (!child.observation?.terminal) {
      throw new LighterChaseObservationPendingError(
        'Lighter Chase cancellation acknowledged but child is not terminal',
      );
    }
  }

  #requestStop(record: LighterChaseRecord, reason: ChaseOrderStatus): boolean {
    this.#active.delete(record.intent.handle);
    if (
      record.status !== 'active' &&
      record.status !== 'termination_pending' &&
      this.#settled(record)
    ) {
      this.#stopRequests.delete(record.intent.handle);
      return false;
    }
    record.stopReason ??=
      this.#stopRequests.get(record.intent.handle) ?? reason;
    this.#stopRequests.delete(record.intent.handle);
    record.status = 'termination_pending';
    return true;
  }

  async #stop(
    record: LighterChaseRecord,
    journal: Journal,
    io: LighterChaseIo,
    reason: ChaseOrderStatus,
  ): Promise<void> {
    if (!this.#requestStop(record, reason)) {
      return;
    }
    await this.#write(record.intent.owner, journal, io);
    try {
      await this.#cancel(record, journal, io);
      if (this.#settled(record)) {
        record.status = record.stopReason === 'failed' ? 'failed' : 'canceled';
        if (amount(record.executedSize).eq(record.intent.originalSize)) {
          record.status = 'filled';
        }
      }
    } catch (error) {
      io.assertCurrent();
      record.error = error instanceof Error ? error.message : String(error);
    }
    await this.#write(record.intent.owner, journal, io);
  }

  /**
   * @param intent - Immutable bounded session intent.
   * @param io - Provider-bound reads and existing guarded transport.
   * @returns Exact owned placement state, including uncertain cleanup.
   */
  async start(
    intent: LighterChaseIntent,
    io: LighterChaseIo,
  ): Promise<LighterChaseRecord> {
    validateIntent(intent);
    const captured = { ...intent, owner: { ...intent.owner } };
    const epoch = this.#epoch;
    return await this.#locked(captured.owner, async () => {
      const journal = await this.#read(captured.owner, io);
      if (epoch !== this.#epoch) {
        throw new Error('Lighter Chase start interrupted');
      }
      if (
        journal.records.some(
          (record) => !this.#settled(record) || record.status === 'active',
        )
      ) {
        throw new Error('An earlier Lighter Chase remains unresolved');
      }
      if (
        journal.records.length >= LIGHTER_NATIVE_PROBE_RECORD_LIMIT ||
        journal.records.some(
          (record) => record.intent.handle === captured.handle,
        )
      ) {
        throw new Error('Lighter Chase journal full or handle already tracked');
      }
      const record: LighterChaseRecord = {
        intent: captured,
        children: [],
        status: 'active',
        repricings: 0,
        lastTickAt: captured.startedAt,
        executedSize: '0',
        executedNotional: '0',
      };
      journal.records.push(record);
      await this.#write(captured.owner, journal, io);
      this.#active.set(captured.handle, { epoch, symbol: captured.symbol });
      try {
        const price = await io.quote();
        io.assertCurrent();
        this.#running(record);
        await this.#place(record, journal, price, io);
        if (record.status === 'active') {
          this.#running(record);
        }
      } catch (error) {
        this.#active.delete(captured.handle);
        record.error = error instanceof Error ? error.message : String(error);
        record.status = this.#settled(record)
          ? 'failed'
          : 'termination_pending';
      }
      await this.#write(captured.owner, journal, io);
      return record;
    });
  }

  /**
   * @param owner - Current account ownership.
   * @param handle - Exact persisted handle.
   * @param io - Original provider context; never recreated on reconnect.
   * @returns Current state after at most one serial cancel/replace.
   */
  async tick(
    owner: LighterChaseOwner,
    handle: string,
    io: LighterChaseIo,
  ): Promise<LighterChaseRecord> {
    return await this.#locked(owner, async () => {
      const journal = await this.#read(owner, io);
      const record = journal.records.find(
        (entry) => entry.intent.handle === handle,
      );
      if (!record) {
        throw new Error('Unknown owned Lighter Chase handle');
      }
      if (
        record.status !== 'active' ||
        this.#active.get(handle)?.epoch !== this.#epoch
      ) {
        this.#active.delete(handle);
        return this.#visible(record);
      }
      const expired = (): boolean =>
        io.now() >= record.intent.startedAt + record.intent.maxDurationMs;
      if (expired()) {
        await this.#stop(record, journal, io, 'duration_reached');
        return record;
      }
      if (
        io.now() < record.lastTickAt ||
        io.now() - record.lastTickAt < record.intent.intervalMs
      ) {
        return record;
      }
      record.lastTickAt = io.now();
      if (record.repricings >= record.intent.maxRepricings) {
        await this.#stop(record, journal, io, 'repricing_limit_reached');
        return record;
      }
      try {
        const child = record.children.at(-1);
        if (!child) {
          throw new Error('Lighter Chase active child is missing');
        }
        await this.#observe(record, child, io);
        this.#running(record);
        if (child.placement.phase === 'failed') {
          this.#active.delete(handle);
          record.status = 'failed';
          record.stopReason ??= 'failed';
          await this.#write(owner, journal, io);
          return record;
        }
        await this.#write(owner, journal, io);
        if (
          amount(record.executedSize).eq(record.intent.originalSize) &&
          child.observation?.terminal
        ) {
          this.#active.delete(handle);
          record.status = 'filled';
          await this.#write(owner, journal, io);
          return record;
        }
        if (expired()) {
          await this.#stop(record, journal, io, 'duration_reached');
          return record;
        }
        const price = await io.quote();
        io.assertCurrent();
        this.#running(record);
        if (expired()) {
          await this.#stop(record, journal, io, 'duration_reached');
          return record;
        }
        const arrival = amount(record.intent.arrivalPrice);
        const adverse = record.intent.isBuy
          ? amount(price).minus(arrival)
          : arrival.minus(amount(price));
        if (
          adverse
            .times(BASIS_POINTS_DIVISOR)
            .gt(arrival.times(record.intent.maxDistanceBps))
        ) {
          await this.#stop(record, journal, io, 'max_distance_reached');
          return record;
        }
        if (amount(price).eq(child.price) && !child.observation?.terminal) {
          return record;
        }
        await this.#cancel(record, journal, io);
        this.#running(record);
        if (amount(record.executedSize).eq(record.intent.originalSize)) {
          this.#active.delete(handle);
          record.status = 'filled';
        } else {
          const freshPrice = await io.quote();
          io.assertCurrent();
          this.#running(record);
          await this.#place(record, journal, freshPrice, io);
        }
        await this.#write(owner, journal, io);
      } catch (error) {
        io.assertCurrent();
        record.error = error instanceof Error ? error.message : String(error);
        if (
          error instanceof LighterChaseObservationPendingError &&
          this.#active.get(handle)?.epoch === this.#epoch &&
          !expired()
        ) {
          await this.#write(owner, journal, io);
        } else {
          await this.#stop(
            record,
            journal,
            io,
            expired() ? 'duration_reached' : 'failed',
          );
        }
      }
      return record;
    });
  }

  /**
   * @param owner - Current account scope.
   * @param handle - Exact durable session handle.
   * @param io - Existing current authority, never another account or slot.
   * @param reason - Requested visible terminal reason.
   * @returns Terminal state only with exact child evidence; otherwise pending.
   */
  async stop(
    owner: LighterChaseOwner,
    handle: string,
    io: LighterChaseIo,
    reason: ChaseOrderStatus,
  ): Promise<LighterChaseRecord> {
    if (this.#active.has(handle) && !this.#stopRequests.has(handle)) {
      this.#stopRequests.set(handle, reason);
    }
    this.#active.delete(handle);
    return await this.#locked(owner, async () => {
      const journal = await this.#read(owner, io);
      const record = journal.records.find(
        (entry) => entry.intent.handle === handle,
      );
      if (!record) {
        throw new Error('Unknown owned Lighter Chase handle');
      }
      await this.#stop(record, journal, io, reason);
      return record;
    });
  }

  /**
   * Persist stop intent when venue authority is unavailable, retaining every dispatch.
   *
   * @param owner - Remembered account scope.
   * @param handle - Exact durable session handle.
   * @param io - Current wallet/network and local storage authority only.
   * @param reason - Requested stop cause; the first cause remains authoritative.
   * @param error - Explanation of the unresolved venue cleanup.
   * @returns Existing terminal evidence or pending local cleanup, without cancellation.
   */
  async stopLocally(
    owner: LighterChaseOwner,
    handle: string,
    io: Pick<LighterChaseIo, 'assertCurrent'>,
    reason: ChaseOrderStatus,
    error: string,
  ): Promise<LighterChaseRecord> {
    if (this.#active.has(handle) && !this.#stopRequests.has(handle)) {
      this.#stopRequests.set(handle, reason);
    }
    this.#active.delete(handle);
    return await this.#locked(owner, async () => {
      const journal = await this.#read(owner, io);
      const record = journal.records.find(
        (entry) => entry.intent.handle === handle,
      );
      if (!record) {
        throw new Error('Unknown owned Lighter Chase handle');
      }
      if (this.#requestStop(record, reason)) {
        record.error = error;
        await this.#write(owner, journal, io);
      }
      return record;
    });
  }

  /**
   * Retain a scheduler failure without using any financial transport.
   *
   * @param owner - Immutable account ownership.
   * @param handle - Exact session handle.
   * @param io - Current read and storage authority.
   * @param error - Visible failure reason.
   */
  async recordError(
    owner: LighterChaseOwner,
    handle: string,
    io: Pick<LighterChaseIo, 'assertCurrent'>,
    error: string,
  ): Promise<void> {
    this.#active.delete(handle);
    await this.#locked(owner, async () => {
      const journal = await this.#read(owner, io);
      const record = journal.records.find(
        (entry) => entry.intent.handle === handle,
      );
      if (
        record &&
        (record.status === 'active' || record.status === 'termination_pending')
      ) {
        record.error = error;
        record.status = 'termination_pending';
        record.stopReason ??= 'failed';
        await this.#write(owner, journal, io);
      }
    });
  }

  #visible(record: LighterChaseRecord): LighterChaseRecord {
    if (
      record.status === 'active' &&
      this.#active.get(record.intent.handle)?.epoch !== this.#epoch
    ) {
      record.status = 'termination_pending';
    }
    return record;
  }

  /**
   * Inspect one validated durable record without retiring unsent attempts.
   *
   * @param owner - Wallet/network/account storage scope, not current venue authority.
   * @param handle - Exact opaque stable handle.
   * @param io - Read-only context fence.
   * @returns Complete durable record, or undefined when absent. Corruption rejects.
   */
  async inspect(
    owner: LighterChaseOwner,
    handle: string,
    io: Pick<LighterChaseIo, 'assertCurrent'>,
  ): Promise<LighterChaseRecord | undefined> {
    return await this.#locked(owner, async () => {
      const journal = await this.#read(owner, io);
      const record = journal.records.find(
        (entry) => entry.intent.handle === handle,
      );
      return record ? this.#visible(record) : undefined;
    });
  }

  /**
   * Read recorded child identities without the Chase loop/journal lock or writes.
   * A venue-lock caller must not wait on the loop, which can itself await that
   * venue lock. Each storage read validates the complete durable snapshot.
   *
   * @param owner - Captured account ownership.
   * @param clientOrderId - Exact target client ID.
   * @param io - Session fence.
   * @returns Whether this ID belongs to any retained Chase child.
   */
  async hasRecordedChild(
    owner: LighterChaseOwner,
    clientOrderId: string,
    io: Pick<LighterChaseIo, 'assertCurrent'>,
  ): Promise<boolean> {
    const journal = await this.#read(owner, io);
    return journal.records.some((record) =>
      record.children.some((child) => child.clientOrderId === clientOrderId),
    );
  }

  /**
   * @param owner - Account-scoped durable inventory.
   * @param io - Read authority and ownership fence only; no transport is used.
   * @returns Visible owned state without automatic financial continuation.
   */
  async list(
    owner: LighterChaseOwner,
    io: Pick<LighterChaseIo, 'assertCurrent'>,
  ): Promise<LighterChaseRecord[]> {
    return await this.#locked(owner, async () => {
      const journal = await this.#read(owner, io);
      let changed = false;
      for (const record of journal.records) {
        let recordChanged = false;
        for (const child of record.children) {
          for (const dispatch of [child.placement, ...child.cancellations]) {
            if (dispatch.phase === 'prepared' || dispatch.phase === 'signed') {
              if (dispatch === child.placement && child.observation) {
                throw new Error(
                  'Lighter Chase unsent child has conflicting venue evidence',
                );
              }
              // Account lock excludes in-flight dispatch; attempted is durable
              // before transport, so these persisted phases are provably unsent.
              dispatch.phase = 'failed';
              changed = true;
              recordChanged = true;
            }
          }
        }
        if (recordChanged && this.#settled(record)) {
          record.status = amount(record.executedSize).eq(
            record.intent.originalSize,
          )
            ? 'filled'
            : 'failed';
          this.#active.delete(record.intent.handle);
        }
      }
      if (changed) {
        await this.#write(owner, journal, io);
      }
      return journal.records.map((record) => this.#visible(record));
    });
  }
}

/**
 * @param record - Validated durable session observation.
 * @returns Existing provider-bound public Chase management contract.
 */
export function toLighterChaseOrder(record: LighterChaseRecord): ChaseOrder {
  const { intent } = record;
  const child = record.children.at(-1);
  const price = child?.price ?? intent.arrivalPrice;
  const arrival = amount(intent.arrivalPrice);
  const adverse = intent.isBuy
    ? amount(price).minus(arrival)
    : arrival.minus(amount(price));
  return {
    handle: intent.handle,
    symbol: intent.symbol,
    side: intent.isBuy ? 'buy' : 'sell',
    originalSize: intent.originalSize,
    remainingSize: amount(intent.originalSize)
      .minus(record.executedSize)
      .toFixed(),
    arrivalPrice: intent.arrivalPrice,
    restingPrice: price,
    restingOrderId: child?.observation?.terminal
      ? null
      : (child?.observation?.orderId ?? null),
    distanceChasedBps: BigNumber.maximum(
      0,
      adverse.div(arrival).times(BASIS_POINTS_DIVISOR),
    )
      .integerValue(BigNumber.ROUND_HALF_UP)
      .toNumber(),
    maxDistanceBps: intent.maxDistanceBps,
    repricings: record.repricings,
    startedAt: intent.startedAt,
    status: record.status,
    providerId: 'lighter',
  };
}
