import { parseCaipAssetType } from '@metamask/utils';
import { cleanAll } from 'nock';

import { mockBscSpamApisV6 } from '../__fixtures__/bsc-spam-token/api-responses/index.js';
import type { V6BalancesMock } from '../__fixtures__/bsc-spam-token/api-responses/index.js';
import {
  buildBscSpamAccount,
  buildEmptyAssetsState,
  getIgnoringCase,
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
import { PriceDataSource } from '../data-sources/PriceDataSource.js';
import { RpcDataSource } from '../data-sources/RpcDataSource.js';
import { StakedBalanceDataSource } from '../data-sources/StakedBalanceDataSource.js';
import { TokenDataSource } from '../data-sources/TokenDataSource.js';
import { CustomAssetGraduationMiddleware } from '../middlewares/CustomAssetGraduationMiddleware.js';
import { DetectionMiddleware } from '../middlewares/DetectionMiddleware.js';
import { RpcFallbackMiddleware } from '../middlewares/RpcFallbackMiddleware.js';
import type {
  AccountId,
  AssetsControllerState,
  AssetsDataSource,
  Caip19AssetId,
  Context,
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
 * they are requested through `includeAssetIds` — so the CDOGE spam filtering
 * the v5 suite performs client-side (occurrence floors) happens server-side
 * here before the token ever reaches the pipeline.
 *
 * Integration Expectation - CDOGE never reaches balances, metadata,
 * detection or prices, and the response is an authoritative snapshot
 * (`updateMode: 'full'`), unless the user imported it as a custom asset, in
 * which case the pin travels as `includeAssetIds` and the row (flagged
 * `Malicious`) must survive.
 */

type ResponseSurface = {
  surface: string;
  lookUp: (response: DataResponse, assetId: string) => unknown;
};

const BALANCES: ResponseSurface = {
  surface: 'balances',
  lookUp: (response, assetId) =>
    getIgnoringCase(
      response.assetsBalance?.[BSC_SPAM_ACCOUNT_ID] ?? {},
      assetId,
    ),
};

const METADATA: ResponseSurface = {
  surface: 'metadata',
  lookUp: (response, assetId) =>
    getIgnoringCase(response.assetsInfo ?? {}, assetId),
};

const PRICES: ResponseSurface = {
  surface: 'prices',
  lookUp: (response, assetId) =>
    getIgnoringCase(response.assetsPrice ?? {}, assetId),
};

const DETECTED_ASSETS: ResponseSurface = {
  surface: 'detected assets',
  lookUp: (response, assetId) =>
    Object.values(response.detectedAssets ?? {})
      .flat()
      .find((detectedId) => detectedId.toLowerCase() === assetId.toLowerCase()),
};

async function runPipeline(
  state: AssetsControllerState,
  {
    rpcDataSource: rpcOverride,
    omitBalanceAssetIds = [],
    unprocessedIncludeAssetIds = [],
  }: {
    rpcDataSource?: AssetsDataSource;
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
    onActiveChainsUpdated: jest.fn(),
    getAssetsState: (): AssetsControllerState => state,
    getAssetVisibility: (accountIds, chainIds): AssetVisibility =>
      getAssetVisibility({
        state,
        accountIds,
        chainIds,
        getNativeAssetForChain: () => BNB_ASSET_ID,
      }),
    isBalanceV6Enabled: (): boolean => true,
  });

  const stakedBalanceDataSource = new StakedBalanceDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated: jest.fn(),
  });

  const rpcDataSource = new RpcDataSource({
    messenger: assetsControllerMessenger,
    getAssetsState: (): AssetsControllerState => state,
    onActiveChainsUpdated: jest.fn(),
    getNativeAssetForChain: (): Caip19AssetId => BNB_ASSET_ID,
    getAssetType: (assetId): 'native' | 'erc20' =>
      parseCaipAssetType(assetId).assetNamespace === 'erc20'
        ? 'erc20'
        : 'native',
    getAssetVisibility: (accountIds, chainIds): AssetVisibility =>
      getAssetVisibility({
        state,
        accountIds,
        chainIds,
        getNativeAssetForChain: () => BNB_ASSET_ID,
      }),
  });

  const tokenDataSource = new TokenDataSource(assetsControllerMessenger, {
    queryApiClient,
    getNativeAssetIds: (): string[] => [BNB_ASSET_ID],
    getAssetType: (assetId): 'native' | 'erc20' =>
      parseCaipAssetType(assetId).assetNamespace === 'erc20'
        ? 'erc20'
        : 'native',
    getAssetsState: (): AssetsControllerState => state,
  });

  const priceDataSource = new PriceDataSource({
    queryApiClient,
    getSelectedCurrency: (): 'usd' => 'usd',
    getAssetsState: (): AssetsControllerState => state,
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

  const sources = buildFastFetchSources(
    {
      accountsApiDataSource,
      stakedBalanceDataSource,
      customAssetGraduationMiddleware: new CustomAssetGraduationMiddleware({
        getSelectedAccountId: (): AccountId => BSC_SPAM_ACCOUNT_ID,
        removeCustomAsset: (): void => {
          throw new Error(
            'The v6 lane never graduates custom assets - pins travel as includeAssetIds!',
          );
        },
        getAssetsState: (): AssetsControllerState => state,
      }),
      rpcFallbackMiddleware: new RpcFallbackMiddleware({
        rpcDataSource: rpcOverride ?? rpcDataSource,
        getAssetsState: (): AssetsControllerState => state,
        isBalanceV6Enabled: (): boolean => true,
      }),
      detectionMiddleware: new DetectionMiddleware({
        getAssetsState: (): AssetsControllerState => state,
      }),
      tokenDataSource,
      priceDataSource,
    },
    // The v6 lane never runs custom-asset graduation: pins are sent to the
    // endpoint as `includeAssetIds`, and an endpoint that cannot resolve one
    // fails the whole chain so the RPC fallback recovers it.
    { isBasicFunctionality: true, includeCustomAssetGraduation: false },
  );

  const { response } = await executeAssetsPipeline({
    sources,
    request,
  });

  accountsApiDataSource.destroy();
  stakedBalanceDataSource.destroy();
  rpcDataSource.destroy();
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

  describe.each(WALLET_PASSES)('$pass', ({ run }) => {
    let response: DataResponse;

    beforeAll(async () => {
      response = await run();
    });

    it.each([BALANCES, METADATA, DETECTED_ASSETS])(
      '$surface - filter out the spam token',
      ({ lookUp }) => {
        expect(lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
      },
    );

    it.each([BALANCES, METADATA])(
      '$surface - keeps the native BNB asset despite low occurrences',
      ({ lookUp }) => {
        expect(lookUp(response, BNB_ASSET_ID)).toBeDefined();
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
      expect(PRICES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
    });

    // v6 performs a 'full' update operation (full wipe of balance state)
    it('answers with an authoritative full snapshot', () => {
      expect(response.updateMode).toBe('full');
    });

    it('captures the full response as a golden record', () => {
      expect(withZeroedTimestamps(response)).toMatchSnapshot();
    });
  });
});

describe('assets pipeline (Accounts API v6): BNB Chain spam token (CDOGE) imported as a custom asset', () => {
  afterEach(() => {
    cleanAll();
  });

  const createRecordingRpcSource = (
    balances: Record<Caip19AssetId, { amount: string }>,
  ): { source: AssetsDataSource; requests: DataRequest[] } => {
    const requests: DataRequest[] = [];
    const source: AssetsDataSource = {
      getName: () => 'RpcDataSource',
      assetsMiddleware: async (ctx): Promise<Context> => {
        requests.push(ctx.request);
        return {
          ...ctx,
          response: {
            assetsBalance: { [BSC_SPAM_ACCOUNT_ID]: balances },
          },
        };
      },
    };
    return { source, requests };
  };

  it.each([BALANCES, METADATA, DETECTED_ASSETS])(
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

  it('does not re-read the custom asset on RPC when the Accounts API resolves the includeAssetIds', async () => {
    const { source, requests } = createRecordingRpcSource({});

    const { response } = await runPipeline(
      buildEmptyAssetsState({
        customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
      }),
      {
        rpcDataSource: source,
      },
    );

    // A resolved pin is neither in `unprocessedIncludeAssetIds` (so no RPC
    // retry is queued) nor left to the legacy stale-asset sweep.
    expect(requests).toHaveLength(0);
    expect(BALANCES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();

    expect(withZeroedTimestamps(response)).toMatchSnapshot();
  });

  it('re-reads the custom asset on RPC when the Accounts API cannot process the includeAssetIds', async () => {
    const { source, requests } = createRecordingRpcSource({
      [CDOGE_ASSET_ID_LOWERCASE]: { amount: '4321' },
    });

    const { response } = await runPipeline(
      buildEmptyAssetsState({
        customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
      }),
      {
        rpcDataSource: source,
        unprocessedIncludeAssetIds: [CDOGE_ASSET_ID_LOWERCASE],
      },
    );

    // The unresolved pin fails the whole chain, so the v6 RPC fallback
    // refetches it in full rather than scoping the request via
    // `customAssets` — the RPC read re-derives the pin from state itself.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.chainIds).toStrictEqual([BSC_CHAIN_ID]);
    expect(BALANCES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toMatchObject({
      amount: '4321',
    });

    expect(withZeroedTimestamps(response)).toMatchSnapshot();
  });
});
