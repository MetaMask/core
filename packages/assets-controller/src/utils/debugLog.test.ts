import {
  MAX_ENTRIES,
  TTL_MS,
  appendDebugLogEntry,
  pruneDebugLogEntries,
  summarizeBalanceWrite,
} from './debugLog.js';
import type { DebugLogConfig, DebugLogEntry } from './debugLog.js';
import type { DebugLogContext, DebugLogEvent } from './debugLogStore.js';
import type { AccountId, Caip19AssetId } from '../types.js';

const ACCOUNT_ID = 'account-1' as AccountId;
const ASSET_ID = 'eip155:1/slip44:60' as Caip19AssetId;

/**
 * Build a published event for tests.
 *
 * @param overrides - Fields to override on the base event.
 * @param overrides.context - Context override.
 * @param overrides.data - Data override.
 * @returns A {@link DebugLogEvent}.
 */
function buildEvent(
  overrides: Partial<DebugLogEvent> & { context?: DebugLogContext } = {},
): DebugLogEvent {
  const timestampMs = overrides.timestampMs ?? 1_000;
  return {
    className: 'AssetsController',
    methodName: '#updateState',
    timestampMs,
    timestamp: new Date(timestampMs).toISOString(),
    context: { trigger: 'subscription', lane: 'subscription', sources: ['A'] },
    data: { receivedCount: 0, changedCount: 0 },
    ...overrides,
  };
}

describe('summarizeBalanceWrite', () => {
  it('counts received balances across accounts', () => {
    const summary = summarizeBalanceWrite({
      assetsBalance: {
        [ACCOUNT_ID]: { [ASSET_ID]: { amount: '1' } },
        'account-2': { [ASSET_ID]: { amount: '2' }, 'a/b': { amount: '3' } },
      },
      changedBalances: [],
    });
    expect(summary).toStrictEqual({ receivedCount: 3, changedCount: 0 });
  });

  it('handles a missing assetsBalance', () => {
    expect(summarizeBalanceWrite({ changedBalances: [] })).toStrictEqual({
      receivedCount: 0,
      changedCount: 0,
    });
  });

  it('drops zero-noise changes (undefined or 0 -> 0)', () => {
    const summary = summarizeBalanceWrite({
      changedBalances: [
        { accountId: ACCOUNT_ID, assetId: ASSET_ID, oldAmount: undefined, newAmount: '0' },
        { accountId: ACCOUNT_ID, assetId: ASSET_ID, oldAmount: '0', newAmount: '0' },
      ],
    });
    expect(summary).toStrictEqual({ receivedCount: 0, changedCount: 0 });
  });

  it('keeps real changes and reports previousAmount', () => {
    const summary = summarizeBalanceWrite({
      changedBalances: [
        { accountId: ACCOUNT_ID, assetId: ASSET_ID, oldAmount: '5', newAmount: '9' },
      ],
    });
    expect(summary.changedCount).toBe(1);
    expect(summary.changes).toStrictEqual([
      { accountId: ACCOUNT_ID, assetId: ASSET_ID, previousAmount: '5', newAmount: '9' },
    ]);
  });
});

describe('pruneDebugLogEntries', () => {
  it('drops entries older than the TTL', () => {
    const now = 100 * TTL_MS;
    const fresh = { ...buildEvent({ timestampMs: now }), repeatCount: 1 };
    const stale = { ...buildEvent({ timestampMs: now - TTL_MS - 1 }), repeatCount: 1 };
    expect(pruneDebugLogEntries([fresh, stale], {}, now)).toStrictEqual([fresh]);
  });

  it('honours a custom ttlMs', () => {
    const now = 10_000;
    const entry = { ...buildEvent({ timestampMs: now - 500 }), repeatCount: 1 };
    expect(pruneDebugLogEntries([entry], { ttlMs: 100 }, now)).toStrictEqual([]);
  });
});

