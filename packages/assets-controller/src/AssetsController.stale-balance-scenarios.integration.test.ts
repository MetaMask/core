import type { BalanceUpdate } from '@metamask/core-backend';
import { TransactionStatus } from '@metamask/transaction-controller';
import { cleanAll } from 'nock';

import { createMockMessengers } from './__fixtures__/MockAssetControllerMessenger.js';
import type {
  MockRootMessenger,
  RegisterWalletLifecycleMocksOptions,
} from './__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from './__fixtures__/mockTokenApi.js';
import { mockStaleBalanceApis } from './__fixtures__/stale-balance/api-responses/index.js';
import {
  buildStaleBalanceProviderStates,
  registerStaleBalanceControllerActions,
} from './__fixtures__/stale-balance/messenger.js';
import type { StaleBalanceProviderState } from './__fixtures__/stale-balance/provider.js';
import {
  buildCapturedBscBalances,
  buildDoubledBscBalances,
  buildDoubledBscNativeBalance,
  buildDoubledBscTokenBalances,
} from './__fixtures__/stale-balance/rpcAmounts.js';
import { buildSnapState } from './__fixtures__/stale-balance/snap.js';
import type { StaleBalanceSnapState } from './__fixtures__/stale-balance/snap.js';
import {
  buildBscAccount,
  buildEmptySolanaSnapState,
  buildEmptyStaleBalanceState,
  buildMainnetAccount,
  buildSolanaSnapAccount,
} from './__fixtures__/stale-balance/staleBalanceWallet.js';
import {
  BNB_ASSET_ID,
  BSC_ACCOUNT_ID,
  BSC_CHAIN_ID,
  ETH_ASSET_ID,
  GTAI_ASSET_ID_CHECKSUM,
  HOODI_CHAIN_ID,
  HOODI_NATIVE_ASSET_ID,
  HOODI_STAKED_ETH_ASSET_ID,
  HOODI_STAKING_CONTRACT,
  MAINNET_ACCOUNT_ID,
  MAINNET_CHAIN_ID,
  MAINNET_NETWORK_CLIENT_ID,
  MAINNET_STAKED_ETH_ASSET_ID,
  MAINNET_STAKING_CONTRACT,
  SOL_ASSET_ID,
  SOLANA_ACCOUNT_ID,
  SOLANA_CHAIN_ID,
  SOLANA_JUP_ASSET_ID,
  SOLANA_USDC_ASSET_ID,
  STALE_WALLET_ADDRESS,
  USDT_ASSET_ID_CHECKSUM,
  USDT_CONTRACT,
} from './__fixtures__/stale-balance/wallet.js';
import {
  getIgnoringCase,
  waitFor,
  waitUntilStable,
} from './__fixtures__/test-utils.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';
import { normalizeAmountString } from './utils/normalizeAmountString.js';

/**
 * Integration coverage for the twelve stale-balance scenarios of
 * `docs/decisions/2026-09-23-accounts-api-v6-integration.md` — the
 * "Stale balance scenarios (`full`)" and "Stale balance scenarios
 * (`merge`)" tables. Boots the real controller against the same captured
 * APIs as the other v6 integration suites and breaks one external boundary
 * at a time.
 */

/** The captured BNB Chain balances, keyed by lower-cased asset ID. */
const BSC_CAPTURED = buildCapturedBscBalances();

/** The doubled BNB Chain balances the RPC provider serves, lower-cased. */
const BSC_DOUBLED = buildDoubledBscBalances();

/** The lower-cased form of the USDT asset ID, as the captures key it. */
const USDT_ASSET_ID_LOWER = USDT_ASSET_ID_CHECKSUM.toLowerCase();

type StateSurface = {
  surface: string;
  lookUp: (state: AssetsControllerState, assetId: string) => unknown;
  getAssetIds: (state: AssetsControllerState) => Set<string>;
  lookupAmount: (
    state: AssetsControllerState,
    assetId: string,
  ) => string | undefined;
};

type StaleBalanceHarnessOptions = {
  state?: Partial<AssetsControllerState>;
  /** Mutations of the captured Accounts API v6 balances response. */
  apiMutations?: {
    omitAssetIds?: string[];
    setBalances?: Record<string, string>;
    unprocessedNetworks?: string[];
  };
  /** EVM provider state overrides per chain. */
  providers?: {
    bsc?: Partial<StaleBalanceProviderState>;
    mainnet?: Partial<StaleBalanceProviderState>;
    hoodi?: Partial<StaleBalanceProviderState>;
  };
  /** The Solana keyring snap's responses. */
  snap?: Partial<StaleBalanceSnapState>;
  /** Lifecycle and feature flags; defaults keep the controller dormant. */
  lifecycle?: RegisterWalletLifecycleMocksOptions;
};

