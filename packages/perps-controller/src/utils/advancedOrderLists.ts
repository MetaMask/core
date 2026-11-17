import {
  CHASE_ORDER_CONFIG,
  TWAP_ORDER_CONFIG,
} from '../constants/perpsConfig.js';
import type {
  ChaseOrder,
  ChaseOrderLists,
  PerpsProviderType,
  SubscribeTwapOrdersParams,
  TwapOrder,
} from '../types/index.js';
import {
  chaseOrderKey,
  isChaseOrderRunning,
  isTwapOrderActive,
  mergeChaseOrderHistory,
  mergeTwapOrders,
  twapOrderKey,
} from './advancedOrders.js';
import { ensureError } from './errorUtils.js';

/** Where a live TWAP list reads and streams schedules from. */
export type LiveTwapOrderSource = {
  getTwapOrders: () => Promise<TwapOrder[]>;
  subscribeToTwapOrders: (params: SubscribeTwapOrdersParams) => () => void;
  /**
   * Names the account, provider and network the reads follow. When it
   * changes, held rows are dropped so one context's TWAPs never show in
   * another.
   */
  getContextKey?: () => string;
  /**
   * Calls the listener when the account, provider or network may have
   * changed, so held rows clear at once instead of on the next read.
   */
  subscribeToContextChanges?: (listener: () => void) => () => void;
};

/** A chase cancel that succeeded, with the ending the provider reported. */
export type CanceledChaseOrder = {
  handle: string;
  providerId?: PerpsProviderType;
  /** The chase's final snapshot, from `CancelOrderResult.chaseOrder`. */
  chaseOrder: ChaseOrder;
};

/** Where a live chase list reads chase snapshots from. */
export type LiveChaseOrderSource = {
  getChaseOrders: () => Promise<ChaseOrder[]>;
  /**
   * Names the account, provider and network the reads follow. When it
   * changes, held lists are dropped so one context's chases, and their
   * cancel actions, never show in another.
   */
  getContextKey?: () => string;
  /**
   * Calls the listener when the account, provider or network may have
   * changed, so held lists clear at once instead of on the next read.
   */
  subscribeToContextChanges?: (listener: () => void) => () => void;
  /**
   * Calls the listener after a chase cancel succeeds with a known ending. A
   * provider can drop a canceled chase before the next read, so this is how
   * the list learns how the chase ended rather than guessing from its absence.
   */
  subscribeToChaseCancellations?: (
    listener: (canceled: CanceledChaseOrder) => void,
  ) => () => void;
};

/**
 * Keep one merged TWAP list from the venue stream and reads.
 *
 * The read is the authority: a schedule no read lists is dropped, unless the
 * stream still reports it (the stream can know of a TWAP before a read does,
 * for example one placed elsewhere). A push the last read cannot explain
 * triggers one catch-up read. While a schedule runs, or after a failed read,
 * reads repeat so slice fills, and with them execution totals, keep rising.
 * Held rows reset when the source's context key changes.
 *
 * Works over any source: the controller passes itself, and a client on the
 * other side of a messenger can pass its messenger calls.
 *
 * @param params - Source, listener and cadence.
 * @param params.source - Reads and stream of TWAP schedules.
 * @param params.callback - Receives the merged list, newest first, on change.
 * @param params.onError - Receives read failures; the list keeps its state.
 * @param params.refreshIntervalMs - Read cadence while a schedule runs.
 * @param params.catchUpIntervalMs - Delay before a catch-up read.
 * @returns A cleanup function that stops reads and the stream.
 */
