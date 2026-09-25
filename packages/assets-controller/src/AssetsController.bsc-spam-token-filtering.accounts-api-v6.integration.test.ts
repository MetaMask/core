/* eslint-disable jest/no-restricted-matchers */
import type { ApiPlatformClient } from '@metamask/core-backend';
import { cleanAll } from 'nock';

import { mockBscSpamApisV6 } from './__fixtures__/bsc-spam-token/api-responses/index.js';
import type { V6BalancesMock } from './__fixtures__/bsc-spam-token/api-responses/index.js';
import {
  buildBscSpamAccount,
  buildEmptyAssetsState,
  getIgnoringCase,
} from './__fixtures__/bsc-spam-token/bscSpamWallet.js';
import { registerBscSpamControllerActions } from './__fixtures__/bsc-spam-token/messenger.js';
import {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  CDOGE_ASSET_ID_CHECKSUM,
  CDOGE_ASSET_ID_LOWERCASE,
} from './__fixtures__/bsc-spam-token/wallet.js';
import { createMockMessengers } from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from './__fixtures__/mockTokenApi.js';
import {
  waitFor,
  waitUntilStable,
  withZeroedTimestamps,
} from './__fixtures__/test-utils.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';

/**
 * Integration coverage for `AssetsController` against the BNB Chain wallet
 * from the `$$$DOGECHAIN` (`CDOGE`) spam-token report, on the Accounts API
 * **v6** balances endpoint, enabled the way the rollout does it: the
 * `assetsAccountsApiV6` remote feature flag.
 *
 * Boots the real controller, answers the same live-captured v6 APIs as
 * `buildFastFetchSources.bsc-spam-token-filtering.accounts-api-v6.integration.test.ts`,
 * and asserts CDOGE never lands in persisted state. On v6 the backend omits
 * the Malicious CDOGE row server-side, so nothing client-side may resurrect
 * it (RPC fallback, detection, prices) — unless the user imported it as a
 * custom asset, in which case the pin travels as `includeAssetIds` and the
 * row must survive (see the custom-asset suite below).
 */

/** The flag set that turns the Accounts API v6 balances endpoint on. */
const ACCOUNTS_API_V6_FLAGS = { assetsAccountsApiV6: true } as const;

type StateSurface = {
  surface: string;
  lookUp: (state: AssetsControllerState, assetId: string) => unknown;
};

const BALANCES: StateSurface = {
  surface: 'balances',
  lookUp: (state, assetId) =>
    getIgnoringCase(state.assetsBalance[BSC_SPAM_ACCOUNT_ID] ?? {}, assetId),
};

const METADATA: StateSurface = {
  surface: 'metadata',
  lookUp: (state, assetId) => getIgnoringCase(state.assetsInfo, assetId),
};

const PRICES: StateSurface = {
  surface: 'prices',
  lookUp: (state, assetId) => getIgnoringCase(state.assetsPrice, assetId),
};

type WithControllerCallback<ReturnValue> = (args: {
  controller: AssetsController;
  messenger: MockRootMessenger;
}) => Promise<ReturnValue>;

async function withController<ReturnValue>(
  {
    state = buildEmptyAssetsState(),
    queryApiClient = createTestApiClient(),
    remoteFeatureFlags = ACCOUNTS_API_V6_FLAGS,
  }: {
    state?: Partial<AssetsControllerState>;
    queryApiClient?: ApiPlatformClient;
    remoteFeatureFlags?: Record<string, boolean>;
  },
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (messenger) =>
      registerBscSpamControllerActions(messenger, { remoteFeatureFlags }),
  });

  const controller = new AssetsController({
    messenger: assetsControllerMessenger,
    state,
    queryApiClient,
    isBasicFunctionality: (): boolean => true,
  });

  try {
    return await fn({ controller, messenger: rootMessenger });
  } finally {
    controller.destroy();
    queryApiClient.clear();
  }
}

async function fetchWallet(
  state: Partial<AssetsControllerState> = buildEmptyAssetsState(),
  remoteFeatureFlags: Record<string, boolean> = ACCOUNTS_API_V6_FLAGS,
): Promise<{ state: AssetsControllerState; v6Balances: V6BalancesMock }> {
  const { accountsSupportedNetworks, v6Balances } = mockBscSpamApisV6();

  const stateAfter = await withController(
    { state, remoteFeatureFlags },
    async ({ controller }) => {
      // wait for `AccountsApiDataSource` to ask `/v2/supportedNetworks` to indicate the fast-lane is ready
      await waitFor(() =>
        expect(accountsSupportedNetworks.isDone()).toBe(true),
      );

      await controller.getAssets([buildBscSpamAccount()], {
        chainIds: [BSC_CHAIN_ID],
        forceUpdate: true,
      });

      // `getAssets` awaits the fast lane only; the slow lane is fire-and-forget
      // and can still be writing. Let state settle so the assertions about CDOGE
      // being absent cannot pass just because nothing has landed yet.
      await waitUntilStable(() => controller.state);

      return controller.state;
    },
  );

  return { state: stateAfter, v6Balances };
}

const WALLET_PASSES = [
  {
    pass: 'first pass over a fresh wallet',
    run: async (): Promise<AssetsControllerState> =>
      (await fetchWallet()).state,
  },
  {
    pass: 'second pass over the wallet the first pass left behind',
    run: async (): Promise<AssetsControllerState> => {
      const firstPass = (await fetchWallet()).state;
      cleanAll();

      const secondPass = await fetchWallet(
        buildEmptyAssetsState({
          assetsBalance: firstPass.assetsBalance,
          assetsInfo: firstPass.assetsInfo,
          assetsPrice: firstPass.assetsPrice,
        }),
      );
      return secondPass.state;
    },
  },
];