type StaleBalanceHarnessCallback<ReturnValue> = (args: {
  controller: AssetsController;
  messenger: MockRootMessenger;
  /** The per-chain provider states, mutable between phases. */
  providerStates: Record<string, StaleBalanceProviderState>;
  /** The Solana snap state, mutable between phases. */
  snapState: StaleBalanceSnapState;
}) => Promise<ReturnValue>;

async function withStaleBalanceController<ReturnValue>(
  {
    state = buildEmptyStaleBalanceState(),
    apiMutations = {},
    providers = {},
    snap = {},
    lifecycle = {
      isKeyringUnlocked: false,
      isAccountTreeInitialized: false,
      clientControllerState: { isUiOpen: false },
      remoteFeatureFlags: { assetsAccountsApiV6: true },
    },
  }: StaleBalanceHarnessOptions,
  fn: StaleBalanceHarnessCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mocks = mockStaleBalanceApis(apiMutations);
  const providerStates = buildStaleBalanceProviderStates(providers);
  const snapState = buildSnapState(snap);

  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (messenger) =>
      registerStaleBalanceControllerActions(messenger, {
        providerStates,
        snapState,
        lifecycle,
      }),
  });

  const queryApiClient = createTestApiClient();
  const controller = new AssetsController({
    messenger: assetsControllerMessenger,
    state,
    queryApiClient,
    isBasicFunctionality: (): boolean => true,
  });

  try {
    // `AccountsApiDataSource` loads `/v2/supportedNetworks` asynchronously
    // on boot; wait for it so the explicit fetch below cannot race it.
    await waitFor(() =>
      expect(mocks.accountsSupportedNetworks.isDone()).toBe(true),
    );
    return await fn({
      controller,
      messenger: rootMessenger,
      providerStates,
      snapState,
    });
  } finally {
    controller.destroy();
    queryApiClient.clear();
  }
}

/** The Solana wallet as the snap reports it: SOL, JUP, and the pinned USDC. */
const SOLANA_SNAP_BALANCES = {
  [SOL_ASSET_ID]: { amount: '3.25', unit: 'SOL' },
  [SOLANA_JUP_ASSET_ID]: { amount: '40.25', unit: 'JUP' },
  [SOLANA_USDC_ASSET_ID]: { amount: '125.5', unit: 'USDC' },
} as const;

/**
 * Fetch the Solana snap account's balances over the snap.
 *
 * @param options - The snap's responses and the starting state.
 * @param options.snap - Overrides of the healthy snap responses.
 * @param options.state - The starting controller state.
 * @returns The controller state after the fetch settles.
 */
async function fetchSolanaSnapWallet({
  snap = {},
  state = buildEmptySolanaSnapState(),
}: {
  snap?: Partial<StaleBalanceSnapState>;
  state?: Partial<AssetsControllerState>;
} = {}): Promise<AssetsControllerState> {
  return await withStaleBalanceController(
    {
      state,
      snap: {
        listedAssetIds: [SOL_ASSET_ID, SOLANA_JUP_ASSET_ID],
        balances: SOLANA_SNAP_BALANCES,
        ...snap,
      },
    },
    async ({ controller }) => {
      await controller.getAssets([buildSolanaSnapAccount()], {
        chainIds: [SOLANA_CHAIN_ID],
        forceUpdate: true,
      });
      await waitUntilStable(() => controller.state);
      return controller.state;
    },
  );
}