export function createLiveTwapOrderList(params: {
  source: LiveTwapOrderSource;
  callback: (twapOrders: TwapOrder[]) => void;
  onError?: (error: Error) => void;
  refreshIntervalMs?: number;
  catchUpIntervalMs?: number;
}): () => void {
  const { source, callback, onError } = params;
  const refreshIntervalMs =
    params.refreshIntervalMs ?? TWAP_ORDER_CONFIG.RefreshIntervalMs;
  const catchUpIntervalMs =
    params.catchUpIntervalMs ?? TWAP_ORDER_CONFIG.StreamCatchUpIntervalMs;

  let orders: TwapOrder[] = [];
  let emitted: string | undefined;
  let listed = new Set<string>();
  let streamed = new Set<string>();
  let stopped = false;
  let failed = false;
  // Generation of the read in flight, if any. A read for a context the list
  // has left neither blocks nor feeds the new context's reads.
  let activeRead: number | undefined;
  let readAgain = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerDueAt = Number.POSITIVE_INFINITY;
  let context = source.getContextKey?.();
  // Bumped on every context reset, so a read can tell it outlived one even
  // when a stream push already moved `context` to the new value.
  let generation = 0;

  const resetOnContextChange = (): boolean => {
    const current = source.getContextKey?.();
    if (current === context) {
      return false;
    }
    context = current;
    generation += 1;
    orders = [];
    listed = new Set();
    streamed = new Set();
    return true;
  };

  const emit = (): void => {
    const serialized = JSON.stringify(orders);
    if (serialized !== emitted) {
      emitted = serialized;
      callback(orders);
    }
  };

  const schedule = (delayMs: number): void => {
    const dueAt = Date.now() + delayMs;
    if (stopped || (timer !== undefined && timerDueAt <= dueAt)) {
      return;
    }
    clearTimeout(timer);
    timerDueAt = dueAt;
    timer = setTimeout(() => {
      timer = undefined;
      timerDueAt = Number.POSITIVE_INFINITY;
      read().catch(() => undefined);
    }, delayMs);
  };

  const scheduleNext = (): void => {
    if (failed || orders.some(isTwapOrderActive)) {
      schedule(refreshIntervalMs);
    }
  };

  /**
   * Read the venue, merge the result and schedule the next read.
   */
  async function read(): Promise<void> {
    if (resetOnContextChange()) {
      // Clear the old context's rows now, not when this read returns.
      emit();
    }
    if (activeRead === generation) {
      readAgain = true;
      return;
    }
    const readGeneration = generation;
    activeRead = readGeneration;
    let result: TwapOrder[] = [];
    let failure: { error: unknown } | undefined;
    try {
      result = await source.getTwapOrders();
    } catch (error) {
      failure = { error };
    }
    if (stopped) {
      return;
    }
    if (resetOnContextChange()) {
      emit();
    }
    if (generation !== readGeneration) {
      // The read answered for a context the list has left. Start a read for
      // the new one unless another read already did.
      if (activeRead === readGeneration) {
        activeRead = undefined;
        readAgain = false;
        schedule(0);
      }
      return;
    }
    activeRead = undefined;
    if (failure) {
      failed = true;
      onError?.(ensureError(failure.error, 'createLiveTwapOrderList'));
    } else {
      const readKeys = new Set(result.map(twapOrderKey));
      orders = mergeTwapOrders(
        orders.filter((order) => {
          const key = twapOrderKey(order);
          return readKeys.has(key) || streamed.has(key);
        }),
        result,
      );
      listed = readKeys;
      failed = false;
      emit();
    }
    if (readAgain) {
      readAgain = false;
      schedule(0);
      return;
    }
    scheduleNext();
  }

  const unsubscribe = source.subscribeToTwapOrders({
    callback: (pushed) => {
      if (stopped) {
        return;
      }
      resetOnContextChange();
      const before = new Map(
        orders.map((order) => [twapOrderKey(order), order]),
      );
      streamed = new Set(pushed.map(twapOrderKey));
      orders = mergeTwapOrders(orders, pushed);
      emit();
      const merged = new Map(
        orders.map((order) => [twapOrderKey(order), order]),
      );
      const unexplained = [...streamed].some(
        (key) =>
          !listed.has(key) ||
          before.get(key)?.status !== merged.get(key)?.status,
      );
      if (unexplained || pushed.length === 0) {
        schedule(catchUpIntervalMs);
      }
    },
  });

  const unsubscribeContext = source.subscribeToContextChanges?.(() => {
    if (!stopped && resetOnContextChange()) {
      emit();
      readAgain = false;
      schedule(0);
    }
  });

  read().catch(() => undefined);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    unsubscribeContext?.();
  };
}

/**
 * Whether two snapshots name the same chase. A missing provider matches any,
 * since single-provider reads leave it unset.
 *
 * @param left - One chase.
 * @param right - The other chase.
 * @returns True for the same handle on a compatible provider.
 */
function isSameChase(
  left: Pick<ChaseOrder, 'handle' | 'providerId'>,
  right: Pick<ChaseOrder, 'handle' | 'providerId'>,
): boolean {
  return (
    left.handle === right.handle &&
    (left.providerId === undefined ||
      right.providerId === undefined ||
      left.providerId === right.providerId)
  );
}

/**
 * Copy a snapshot under the provider the list holds it by.
 *
 * @param order - The snapshot.
 * @param providerId - Provider to record, or none.
 * @returns The snapshot with exactly that provider.
 */
function withProvider(
  order: ChaseOrder,
  providerId: PerpsProviderType | undefined,
): ChaseOrder {
  const { providerId: _previous, ...rest } = order;
  return providerId === undefined ? rest : { ...rest, providerId };
}

/**
 * Keep running and history chase lists from repeated reads.
 *
 * Ended chases stay in history after a provider drops them, up to
 * `historyLimit`. A running chase a read omits stays for `omissionGraceReads`
 * reads, since an aggregated read drops a provider whose read failed. Reads
 * repeat at `refreshIntervalMs` for as long as the list is subscribed, so a
 * chase placed anywhere appears without a manual refresh. Lists reset when the
 * source's context key changes. When a chase cancel succeeds with a known
 * ending, the list keeps that ending, also for a chase no read has listed yet,
 * and keeps it in history after the provider drops the session.
 *
 * @param params - Source, listener and cadence.
 * @param params.source - Reads of chase snapshots.
 * @param params.callback - Receives the lists on change.
 * @param params.onError - Receives read failures; the lists keep their state.
 * @param params.refreshIntervalMs - Read cadence.
 * @param params.historyLimit - Most ended chases kept.
 * @param params.omissionGraceReads - Reads a running chase survives omission.
 * @returns A cleanup function that stops reads.
 */