describe('appendDebugLogEntry', () => {
  it('unshifts newest-first and stamps repeatCount 1', () => {
    const first = buildEvent({ timestampMs: 1 });
    const second = buildEvent({
      timestampMs: 2,
      context: { trigger: 'action', lane: 'fast', sources: ['B'] },
      data: { receivedCount: 1, changedCount: 1 },
    });
    const afterFirst = appendDebugLogEntry([], first, {});
    const afterSecond = appendDebugLogEntry(afterFirst, second, {});
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[0]?.timestampMs).toBe(2);
    expect(afterSecond[0]?.repeatCount).toBe(1);
    expect(afterSecond[1]?.timestampMs).toBe(1);
  });

  it('coalesces consecutive no-op entries with matching class/method/trigger/lane/sources', () => {
    const a = buildEvent({ timestampMs: 1 });
    const b = buildEvent({ timestampMs: 2 });
    const result = appendDebugLogEntry(appendDebugLogEntry([], a, {}), b, {});
    expect(result).toHaveLength(1);
    expect(result[0]?.repeatCount).toBe(2);
    expect(result[0]?.timestampMs).toBe(2);
    expect(result[0]?.timestamp).toBe(new Date(2).toISOString());
  });

  it('does not coalesce when a balance actually changed', () => {
    const noop = buildEvent({ timestampMs: 1 });
    const changed = buildEvent({
      timestampMs: 2,
      data: { receivedCount: 1, changedCount: 1 },
    });
    const result = appendDebugLogEntry(appendDebugLogEntry([], noop, {}), changed, {});
    expect(result).toHaveLength(2);
  });

  it('does not coalesce when the entry carries an error', () => {
    const noop = buildEvent({ timestampMs: 1 });
    const errored = buildEvent({ timestampMs: 2, error: 'boom' });
    const result = appendDebugLogEntry(appendDebugLogEntry([], noop, {}), errored, {});
    expect(result).toHaveLength(2);
  });

  it('does not coalesce when context carries error/fallback/failed signals', () => {
    const noop = buildEvent({ timestampMs: 1 });
    const withFallback = buildEvent({
      timestampMs: 2,
      context: {
        trigger: 'subscription',
        lane: 'subscription',
        sources: ['A'],
        fallbackChains: ['eip155:1'],
      },
    });
    const result = appendDebugLogEntry(
      appendDebugLogEntry([], noop, {}),
      withFallback,
      {},
    );
    expect(result).toHaveLength(2);
  });

  it('does not coalesce across different sources', () => {
    const a = buildEvent({ timestampMs: 1, context: { trigger: 'subscription', lane: 'subscription', sources: ['A'] } });
    const b = buildEvent({ timestampMs: 2, context: { trigger: 'subscription', lane: 'subscription', sources: ['B'] } });
    const result = appendDebugLogEntry(appendDebugLogEntry([], a, {}), b, {});
    expect(result).toHaveLength(2);
  });

  it('caps the buffer at maxEntries, dropping the oldest', () => {
    const config: DebugLogConfig = { maxEntries: 2 };
    let entries: DebugLogEntry[] = [];
    for (let index = 1; index <= 3; index++) {
      entries = appendDebugLogEntry(
        entries,
        buildEvent({
          timestampMs: index,
          data: { receivedCount: index, changedCount: 1 },
        }),
        config,
      );
    }
    expect(entries).toHaveLength(2);
    expect(entries[0]?.timestampMs).toBe(3);
    expect(entries[1]?.timestampMs).toBe(2);
  });

  it('prunes stale entries before appending', () => {
    const stale = { ...buildEvent({ timestampMs: 0 }), repeatCount: 1 };
    const result = appendDebugLogEntry(
      [stale],
      buildEvent({
        timestampMs: TTL_MS + 1,
        data: { receivedCount: 1, changedCount: 1 },
      }),
      {},
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.timestampMs).toBe(TTL_MS + 1);
  });

  it('exposes sane defaults', () => {
    expect(MAX_ENTRIES).toBe(100);
    expect(TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
