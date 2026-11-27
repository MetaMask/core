import {
  CHASE_ORDER_CONFIG,
  STREAM_RETRY_CONFIG,
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
  isChaseOrderCancelable,
  mergeChaseOrderHistory,
  mergeTwapOrders,
  twapOrderKey,
} from './advancedOrders.js';
import { ensureError } from './errorUtils.js';

/**
 * Do nothing; the cleanup of a stream not yet open.
 *
 * @returns Nothing.
 */
const noop = (): void => undefined;

/**
 * Delay before retrying a failed list read.
 *
 * @param attempts - Retries made since the last read that succeeded.
 * @returns Delay in milliseconds, or undefined once the retries are spent.
 */
function getReadRetryDelayMs(attempts: number): number | undefined {
  return attempts < STREAM_RETRY_CONFIG.MaxAttempts
    ? Math.min(
        STREAM_RETRY_CONFIG.BaseDelayMs * 2 ** attempts,
        STREAM_RETRY_CONFIG.MaxDelayMs,
      )
    : undefined;
}

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
   * Calls the listener when a chase may have changed (placed, re-priced,
   * filled or ended), so the list reads again. Without it the list reads only
   * when it opens, on a context change and after a cancel.
   */
  subscribeToChaseOrderChanges?: (listener: () => void) => () => void;
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
 * triggers one catch-up read. Slice fills, and with them execution totals,
 * rise from the stream's pushes; no read repeats on a timer. A failed read is
 * retried a bounded number of times. When the source's context key changes,
 * held rows reset and the stream reopens, and pushes from the earlier stream
 * are ignored.
 *
 * Works over any source: the controller passes itself, and a client on the
 * other side of a messenger can pass its messenger calls.
 *
 * @param params - Source, listener and cadence.
 * @param params.source - Reads and stream of TWAP schedules.
 * @param params.callback - Receives the merged list, newest first, on change.
 * @param params.onError - Receives read failures; the list keeps its state.
 * @param params.catchUpIntervalMs - Delay before a catch-up read.
 * @returns A cleanup function that stops reads and the stream.
 */
