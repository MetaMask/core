import type { BalanceUpdate } from '@metamask/core-backend';
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
  buildCapturedMainnetBalances,
  buildDoubledBscBalances,
  buildDoubledBscNativeBalance,
  buildDoubledBscTokenBalances,
} from './__fixtures__/stale-balance/rpcAmounts.js';
import type { CapturedBalance } from './__fixtures__/stale-balance/rpcAmounts.js';
import { buildSnapState } from './__fixtures__/stale-balance/snap.js';
import type { StaleBalanceSnapState } from './__fixtures__/stale-balance/snap.js';
import {
  buildBscAccount,
  buildEmptySolanaSnapState,
  buildEmptyStaleBalanceState,
  buildMainnetAccount,
  buildSolanaSnapAccount,
  getIgnoringCase,
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
import { waitFor, waitUntilStable } from './__fixtures__/test-utils.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';
import { normalizeAmountString } from './utils/normalizeAmountString.js';

/**
 * Integration coverage for the twelve stale-balance scenarios of
 * `docs/decisions/2026-09-23-accounts-api-v6-integration.md` — the
 * "Stale balance scenarios (`full`)" and "Stale balance scenarios
 * (`merge`)" tables.
 *
 * Boots the real controller against the same captured APIs as the other v6
 * integration suites, and breaks one external boundary at a time — the
 * Solana keyring snap, the BNB Chain RPC endpoint, the Account Activity
 * websocket, and the staking vaults — to assert what the last-known
 * amounts do while that boundary is stale, and what the next full fetch
 * recovers.
 *
 * The fixtures layer the scenario mutations on top of real captures: the
 * wallet's holdings "move between passes" by doubling every BNB Chain
 * balance the RPC provider serves, so a recovered read is provably fresh
 * rather than a copy of the last one.
 */

// ============================================================================
// SCENARIO TABLES
// ============================================================================

/** The captured BNB Chain balances, keyed by lower-cased asset ID. */
const BSC_CAPTURED = buildCapturedBscBalances();

/** The captured mainnet balances, keyed by lower-cased asset ID. */
const MAINNET_CAPTURED = buildCapturedMainnetBalances();

/** The doubled BNB Chain balances the RPC provider serves, lower-cased. */
const BSC_DOUBLED = buildDoubledBscBalances();

/** The lower-cased form of the USDT asset ID, as the captures key it. */
const USDT_ASSET_ID_LOWER = USDT_ASSET_ID_CHECKSUM.toLowerCase();

// ============================================================================
// STATE HELPERS
// ============================================================================

/**
 * Carry a finished pass's surfaces into the next pass's starting state, as
 * the controller would after persisting them.
 *
 * @param state - The state a pass returned.
 * @returns The surfaces to seed the next pass with.
 */
const carryOverSurfaces = (
  state: AssetsControllerState,
): Partial<AssetsControllerState> => ({
  assetsBalance: state.assetsBalance,
  assetsInfo: state.assetsInfo,
  assetsPrice: state.assetsPrice,
});

/**
 * The normalized form a captured (or doubled) balance should land in.
 *
 * @param captured - The raw balance and the decimals it is denominated at.
 * @returns The canonical amount string.
 */
const normalizedAmount = (captured: CapturedBalance): string =>
  normalizeAmountString(captured.balance, captured.decimals);

/**
 * Look up an expected amount by asset ID (any casing) in a captured map.
 *
 * @param captured - The captured (or doubled) balances.
 * @param assetId - The asset ID to expect, any casing.
 * @returns The normalized expected amount.
 */
const expectedAmount = (
  captured: Record<string, CapturedBalance>,
  assetId: string,
): string => normalizedAmount(captured[assetId.toLowerCase()]);

/**
 * Assert one asset's landed amount.
 *
 * @param balances - The account's balances from controller state.
 * @param assetId - The asset ID to look up, any casing.
 * @param expected - The expected amount string.
 */
const expectAmount = (
  balances: Record<string, unknown>,
  assetId: string,
  expected: string,
): void => {
  expect(getIgnoringCase(balances, assetId)).toMatchObject({
    amount: expected,
  });
};

/**
 * The set of lower-cased asset IDs a record keys, for row-set comparisons.
 *
 * @param record - A balance (or other) record.
 * @returns The lower-cased key set.
 */
const lowerKeySet = (record: Record<string, unknown>): Set<string> =>
  new Set(Object.keys(record).map((key) => key.toLowerCase()));

// ============================================================================
// CONTROLLER HARNESS
// ============================================================================

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
  /**
   * Lifecycle and feature flags. Defaults keep the controller dormant
   * (locked, uninitialized, UI closed) so only the explicit `getAssets`
   * calls drive the pipeline; scenario 12 opts into the active lifecycle.
   */
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

// ============================================================================
// SCENARIOS 1-3, 11 — SOLANA KEYRING SNAP (full / merge)
// ============================================================================

/** The Solana wallet as the snap reports it: SOL, JUP, and the pinned USDC. */
const SOLANA_SNAP_BALANCES = {
  [SOL_ASSET_ID]: { amount: '3.25', unit: 'SOL' },
  [SOLANA_JUP_ASSET_ID]: { amount: '40.25', unit: 'JUP' },
  [SOLANA_USDC_ASSET_ID]: { amount: '125.5', unit: 'USDC' },
} as const;

/**
 * Fetch the Solana snap account's balances over the snap, with the
 * scenario's snap responses and starting state.
 *
 * @param options - The snap's responses (`snap`) and the starting `state`.
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
  // Scenario tables: "Stale balance scenarios (`full`)" rows 1-3, plus
  // "Stale balance scenarios (`merge`)" row 4 (the snap live event).

  afterEach(() => {
    cleanAll();
  });

  it('1: keeps the last amounts on screen when the snap is unreachable', async () => {
    const seeded = await fetchSolanaSnapWallet();
    cleanAll();

    const unreachable = await fetchSolanaSnapWallet({
      state: buildEmptySolanaSnapState(carryOverSurfaces(seeded)),
      snap: { failAll: true },
    });

    const balances = unreachable.assetsBalance[SOLANA_ACCOUNT_ID] ?? {};
    // Every holding keeps the last successful read.
    expectAmount(balances, SOL_ASSET_ID, '3.25');
    expectAmount(balances, SOLANA_JUP_ASSET_ID, '40.25');
    expectAmount(balances, SOLANA_USDC_ASSET_ID, '125.5');
    // And nothing else landed while the snap was down.
    expect(lowerKeySet(balances)).toStrictEqual(
      lowerKeySet(seeded.assetsBalance[SOLANA_ACCOUNT_ID] ?? {}),
    );
  });

  it('2: copies the last amount for a skipped asset the snap has seen before', async () => {
    const seeded = await fetchSolanaSnapWallet();
    cleanAll();

    // The snap answers only JUP, skipping SOL (native) and USDC (the user's
    // pin); it has stored amounts for both.
    const skipped = await fetchSolanaSnapWallet({
      state: buildEmptySolanaSnapState(carryOverSurfaces(seeded)),
      snap: {
        balances: { [SOLANA_JUP_ASSET_ID]: { amount: '45.5', unit: 'JUP' } },
      },
    });

    const balances = skipped.assetsBalance[SOLANA_ACCOUNT_ID] ?? {};
    expectAmount(balances, SOLANA_JUP_ASSET_ID, '45.5');
    expectAmount(balances, SOL_ASSET_ID, '3.25');
    expectAmount(balances, SOLANA_USDC_ASSET_ID, '125.5');
    expect(lowerKeySet(balances)).toStrictEqual(
      lowerKeySet(seeded.assetsBalance[SOLANA_ACCOUNT_ID] ?? {}),
    );
  });

  it('3: zero-seeds a skipped visible asset no amount was ever stored for', async () => {
    // A fresh wallet: the snap lists SOL and JUP but answers only JUP, so
    // SOL (native) and the pinned USDC have never had an amount.
    const zeroed = await fetchSolanaSnapWallet({
      snap: {
        balances: { [SOLANA_JUP_ASSET_ID]: { amount: '40.25', unit: 'JUP' } },
      },
    });

    const balances = zeroed.assetsBalance[SOLANA_ACCOUNT_ID] ?? {};
    expectAmount(balances, SOLANA_JUP_ASSET_ID, '40.25');
    // The placeholder zeros are not stale — there is no earlier amount.
    expectAmount(balances, SOL_ASSET_ID, '0');
    expectAmount(balances, SOLANA_USDC_ASSET_ID, '0');
    expect(lowerKeySet(balances)).toStrictEqual(
      new Set([
        SOL_ASSET_ID.toLowerCase(),
        SOLANA_JUP_ASSET_ID.toLowerCase(),
        SOLANA_USDC_ASSET_ID.toLowerCase(),
      ]),
    );
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
        // Seed through a full fetch.
        await controller.getAssets([buildSolanaSnapAccount()], {
          chainIds: [SOLANA_CHAIN_ID],
          forceUpdate: true,
        });
        await waitUntilStable(() => controller.state);

        // The snap's live event names only JUP.
        messenger.publish('AccountsController:accountBalancesUpdated', {
          balances: {
            [SOLANA_ACCOUNT_ID]: {
              [SOLANA_JUP_ASSET_ID]: { amount: '50', unit: 'sol' },
            },
          },
        });
        await waitFor(() => {
          expectAmount(
            controller.state.assetsBalance[SOLANA_ACCOUNT_ID] ?? {},
            SOLANA_JUP_ASSET_ID,
            '50',
          );
        });

        // The skipped holdings keep their last full-fetch amounts.
        const balances = controller.state.assetsBalance[SOLANA_ACCOUNT_ID];
        expectAmount(balances, SOL_ASSET_ID, '3.25');
        expectAmount(balances, SOLANA_USDC_ASSET_ID, '125.5');

        // SOL moves on-chain; only the next full fetch sees it, because
        // the event only ever names the tokens the snap itself reported.
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

        const refreshed = controller.state.assetsBalance[SOLANA_ACCOUNT_ID];
        expectAmount(refreshed, SOL_ASSET_ID, '4');
        // The event's amount for JUP is overwritten by the full fetch too.
        expectAmount(refreshed, SOLANA_JUP_ASSET_ID, '40.25');
        expect(lowerKeySet(refreshed)).toStrictEqual(
          new Set([
            SOL_ASSET_ID.toLowerCase(),
            SOLANA_JUP_ASSET_ID.toLowerCase(),
            SOLANA_USDC_ASSET_ID.toLowerCase(),
          ]),
        );
      },
    );
  });
});

// ============================================================================
// SCENARIOS 4-7 — BNB CHAIN RPC FALLBACK (full)
// ============================================================================

/** The BNB Chain provider as the recovered wallet: every holding doubled. */
const BSC_DOUBLED_PROVIDER = {
  nativeBalanceWei: buildDoubledBscNativeBalance(),
  tokenBalancesWei: buildDoubledBscTokenBalances(),
} as const;

/**
 * Fetch the BNB Chain account's balances, with the scenario's Accounts API
 * mutations, RPC provider overrides and starting state.
 *
 * @param options - The scenario's API mutations, provider overrides, state.
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
  // Scenario table: "Stale balance scenarios (`full`)", rows 4-7. The seed
  // pass lands the captured balances through the Accounts API; the second
  // pass has the API report BNB Chain unprocessed, so the RPC provider
  // answers for it — with the wallet's holdings doubled, so a recovered
  // read is provably fresh.

  afterEach(() => {
    cleanAll();
  });

  it('4: keeps the last amount for the one token whose RPC read fails while the rest of the chain updates', async () => {
    const seeded = await fetchBscWallet();
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState(carryOverSurfaces(seeded)),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
      bscProvider: { failingTokens: [USDT_CONTRACT] },
    });

    const balances = after.assetsBalance[BSC_ACCOUNT_ID] ?? {};
    // Every token updates to its doubled amount except the unread USDT,
    // which keeps the amount the Accounts API seed pass reported.
    for (const [assetId, captured] of Object.entries({
      ...BSC_DOUBLED,
      [USDT_ASSET_ID_LOWER]: BSC_CAPTURED[USDT_ASSET_ID_LOWER],
    })) {
      expectAmount(balances, assetId, normalizedAmount(captured));
    }
    expect(lowerKeySet(balances)).toStrictEqual(
      lowerKeySet(seeded.assetsBalance[BSC_ACCOUNT_ID] ?? {}),
    );
  });

  it('5: drops the failed token that was already at zero and is not tracked on purpose', async () => {
    // The seed pass documents a wallet that holds no USDT: the API reports
    // it at zero, an unused token it detected once.
    const seeded = await fetchBscWallet({
      apiMutations: { setBalances: { [USDT_ASSET_ID_LOWER]: '0' } },
    });
    const seededBalances = seeded.assetsBalance[BSC_ACCOUNT_ID] ?? {};
    expectAmount(seededBalances, USDT_ASSET_ID_CHECKSUM, '0');
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState(carryOverSurfaces(seeded)),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
      bscProvider: { failingTokens: [USDT_CONTRACT] },
    });

    const balances = after.assetsBalance[BSC_ACCOUNT_ID] ?? {};
    // The unused token disappears; everything else updates to its doubled
    // amount.
    expect(getIgnoringCase(balances, USDT_ASSET_ID_CHECKSUM)).toBeUndefined();
    expect(lowerKeySet(balances)).toStrictEqual(
      new Set(
        [...lowerKeySet(seededBalances)].filter(
          (assetId) => assetId !== USDT_ASSET_ID_LOWER,
        ),
      ),
    );
    for (const [assetId, captured] of Object.entries(BSC_DOUBLED)) {
      if (assetId === USDT_ASSET_ID_LOWER) {
        continue;
      }
      expectAmount(balances, assetId, normalizedAmount(captured));
    }
  });

  it('6: keeps every last amount on the chain when all RPC calls fail', async () => {
    const seeded = await fetchBscWallet();
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState(carryOverSurfaces(seeded)),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
      bscProvider: { failAll: true },
    });

    const balances = after.assetsBalance[BSC_ACCOUNT_ID] ?? {};
    // The whole chain is unreadable; every captured amount survives.
    for (const [assetId, captured] of Object.entries(BSC_CAPTURED)) {
      expectAmount(balances, assetId, normalizedAmount(captured));
    }
    expect(lowerKeySet(balances)).toStrictEqual(
      lowerKeySet(seeded.assetsBalance[BSC_ACCOUNT_ID] ?? {}),
    );
  });

  it('7: recovers the chain with fresh amounts once the RPC fallback owns it', async () => {
    const seeded = await fetchBscWallet();
    cleanAll();

    const after = await fetchBscWallet({
      state: buildEmptyStaleBalanceState(carryOverSurfaces(seeded)),
      apiMutations: { unprocessedNetworks: [BSC_CHAIN_ID] },
    });

    const balances = after.assetsBalance[BSC_ACCOUNT_ID] ?? {};
    // The chain failed over to RPC, which reads every holding at its
    // (doubled) fresh amount.
    for (const [assetId, captured] of Object.entries(BSC_DOUBLED)) {
      expectAmount(balances, assetId, normalizedAmount(captured));
    }
    expect(lowerKeySet(balances)).toStrictEqual(
      lowerKeySet(seeded.assetsBalance[BSC_ACCOUNT_ID] ?? {}),
    );
  });
});

// ============================================================================
// SCENARIOS 8-10 — ACCOUNT ACTIVITY LIVE EVENTS (merge)
// ============================================================================

/** A `postBalance` amount of GTAI in wei, hex-encoded as the service does. */
const GTAI_WEI = {
  /** 950.25 GTAI — the fresh amount after the transaction. */
  fresh: '0x33835e2c5c16f10000',
  /** 900.125 GTAI — the one valid row among the malformed ones. */
  validAmongMalformed: '0x30cbbe666ef07c8000',
  /** 1 GTAI — an obviously wrong amount the service sends. */
  wrong: '0xde0b6b3a7640000',
} as const;

/** The GTAI amounts the events above should land, after unit conversion. */
const GTAI_EVENT_AMOUNTS = {
  fresh: '950.25',
  validAmongMalformed: '900.125',
  wrong: '1',
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
 * Drop a field from a row, for the malformed-row scenario.
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
    return { ...row, asset: undefined } as BalanceUpdate;
  }
  if (field === 'postBalance') {
    return { ...row, postBalance: undefined } as BalanceUpdate;
  }
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
  // Scenario table: "Stale balance scenarios (`merge`)", rows 1-3. The
  // controller is seeded through a full Accounts API poll; the events then
  // overlay single tokens on top of it.

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
      const balances = controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {};
      // Before the event, both tokens sit at their captured amounts.
      expectAmount(
        balances,
        GTAI_ASSET_ID_CHECKSUM,
        expectedAmount(BSC_CAPTURED, GTAI_ASSET_ID_CHECKSUM),
      );
      expectAmount(
        balances,
        USDT_ASSET_ID_CHECKSUM,
        expectedAmount(BSC_CAPTURED, USDT_ASSET_ID_CHECKSUM),
      );

      // The transaction's event names only GTAI.
      publishBalanceUpdated(messenger, [
        balanceUpdateRow(GTAI_ASSET_ID_CHECKSUM, GTAI_WEI.fresh),
      ]);
      await waitFor(() => {
        expectAmount(
          controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {},
          GTAI_ASSET_ID_CHECKSUM,
          GTAI_EVENT_AMOUNTS.fresh,
        );
      });

      // The omitted USDT (and the native BNB) keep the last full poll's
      // amounts.
      const after = controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {};
      expectAmount(
        after,
        USDT_ASSET_ID_CHECKSUM,
        expectedAmount(BSC_CAPTURED, USDT_ASSET_ID_CHECKSUM),
      );
      expectAmount(
        after,
        BNB_ASSET_ID,
        expectedAmount(BSC_CAPTURED, BNB_ASSET_ID),
      );
      // The overlay added no rows and removed none.
      expect(lowerKeySet(after)).toStrictEqual(lowerKeySet(balances));
    });
  });

  it('9: writes nothing for malformed rows, and nothing at all for an empty event', async () => {
    await withBscLiveController(async ({ controller, messenger }) => {
      const before = controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {};

      // The row missing `postBalance` names USDT; the row missing `asset`
      // names GTAI; the row missing `decimals` names the native BNB. One
      // valid row names GTAI's fresh amount.
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
        expectAmount(
          controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {},
          GTAI_ASSET_ID_CHECKSUM,
          GTAI_EVENT_AMOUNTS.validAmongMalformed,
        );
      });

      // The malformed rows wrote nothing: the amounts they tried to name
      // keep the last full poll's values.
      const after = controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {};
      expectAmount(
        after,
        USDT_ASSET_ID_CHECKSUM,
        expectedAmount(BSC_CAPTURED, USDT_ASSET_ID_CHECKSUM),
      );
      expectAmount(
        after,
        BNB_ASSET_ID,
        expectedAmount(BSC_CAPTURED, BNB_ASSET_ID),
      );
      expect(lowerKeySet(after)).toStrictEqual(lowerKeySet(before));

      // An empty event writes nothing at all.
      publishBalanceUpdated(messenger, []);
      await waitUntilStable(() => controller.state);
      expect(
        controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {},
      ).toStrictEqual(after);
    });
  });

  it('10: overwrites a wrong event amount at the next full poll', async () => {
    await withBscLiveController(async ({ controller, messenger }) => {
      const before = controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {};
      // The event sends an amount that is wrong.
      publishBalanceUpdated(messenger, [
        balanceUpdateRow(GTAI_ASSET_ID_CHECKSUM, GTAI_WEI.wrong),
      ]);
      await waitFor(() => {
        expectAmount(
          controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {},
          GTAI_ASSET_ID_CHECKSUM,
          GTAI_EVENT_AMOUNTS.wrong,
        );
      });

      // The next full poll overwrites it with the Accounts API's amount.
      await controller.getAssets([buildBscAccount()], {
        chainIds: [BSC_CHAIN_ID],
        forceUpdate: true,
      });
      await waitUntilStable(() => controller.state);
      expectAmount(
        controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {},
        GTAI_ASSET_ID_CHECKSUM,
        expectedAmount(BSC_CAPTURED, GTAI_ASSET_ID_CHECKSUM),
      );
      // The full poll also restored the wallet's full row set.
      expect(
        lowerKeySet(controller.state.assetsBalance[BSC_ACCOUNT_ID] ?? {}),
      ).toStrictEqual(lowerKeySet(before));
    });
  });
});

