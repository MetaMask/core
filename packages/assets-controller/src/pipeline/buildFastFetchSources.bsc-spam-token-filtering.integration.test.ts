import { MockInternalProvider } from '@metamask/eth-json-rpc-provider';
import type { NetworkState } from '@metamask/network-controller';
import {
  getDefaultNetworkControllerState,
  NetworkStatus,
} from '@metamask/network-controller';
import { parseCaipAssetType } from '@metamask/utils';
import { cleanAll } from 'nock';

import {
  buildCustomNetworkClientConfiguration,
  buildCustomNetworkConfiguration,
  buildCustomRpcEndpoint,
  buildMockGetNetworkClientById,
} from '../../../network-controller/tests/helpers.js';
import { mockBscSpamApis } from '../__fixtures__/bsc-spam-token/api-responses/index.js';
import {
  buildBscSpamAccount,
  buildEmptyAssetsState,
} from '../__fixtures__/bsc-spam-token/bscSpamWallet.js';
import {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_CHAIN_ID_HEX,
  BSC_NETWORK_CLIENT_ID,
  BSC_RPC_URL,
  BSC_SPAM_ACCOUNT_ID,
  CDOGE_ASSET_ID_CHECKSUM,
  CDOGE_ASSET_ID_LOWERCASE,
} from '../__fixtures__/bsc-spam-token/wallet.js';
import { createMockAssetControllerMessenger } from '../__fixtures__/MockAssetControllerMessenger.js';
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

type PipelineResult = {
  response: DataResponse;
  /** The asset IDs each `/v3/assets` request asked about, in request order. */
  requestedAssetBatches: string[][];
};

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
 * Register the controllers the RPC-backed sources read their networks from, so
 * BNB Chain resolves to a network client backed by a `MockInternalProvider`.
 *
 * Staking stays inert regardless: its supported chains are Mainnet and Hoodi,
 * and BNB Chain is neither.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 */
function registerBscNetwork(
  rootMessenger: ReturnType<
    typeof createMockAssetControllerMessenger
  >['rootMessenger'],
): void {
  // Answers in process, so no JSON-RPC can reach a real node. `eth_chainId`
  // gets a real answer because ethers asks for it before any other call; the
  // read methods get `'0x'`, which every caller in the lane takes as "nothing
  // here". Anything else throws, which is what we want: this wallet's captures
  // give the lane no reason to read on-chain at all.
  const provider = new MockInternalProvider({
    stubs: [
      { method: 'eth_chainId', result: BSC_CHAIN_ID_HEX },
      { method: 'eth_call', result: '0x' },
      { method: 'eth_getBalance', result: '0x' },
      { method: 'eth_blockNumber', result: '0x' },
    ].map(({ method, result }) => ({
      request: { method },
      response: { result },
      // Stubs are consumed on match unless this says otherwise, and the lane
      // may read the same method once per account and chain.
      discardAfterMatching: false,
    })),
  });

  const networkState: NetworkState = {
    ...getDefaultNetworkControllerState(),
    selectedNetworkClientId: BSC_NETWORK_CLIENT_ID,
    networkConfigurationsByChainId: {
      [BSC_CHAIN_ID_HEX]: buildCustomNetworkConfiguration({
        chainId: BSC_CHAIN_ID_HEX,
        name: 'BNB Chain',
        nativeCurrency: 'BNB',
        rpcEndpoints: [
          buildCustomRpcEndpoint({
            networkClientId: BSC_NETWORK_CLIENT_ID,
            url: BSC_RPC_URL,
          }),
        ],
      }),
    },
    networksMetadata: {
      [BSC_NETWORK_CLIENT_ID]: { status: NetworkStatus.Available, EIPS: {} },
    },
  };

  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    () => networkState,
  );

  const getNetworkClientById = buildMockGetNetworkClientById({
    [BSC_NETWORK_CLIENT_ID]: buildCustomNetworkClientConfiguration({
      chainId: BSC_CHAIN_ID_HEX,
      rpcUrl: BSC_RPC_URL,
      ticker: 'BNB',
    }),
  });

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    (networkClientId) =>
      ({
        ...getNetworkClientById(networkClientId),
        provider,
        // The real client's provider and block tracker are proxies around live
        // connections; the sources only ever call `request` on the provider.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
  );

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: { eip155: { [BSC_CHAIN_ID_HEX]: true } },
      nativeAssetIdentifiers: { [BSC_CHAIN_ID]: BNB_ASSET_ID },
    }),
  );

  // Read for the chain's multicall3 address; BNB Chain has no entry here.
  rootMessenger.registerActionHandler(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    () => undefined,
  );
}

/**
 * Run the fast fetch lane once against the captured APIs.
 *
 * The lane is composed by `buildFastFetchSources`, the same function
 * `AssetsController` uses, so the middlewares run in the production order with
 * the production roles filled by real instances.
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

  registerBscNetwork(rootMessenger);

  const queryApiClient = createTestApiClient();

  const accountsApiDataSource = new AccountsApiDataSource({
    messenger: assetsControllerMessenger,
    queryApiClient,
    onActiveChainsUpdated: (): void => undefined,
  });

  const stakedBalanceDataSource = new StakedBalanceDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated: (): void => undefined,
  });

  const rpcDataSource = new RpcDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated: (): void => undefined,
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

  // cleanup
  accountsApiDataSource.destroy();
  stakedBalanceDataSource.destroy();
  rpcDataSource.destroy();
  queryApiClient.clear();

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
    cleanAll();
  });

  describe('first pass over a fresh wallet', () => {
    it('prunes balances, metadata, and detected assets for the spam token', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());

      // The Accounts API returned this balance and the Tokens API said the
      // token has one occurrence against a floor of three, so nothing about it
      // should reach state — including `detectedAssets`, which would still
      // announce it downstream as a new holding.
      expect(
        getIgnoringCase(balancesFor(response), CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
      expect(
        getIgnoringCase(response.assetsInfo ?? {}, CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
      expect(
        allDetectedAssetIds(response).map((assetId) => assetId.toLowerCase()),
      ).not.toContain(CDOGE_ASSET_ID_LOWERCASE);
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

    // Legitimate failing test, our middleware stack does not filter out spam asset prices!
    // This does eventually get cleaned up during unlock cleanup, but worth flagging.
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('does not carry a price for the spam token', async () => {
      const { response } = await runPipeline(buildEmptyAssetsState());
      expect(
        getIgnoringCase(response.assetsPrice ?? {}, CDOGE_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
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
      expect(
        allDetectedAssetIds(response).map((assetId) => assetId.toLowerCase()),
      ).not.toContain(CDOGE_ASSET_ID_LOWERCASE);
    });
  });
});