export function createLiveTwapOrderList(params: {
  source: LiveTwapOrderSource;
  callback: (twapOrders: TwapOrder[]) => void;
  onError?: (error: Error) => void;
  catchUpIntervalMs?: number;
}): () => void {
  const { source, callback, onError } = params;
  const catchUpIntervalMs =
    params.catchUpIntervalMs ?? TWAP_ORDER_CONFIG.StreamCatchUpIntervalMs;

  let orders: TwapOrder[] = [];
  let emitted: string | undefined;
  let listed = new Set<string>();
  let streamed = new Set<string>();
  let stopped = false;
  let failures = 0;
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
  let unsubscribeStream: () => void = noop;

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
    failures = 0;
    // The stream answers for the context it opened in, so open a new one.
    openStream();
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

  /**
   * Read the venue and merge the result.
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
      const retryDelayMs = getReadRetryDelayMs(failures);
      failures += 1;
      if (retryDelayMs !== undefined) {
        schedule(retryDelayMs);
      }
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
      failures = 0;
      emit();
    }
    if (readAgain) {
      readAgain = false;
      schedule(0);
    }
  }

  /**
   * Merge a stream push into the list, unless it comes from a stream opened
   * for an earlier context.
   *
   * @param streamGeneration - Generation the pushing stream was opened in.
   * @param pushed - The pushed schedules.
   */
  function onPush(streamGeneration: number, pushed: TwapOrder[]): void {
    if (stopped || streamGeneration !== generation) {
      return;
    }
    if (resetOnContextChange()) {
      // The push answered for the context the list just left.
      emit();
      readAgain = false;
      schedule(0);
      return;
    }
    const before = new Map(orders.map((order) => [twapOrderKey(order), order]));
    streamed = new Set(pushed.map(twapOrderKey));
    orders = mergeTwapOrders(orders, pushed);
    emit();
    const merged = new Map(orders.map((order) => [twapOrderKey(order), order]));
    const unexplained = [...streamed].some(
      (key) =>
        !listed.has(key) || before.get(key)?.status !== merged.get(key)?.status,
    );
    if (unexplained || pushed.length === 0) {
      schedule(catchUpIntervalMs);
    }
  }

  /**
   * Open the stream for the current context, closing the previous one.
   */
  function openStream(): void {
    const previous = unsubscribeStream;
    unsubscribeStream = noop;
    previous();
    if (stopped) {
      return;
    }
    const streamGeneration = generation;
    const unsubscribe = source.subscribeToTwapOrders({
      callback: (pushed) => onPush(streamGeneration, pushed),
    });
    if (stopped || streamGeneration !== generation) {
      // A first push already moved the list to another context.
      unsubscribe();
    } else {
      unsubscribeStream = unsubscribe;
    }
  }

  openStream();

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
    unsubscribeStream();
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
 * Keep running and history chase lists from reads the provider's own chase
 * changes trigger.
 *
 * Ended chases stay in history after a provider drops them, up to
 * `historyLimit`. A running chase a read omits stays for `omissionGraceReads`
 * reads, since an aggregated read drops a provider whose read failed; those
 * reads follow one after the other, then stop. Otherwise the list reads when
 * it opens and when the source reports a change, never on a timer; a failed
 * read is retried a bounded number of times. Lists reset when the source's
 * context key changes. When a chase cancel succeeds with a known
 * ending, the list keeps that ending, also for a chase no read has listed yet,
 * and keeps it in history after the provider drops the session.
 *
 * @param params - Source, listener and cadence.
 * @param params.source - Reads of chase snapshots.
 * @param params.callback - Receives the lists on change.
 * @param params.onError - Receives read failures; the lists keep their state.
 * @param params.historyLimit - Most ended chases kept.
 * @param params.omissionGraceReads - Reads a running chase survives omission.
 * @returns A cleanup function that stops reads.
 */
export function createLiveChaseOrderList(params: {
  source: LiveChaseOrderSource;
  callback: (lists: ChaseOrderLists) => void;
  onError?: (error: Error) => void;
  historyLimit?: number;
  omissionGraceReads?: number;
}): () => void {
  const { source, callback, onError, historyLimit } = params;
  const omissionGraceReads =
    params.omissionGraceReads ?? CHASE_ORDER_CONFIG.OmissionGraceReads;
  let lists: ChaseOrderLists | undefined;
  let emitted: string | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let context = source.getContextKey?.();
  let generation = 0;
  let activeRead: number | undefined;
  let readAgain = false;
  let failures = 0;
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
    readAgain = false;
    failures = 0;
    return true;
  };

  const endingOf = (order: ChaseOrder): ChaseOrder | undefined =>
    endings.find((ending) => isSameChase(ending, order));

  // A read that still offers a cancel (running, or stopped with a child
  // resting) after the cancel reported an ending is stale; the ending replaces
  // it. An ending the read reports wins.
  const settle = (order: ChaseOrder): ChaseOrder => {
    const ending = endingOf(order);
    return ending && isChaseOrderCancelable(order)
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
   * Read the chases and merge them.
   */
  async function read(): Promise<void> {
    if (resetOnContextChange()) {
      // Clear the old context's chases, and their cancels, now.
      emit();
    }
    if (activeRead === generation) {
      // One more read covers every change that arrives while one runs.
      readAgain = true;
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
    let followUpMs: number | undefined;
    if (failure) {
      followUpMs = getReadRetryDelayMs(failures);
      failures += 1;
      onError?.(ensureError(failure.error, 'createLiveChaseOrderList'));
    } else {
      failures = 0;
      const settled = current.map(settle);
      lists = mergeChaseOrderHistory({
        previous: lists,
        current: [...settled, ...keepOmitted(settled)],
        historyLimit,
      });
      emit();
      if (omissions.size > 0) {
        // Settle the omitted chases: they come back or their grace runs out.
        followUpMs = STREAM_RETRY_CONFIG.BaseDelayMs;
      }
    }
    if (readAgain) {
      readAgain = false;
      followUpMs = 0;
    }
    if (followUpMs !== undefined) {
      scheduleRead(followUpMs);
    }
  }

  const unsubscribeChanges = source.subscribeToChaseOrderChanges?.(() => {
    if (!stopped) {
      read().catch(() => undefined);
    }
  });

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
    unsubscribeChanges?.();
    unsubscribeContext?.();
    unsubscribeCancellations?.();
  };
}
