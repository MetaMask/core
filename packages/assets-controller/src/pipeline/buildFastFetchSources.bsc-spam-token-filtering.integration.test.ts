import { parseCaipAssetType } from '@metamask/utils';
import { cleanAll } from 'nock';

import { mockBscSpamApis } from '../__fixtures__/bsc-spam-token/api-responses/index.js';
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
 * from the `$$$DOGECHAIN` (`CDOGE`) spam-token report.
 *
 * Executes the real fast-lane pipeline against realistic APIs.
 *
 * Integration Expectation - CDOGE is correctly filtered out.
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
    includeCustomAssetGraduation = true,
  }: {
    rpcDataSource?: AssetsDataSource;
    omitBalanceAssetIds?: string[];
    includeCustomAssetGraduation?: boolean;
  } = {},
): Promise<DataResponse> {
  const { assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (rootMessenger) => {
      // Note - this may change as we add feature flags to the controller/pipeline
      // e.g. Accounts API v6
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

  mockBscSpamApis({ omitBalanceAssetIds });

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
            'Integration should not call graduation to remove assets!',
          );
        },
        getAssetsState: (): AssetsControllerState => state,
      }),
      rpcFallbackMiddleware: new RpcFallbackMiddleware({
        rpcDataSource: rpcOverride ?? rpcDataSource,
        getAssetsState: (): AssetsControllerState => state,
      }),
      detectionMiddleware: new DetectionMiddleware({
        getAssetsState: (): AssetsControllerState => state,
      }),
      tokenDataSource,
      priceDataSource,
    },
    { isBasicFunctionality: true, includeCustomAssetGraduation },
  );

  const { response } = await executeAssetsPipeline({
    sources,
    request,
  });

  accountsApiDataSource.destroy();
  stakedBalanceDataSource.destroy();
  rpcDataSource.destroy();
  queryApiClient.clear();

  return response;
}

const WALLET_PASSES = [
  {
    pass: 'first pass over a fresh wallet',
    run: async (): Promise<DataResponse> =>
      runPipeline(buildEmptyAssetsState()),
  },
  {
    pass: 'second pass over the wallet the first pass left behind',
    run: async (): Promise<DataResponse> => {
      const firstPass = await runPipeline(buildEmptyAssetsState());
      cleanAll();

      return runPipeline(
        buildEmptyAssetsState({
          assetsBalance: firstPass.assetsBalance,
          assetsInfo: firstPass.assetsInfo,
          assetsPrice: firstPass.assetsPrice,
        }),
      );
    },
  },
];

describe('assets pipeline: BNB Chain spam token (CDOGE)', () => {
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

    // Legitimate failing test, our middleware stack does not filter out spam
    // asset prices! This does eventually get cleaned up during unlock cleanup,
    // but worth flagging.
    it.failing('keeps the spam token out of prices', () => {
      expect(PRICES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
    });

    // V5 will perform a 'merge' operation instead of a 'full' operation
    it('v5 pipeline ends up performing a merge operation', () => {
      expect(response.updateMode).toBe('merge');
    });
  });
});

describe('assets pipeline (without graduation middleware only on v6 integration): BNB Chain spam token (CDOGE) imported as a custom asset', () => {
  afterEach(() => {
    cleanAll();
  });

  const pipelineOpts = {
    includeCustomAssetGraduation: false,
  };

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
    '$surface - keeps the imported token despite a positive API balance and low occurrences',
    async ({ lookUp }) => {
      const response = await runPipeline(
        buildEmptyAssetsState({
          customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
        }),
        pipelineOpts,
      );

      expect(lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();
    },
  );

  it('does not re-read the custom asset on RPC when the Accounts API reports its balance', async () => {
    const { source, requests } = createRecordingRpcSource({});

    const response = await runPipeline(
      buildEmptyAssetsState({
        customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
      }),
      {
        ...pipelineOpts,
        rpcDataSource: source,
      },
    );

    expect(requests).toHaveLength(0);
    expect(BALANCES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toBeDefined();
  });

  it('re-reads the custom asset on RPC when the Accounts API omits it', async () => {
    const { source, requests } = createRecordingRpcSource({
      [CDOGE_ASSET_ID_LOWERCASE]: { amount: '4321' },
    });

    const response = await runPipeline(
      buildEmptyAssetsState({
        customAssets: { [BSC_SPAM_ACCOUNT_ID]: [CDOGE_ASSET_ID_CHECKSUM] },
      }),
      {
        ...pipelineOpts,
        rpcDataSource: source,
        omitBalanceAssetIds: [CDOGE_ASSET_ID_LOWERCASE],
      },
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.customAssets ?? []).toContain(CDOGE_ASSET_ID_CHECKSUM);
    expect(BALANCES.lookUp(response, CDOGE_ASSET_ID_LOWERCASE)).toMatchObject({
      amount: '4321',
    });
  });
});
