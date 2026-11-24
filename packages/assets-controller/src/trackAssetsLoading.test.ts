import type { InternalAccount } from '@metamask/keyring-internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssetsControllerState } from './AssetsController.js';
import {
  trackAssetsLoading,
  trackBackgroundAssetsLoading,
} from './trackAssetsLoading.js';

const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock('./logger.js', () => ({
  projectLogger: {},
  createModuleLogger: (): typeof mockLog => mockLog,
}));

type FakeControllerState = Pick<
  AssetsControllerState,
  'assetsLoadingStatus' | 'assetsBackgroundLoadingStatus'
>;

const ACCOUNT_1: InternalAccount = {
  id: 'account-1',
  address: '0x1234567890123456789012345678901234567890',
  options: {},
  methods: [],
  type: 'eip155:eoa',
  scopes: ['eip155:1'],
  metadata: {
    name: 'Test Account 1',
    keyring: { type: 'HD Key Tree' },
    importTime: 0,
    lastSelected: 0,
  },
};

const ACCOUNT_2: InternalAccount = {
  ...ACCOUNT_1,
  id: 'account-2',
  metadata: { ...ACCOUNT_1.metadata, name: 'Test Account 2' },
};

/**
 * Minimal stand-in for the controller: just the state and `update` the
 * decorator needs, with a fetch method that stays in flight until released.
 */
class FakeAssetsController {
  readonly holds: (() => void)[] = [];

  state: FakeControllerState = {};

  update(callback: (state: FakeControllerState) => void): void {
    callback(this.state);
  }

  /**
   * Let the oldest fetch that is still in flight finish.
   */
  releaseNextFetch(): void {
    const resolve = this.holds.shift();
    resolve?.();
  }

  @trackAssetsLoading
  async getAssets(
    _accounts: InternalAccount[],
    options?: { forceUpdate?: boolean; fail?: boolean },
  ): Promise<void> {
    if (options?.fail) {
      throw new Error('fetch failed');
    }
    await new Promise<void>((resolve) => {
      this.holds.push(resolve);
    });
  }
}

describe('trackAssetsLoading', () => {
  it('marks accounts as loading while the fetch is in flight and loaded once it settles', async () => {
    const controller = new FakeAssetsController();
    const fetchPromise = controller.getAssets([ACCOUNT_1, ACCOUNT_2], {
      forceUpdate: true,
    });

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loading',
      [ACCOUNT_2.id]: 'loading',
    });
    controller.releaseNextFetch();
    await fetchPromise;

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
      [ACCOUNT_2.id]: 'loaded',
    });
  });

  it('settles the loading status when the fetch fails', async () => {
    const controller = new FakeAssetsController();

    await expect(
      controller.getAssets([ACCOUNT_1], { forceUpdate: true, fail: true }),
    ).rejects.toThrow('fetch failed');

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });
  });

  it('does not re-mark a settled account, so a later refresh never re-toggles it', async () => {
    const controller = new FakeAssetsController();
    const firstFetch = controller.getAssets([ACCOUNT_1], {
      forceUpdate: true,
    });
    controller.releaseNextFetch();
    await firstFetch;

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });

    // A later forced refresh of the settled account is not tracked.
    const refreshFetch = controller.getAssets([ACCOUNT_1], {
      forceUpdate: true,
    });

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });

    controller.releaseNextFetch();
    await refreshFetch;

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });
  });

  it('marks only accounts that have never settled within a fetch', async () => {
    const controller = new FakeAssetsController();
    const firstFetch = controller.getAssets([ACCOUNT_1], {
      forceUpdate: true,
    });
    controller.releaseNextFetch();
    await firstFetch;

    const mixedFetch = controller.getAssets([ACCOUNT_1, ACCOUNT_2], {
      forceUpdate: true,
    });

    // ACCOUNT_1 is settled and stays loaded; ACCOUNT_2 is on its first fetch.
    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
      [ACCOUNT_2.id]: 'loading',
    });

    controller.releaseNextFetch();
    await mixedFetch;

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
      [ACCOUNT_2.id]: 'loaded',
    });
  });

  it('does not mark anything when there are no accounts', async () => {
    const controller = new FakeAssetsController();
    const fetchPromise = controller.getAssets([], { forceUpdate: true });

    expect(controller.state.assetsLoadingStatus).toBeUndefined();

    controller.releaseNextFetch();
    await fetchPromise;

    expect(controller.state.assetsLoadingStatus).toBeUndefined();
  });

  it('does not track calls that do not force an update', async () => {
    const controller = new FakeAssetsController();
    const fetchPromise = controller.getAssets([ACCOUNT_1]);

    expect(controller.state.assetsLoadingStatus).toBeUndefined();

    controller.releaseNextFetch();
    await fetchPromise;

    expect(controller.state.assetsLoadingStatus).toBeUndefined();
  });

  describe('logging', () => {
    beforeEach(() => {
      mockLog.mockClear();
    });

    it('logs each status transition with the resulting loading status map', async () => {
      const controller = new FakeAssetsController();
      const fetchPromise = controller.getAssets([ACCOUNT_1], {
        forceUpdate: true,
      });

      expect(mockLog).toHaveBeenCalledWith('assetsLoadingStatus updated', {
        status: 'loading',
        accountIds: [ACCOUNT_1.id],
        assetsLoadingStatus: { [ACCOUNT_1.id]: 'loading' },
      });

      controller.releaseNextFetch();
      await fetchPromise;

      expect(mockLog).toHaveBeenCalledWith('assetsLoadingStatus updated', {
        status: 'loaded',
        accountIds: [ACCOUNT_1.id],
        assetsLoadingStatus: { [ACCOUNT_1.id]: 'loaded' },
      });
    });

    it('logs the accounts skipped because they already settled', async () => {
      const controller = new FakeAssetsController();
      const firstFetch = controller.getAssets([ACCOUNT_1], {
        forceUpdate: true,
      });
      controller.releaseNextFetch();
      await firstFetch;
      mockLog.mockClear();

      const refreshFetch = controller.getAssets([ACCOUNT_1, ACCOUNT_2], {
        forceUpdate: true,
      });

      expect(mockLog).toHaveBeenCalledWith(
        'Skipping assetsLoadingStatus for settled accounts',
        { accountIds: [ACCOUNT_1.id] },
      );

      controller.releaseNextFetch();
      await refreshFetch;
    });

    it('does not log when nothing is tracked', async () => {
      const controller = new FakeAssetsController();
      const fetchPromise = controller.getAssets([ACCOUNT_1]);
      controller.releaseNextFetch();
      await fetchPromise;

      expect(mockLog).not.toHaveBeenCalled();
    });
  });
});