describe('AssetsController stale-balance scenarios: Solana keyring snap', () => {
  const BALANCES: StateSurface = {
    surface: 'balances',
    lookUp: (state, assetId) =>
      getIgnoringCase(state.assetsBalance[SOLANA_ACCOUNT_ID] ?? {}, assetId),
    getAssetIds: (state) =>
      new Set(
        Object.keys(state.assetsBalance[SOLANA_ACCOUNT_ID] ?? {}).map((key) =>
          key.toLowerCase(),
        ),
      ),
    lookupAmount: (state, assetId) =>
      (
        getIgnoringCase(
          state.assetsBalance[SOLANA_ACCOUNT_ID] ?? {},
          assetId,
        ) as { amount?: string } | undefined
      )?.amount,
  };

  afterEach(() => {
    cleanAll();
  });

  it('1: keeps the last amounts on screen when the snap is unreachable', async () => {
    const seeded = await fetchSolanaSnapWallet();
    cleanAll();

    const unreachable = await fetchSolanaSnapWallet({
      state: buildEmptySolanaSnapState({
        assetsBalance: seeded.assetsBalance,
        assetsInfo: seeded.assetsInfo,
        assetsPrice: seeded.assetsPrice,
      }),
      snap: { failAll: true },
    });

    expect(BALANCES.lookupAmount(unreachable, SOL_ASSET_ID)).toBe('3.25');
    expect(BALANCES.lookupAmount(unreachable, SOLANA_JUP_ASSET_ID)).toBe(
      '40.25',
    );
    expect(BALANCES.lookupAmount(unreachable, SOLANA_USDC_ASSET_ID)).toBe(
      '125.5',
    );
    expect(BALANCES.getAssetIds(unreachable)).toStrictEqual(
      BALANCES.getAssetIds(seeded),
    );
  });

  it('2: copies the last amount for a skipped asset the snap has seen before', async () => {
    const seeded = await fetchSolanaSnapWallet();
    cleanAll();

    const skipped = await fetchSolanaSnapWallet({
      state: buildEmptySolanaSnapState({
        assetsBalance: seeded.assetsBalance,
        assetsInfo: seeded.assetsInfo,
        assetsPrice: seeded.assetsPrice,
      }),
      snap: {
        balances: { [SOLANA_JUP_ASSET_ID]: { amount: '45.5', unit: 'JUP' } },
      },
    });

    expect(BALANCES.lookupAmount(skipped, SOLANA_JUP_ASSET_ID)).toBe('45.5');
    expect(BALANCES.lookupAmount(skipped, SOL_ASSET_ID)).toBe('3.25');
    expect(BALANCES.lookupAmount(skipped, SOLANA_USDC_ASSET_ID)).toBe('125.5');
    expect(BALANCES.getAssetIds(skipped)).toStrictEqual(
      BALANCES.getAssetIds(seeded),
    );
  });

  it('3: zero-seeds a skipped visible asset no amount was ever stored for', async () => {
    const zeroed = await fetchSolanaSnapWallet({
      snap: {
        balances: { [SOLANA_JUP_ASSET_ID]: { amount: '40.25', unit: 'JUP' } },
      },
    });

    expect(BALANCES.lookupAmount(zeroed, SOLANA_JUP_ASSET_ID)).toBe('40.25');
    expect(BALANCES.lookupAmount(zeroed, SOL_ASSET_ID)).toBe('0');
    expect(BALANCES.lookupAmount(zeroed, SOLANA_USDC_ASSET_ID)).toBe('0');
  });

  it('11: overlays only the holdings the snap event names, and the next full fetch refreshes the skipped one', async () => {
    await withStaleBalanceController(
      {
        state: buildEmptySolanaSnapState(),
        snap: {
          listedAssetIds: [SOL_ASSET_ID, SOLANA_JUP_ASSET_ID],
          balances: SOLANA_SNAP_BALANCES,
        },
      },
      async ({ controller, messenger, snapState }) => {
        await controller.getAssets([buildSolanaSnapAccount()], {
          chainIds: [SOLANA_CHAIN_ID],
          forceUpdate: true,
        });
        await waitUntilStable(() => controller.state);

        messenger.publish('AccountsController:accountBalancesUpdated', {
          balances: {
            [SOLANA_ACCOUNT_ID]: {
              [SOLANA_JUP_ASSET_ID]: { amount: '50', unit: 'sol' },
            },
          },
        });
        await waitFor(() => {
          expect(
            BALANCES.lookupAmount(controller.state, SOLANA_JUP_ASSET_ID),
          ).toBe('50');
        });

        expect(BALANCES.lookupAmount(controller.state, SOL_ASSET_ID)).toBe(
          '3.25',
        );
        expect(
          BALANCES.lookupAmount(controller.state, SOLANA_USDC_ASSET_ID),
        ).toBe('125.5');

        snapState.balances = {
          [SOL_ASSET_ID]: { amount: '4', unit: 'SOL' },
          [SOLANA_JUP_ASSET_ID]: { amount: '40.25', unit: 'JUP' },
          [SOLANA_USDC_ASSET_ID]: { amount: '125.5', unit: 'USDC' },
        };
        await controller.getAssets([buildSolanaSnapAccount()], {
          chainIds: [SOLANA_CHAIN_ID],
          forceUpdate: true,
        });
        await waitUntilStable(() => controller.state);

        expect(BALANCES.lookupAmount(controller.state, SOL_ASSET_ID)).toBe('4');
        expect(
          BALANCES.lookupAmount(controller.state, SOLANA_JUP_ASSET_ID),
        ).toBe('40.25');
        expect(
          BALANCES.lookupAmount(controller.state, SOLANA_USDC_ASSET_ID),
        ).toBe('125.5');
      },
    );
  });
});

