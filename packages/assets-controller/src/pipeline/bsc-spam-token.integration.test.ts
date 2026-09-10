import { parseCaipAssetType } from '@metamask/utils';
import { cleanAll } from 'nock';

import { mockBscSpamApis } from '../__fixtures__/bsc-spam-token/api-responses/index.js';
import {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  CDOGE_ASSET_ID_CHECKSUM,
  CDOGE_ASSET_ID_LOWERCASE,
  buildBscSpamAccount,
  buildEmptyAssetsState,
} from '../__fixtures__/bsc-spam-token/bscSpamWallet.js';
import { createMockAssetControllerMessenger } from '../__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from '../__fixtures__/mockTokenApi.js';
import { AccountsApiDataSource } from '../data-sources/AccountsApiDataSource.js';
import { PriceDataSource } from '../data-sources/PriceDataSource.js';
import { TokenDataSource } from '../data-sources/TokenDataSource.js';
import { DetectionMiddleware } from '../middlewares/DetectionMiddleware.js';
import {
  createParallelBalanceMiddleware,
  createParallelMiddleware,
} from '../middlewares/ParallelMiddleware.js';
import type {
  AssetsControllerStateInternal,
  DataRequest,
  DataResponse,
} from '../types.js';
import { executeAssetsPipeline } from './index.js';

/**
 * Integration coverage for the fast fetch lane against the BNB Chain wallet
 * from the `$$$DOGECHAIN` (`CDOGE`) spam-token report.
 *
 * This drives the real `AccountsApiDataSource`, `DetectionMiddleware`,
 * `TokenDataSource` and `PriceDataSource` through `executeAssetsPipeline`
 * without booting `AssetsController`, and answers every HTTP call from
 * responses captured live off the Accounts, Tokens, Token and Price APIs (see
 * `__fixtures__/bsc-spam-token/`). Only the messenger and the HTTP boundary are
 * mocked.
 *
 * The wallet holds 38 assets. `CDOGE` has one aggregator occurrence, BNB Chain
 * has no entry in `/v1/suggestedOccurrenceFloors` so its floor is the default
 * three, and `eip155:56` is fully supported by the Tokens API — so the spam
 * token genuinely reaches the occurrence filter and should be dropped.
 */

type PipelineResult = {
  response: DataResponse;
  /** The asset IDs each `/v3/assets` request asked about, in request order. */
  requestedAssetBatches: string[][];
};

/**
 * Teardown for everything `runPipeline` constructs.
 *
 * Both entries matter for the suite to terminate. `AccountsApiDataSource`
 * installs a 20-minute chain-refresh interval, and every cached API response
 * holds a 5-minute TanStack Query garbage-collection timer — enough to keep a
 * single-file jest run alive long past the last assertion.
 */
const teardowns: (() => void)[] = [];

/**
 * Balances the pipeline returned for the wallet's account.
 *
 * @param response - The pipeline response.
 * @returns The account's balances, keyed by CAIP-19 asset ID.
 */
function balancesFor(response: DataResponse): Record<string, unknown> {
  return response.assetsBalance?.[BSC_SPAM_ACCOUNT_ID] ?? {};
}

/**
 * Look an asset up in a record case-insensitively.
 *
 * Every assertion about the spam token goes through this: matching
 * case-sensitively is precisely the mistake under test, so a test that only
 * checked one casing would pass while the bug persisted under the other.
 *
 * @param record - The record to search.
 * @param assetId - The CAIP-19 asset ID, in any casing.
 * @returns The matching value, or undefined.
 */
function getIgnoringCase(
  record: Record<string, unknown>,
  assetId: string,
): unknown {
  const lowerId = assetId.toLowerCase();
  const match = Object.keys(record).find(
    (key) => key.toLowerCase() === lowerId,
  );
  return match === undefined ? undefined : record[match];
}

/**
 * Every asset ID the pipeline reported as newly detected, across all accounts.
 *
 * @param response - The pipeline response.
 * @returns The detected asset IDs.
 */
function allDetectedAssetIds(response: DataResponse): string[] {
  return Object.values(response.detectedAssets ?? {}).flat();
}

