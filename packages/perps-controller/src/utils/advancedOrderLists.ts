import {
  CHASE_ORDER_CONFIG,
  TWAP_ORDER_CONFIG,
} from '../constants/perpsConfig.js';
import type {
  ChaseOrder,
  ChaseOrderLists,
  SubscribeTwapOrdersParams,
  TwapOrder,
} from '../types/index.js';
import {
  chaseOrderKey,
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
  let reading = false;
  let readAgain = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerDueAt = Number.POSITIVE_INFINITY;
  let context = source.getContextKey?.();

  const resetOnContextChange = (): boolean => {
    const current = source.getContextKey?.();
    if (current === context) {
      return false;
    }
    context = current;
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
    if (reading) {
      readAgain = true;
      return;
    }
    reading = true;
    try {
      if (resetOnContextChange()) {
        // Clear the old context's rows now, not when this read returns.
        emit();
      }
      const result = await source.getTwapOrders();
      if (stopped) {
        return;
      }
      if (resetOnContextChange()) {
        // The read answered for the previous context; read the new one.
        readAgain = true;
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
      }
      emit();
    } catch (error) {
      failed = true;
      onError?.(ensureError(error, 'createLiveTwapOrderList'));
    } finally {
      reading = false;
    }
    if (stopped) {
      return;
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

  read().catch(() => undefined);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
}

/**
 * Keep running and history chase lists from repeated reads.
 *
 * Ended chases stay in history after a provider drops them, up to
 * `historyLimit`. A running chase a read omits stays for `omissionGraceReads`
 * reads, since an aggregated read drops a provider whose read failed. Reads
 * repeat at `refreshIntervalMs` for as long as the list is subscribed, so a
 * chase placed anywhere appears without a manual refresh. Lists reset when the
 * source's context key changes.
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
  let omissions = new Map<string, number>();

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
    lists = undefined;
    omissions = new Map();
    return true;
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

  const read = async (): Promise<void> => {
    let delayMs = refreshIntervalMs;
    try {
      if (resetOnContextChange()) {
        // Clear the old context's chases, and their cancels, now.
        emit();
      }
      const current = await source.getChaseOrders();
      if (stopped) {
        return;
      }
      if (resetOnContextChange()) {
        // The read answered for the previous context; read the new one.
        delayMs = 0;
      } else {
        lists = mergeChaseOrderHistory({
          previous: lists,
          current: [...current, ...keepOmitted(current)],
          historyLimit,
        });
      }
      emit();
    } catch (error) {
      onError?.(ensureError(error, 'createLiveChaseOrderList'));
    }
    if (!stopped) {
      timer = setTimeout(() => {
        read().catch(() => undefined);
      }, delayMs);
    }
  };

  read().catch(() => undefined);

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
