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
  AssetsControllerStateInternal,
  Caip19AssetId,
  DataRequest,
  DataResponse,
} from '../types.js';
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
  state: AssetsControllerStateInternal,
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
  });

  const stakedBalanceDataSource = new StakedBalanceDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated: jest.fn(),
  });

  const rpcDataSource = new RpcDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated: jest.fn(),
    getNativeAssetForChain: (): Caip19AssetId => BNB_ASSET_ID,
    getAssetType: (assetId): 'native' | 'erc20' =>
      parseCaipAssetType(assetId).assetNamespace === 'erc20'
        ? 'erc20'
        : 'native',
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

  mockBscSpamApis();

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
      }),
      rpcFallbackMiddleware: new RpcFallbackMiddleware({ rpcDataSource }),
      detectionMiddleware: new DetectionMiddleware(),
      tokenDataSource,
      priceDataSource,
    },
    { isBasicFunctionality: true },
  );

  const { response } = await executeAssetsPipeline({
    sources,
    request,
    getAssetsState: () => state,
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
  });
});
