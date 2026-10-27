import { cleanAll } from 'nock';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  RESPONSE_METADATA_SURFACE,
  RESPONSE_PRICES_SURFACE,
  responseBalancesSurface,
} from '../__fixtures__/assetSurfaces.js';
import { mockBscSpamApisV6 } from '../__fixtures__/bsc-spam-token/api-responses/index.js';
import type { V6BalancesMock } from '../__fixtures__/bsc-spam-token/api-responses/index.js';
import {
  buildBscSpamAccount,
  buildEmptyAssetsState,
} from '../__fixtures__/bsc-spam-token/bscSpamWallet.js';
import { registerBscSpamNetwork } from '../__fixtures__/bsc-spam-token/messenger.js';
import {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  CDOGE_ASSET_ID_CHECKSUM,
  CDOGE_ASSET_ID_LOWERCASE,
} from '../__fixtures__/bsc-spam-token/wallet.js';
import { createMockMessengers } from '../__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from '../__fixtures__/mockTokenApi.js';
import { withZeroedTimestamps } from '../__fixtures__/test-utils.js';
import { AccountsApiDataSource } from '../data-sources/AccountsApiDataSource.js';
import type {
  AssetsControllerState,
  DataRequest,
  DataResponse,
} from '../types.js';
import type { AssetVisibility } from '../utils/assetVisibility.js';
import { getAssetVisibility } from '../utils/assetVisibility.js';
import { buildFastFetchSources, executeAssetsPipeline } from './index.js';

/**
 * Integration coverage for the fast fetch lane against the BNB Chain wallet
 * from the `$$$DOGECHAIN` (`CDOGE`) spam-token report, on the Accounts API
 * **v6** balances endpoint (`assetsAccountsApiV6` on).
 *
 * Executes the real fast-lane pipeline against the live-captured v6 APIs. The
 * v6 endpoint classifies every balance row and omits `Malicious` rows unless
 * they are requested through `includeAssetIds`, so CDOGE never reaches the
 * pipeline unless the user pinned it.
 *
 * Integration Expectation - CDOGE never reaches balances, metadata,
 * detection or prices, and the response is an authoritative snapshot
 * (`updateMode: 'full'`), unless the user imported it as a custom asset, in
 * which case the pin travels as `includeAssetIds` and the row (flagged
 * `Malicious`) must survive.
 */

const BALANCES = responseBalancesSurface(BSC_SPAM_ACCOUNT_ID);
const METADATA = RESPONSE_METADATA_SURFACE;
const PRICES = RESPONSE_PRICES_SURFACE;

async function runPipeline(
  state: AssetsControllerState,
  {
    omitBalanceAssetIds = [],
    unprocessedIncludeAssetIds = [],
  }: {
    omitBalanceAssetIds?: string[];
    unprocessedIncludeAssetIds?: string[];
  } = {},
): Promise<{ response: DataResponse; v6Balances: V6BalancesMock }> {
  const { assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (rootMessenger) => {
      // v6 integration flag
      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        (): {
          remoteFeatureFlags: Record<string, boolean>;
          cacheTimestamp: number;
        } => ({
          remoteFeatureFlags: { assetsAccountsApiV6: true },
          cacheTimestamp: 0,
        }),
      );

      registerBscSpamNetwork(rootMessenger);
    },
  });

  const queryApiClient = createTestApiClient();

  const accountsApiDataSource = new AccountsApiDataSource({
    messenger: assetsControllerMessenger,
    queryApiClient,
    onActiveChainsUpdated: vi.fn(),
    getAssetsState: (): AssetsControllerState => state,
    getAssetVisibility: (accountIds, chainIds): AssetVisibility =>
      getAssetVisibility({
        state,
        accountIds,
        chainIds,
        getNativeAssetForChain: () => BNB_ASSET_ID,
      }),
  });

  const { v6Balances } = mockBscSpamApisV6({
    omitBalanceAssetIds,
    unprocessedIncludeAssetIds,
  });

  await accountsApiDataSource.refreshActiveChains();

  const account = buildBscSpamAccount();
  const request: DataRequest = {
    accountsWithSupportedChains: [{ account, supportedChains: [BSC_CHAIN_ID] }],
    chainIds: [BSC_CHAIN_ID],
    assetTypes: ['fungible'],
    dataTypes: ['balance', 'metadata', 'price'],
    forceUpdate: true,
  };

  // Pins travel as `includeAssetIds`. A chain that comes back without them
  // is errored for the background lane; this lane does not retry it.
  const sources = buildFastFetchSources(
    { accountsApiDataSource },
    { isBasicFunctionality: true },
  );

  const { response } = await executeAssetsPipeline({
    sources,
    request,
  });

  accountsApiDataSource.destroy();
  queryApiClient.clear();

  return { response, v6Balances };
}