// ============================================================================
// SCENARIO 12 — STAKED ETH ON MAINNET AND HOODI (merge)
// ============================================================================

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

/** The staked ETH amounts the reads above should land. */
const STAKED_AMOUNTS = {
  mainnetSeed: '0.6',
  mainnetAfterTx: '0.85',
  hoodi: '0.35',
} as const;

describe('AssetsController stale-balance scenarios: staked ETH on mainnet and Hoodi', () => {
  // Scenario table: "Stale balance scenarios (`merge`)", row 5. The vault
  // balances come only from the staking source's reads — the captured
  // Accounts API response has no vault rows — so every assertion here is
  // about what the last staking read reported.

  afterEach(() => {
    cleanAll();
  });

  it('12: refreshes only the vault the transaction touched, and staked ETH survives token polls that never include it', async () => {
    await withStaleBalanceController(
      {
        lifecycle: {
          // The keyring is unlocked by the test itself (below), so the
          // startup refresh and subscriptions happen inside the test,
          // after the harness's readiness wait.
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
        // Boot the wallet: unlock the keyring, which (with the UI open and
        // the account tree initialized) starts the controller.
        messenger.publish('KeyringController:unlock');

        // The startup refresh lands the captured balances, and both
        // vaults' staked ETH from the staking source's initial read.
        await waitFor(
          () => {
            const balances =
              controller.state.assetsBalance[MAINNET_ACCOUNT_ID] ?? {};
            expectAmount(
              balances,
              MAINNET_STAKED_ETH_ASSET_ID,
              STAKED_AMOUNTS.mainnetSeed,
            );
            expectAmount(
              balances,
              HOODI_STAKED_ETH_ASSET_ID,
              STAKED_AMOUNTS.hoodi,
            );
          },
          { timeoutMs: 5000 },
        );
        await waitUntilStable(() => controller.state, { timeoutMs: 5000 });

        // The wallet interacts with the mainnet vault; its holdings move.
        providerStates[MAINNET_NETWORK_CLIENT_ID].stakingByContract[
          MAINNET_STAKING_CONTRACT
        ] = { ...STAKING_READS.mainnetAfterTx };

        // The transaction confirms against the mainnet vault.
        messenger.publish('TransactionController:transactionConfirmed', {
          chainId: '0x1',
          txParams: {
            from: STALE_WALLET_ADDRESS,
            to: MAINNET_STAKING_CONTRACT,
          },
        });

        // Only the mainnet vault refreshes; the Hoodi vault keeps its last
        // staking read.
        await waitFor(
          () => {
            expectAmount(
              controller.state.assetsBalance[MAINNET_ACCOUNT_ID] ?? {},
              MAINNET_STAKED_ETH_ASSET_ID,
              STAKED_AMOUNTS.mainnetAfterTx,
            );
          },
          { timeoutMs: 5000 },
        );
        await waitUntilStable(() => controller.state, { timeoutMs: 5000 });
        expectAmount(
          controller.state.assetsBalance[MAINNET_ACCOUNT_ID] ?? {},
          HOODI_STAKED_ETH_ASSET_ID,
          STAKED_AMOUNTS.hoodi,
        );

        // A token poll over both chains never includes staked ETH; both
        // staked rows survive it at their last staking read.
        await controller.getAssets([buildMainnetAccount()], {
          chainIds: [MAINNET_CHAIN_ID, HOODI_CHAIN_ID],
          forceUpdate: true,
        });
        await waitUntilStable(() => controller.state, { timeoutMs: 5000 });

        const balances =
          controller.state.assetsBalance[MAINNET_ACCOUNT_ID] ?? {};
        expectAmount(
          balances,
          MAINNET_STAKED_ETH_ASSET_ID,
          STAKED_AMOUNTS.mainnetAfterTx,
        );
        expectAmount(balances, HOODI_STAKED_ETH_ASSET_ID, STAKED_AMOUNTS.hoodi);
        // The poll's own surfaces landed too: the captured mainnet ETH and
        // the Hoodi native ETH the RPC fallback read.
        expectAmount(
          balances,
          ETH_ASSET_ID,
          expectedAmount(MAINNET_CAPTURED, ETH_ASSET_ID),
        );
        expectAmount(balances, HOODI_NATIVE_ASSET_ID, '0.75');
        // Both vaults survived a token poll that never includes them.
        expect(lowerKeySet(balances)).toContain(
          MAINNET_STAKED_ETH_ASSET_ID.toLowerCase(),
        );
        expect(lowerKeySet(balances)).toContain(
          HOODI_STAKED_ETH_ASSET_ID.toLowerCase(),
        );
      },
    );
  });
});