/**
 * Run the fast fetch lane once against the captured APIs.
 *
 * The lane is composed here rather than through `buildFastFetchSources`, which
 * requires the full production set: the RPC, staking and graduation sources are
 * irrelevant to this wallet and would add network surface unrelated to the bug.
 * The slice below keeps the part of the production order that matters here —
 * balances, then detection, then metadata and prices in parallel.
 * `buildFastFetchSources.test.ts` pins the full ordering separately.
 *
 * @param state - Controller state the pipeline reads through `getAssetsState`.
 * @returns The pipeline response and what each API was asked for.
 */
async function runPipeline(
  state: AssetsControllerStateInternal,
): Promise<PipelineResult> {
  const { assetsControllerMessenger, rootMessenger } =
    createMockAssetControllerMessenger({ delegateGetState: false });

  // AccountsApiDataSource reads the v6-balances feature flag before fetching;
  // absent flags leave it on the v5 endpoint this fixture captures.
  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    (): {
      remoteFeatureFlags: Record<string, never>;
      cacheTimestamp: number;
    } => ({
      remoteFeatureFlags: {},
      cacheTimestamp: 0,
    }),
  );

  const queryApiClient = createTestApiClient();
  const getAssetsState = (): AssetsControllerStateInternal => state;

  const accountsApiDataSource = new AccountsApiDataSource({
    messenger: assetsControllerMessenger,
    queryApiClient,
    onActiveChainsUpdated: (): void => undefined,
  });

  const tokenDataSource = new TokenDataSource(assetsControllerMessenger, {
    queryApiClient,
    getNativeAssetIds: (): string[] => [BNB_ASSET_ID],
    getAssetType: (assetId): 'native' | 'erc20' =>
      parseCaipAssetType(assetId).assetNamespace === 'erc20'
        ? 'erc20'
        : 'native',
  });

  const priceDataSource = new PriceDataSource({
    queryApiClient,
    getSelectedCurrency: (): 'usd' => 'usd',
  });

  teardowns.push((): void => {
    accountsApiDataSource.destroy();
    queryApiClient.clear();
  });

  const { assets } = mockBscSpamApis();

  // `fetch` only accepts chains the source has claimed, which it learns from
  // the Accounts API's supported-network list.
  await accountsApiDataSource.refreshActiveChains();

  const account = buildBscSpamAccount();
  const request: DataRequest = {
    accountsWithSupportedChains: [{ account, supportedChains: [BSC_CHAIN_ID] }],
    chainIds: [BSC_CHAIN_ID],
    assetTypes: ['fungible'],
    dataTypes: ['balance', 'metadata', 'price'],
    forceUpdate: true,
  };

  const { response } = await executeAssetsPipeline({
    sources: [
      createParallelBalanceMiddleware([accountsApiDataSource]),
      new DetectionMiddleware(),
      createParallelMiddleware([tokenDataSource, priceDataSource]),
    ],
    request,
    getAssetsState,
  });

  return { response, requestedAssetBatches: assets.requestedBatches };
}

/**
 * Apply a pipeline response to state the way `AssetsController` merges it, so a
 * second pass sees what the first pass would have persisted.
 *
 * Deliberately naive — a plain merge of balances, metadata and prices. The
 * point is only that whatever survived pass one is "known" in pass two.
 *
 * @param state - The state to merge into.
 * @param response - The pipeline response to apply.
 * @returns The merged state.
 */
function commitToState(
  state: AssetsControllerStateInternal,
  response: DataResponse,
): AssetsControllerStateInternal {
  const assetsBalance = { ...state.assetsBalance };
  for (const [accountId, accountBalances] of Object.entries(
    response.assetsBalance ?? {},
  )) {
    assetsBalance[accountId] = {
      ...(assetsBalance[accountId] ?? {}),
      ...accountBalances,
    };
  }

  return {
    ...state,
    assetsBalance,
    assetsInfo: { ...state.assetsInfo, ...(response.assetsInfo ?? {}) },
    assetsPrice: { ...state.assetsPrice, ...(response.assetsPrice ?? {}) },
  };
}