const WALLET_PASSES = [
  {
    pass: 'first pass over a fresh wallet',
    run: async (): Promise<DataResponse> =>
      (await runPipeline(buildEmptyAssetsState())).response,
  },
  {
    pass: 'second pass over the wallet the first pass left behind',
    run: async (): Promise<DataResponse> => {
      const firstPass = await runPipeline(buildEmptyAssetsState());
      cleanAll();

      return (
        await runPipeline(
          buildEmptyAssetsState({
            assetsBalance: firstPass.response.assetsBalance,
            assetsInfo: firstPass.response.assetsInfo,
            assetsPrice: firstPass.response.assetsPrice,
          }),
        )
      ).response;
    },
  },
];

describe('assets pipeline (Accounts API v6): BNB Chain spam token (CDOGE)', () => {
  afterEach(() => {
    cleanAll();
  });

  describe.each(WALLET_PASSES)('$pass', ({ pass, run }) => {
    let response: DataResponse;

    beforeAll(async () => {
      response = await run();
    });

    it.each([BALANCES, METADATA])(
      '$surface - filter out the spam token',
      ({ lookUp }) => {
        expect(lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
      },
    );

    if (pass.startsWith('second')) {
      it('balances - keeps the stored native BNB balance', () => {
        expect(BALANCES.lookUp(response, BNB_ASSET_ID)).toBeDefined();
      });
    } else {
      it.each([BALANCES, METADATA])(
        '$surface - keeps the native BNB asset despite low occurrences',
        ({ lookUp }) => {
          expect(lookUp(response, BNB_ASSET_ID)).toBeDefined();
        },
      );
    }

    // The v6 endpoint omits the Malicious row, so the token is never in
    // `assetsBalance` and no price is fetched for it. Unlock cleanup
    // (`cleanSpamAssets`) still clears any spam price left from an older fetch.
    it('keeps the spam token out of prices', () => {
      expect(PRICES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
    });

    it('reads native BNB image, aggregators, occurrences, and 1-day change from the v6 row', () => {
      expect(METADATA.lookUp(response, BNB_ASSET_ID)).toMatchObject({
        image: 'https://example.com/bnb.png',
        aggregators: ['binance'],
        occurrences: 50,
      });
      expect(PRICES.lookUp(response, BNB_ASSET_ID)).toMatchObject({
        price: 600,
        pricePercentChange1d: -1.5,
      });
    });

    // v6 performs a 'full' update operation (full wipe of balance state)
    it('answers with an authoritative full snapshot', () => {
      expect(response.updateMode).toBe('full');
    });
  });

  it('generates snapshot (source of truth)', async () => {
    const { response } = await runPipeline(buildEmptyAssetsState());

    // eslint-disable-next-line vitest/no-restricted-matchers
    expect(withZeroedTimestamps(response)).toMatchSnapshot();
  });
});

describe('assets pipeline (Accounts API v6): BNB Chain spam token (CDOGE) imported as a custom asset', () => {
  afterEach(() => {
    cleanAll();
  });

  it.each([BALANCES, METADATA])(
    '$surface - keeps the imported token the backend flags as Malicious',
    async ({ lookUp }) => {
      const { response, v6Balances } = await runPipeline(
        buildEmptyAssetsState({
          customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
        }),
      );

      // The pin must reach the endpoint as `includeAssetIds`, which is what
      // makes the backend answer the Malicious row at all.
      expect(v6Balances.requestedIncludeAssetIds.flat()).toContain(
        CDOGE_ASSET_ID_CHECKSUM,
      );
      expect(lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();
    },
  );

  it('does not need an RPC read when the Accounts API resolves the includeAssetIds', async () => {
    const { response } = await runPipeline(
      buildEmptyAssetsState({
        customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
      }),
    );

    expect(BALANCES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();
  });

  it('leaves an unresolved includeAssetIds chain for the background lane', async () => {
    const { response } = await runPipeline(
      buildEmptyAssetsState({
        customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
      }),
      {
        unprocessedIncludeAssetIds: [CDOGE_ASSET_ID_LOWERCASE],
      },
    );

    // The unresolved pin fails the whole chain. This lane does not retry
    // it; the background lane owns that RPC read.
    expect(response.errors?.[BSC_CHAIN_ID]).toBe('Unresolved includeAssetIds');
    expect(BALANCES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
  });
});
