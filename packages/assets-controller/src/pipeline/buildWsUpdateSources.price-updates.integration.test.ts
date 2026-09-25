import { parseCaipAssetType } from '@metamask/utils';
import { cleanAll } from 'nock';

import {
  createMockMessengers,
  registerAccountMocks,
} from '../__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from '../__fixtures__/mockTokenApi.js';
import { waitFor } from '../__fixtures__/test-utils.js';
import { mockWsApis } from '../__fixtures__/ws-price-updates/api-responses/index.js';
import { registerMainnetNetwork } from '../__fixtures__/ws-price-updates/messenger.js';
import {
  ETH_ASSET_ID,
  USDC_ASSET_ID_CHECKSUM,
  USDC_ASSET_ID_LOWERCASE,
  WS_ACCOUNT_ID,
} from '../__fixtures__/ws-price-updates/wallet.js';
import {
  buildEthBalanceUpdatedEvent,
  buildUsdcBalanceUpdatedEvent,
  ETH_WS_AMOUNT,
  USDC_WS_AMOUNT,
} from '../__fixtures__/ws-price-updates/wsEvents.js';
import {
  buildEmptyAssetsState,
  buildWsAccount,
  getIgnoringCase,
} from '../__fixtures__/ws-price-updates/wsWallet.js';
import { AccountActivityDataSource } from '../data-sources/AccountActivityDataSource.js';
import { PriceDataSource } from '../data-sources/PriceDataSource.js';
import { TokenDataSource } from '../data-sources/TokenDataSource.js';
import { CustomAssetGraduationMiddleware } from '../middlewares/CustomAssetGraduationMiddleware.js';
import { DetectionMiddleware } from '../middlewares/DetectionMiddleware.js';
import type {
  AccountId,
  AssetsControllerState,
  Caip19AssetId,
  DataRequest,
  DataResponse,
} from '../types.js';
import { buildWsUpdateSources } from './buildWsUpdateSources.js';
import { executeAssetsPipeline } from './executeAssetsPipeline.js';

/**
 * Run one websocket update pass over the wallet — everything but the
 * controller: the real `AccountActivityDataSource` receives a
 * `AccountActivityService:balanceUpdated` event, and its update flows through
 * the composed websocket lane (`buildWsUpdateSources`) via
 * `executeAssetsPipeline`, against the given state.
 *
 * @param options - The pass inputs.
 * @param options.state - The state the pass sees.
 * @param options.event - The websocket event to deliver.
 * @returns The enriched response, the request the detection middleware
 * mutated, and the asset IDs the Token and Price APIs were asked about.
 */
async function runWsUpdatePass({
  state,
  event,
}: {
  state: ReturnType<typeof buildEmptyAssetsState>;
  event: ReturnType<typeof buildEthBalanceUpdatedEvent>;
}): Promise<{
  response: DataResponse;
  request: DataRequest;
  priceBatches: string[][];
  assetBatches: string[][];
}> {
  cleanAll();
  const { assets, prices } = mockWsApis();

  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (messenger) => {
      registerAccountMocks(messenger, { accounts: [buildWsAccount()] });
      registerMainnetNetwork(messenger);
    },
  });

  const queryApiClient = createTestApiClient();

  const tokenDataSource = new TokenDataSource(assetsControllerMessenger, {
    queryApiClient,
    getNativeAssetIds: (): string[] => [ETH_ASSET_ID],
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

  const sources = buildWsUpdateSources(
    {
      customAssetGraduationMiddleware: new CustomAssetGraduationMiddleware({
        getSelectedAccountId: (): AccountId => WS_ACCOUNT_ID,
        removeCustomAsset: (): void => {
          throw new Error(
            'Websocket pass should not graduate custom assets away!',
          );
        },
        getAssetsState: (): AssetsControllerState => state,
      }),
      detectionMiddleware: new DetectionMiddleware({
        getAssetsState: (): AssetsControllerState => state,
      }),
      tokenDataSource,
      priceDataSource,
    },
    { isBasicFunctionality: true },
  );

  let captured: { response: DataResponse; request: DataRequest } | undefined;
  const accountActivityDataSource = new AccountActivityDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated: jest.fn(),
    onAssetsUpdate: async (
      response: DataResponse,
      request: DataRequest,
    ): Promise<void> => {
      const { response: enriched } = await executeAssetsPipeline({
        sources,
        request,
        initialResponse: response,
      });
      captured = { response: enriched, request };
    },
  });

  rootMessenger.publish('AccountActivityService:balanceUpdated', event);

  await waitFor(() => {
    if (!captured) {
      throw new Error('Websocket update pass has not completed yet');
    }
  });

  accountActivityDataSource.destroy();
  queryApiClient.clear();

  return {
    response: captured.response,
    request: captured.request,
    priceBatches: prices.requestedBatches,
    assetBatches: assets.requestedBatches,
  };
}

