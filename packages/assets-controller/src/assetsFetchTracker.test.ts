import { describe, expect, it, vi } from 'vitest';

import { AssetsFetchTracker } from './assetsFetchTracker.js';
import type { AssetsFetchUpdate } from './assetsFetchTracker.js';
import type { AccountId, AssetsFetchStatus } from './types.js';

type FakeState = { assetsFetchStatus?: Record<AccountId, AssetsFetchStatus> };

const CHAIN = 'eip155:1';

/**
 * Build a tracker over a plain state object.
 *
 * @param now - Clock function.
 * @returns The tracker, the state and a write counter.
 */
function setup(now: () => number = (): number => 1000): {
  tracker: AssetsFetchTracker;
  state: FakeState;
  writes: () => number;
} {
  const state: FakeState = {};
  let count = 0;
  const update: AssetsFetchUpdate = (recipe) => {
    count += 1;
    recipe(state);
  };
  return {
    tracker: new AssetsFetchTracker(update, now),
    state,
    writes: () => count,
  };
}

describe('AssetsFetchTracker', () => {
  it('reports fetching then idle for one account and phase', () => {
    const { tracker, state } = setup();

    const end = tracker.begin(['a'], 'fast');
    expect(state.assetsFetchStatus?.a?.fast).toStrictEqual({
      fetchStatus: 'fetching',
      errors: {},
      updatedAt: null,
    });

    end();
    expect(state.assetsFetchStatus?.a?.fast).toStrictEqual({
      fetchStatus: 'idle',
      errors: {},
      updatedAt: 1000,
    });
  });

  it('keeps accounts and phases independent', () => {
    const { tracker, state } = setup();

    const endFast = tracker.begin(['a', 'b'], 'fast');
    tracker.begin(['a'], 'background');
    endFast();

    expect(state.assetsFetchStatus?.a?.fast.fetchStatus).toBe('idle');
    expect(state.assetsFetchStatus?.b?.fast.fetchStatus).toBe('idle');
    expect(state.assetsFetchStatus?.a?.background.fetchStatus).toBe('fetching');
    expect(state.assetsFetchStatus?.b?.background.fetchStatus).toBe('idle');
  });

  it('stays fetching until the last overlapping fetch ends', () => {
    const { tracker, state } = setup();

    const end1 = tracker.begin(['a'], 'fast');
    const end2 = tracker.begin(['a'], 'fast');
    end1();
    expect(state.assetsFetchStatus?.a?.fast.fetchStatus).toBe('fetching');
    end2();
    expect(state.assetsFetchStatus?.a?.fast.fetchStatus).toBe('idle');
  });

  it('clears errors when a new fetch begins', () => {
    const { tracker, state } = setup();

    tracker.begin(['a'], 'fast')({ errors: { [CHAIN]: 'boom' } });
    expect(state.assetsFetchStatus?.a?.fast.errors).toStrictEqual({
      [CHAIN]: 'boom',
    });

    tracker.begin(['a'], 'fast');
    expect(state.assetsFetchStatus?.a?.fast.errors).toStrictEqual({});
  });

  it('moves updatedAt only on error free completion', () => {
    let time = 1;
    const { tracker, state } = setup(() => time);

    tracker.begin(['a'], 'fast')();
    expect(state.assetsFetchStatus?.a?.fast.updatedAt).toBe(1);

    time = 2;
    tracker.begin(['a'], 'fast')({ errors: { [CHAIN]: 'boom' } });
    expect(state.assetsFetchStatus?.a?.fast.updatedAt).toBe(1);

    time = 3;
    tracker.begin(['a'], 'fast')({ errors: {} });
    expect(state.assetsFetchStatus?.a?.fast.updatedAt).toBe(3);
  });

  it('ignores a second call to end', () => {
    const { tracker, state } = setup();

    const end1 = tracker.begin(['a'], 'fast');
    const end2 = tracker.begin(['a'], 'fast');
    end1();
    end1();
    expect(state.assetsFetchStatus?.a?.fast.fetchStatus).toBe('fetching');
    end2();
    expect(state.assetsFetchStatus?.a?.fast.fetchStatus).toBe('idle');
  });

  it('reports the last finisher when an erroring fetch ends first', () => {
    let time = 1000;
    const { tracker, state } = setup(() => time);

    const endFailing = tracker.begin(['a'], 'fast');
    const endClean = tracker.begin(['a'], 'fast');
    endFailing({ errors: { [CHAIN]: 'boom' } });
    time = 2000;
    endClean();

    expect(state.assetsFetchStatus?.a?.fast).toStrictEqual({
      fetchStatus: 'idle',
      errors: {},
      updatedAt: 2000,
    });
  });

  it('reports the last finisher when an erroring fetch ends last', () => {
    let time = 1000;
    const { tracker, state } = setup(() => time);

    tracker.begin(['a'], 'fast')();
    const endClean = tracker.begin(['a'], 'fast');
    const endFailing = tracker.begin(['a'], 'fast');
    time = 2000;
    endClean();
    endFailing({ errors: { [CHAIN]: 'boom' } });

    expect(state.assetsFetchStatus?.a?.fast).toStrictEqual({
      fetchStatus: 'idle',
      errors: { [CHAIN]: 'boom' },
      updatedAt: 1000,
    });
  });

  it('keeps an account fetching when only another begin covering it ends', () => {
    const { tracker, state } = setup();

    const endFirst = tracker.begin(['a', 'b'], 'fast');
    tracker.begin(['b'], 'fast');
    endFirst();

    expect(state.assetsFetchStatus?.a?.fast.fetchStatus).toBe('idle');
    expect(state.assetsFetchStatus?.b?.fast.fetchStatus).toBe('fetching');
  });

  it('writes nothing for an empty account list', () => {
    const { tracker, state, writes } = setup();

    const end = tracker.begin([], 'fast');
    end();

    expect(writes()).toBe(0);
    expect(state.assetsFetchStatus).toBeUndefined();
  });

  it('does not count a begin whose write throws', () => {
    const state: FakeState = {};
    const update = vi
      .fn<AssetsFetchUpdate>((recipe) => recipe(state))
      .mockImplementationOnce(() => {
        throw new Error('update failed');
      });
    const tracker = new AssetsFetchTracker(update, () => 1000);

    expect(() => tracker.begin(['a'], 'fast')).toThrow('update failed');

    tracker.begin(['a'], 'fast');
    expect(state.assetsFetchStatus?.a?.fast.fetchStatus).toBe('fetching');
  });
});