describe('AssetsController (Accounts API v6): BNB Chain spam token (CDOGE)', () => {
  afterEach(() => {
    cleanAll();
  });

  describe.each(WALLET_PASSES)('$pass', ({ run }) => {
    let state: AssetsControllerState;

    beforeAll(async () => {
      state = await run();
    });

    it.each([BALANCES, METADATA])(
      '$surface - filter out the spam token',
      ({ lookUp }) => {
        expect(lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
        expect(lookUp(state, CDOGE_ASSET_ID_CHECKSUM)).toBeUndefined();
      },
    );

    it.each([BALANCES, METADATA])(
      '$surface - keeps the native BNB asset despite low occurrences',
      ({ lookUp }) => {
        expect(lookUp(state, BNB_ASSET_ID)).toBeDefined();
      },
    );

    // Unlike the v5 suite, this is not `it.failing`!
    // On v6 the backend omits the Malicious row, so the token is
    // never in `assetsBalance` or `detectedAssets` at any pipeline stage and
    // no price is ever fetched for it.
    //
    // Note we still need the unlock cleanup (`cleanSpamAssets`) to
    // eventually clean up any remaining spam asset price entries.
    it('keeps the spam token out of prices', () => {
      expect(PRICES.lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
    });

    it('captures the full state as a golden record', () => {
      expect(withZeroedTimestamps(state)).toMatchSnapshot();
    });
  });
});

describe('AssetsController (Accounts API v6): BNB Chain spam token (CDOGE) imported as a custom asset', () => {
  afterEach(() => {
    cleanAll();
  });

  function buildCustomAssetWalletState(): AssetsControllerState {
    return buildEmptyAssetsState({
      customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
      assetsBalance: {
        [BSC_SPAM_ACCOUNT_ID]: {
          [CDOGE_ASSET_ID_CHECKSUM]: { amount: '0' },
        },
      },
      assetsInfo: {
        [CDOGE_ASSET_ID_CHECKSUM]: {
          type: 'erc20',
          symbol: 'CDOGE',
          name: '$$$DOGECHAIN',
          decimals: 9,
        },
      },
    });
  }

  it('keeps the imported token in customAssets, balances and metadata', async () => {
    const { state, v6Balances } = await fetchWallet(
      buildCustomAssetWalletState(),
    );

    // The pin must reach the endpoint as `includeAssetIds`, which is what
    // makes the backend answer the Malicious row at all.
    expect(v6Balances.requestedIncludeAssetIds.flat()).toContain(
      CDOGE_ASSET_ID_CHECKSUM,
    );

    expect(state.customAssets[BSC_SPAM_ACCOUNT_ID]).toContain(
      CDOGE_ASSET_ID_CHECKSUM,
    );
    expect(BALANCES.lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();
    expect(METADATA.lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();
  });

  it('captures the full state as a golden record', async () => {
    const { state: goldenState } = await fetchWallet(
      buildCustomAssetWalletState(),
    );

    expect(withZeroedTimestamps(goldenState)).toMatchSnapshot();
  });
});

describe("AssetsController (Accounts API v6): 'full' update operation - stale tracked spam token already in state", () => {
  afterEach(() => {
    cleanAll();
  });

  /**
   * State as a wallet would have it after the spam token snuck in through an
   * older (v5-era) fetch: a tracked CDOGE balance with metadata and a price,
   * but NOT a custom-asset pin. Mirrors the seed the v5 suite uses to show
   * the opposite outcome.
   *
   * @returns The seeded controller state.
   */
  function buildStaleSpamWalletState(): AssetsControllerState {
    return buildEmptyAssetsState({
      assetsBalance: {
        [BSC_SPAM_ACCOUNT_ID]: {
          [CDOGE_ASSET_ID_CHECKSUM]: { amount: '100' },
        },
      },
      assetsInfo: {
        [CDOGE_ASSET_ID_CHECKSUM]: {
          type: 'erc20',
          symbol: 'CDOGE',
          name: '$$$DOGECHAIN',
          decimals: 9,
        },
      },
      assetsPrice: {
        [CDOGE_ASSET_ID_CHECKSUM]: {
          price: 1,
          lastUpdated: 0,
          assetPriceType: 'fungible',
          usdPrice: 1,
        },
      },
    });
  }

  describe('fetching the wallet on the v6 lane', () => {
    let state: AssetsControllerState;

    beforeAll(async () => {
      state = (await fetchWallet(buildStaleSpamWalletState())).state;
    });

    // The v6 lane answers an authoritative snapshot (`updateMode: 'full'`):
    // balances on the chains the snapshot covers are replaced wholesale, and
    // the backend omitted the Malicious CDOGE row — so the seeded balance is
    // dropped, not merged over. The v5 suite shows the opposite outcome from
    // the same seed.
    it('wipes the stale balance', () => {
      expect(BALANCES.lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
    });

    // The snapshot really covered BNB Chain — the wipe above is the snapshot
    // replacing covered-chain balances, not a failed fetch.
    it('keeps the native BNB asset', () => {
      expect(BALANCES.lookUp(state, BNB_ASSET_ID)).toBeDefined();
    });

    // Prices and metadata are append-only in state updates, so the stale
    // price and metadata linger until the unlock cleanup strips them —
    // the v6 snapshot cleans balances, not prices.
    it.each([METADATA, PRICES])(
      '$surface - stale entry lingers',
      ({ lookUp }) => {
        expect(lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();
      },
    );

    it('captures the full state as a golden record', () => {
      expect(withZeroedTimestamps(state)).toMatchSnapshot();
    });
  });
});
