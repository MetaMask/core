import type {
  DebugLogChange,
  DebugLogContext,
  DebugLogEvent,
} from './debugLogStore.js';
import type { AccountId, Caip19AssetId } from '../types.js';

/**
 * The curated payload a balance write returns, stored as a debug-log event's
 * `data`. Kept small — full responses are never persisted.
 */
export type DebugLogSummary = {
  /** (account, asset) balances present in the response */
  receivedCount: number;
  /** changed balances after zero-noise filtering */
  changedCount: number;
  /** omitted when changedCount is 0 */
  changes?: DebugLogChange[];
};

/**
 * One persisted debug-log entry: a published {@link DebugLogEvent} plus a
 * coalescing counter. Consecutive no-op events from the same source coalesce
 * into a single entry (see {@link appendDebugLogEntry}).
 */
export type DebugLogEntry = DebugLogEvent & {
  /** 1 normally; >1 when consecutive no-op events were coalesced. */
  repeatCount: number;
};

/** Client-provided tuning for the debug-log buffer. */
export type DebugLogConfig = {
  maxEntries?: number;
  ttlMs?: number;
};

/** Default cap on the number of entries kept in the ring buffer. */
export const MAX_ENTRIES = 100;

/** Default maximum age (ms) of a retained entry: 24 hours. */
export const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a change is zero-noise: it went to `'0'` from nothing (seeded-zero
 * churn) rather than representing a real balance event.
 *
 * @param change - The candidate change.
 * @param change.previousAmount - The prior amount, if any.
 * @param change.newAmount - The new amount.
 * @returns `true` when the change should be dropped from the log.
 */
function isZeroNoiseChange(change: {
  previousAmount?: string;
  newAmount: string;
}): boolean {
  return (
    change.newAmount === '0' &&
    (change.previousAmount === undefined || change.previousAmount === '0')
  );
}

/**
 * Turn a response plus the diff already computed by `#updateState` into the
 * counts and (filtered) changes recorded on a debug-log entry.
 *
 * @param params - Inputs.
 * @param params.assetsBalance - Per-account balances present in the response.
 * @param params.changedBalances - The `{ accountId, assetId, oldAmount,
 * newAmount }` diff already produced by `#updateState`.
 * @returns `{ receivedCount, changedCount, changes }`; `changes` is omitted
 * when nothing changed after zero-noise filtering.
 */
export function summarizeBalanceWrite(params: {
  assetsBalance?: Record<AccountId, Record<Caip19AssetId, unknown>>;
  changedBalances: {
    accountId: string;
    assetId: string;
    oldAmount: string | undefined;
    newAmount: string;
  }[];
}): DebugLogSummary {
  const { assetsBalance, changedBalances } = params;

  let receivedCount = 0;
  if (assetsBalance) {
    for (const accountBalances of Object.values(assetsBalance)) {
      receivedCount += Object.keys(accountBalances).length;
    }
  }

  const changes: DebugLogChange[] = [];
  for (const change of changedBalances) {
    const candidate: DebugLogChange = {
      accountId: change.accountId,
      assetId: change.assetId as Caip19AssetId,
      previousAmount: change.oldAmount,
      newAmount: change.newAmount,
    };
    if (isZeroNoiseChange(candidate)) {
      continue;
    }
    changes.push(candidate);
  }

  if (changes.length === 0) {
    return { receivedCount, changedCount: 0 };
  }
  return { receivedCount, changedCount: changes.length, changes };
}

/**
 * Whether two `sources` lists are identical (order-sensitive).
 *
 * @param a - First list.
 * @param b - Second list.
 * @returns `true` when identical.
 */
function sameSources(a: string[] = [], b: string[] = []): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Whether a context carries error/fallback signals that make its entry
 * ineligible for coalescing (absence and no-op are the coalescable signals).
 *
 * @param context - The context to inspect.
 * @returns `true` when the entry must never be coalesced.
 */
function hasErrorSignals(context: DebugLogContext): boolean {
  const hasErrors =
    context.errors !== undefined && Object.keys(context.errors).length > 0;
  const hasFallback =
    context.fallbackChains !== undefined && context.fallbackChains.length > 0;
  const hasFailed =
    context.failedSources !== undefined && context.failedSources.length > 0;
  return hasErrors || hasFallback || hasFailed;
}

/**
 * Whether an entry is a no-op: no error and no balance actually changed.
 *
 * @param entry - The entry to inspect.
 * @returns `true` when the entry represents a no-change write.
 */
function isNoop(entry: DebugLogEntry): boolean {
  if (entry.error !== undefined || hasErrorSignals(entry.context)) {
    return false;
  }
  const changedCount = (entry.data as DebugLogSummary | undefined)?.changedCount;
  return changedCount === 0;
}

/**
 * Whether a candidate no-op entry can be merged into the head entry.
 *
 * @param head - The current newest entry, if any.
 * @param candidate - The incoming entry.
 * @returns `true` when the two may be coalesced.
 */
function canCoalesceInto(
  head: DebugLogEntry | undefined,
  candidate: DebugLogEntry,
): boolean {
  if (head === undefined) {
    return false;
  }
  return (
    isNoop(head) &&
    isNoop(candidate) &&
    head.className === candidate.className &&
    head.methodName === candidate.methodName &&
    head.context.trigger === candidate.context.trigger &&
    head.context.lane === candidate.context.lane &&
    sameSources(head.context.sources, candidate.context.sources)
  );
}

/**
 * Drop entries whose `timestampMs` is older than `ttlMs` before `now`.
 *
 * @param entries - Newest-first buffer.
 * @param config - Buffer config (uses {@link TTL_MS} when `ttlMs` omitted).
 * @param now - Current timestamp (ms).
 * @returns A new array with stale entries removed.
 */
export function pruneDebugLogEntries(
  entries: DebugLogEntry[],
  config: DebugLogConfig,
  now: number,
): DebugLogEntry[] {
  const ttlMs = config.ttlMs ?? TTL_MS;
  const cutoff = now - ttlMs;
  return entries.filter((entry) => entry.timestampMs >= cutoff);
}

/**
 * Append an event to a newest-first ring buffer.
 *
 * Prunes stale entries, then coalesces into the head when both head and
 * candidate are no-ops with identical class/method/trigger/lane/sources;
 * otherwise `unshift`s a fresh entry and drops the oldest once `maxEntries`
 * is exceeded. Pure — never mutates its inputs.
 *
 * @param entries - Existing newest-first buffer.
 * @param event - The newly published event.
 * @param config - Buffer config ({@link MAX_ENTRIES}/{@link TTL_MS} defaults).
 * @returns A new newest-first buffer.
 */
export function appendDebugLogEntry(
  entries: DebugLogEntry[],
  event: DebugLogEvent,
  config: DebugLogConfig,
): DebugLogEntry[] {
  const maxEntries = config.maxEntries ?? MAX_ENTRIES;
  const candidate: DebugLogEntry = { ...event, repeatCount: 1 };
  const pruned = pruneDebugLogEntries(entries, config, candidate.timestampMs);

  const head = pruned[0];

  if (canCoalesceInto(head, candidate)) {
    const merged: DebugLogEntry = {
      ...head,
      repeatCount: head.repeatCount + candidate.repeatCount,
      timestampMs: candidate.timestampMs,
      timestamp: candidate.timestamp,
    };
    return [merged, ...pruned.slice(1)];
  }

  const next = [candidate, ...pruned];
  if (next.length > maxEntries) {
    next.length = maxEntries;
  }
  return next;
}