describe('trackBackgroundAssetsLoading', () => {
  /**
   * Create a fetch that stays in flight until its `release` or `fail` is
   * called.
   *
   * @returns The fetch function plus controls to settle it.
   */
  const createHeldFetch = (): {
    runFetch: () => Promise<void>;
    release: () => void;
    fail: () => void;
  } => {
    let resolve: () => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return {
      runFetch: () => promise,
      release: () => resolve(),
      fail: () => reject(new Error('background failed')),
    };
  };

  it('marks accounts as loading while the background fetch is in flight and loaded once it settles', async () => {
    const controller = new FakeAssetsController();
    const { runFetch, release } = createHeldFetch();

    const tracked = trackBackgroundAssetsLoading(
      controller,
      [ACCOUNT_1, ACCOUNT_2],
      runFetch,
    );

    expect(controller.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loading',
      [ACCOUNT_2.id]: 'loading',
    });

    release();
    await tracked;

    expect(controller.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
      [ACCOUNT_2.id]: 'loaded',
    });
  });

  it('settles the background status and rethrows when the fetch fails', async () => {
    const controller = new FakeAssetsController();
    const { runFetch, fail } = createHeldFetch();

    const tracked = trackBackgroundAssetsLoading(
      controller,
      [ACCOUNT_1],
      runFetch,
    );
    fail();

    await expect(tracked).rejects.toThrow('background failed');
    expect(controller.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });
  });

  it('keeps an account loading until every overlapping background fetch settles', async () => {
    const controller = new FakeAssetsController();
    const first = createHeldFetch();
    const second = createHeldFetch();

    const firstTracked = trackBackgroundAssetsLoading(
      controller,
      [ACCOUNT_1, ACCOUNT_2],
      first.runFetch,
    );
    const secondTracked = trackBackgroundAssetsLoading(
      controller,
      [ACCOUNT_1],
      second.runFetch,
    );

    first.release();
    await firstTracked;

    // ACCOUNT_1 still has the second fetch in flight; ACCOUNT_2 has none.
    expect(controller.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loading',
      [ACCOUNT_2.id]: 'loaded',
    });

    second.release();
    await secondTracked;

    expect(controller.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
      [ACCOUNT_2.id]: 'loaded',
    });
  });

  it('re-marks accounts on every call, including accounts that already settled', async () => {
    const controller = new FakeAssetsController();
    const first = createHeldFetch();
    const firstTracked = trackBackgroundAssetsLoading(
      controller,
      [ACCOUNT_1],
      first.runFetch,
    );
    first.release();
    await firstTracked;

    const refresh = createHeldFetch();
    const refreshTracked = trackBackgroundAssetsLoading(
      controller,
      [ACCOUNT_1],
      refresh.runFetch,
    );

    expect(controller.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loading',
    });

    refresh.release();
    await refreshTracked;

    expect(controller.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });
  });

  it('tracks overlapping fetches separately per controller', async () => {
    const controllerA = new FakeAssetsController();
    const controllerB = new FakeAssetsController();
    const fetchA = createHeldFetch();
    const fetchB = createHeldFetch();

    const trackedA = trackBackgroundAssetsLoading(
      controllerA,
      [ACCOUNT_1],
      fetchA.runFetch,
    );
    const trackedB = trackBackgroundAssetsLoading(
      controllerB,
      [ACCOUNT_1],
      fetchB.runFetch,
    );

    fetchA.release();
    await trackedA;

    expect(controllerA.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });
    expect(controllerB.state.assetsBackgroundLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loading',
    });

    fetchB.release();
    await trackedB;
  });

  it('does not mark anything when there are no accounts', async () => {
    const controller = new FakeAssetsController();
    const { runFetch, release } = createHeldFetch();

    const tracked = trackBackgroundAssetsLoading(controller, [], runFetch);
    release();
    await tracked;

    expect(controller.state.assetsBackgroundLoadingStatus).toBeUndefined();
  });

  it('logs each background status transition', async () => {
    mockLog.mockClear();
    const controller = new FakeAssetsController();
    const { runFetch, release } = createHeldFetch();

    const tracked = trackBackgroundAssetsLoading(
      controller,
      [ACCOUNT_1],
      runFetch,
    );

    expect(mockLog).toHaveBeenCalledWith(
      'assetsBackgroundLoadingStatus updated',
      {
        status: 'loading',
        accountIds: [ACCOUNT_1.id],
        assetsBackgroundLoadingStatus: { [ACCOUNT_1.id]: 'loading' },
      },
    );

    release();
    await tracked;

    expect(mockLog).toHaveBeenCalledWith(
      'assetsBackgroundLoadingStatus updated',
      {
        status: 'loaded',
        accountIds: [ACCOUNT_1.id],
        assetsBackgroundLoadingStatus: { [ACCOUNT_1.id]: 'loaded' },
      },
    );
  });
});