export function createLiveChaseOrderList(params: {
  source: LiveChaseOrderSource;
  callback: (lists: ChaseOrderLists) => void;
  onError?: (error: Error) => void;
  refreshIntervalMs?: number;
  historyLimit?: number;
  omissionGraceReads?: number;
}): () => void {
  const { source, callback, onError, historyLimit } = params;
  const refreshIntervalMs =
    params.refreshIntervalMs ?? CHASE_ORDER_CONFIG.RefreshIntervalMs;
  const omissionGraceReads =
    params.omissionGraceReads ?? CHASE_ORDER_CONFIG.OmissionGraceReads;
  let lists: ChaseOrderLists | undefined;
  let emitted: string | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let context = source.getContextKey?.();
  let generation = 0;
  let activeRead: number | undefined;
  let omissions = new Map<string, number>();
  // Endings the provider reported for chases cancelled in this context.
  let endings: ChaseOrder[] = [];

  const emit = (): void => {
    const next = lists ?? { running: [], history: [] };
    const serialized = JSON.stringify(next);
    if (serialized !== emitted) {
      emitted = serialized;
      callback(next);
    }
  };

  const resetOnContextChange = (): boolean => {
    const current = source.getContextKey?.();
    if (current === context) {
      return false;
    }
    context = current;
    generation += 1;
    lists = undefined;
    omissions = new Map();
    endings = [];
    return true;
  };

  const endingOf = (order: ChaseOrder): ChaseOrder | undefined =>
    endings.find((ending) => isSameChase(ending, order));

  // A read that still lists a chase as running after its cancel reported an
  // ending is stale; the ending replaces it. An ending the read reports wins.
  const settle = (order: ChaseOrder): ChaseOrder => {
    const ending = endingOf(order);
    return ending && isChaseOrderRunning(order)
      ? withProvider(ending, order.providerId)
      : order;
  };

  // Running chases this read omits, kept while within their grace reads.
  const keepOmitted = (current: readonly ChaseOrder[]): ChaseOrder[] => {
    const present = new Set(current.map(chaseOrderKey));
    const kept: ChaseOrder[] = [];
    const counts = new Map<string, number>();
    for (const order of lists?.running ?? []) {
      const key = chaseOrderKey(order);
      const count = (omissions.get(key) ?? 0) + 1;
      if (!present.has(key) && count <= omissionGraceReads) {
        kept.push(order);
        counts.set(key, count);
      }
    }
    omissions = counts;
    return kept;
  };

  const scheduleRead = (delayMs: number): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      read().catch(() => undefined);
    }, delayMs);
  };

  /**
   * Read the chases, merge them and schedule the next read.
   */
  async function read(): Promise<void> {
    if (resetOnContextChange()) {
      // Clear the old context's chases, and their cancels, now.
      emit();
    }
    if (activeRead === generation) {
      return;
    }
    const readGeneration = generation;
    activeRead = readGeneration;
    let current: ChaseOrder[] = [];
    let failure: { error: unknown } | undefined;
    try {
      current = await source.getChaseOrders();
    } catch (error) {
      failure = { error };
    }
    if (stopped) {
      return;
    }
    if (resetOnContextChange()) {
      emit();
    }
    if (generation !== readGeneration) {
      // The read answered for a context the list has left. Read the new one
      // now unless another read already started.
      if (activeRead === readGeneration) {
        activeRead = undefined;
        scheduleRead(0);
      }
      return;
    }
    activeRead = undefined;
    if (failure) {
      onError?.(ensureError(failure.error, 'createLiveChaseOrderList'));
    } else {
      const settled = current.map(settle);
      lists = mergeChaseOrderHistory({
        previous: lists,
        current: [...settled, ...keepOmitted(settled)],
        historyLimit,
      });
      emit();
    }
    scheduleRead(refreshIntervalMs);
  }

  const unsubscribeContext = source.subscribeToContextChanges?.(() => {
    if (!stopped && resetOnContextChange()) {
      emit();
      scheduleRead(0);
    }
  });

  const unsubscribeCancellations = source.subscribeToChaseCancellations?.(
    ({ handle, providerId, chaseOrder }) => {
      if (stopped) {
        return;
      }
      const ending = withProvider({ ...chaseOrder, handle }, providerId);
      endings = [
        ...endings.filter((held) => !isSameChase(held, ending)),
        ending,
      ];
      // Recorded even before any read lists the chase, so a read still in
      // flight cannot bring it back as running.
      const held = [...(lists?.running ?? []), ...(lists?.history ?? [])];
      const listed = held.find((order) => isSameChase(order, ending));
      lists = mergeChaseOrderHistory({
        previous: {
          running: [],
          history: (lists?.history ?? []).filter(
            (order) => !isSameChase(order, ending),
          ),
        },
        current: [
          ...(lists?.running ?? []).filter(
            (order) => !isSameChase(order, ending),
          ),
          listed ? withProvider(ending, listed.providerId) : ending,
        ],
        historyLimit,
      });
      emit();
    },
  );

  read().catch(() => undefined);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribeContext?.();
    unsubscribeCancellations?.();
  };
}