/** The BNB Chain provider as the recovered wallet: every holding doubled. */
const BSC_DOUBLED_PROVIDER = {
  nativeBalanceWei: buildDoubledBscNativeBalance(),
  tokenBalancesWei: buildDoubledBscTokenBalances(),
} as const;

/**
 * Fetch the BNB Chain account's balances with the scenario's API mutations,
 * RPC provider overrides and starting state.
 *
 * @param options - The scenario's API mutations, provider overrides and state.
 * @param options.apiMutations - Mutations of the v6 balances response.
 * @param options.bscProvider - Overrides of the doubled BNB Chain provider.
 * @param options.state - The starting controller state.
 * @returns The controller state after the fetch settles.
 */
async function fetchBscWallet({
  apiMutations = {},
  bscProvider = {},
  state = buildEmptyStaleBalanceState(),
}: {
  apiMutations?: StaleBalanceHarnessOptions['apiMutations'];
  bscProvider?: Partial<StaleBalanceProviderState>;
  state?: Partial<AssetsControllerState>;
} = {}): Promise<AssetsControllerState> {
  return await withStaleBalanceController(
    {
      state,
      apiMutations,
      providers: {
        bsc: { ...BSC_DOUBLED_PROVIDER, ...bscProvider },
      },
    },
    async ({ controller }) => {
      await controller.getAssets([buildBscAccount()], {
        chainIds: [BSC_CHAIN_ID],
        forceUpdate: true,
      });
      await waitUntilStable(() => controller.state);
      return controller.state;
    },
  );
}