/**
 * Asset IDs an API was asked about, lower-cased, across all batches.
 *
 * @param batches - The recorded request batches.
 * @returns The lower-cased asset IDs asked about.
 */
function askedAbout(batches: string[][]): Set<string> {
  return new Set(batches.flat().map((assetId) => assetId.toLowerCase()));
}

describe('websocket update pipeline: prices for surfaced holdings', () => {
  afterEach(() => {
    cleanAll();
  });

  describe('brand-new holdings: ETH held and USDC acquired in one websocket event', () => {
    let result: Awaited<ReturnType<typeof runWsUpdatePass>>;

    beforeAll(async () => {
      result = await runWsUpdatePass({
        state: buildEmptyAssetsState(),
        event: {
          address: '0x742d35cc6634c0532925a3b844bc454e4438f44e',
          chain: 'eip155:1',
          updates: [
            ...buildEthBalanceUpdatedEvent().updates,
            ...buildUsdcBalanceUpdatedEvent().updates,
          ],
        },
      });
    });

    it('detects both holdings as new', () => {
      const detected = result.response.detectedAssets?.[
        WS_ACCOUNT_ID
      ] as Caip19AssetId[];
      expect(detected?.map((id) => id.toLowerCase())).toStrictEqual(
        expect.arrayContaining([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
      );
    });

    it('enriches both holdings with captured metadata in the same pass', () => {
      const eth = getIgnoringCase(
        result.response.assetsInfo ?? {},
        ETH_ASSET_ID,
      ) as { name: string; symbol: string; decimals: number };
      const usdc = getIgnoringCase(
        result.response.assetsInfo ?? {},
        USDC_ASSET_ID_LOWERCASE,
      ) as { name: string; symbol: string; decimals: number };

      expect(eth).toMatchObject({
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
      });
      expect(usdc).toMatchObject({
        name: 'USDC',
        symbol: 'USDC',
        decimals: 6,
      });
    });

    it('carries the websocket balances through', () => {
      const balances = result.response.assetsBalance?.[WS_ACCOUNT_ID] ?? {};

      expect(getIgnoringCase(balances, ETH_ASSET_ID)).toStrictEqual({
        amount: ETH_WS_AMOUNT,
      });
      expect(getIgnoringCase(balances, USDC_ASSET_ID_LOWERCASE)).toStrictEqual({
        amount: USDC_WS_AMOUNT,
      });
    });

    it('queues both holdings for a price update', () => {
      // The detection middleware mutates the request so the price data source
      // prices the holdings it surfaced.
      const queued =
        result.request.assetsForPriceUpdate?.map((id) => id.toLowerCase()) ??
        [];
      expect(queued).toStrictEqual(
        expect.arrayContaining([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
      );
    });

    it('invokes the price API for both holdings in the same pass', () => {
      expect(askedAbout(result.priceBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
      );
    });

    it('prices both holdings from the captured spot prices', () => {
      const ethPrice = getIgnoringCase(
        result.response.assetsPrice ?? {},
        ETH_ASSET_ID,
      ) as { price: number };
      const usdcPrice = getIgnoringCase(
        result.response.assetsPrice ?? {},
        USDC_ASSET_ID_LOWERCASE,
      ) as { price: number };

      expect(ethPrice).toBeDefined();
      expect(ethPrice.price).toBeGreaterThan(0);
      expect(usdcPrice).toBeDefined();
      // The captured USDC price is pegged around one dollar.
      expect(usdcPrice.price).toBeGreaterThan(0.9);
      expect(usdcPrice.price).toBeLessThan(1.1);
    });

    it('asks the Token API for the new token and the native asset', () => {
      // The occurrence filter consults occurrences for the new ERC-20 before
      // detection, and metadata enrichment covers the native asset every pass.
      expect(askedAbout(result.assetBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
      );
    });
  });

  describe('held-but-unpriced native asset: ETH in state without a price', () => {
    let result: Awaited<ReturnType<typeof runWsUpdatePass>>;

    beforeAll(async () => {
      result = await runWsUpdatePass({
        state: buildEmptyAssetsState({
          assetsBalance: {
            [WS_ACCOUNT_ID]: { [ETH_ASSET_ID]: { amount: '1' } },
          },
          assetsInfo: {
            [ETH_ASSET_ID]: {
              type: 'native',
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18,
              image:
                'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/slip44:60.png',
            },
          },
        }),
        event: buildEthBalanceUpdatedEvent(),
      });
    });

    it('does not re-detect the holding', () => {
      expect(result.response.detectedAssets?.[WS_ACCOUNT_ID]).toBeUndefined();
    });

    it('queues the held-but-unpriced asset for a price update', () => {
      const queued =
        result.request.assetsForPriceUpdate?.map((id) => id.toLowerCase()) ??
        [];
      expect(queued).toStrictEqual([ETH_ASSET_ID]);
    });

    it('invokes the price API for the held-but-unpriced asset', () => {
      expect(askedAbout(result.priceBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID]),
      );
    });

    it('prices the held asset from the captured spot price', () => {
      const ethPrice = getIgnoringCase(
        result.response.assetsPrice ?? {},
        ETH_ASSET_ID,
      ) as { price: number };
      expect(ethPrice).toBeDefined();
      expect(ethPrice.price).toBeGreaterThan(0);
    });

    it('carries the refreshed websocket balance', () => {
      const balances = result.response.assetsBalance?.[WS_ACCOUNT_ID] ?? {};
      expect(getIgnoringCase(balances, ETH_ASSET_ID)).toStrictEqual({
        amount: ETH_WS_AMOUNT,
      });
    });
  });

  describe('already-priced token: USDC in state with balance, metadata and price', () => {
    let result: Awaited<ReturnType<typeof runWsUpdatePass>>;

    beforeAll(async () => {
      result = await runWsUpdatePass({
        state: buildEmptyAssetsState({
          assetsBalance: {
            [WS_ACCOUNT_ID]: {
              [USDC_ASSET_ID_CHECKSUM]: { amount: '5' },
            },
          },
          assetsInfo: {
            [USDC_ASSET_ID_CHECKSUM]: {
              type: 'erc20',
              name: 'USDC',
              symbol: 'USDC',
              decimals: 6,
              image:
                'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png',
            },
          },
          assetsPrice: {
            [USDC_ASSET_ID_CHECKSUM]: {
              assetPriceType: 'fungible',
              price: 1,
              usdPrice: 1,
              pricePercentChange1d: 0.01,
              lastUpdated: 1_756_100_000_000,
            },
          },
        }),
        event: buildUsdcBalanceUpdatedEvent(),
      });
    });

    it('does not re-detect the token', () => {
      expect(result.response.detectedAssets?.[WS_ACCOUNT_ID]).toBeUndefined();
    });

    it('does not queue the priced token for another price update', () => {
      expect(result.request.assetsForPriceUpdate ?? []).toStrictEqual([]);
    });

    it('does not invoke the price API', () => {
      expect(result.priceBatches).toStrictEqual([]);
    });

    it('does not refetch metadata for the enriched token, only the native asset', () => {
      // Native metadata is refreshed every pass; the fully enriched token is
      // left alone.
      expect(askedAbout(result.assetBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID]),
      );
    });

    it('carries the websocket balance refresh', () => {
      const balances = result.response.assetsBalance?.[WS_ACCOUNT_ID] ?? {};
      expect(getIgnoringCase(balances, USDC_ASSET_ID_LOWERCASE)).toStrictEqual({
        amount: USDC_WS_AMOUNT,
      });
    });
  });
});