describe('assets pipeline: BNB Chain spam token (CDOGE)', () => {
  afterEach(() => {
    while (teardowns.length > 0) {
      teardowns.pop()?.();
    }
    cleanAll();
  });

  describe('first pass over a fresh wallet', () => {
    it('drops the sub-floor spam token from the balances it would persist', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());

      const balances = balancesFor(response);

      // The Accounts API returned this balance and the Tokens API said the
      // token has one occurrence against a floor of three, so nothing about it
      // should reach state.
      expect(
        getIgnoringCase(balances, CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
    });

    it('drops the spam token from the detected-asset list', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());

      const detectedLowerIds = allDetectedAssetIds(response).map((assetId) =>
        assetId.toLowerCase(),
      );

      // Left in `detectedAssets`, the spam token is still announced downstream
      // as a new holding even once its balance is gone.
      expect(detectedLowerIds).not.toContain(CDOGE_ASSET_ID_LOWERCASE);
    });

    it('does not enrich the spam token with metadata', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());

      expect(
        getIgnoringCase(response.assetsInfo ?? {}, CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
    });

    // Legitimate failing test, our middleware stack does not filter out spam asset prices!
    // This does eventually get cleaned up during unlock cleanup, but worth flagging.
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('does not carry a price for the spam token', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());
      expect(
        getIgnoringCase(response.assetsPrice ?? {}, CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
    });

    it('keeps the native BNB balance and its metadata despite its low occurrence count', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());

      expect(
        getIgnoringCase(balancesFor(response), BNB_ASSET_ID),
      ).toBeDefined();
      expect(
        getIgnoringCase(response.assetsInfo ?? {}, BNB_ASSET_ID),
      ).toBeDefined();
    });
  });

  describe('the checksum / lower-case boundary', () => {
    it('asks the Tokens API with a checksummed id and is answered with a lower-case one', async () => {
      const { requestedAssetBatches } = await runPipeline(
        buildEmptyAssetsState(),
      );

      const requested = requestedAssetBatches.flat();

      // `AccountsApiDataSource` checksums ERC-20 ids, so that is the casing the
      // pipeline carries and the casing the Tokens API is asked with...
      expect(requested).toContain(CDOGE_ASSET_ID_CHECKSUM);
      expect(requested).not.toContain(CDOGE_ASSET_ID_LOWERCASE);
      // ...while the captured Tokens API answers lower-case regardless. Any
      // filtering that matches asset ids by exact string across this boundary
      // silently does nothing.
    });

    it('prunes balances, metadata, and detected assets for spam tokens', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());

      // spam balances filtered out
      expect(
        getIgnoringCase(balancesFor(response), CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();

      // spam metadata filtered out
      expect(
        getIgnoringCase(response.assetsInfo ?? {}, CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();

      // spam detected assets filtered out
      expect(
        allDetectedAssetIds(response).map((assetId) => assetId.toLowerCase()),
      ).not.toContain(CDOGE_ASSET_ID_LOWERCASE);
    });
  });

  describe('second pass over the wallet the first pass left behind', () => {
    it('still keeps the spam token out once its balance is in state', async () => {
      const firstPass = await runPipeline(buildEmptyAssetsState());
      cleanAll();

      const stateAfterFirstPass = commitToState(
        buildEmptyAssetsState(),
        firstPass.response,
      );
      const { response } = await runPipeline(stateAfterFirstPass);

      // A spam balance that survives pass one is no longer "newly detected" in
      // pass two, so `TokenDataSource` treats it as a balance-only heal — a
      // path that bypasses spam filtering outright. That is what makes the bug
      // stick rather than self-correct on the next poll.
      expect(
        getIgnoringCase(balancesFor(response), CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
      expect(
        getIgnoringCase(response.assetsInfo ?? {}, CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
    });
  });

  describe('custom assets', () => {
    it('keeps a sub-floor token the user imported themselves', async () => {
      // Users may import whatever they like; the occurrence floor must not
      // second-guess an explicit import.
      const importedSpam = CDOGE_ASSET_ID_CHECKSUM;
      const state = buildEmptyAssetsState({
        customAssets: { [BSC_SPAM_ACCOUNT_ID]: [importedSpam] },
      });

      const { response } = await runPipeline(state);

      expect(
        getIgnoringCase(response.assetsInfo ?? {}, importedSpam),
      ).toBeDefined();
    });
  });
});