describe('AssetsController stale-balance scenarios: BNB Chain RPC fallback', () => {
  const BALANCES: StateSurface = {
    surface: 'balances',
    lookUp: (state, assetId) =>
      getIgnoringCase(state.assetsBalance[BSC_ACCOUNT_ID] ?? {}, assetId),
    getAssetIds: (state) =>
      new Set(
        Object.keys(state.assetsBalance[BSC_ACCOUNT_ID] ?? {}).map((key) =>
          key.toLowerCase(),
        ),
      ),
    lookupAmount: (state, assetId) =>
      (
        getIgnoringCase(state.assetsBalance[BSC_ACCOUNT_ID] ?? {}, assetId) as
          | { amount?: string }
          | undefined
      )?.amount,
  };

  afterEach(() => {
    cleanAll();
  });

  it('4: keeps the last amount for the one token whose RPC read fails while the rest of the chain updates', async () => {
    const seeded = await fetchBscWallet();
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState({
        assetsBalance: seeded.assetsBalance,
        assetsInfo: seeded.assetsInfo,
        assetsPrice: seeded.assetsPrice,
      }),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
      bscProvider: { failingTokens: [USDT_CONTRACT] },
    });

    for (const [assetId, captured] of Object.entries({
      ...BSC_DOUBLED,
      [USDT_ASSET_ID_LOWER]: BSC_CAPTURED[USDT_ASSET_ID_LOWER],
    })) {
      expect(BALANCES.lookupAmount(after, assetId)).toBe(
        normalizeAmountString(captured.balance, captured.decimals),
      );
    }
    expect(BALANCES.getAssetIds(after)).toStrictEqual(
      BALANCES.getAssetIds(seeded),
    );
  });

  it('5: drops the failed token that was already at zero and is not tracked on purpose', async () => {
    const seeded = await fetchBscWallet({
      apiMutations: { setBalances: { [USDT_ASSET_ID_LOWER]: '0' } },
    });
    expect(BALANCES.lookupAmount(seeded, USDT_ASSET_ID_CHECKSUM)).toBe('0');
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState({
        assetsBalance: seeded.assetsBalance,
        assetsInfo: seeded.assetsInfo,
        assetsPrice: seeded.assetsPrice,
      }),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
      bscProvider: { failingTokens: [USDT_CONTRACT] },
    });

    expect(
      BALANCES.lookupAmount(after, USDT_ASSET_ID_CHECKSUM),
    ).toBeUndefined();
    expect(BALANCES.getAssetIds(after)).toStrictEqual(
      new Set(
        [...BALANCES.getAssetIds(seeded)].filter(
          (assetId) => assetId !== USDT_ASSET_ID_LOWER,
        ),
      ),
    );
    for (const [assetId, captured] of Object.entries(BSC_DOUBLED)) {
      if (assetId === USDT_ASSET_ID_LOWER) {
        continue;
      }
      expect(BALANCES.lookupAmount(after, assetId)).toBe(
        normalizeAmountString(captured.balance, captured.decimals),
      );
    }
  });

  it('6: keeps every last amount on the chain when all RPC calls fail', async () => {
    const seeded = await fetchBscWallet();
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState({
        assetsBalance: seeded.assetsBalance,
        assetsInfo: seeded.assetsInfo,
        assetsPrice: seeded.assetsPrice,
      }),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
      bscProvider: { failAll: true },
    });

    for (const [assetId, captured] of Object.entries(BSC_CAPTURED)) {
      expect(BALANCES.lookupAmount(after, assetId)).toBe(
        normalizeAmountString(captured.balance, captured.decimals),
      );
    }
    expect(BALANCES.getAssetIds(after)).toStrictEqual(
      BALANCES.getAssetIds(seeded),
    );
  });

  it('7: recovers the chain with fresh amounts once the RPC fallback owns it', async () => {
    const seeded = await fetchBscWallet();
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState({
        assetsBalance: seeded.assetsBalance,
        assetsInfo: seeded.assetsInfo,
        assetsPrice: seeded.assetsPrice,
      }),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
    });

    for (const [assetId, captured] of Object.entries(BSC_DOUBLED)) {
      expect(BALANCES.lookupAmount(after, assetId)).toBe(
        normalizeAmountString(captured.balance, captured.decimals),
      );
    }
    expect(BALANCES.getAssetIds(after)).toStrictEqual(
      BALANCES.getAssetIds(seeded),
    );
  });
});

/** `postBalance` amounts of GTAI in wei, hex-encoded as the service sends. */
const GTAI_WEI = {
  fresh: '0x33835e2c5c16f10000',
  validAmongMalformed: '0x30cbbe666ef07c8000',
  wrong: '0xde0b6b3a7640000',
} as const;

/** The GTAI amounts the events above land, after unit conversion. */
const GTAI_EVENT_AMOUNTS = {
  fresh: '950.25',
  validAmongMalformed: '900.125',
  wrong: '1',
} as const;

/** The captured amounts the seeded full poll lands, as events overlay them. */
const CAPTURED_AMOUNTS = {
  [GTAI_ASSET_ID_CHECKSUM]: '910.2040000000002',
  [USDT_ASSET_ID_CHECKSUM]: '0.002916',
  [BNB_ASSET_ID]: '0.0094950054678',
} as const;

/**
 * Build one `AccountActivityService:balanceUpdated` update row.
 *
 * @param assetId - The CAIP-19 asset ID the row names.
 * @param amount - The `postBalance` amount (wei, hex or decimal).
 * @returns The update row.
 */
const balanceUpdateRow = (assetId: string, amount: string): BalanceUpdate => ({
  asset: { fungible: true, type: assetId, unit: 'wei', decimals: 18 },
  postBalance: { amount },
  transfers: [],
});

/**
 * Drop a field from a row, for the malformed-row scenario. The result
 * deliberately violates `BalanceUpdate`, as a malformed service payload
 * would; each directive below marks one intentional violation.
 *
 * @param row - The row to break.
 * @param field - The field to remove.
 * @returns The malformed row, as the service would send it.
 */
const malformedBalanceUpdateRow = (
  row: BalanceUpdate,
  field: 'asset' | 'postBalance' | 'decimals',
): BalanceUpdate => {
  if (field === 'asset') {
    // @ts-expect-error The row deliberately carries no asset.
    return { ...row, asset: undefined } as BalanceUpdate;
  }
  if (field === 'postBalance') {
    // @ts-expect-error The row deliberately carries no postBalance.
    return { ...row, postBalance: undefined } as BalanceUpdate;
  }
  // @ts-expect-error The row's asset deliberately carries no decimals.
  return {
    ...row,
    asset: { ...row.asset, decimals: undefined },
  } as BalanceUpdate;
};

