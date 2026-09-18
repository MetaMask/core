import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerState } from './AssetsController.js';
import { trackAssetsLoading } from './trackAssetsLoading.js';

type FakeControllerState = Pick<
  AssetsControllerState,
  'assetsLoadingStatus' | 'assetsLoadingTokens'
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

  state: FakeControllerState = {
    assetsLoadingStatus: {},
    assetsLoadingTokens: {},
  };

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
    expect(controller.state.assetsLoadingTokens[ACCOUNT_1.id]).toBeDefined();

    controller.releaseNextFetch();
    await fetchPromise;

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
      [ACCOUNT_2.id]: 'loaded',
    });
    expect(controller.state.assetsLoadingTokens).toStrictEqual({});
  });

  it('settles the loading status when the fetch fails', async () => {
    const controller = new FakeAssetsController();

    await expect(
      controller.getAssets([ACCOUNT_1], { forceUpdate: true, fail: true }),
    ).rejects.toThrow('fetch failed');

    expect(controller.state.assetsLoadingStatus).toStrictEqual({
      [ACCOUNT_1.id]: 'loaded',
    });
    expect(controller.state.assetsLoadingTokens).toStrictEqual({});
  });

  it('does not let an older fetch settle an account a newer overlapping fetch owns', async () => {
    const controller = new FakeAssetsController();
    const olderFetch = controller.getAssets([ACCOUNT_1], {
      forceUpdate: true,
    });
    const newerFetch = controller.getAssets([ACCOUNT_1], {
      forceUpdate: true,
    });

    expect(controller.state.assetsLoadingStatus[ACCOUNT_1.id]).toBe('loading');

    controller.releaseNextFetch();
    await olderFetch;

    expect(controller.state.assetsLoadingStatus[ACCOUNT_1.id]).toBe('loading');

    controller.releaseNextFetch();
    await newerFetch;

    expect(controller.state.assetsLoadingStatus[ACCOUNT_1.id]).toBe('loaded');
  });

  it('does not mark anything when there are no accounts', async () => {
    const controller = new FakeAssetsController();
    const fetchPromise = controller.getAssets([], { forceUpdate: true });

    expect(controller.state.assetsLoadingStatus).toStrictEqual({});
    expect(controller.state.assetsLoadingTokens).toStrictEqual({});

    controller.releaseNextFetch();
    await fetchPromise;

    expect(controller.state.assetsLoadingStatus).toStrictEqual({});
  });

  it('does not track calls that do not force an update', async () => {
    const controller = new FakeAssetsController();
    const fetchPromise = controller.getAssets([ACCOUNT_1]);

    expect(controller.state.assetsLoadingStatus).toStrictEqual({});
    expect(controller.state.assetsLoadingTokens).toStrictEqual({});

    controller.releaseNextFetch();
    await fetchPromise;

    expect(controller.state.assetsLoadingStatus).toStrictEqual({});
  });
});