/**
 * Publish an `AccountActivityService:balanceUpdated` event for the wallet's
 * BNB Chain activity.
 *
 * @param messenger - The root messenger.
 * @param updates - The event's update rows.
 */
const publishBalanceUpdated = (
  messenger: MockRootMessenger,
  updates: BalanceUpdate[],
): void => {
  messenger.publish('AccountActivityService:balanceUpdated', {
    address: STALE_WALLET_ADDRESS,
    chain: BSC_CHAIN_ID,
    updates,
  });
};

describe('AssetsController stale-balance scenarios: Account Activity live events', () => {
  const BALANCES: StateSurface = {
    surface: 'balances',
    lookUp: (state, assetId) =>
      getIgnoringCase(state.assetsBalance[BSC_ACCOUNT_ID] ?? {}, assetId),
    getAssetIds: (state) =>
      new Set(
        Object.keys(state.assetsBalance[BSC_ACCOUNT_ID] ?? {}).map((key) =>
          key.toLowerCase(),
        ),
      ),
    lookupAmount: (state, assetId) =>
      (
        getIgnoringCase(state.assetsBalance[BSC_ACCOUNT_ID] ?? {}, assetId) as
          | { amount?: string }
          | undefined
      )?.amount,
  };

  afterEach(() => {
    cleanAll();
  });

  /**
   * Boot a controller over the captured BNB Chain wallet and drive it
   * through a full fetch, ready for live event scenarios.
   *
   * @param fn - The scenario, run against the seeded controller.
   * @returns A promise resolving when the scenario completes.
   */
  const withBscLiveController = (
    fn: StaleBalanceHarnessCallback<void>,
  ): Promise<void> =>
    withStaleBalanceController(
      { state: buildEmptyStaleBalanceState() },
      async (args) => {
        await args.controller.getAssets([buildBscAccount()], {
          chainIds: [BSC_CHAIN_ID],
          forceUpdate: true,
        });
        await waitUntilStable(() => args.controller.state);
        await fn(args);
      },
    );

  it('8: overlays only the token the event names; the omitted token keeps its last amount', async () => {
    await withBscLiveController(async ({ controller, messenger }) => {
      const before = controller.state;
      expect(
        BALANCES.lookupAmount(controller.state, GTAI_ASSET_ID_CHECKSUM),
      ).toBe(CAPTURED_AMOUNTS[GTAI_ASSET_ID_CHECKSUM]);
      expect(
        BALANCES.lookupAmount(controller.state, USDT_ASSET_ID_CHECKSUM),
      ).toBe(CAPTURED_AMOUNTS[USDT_ASSET_ID_CHECKSUM]);

      publishBalanceUpdated(messenger, [
        balanceUpdateRow(GTAI_ASSET_ID_CHECKSUM, GTAI_WEI.fresh),
      ]);
      await waitFor(() => {
        expect(
          BALANCES.lookupAmount(controller.state, GTAI_ASSET_ID_CHECKSUM),
        ).toBe(GTAI_EVENT_AMOUNTS.fresh);
      });

      expect(
        BALANCES.lookupAmount(controller.state, USDT_ASSET_ID_CHECKSUM),
      ).toBe(CAPTURED_AMOUNTS[USDT_ASSET_ID_CHECKSUM]);
      expect(BALANCES.lookupAmount(controller.state, BNB_ASSET_ID)).toBe(
        CAPTURED_AMOUNTS[BNB_ASSET_ID],
      );
      expect(BALANCES.getAssetIds(controller.state)).toStrictEqual(
        BALANCES.getAssetIds(before),
      );
    });
  });

  it('9: writes nothing for malformed rows, and nothing at all for an empty event', async () => {
    await withBscLiveController(async ({ controller, messenger }) => {
      const before = controller.state;

      publishBalanceUpdated(messenger, [
        malformedBalanceUpdateRow(
          balanceUpdateRow(USDT_ASSET_ID_CHECKSUM, GTAI_WEI.fresh),
          'postBalance',
        ),
        malformedBalanceUpdateRow(
          balanceUpdateRow(GTAI_ASSET_ID_CHECKSUM, GTAI_WEI.fresh),
          'asset',
        ),
        malformedBalanceUpdateRow(
          balanceUpdateRow(BNB_ASSET_ID, GTAI_WEI.fresh),
          'decimals',
        ),
        balanceUpdateRow(GTAI_ASSET_ID_CHECKSUM, GTAI_WEI.validAmongMalformed),
      ]);
      await waitFor(() => {
        expect(
          BALANCES.lookupAmount(controller.state, GTAI_ASSET_ID_CHECKSUM),
        ).toBe(GTAI_EVENT_AMOUNTS.validAmongMalformed);
      });

      const after = controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {};
      expect(
        BALANCES.lookupAmount(controller.state, USDT_ASSET_ID_CHECKSUM),
      ).toBe(CAPTURED_AMOUNTS[USDT_ASSET_ID_CHECKSUM]);
      expect(BALANCES.lookupAmount(controller.state, BNB_ASSET_ID)).toBe(
        CAPTURED_AMOUNTS[BNB_ASSET_ID],
      );
      expect(BALANCES.getAssetIds(controller.state)).toStrictEqual(
        BALANCES.getAssetIds(before),
      );

      publishBalanceUpdated(messenger, []);
      await waitUntilStable(() => controller.state);
      expect(
        controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {},
      ).toStrictEqual(after);
    });
  });

  it('10: overwrites a wrong event amount at the next full poll', async () => {
    await withBscLiveController(async ({ controller, messenger }) => {
      const before = controller.state;

      publishBalanceUpdated(messenger, [
        balanceUpdateRow(GTAI_ASSET_ID_CHECKSUM, GTAI_WEI.wrong),
      ]);
      await waitFor(() => {
        expect(
          BALANCES.lookupAmount(controller.state, GTAI_ASSET_ID_CHECKSUM),
        ).toBe(GTAI_EVENT_AMOUNTS.wrong);
      });

      await controller.getAssets([buildBscAccount()], {
        chainIds: [BSC_CHAIN_ID],
        forceUpdate: true,
      });
      await waitUntilStable(() => controller.state);
      expect(
        BALANCES.lookupAmount(controller.state, GTAI_ASSET_ID_CHECKSUM),
      ).toBe(CAPTURED_AMOUNTS[GTAI_ASSET_ID_CHECKSUM]);
      expect(BALANCES.getAssetIds(controller.state)).toStrictEqual(
        BALANCES.getAssetIds(before),
      );
    });
  });
});

/** Staking-vault reads the providers serve. */
const STAKING_READS = {
  /** The mainnet vault as of the seed: 0.5 shares worth 0.6 ETH. */
  mainnetSeed: {
    sharesWei: '500000000000000000',
    assetsWei: '600000000000000000',
  },
  /** The mainnet vault after the deposit: 0.7 shares worth 0.85 ETH. */
  mainnetAfterTx: {
    sharesWei: '700000000000000000',
    assetsWei: '850000000000000000',
  },
  /** The Hoodi vault, untouched throughout: 0.3 shares worth 0.35 ETH. */
  hoodi: {
    sharesWei: '300000000000000000',
    assetsWei: '350000000000000000',
  },
} as const;

/** The wallet's native ETH on Hoodi: 0.75 ETH. */
const HOODI_NATIVE_BALANCE_WEI = '750000000000000000';

/** The staked ETH amounts the reads above land. */
const STAKED_AMOUNTS = {
  mainnetSeed: '0.6',
  mainnetAfterTx: '0.85',
  hoodi: '0.35',
} as const;

/** The captured mainnet ETH the token poll lands. */
const MAINNET_ETH_CAPTURED_AMOUNT = '0.053234767359623827';

describe('AssetsController stale-balance scenarios: staked ETH on mainnet and Hoodi', () => {
  const BALANCES: StateSurface = {
    surface: 'balances',
    lookUp: (state, assetId) =>
      getIgnoringCase(state.assetsBalance[MAINNET_ACCOUNT_ID] ?? {}, assetId),
    getAssetIds: (state) =>
      new Set(
        Object.keys(state.assetsBalance[MAINNET_ACCOUNT_ID] ?? {}).map((key) =>
          key.toLowerCase(),
        ),
      ),
    lookupAmount: (state, assetId) =>
      (
        getIgnoringCase(
          state.assetsBalance[MAINNET_ACCOUNT_ID] ?? {},
          assetId,
        ) as { amount?: string } | undefined
      )?.amount,
  };

  afterEach(() => {
    cleanAll();
  });

  it('12: refreshes only the vault the transaction touched, and staked ETH survives token polls that never include it', async () => {
    await withStaleBalanceController(
      {
        lifecycle: {
          // The keyring is unlocked by the test itself, after the
          // harness's readiness wait.
          isKeyringUnlocked: false,
          isAccountTreeInitialized: true,
          clientControllerState: { isUiOpen: true },
          remoteFeatureFlags: { assetsAccountsApiV6: true },
        },
        providers: {
          mainnet: {
            stakingByContract: {
              [MAINNET_STAKING_CONTRACT]: STAKING_READS.mainnetSeed,
            },
          },
          hoodi: {
            nativeBalanceWei: HOODI_NATIVE_BALANCE_WEI,
            stakingByContract: {
              [HOODI_STAKING_CONTRACT]: STAKING_READS.hoodi,
            },
          },
        },
        snap: {
          listedAssetIds: [SOL_ASSET_ID, SOLANA_JUP_ASSET_ID],
          balances: SOLANA_SNAP_BALANCES,
        },
      },
      async ({ controller, messenger, providerStates }) => {
        // Unlock starts the controller (UI open, account tree initialized).
        messenger.publish('KeyringController:unlock');

        await waitFor(
          () => {
            expect(
              BALANCES.lookupAmount(
                controller.state,
                MAINNET_STAKED_ETH_ASSET_ID,
              ),
            ).toBe(STAKED_AMOUNTS.mainnetSeed);
            expect(
              BALANCES.lookupAmount(
                controller.state,
                HOODI_STAKED_ETH_ASSET_ID,
              ),
            ).toBe(STAKED_AMOUNTS.hoodi);
          },
          { timeoutMs: 5000 },
        );
        await waitUntilStable(() => controller.state, { timeoutMs: 5000 });

        providerStates[MAINNET_NETWORK_CLIENT_ID].stakingByContract[
          MAINNET_STAKING_CONTRACT
        ] = { ...STAKING_READS.mainnetAfterTx };

        messenger.publish('TransactionController:transactionConfirmed', {
          id: 'stale-balance-staking-transaction',
          networkClientId: MAINNET_NETWORK_CLIENT_ID,
          status: TransactionStatus.confirmed,
          time: 0,
          chainId: '0x1',
          txParams: {
            from: STALE_WALLET_ADDRESS,
            to: MAINNET_STAKING_CONTRACT,
          },
        });

        await waitFor(
          () => {
            expect(
              BALANCES.lookupAmount(
                controller.state,
                MAINNET_STAKED_ETH_ASSET_ID,
              ),
            ).toBe(STAKED_AMOUNTS.mainnetAfterTx);
          },
          { timeoutMs: 5000 },
        );
        await waitUntilStable(() => controller.state, { timeoutMs: 5000 });
        expect(
          BALANCES.lookupAmount(controller.state, HOODI_STAKED_ETH_ASSET_ID),
        ).toBe(STAKED_AMOUNTS.hoodi);

        await controller.getAssets([buildMainnetAccount()], {
          chainIds: [MAINNET_CHAIN_ID, HOODI_CHAIN_ID],
          forceUpdate: true,
        });
        await waitUntilStable(() => controller.state, { timeoutMs: 5000 });

        expect(
          BALANCES.lookupAmount(controller.state, MAINNET_STAKED_ETH_ASSET_ID),
        ).toBe(STAKED_AMOUNTS.mainnetAfterTx);
        expect(
          BALANCES.lookupAmount(controller.state, HOODI_STAKED_ETH_ASSET_ID),
        ).toBe(STAKED_AMOUNTS.hoodi);
        // The poll's own surfaces: the captured mainnet ETH and the Hoodi
        // native ETH the RPC fallback read.
        expect(BALANCES.lookupAmount(controller.state, ETH_ASSET_ID)).toBe(
          MAINNET_ETH_CAPTURED_AMOUNT,
        );
        expect(
          BALANCES.lookupAmount(controller.state, HOODI_NATIVE_ASSET_ID),
        ).toBe('0.75');
        expect(
          BALANCES.lookUp(controller.state, MAINNET_STAKED_ETH_ASSET_ID),
        ).toBeDefined();
        expect(
          BALANCES.lookUp(controller.state, HOODI_STAKED_ETH_ASSET_ID),
        ).toBeDefined();
      },
    );
  });
});
