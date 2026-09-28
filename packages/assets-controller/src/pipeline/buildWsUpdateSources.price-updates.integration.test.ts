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
  USDC_ASSET_ID_LOWERCASE,
  WS_ACCOUNT_ID,
} from '../__fixtures__/ws-price-updates/wallet.js';
import type { BalanceUpdatedEventPayload } from '../__fixtures__/ws-price-updates/wsEvents.js';
import {
  buildEthAndUsdcBalanceUpdatedEvent,
  buildEthBalanceUpdatedEvent,
  buildUsdcBalanceUpdatedEvent,
  ETH_WS_AMOUNT,
  USDC_WS_AMOUNT,
} from '../__fixtures__/ws-price-updates/wsEvents.js';
import {
  buildEmptyAssetsState,
  buildEthHeldUnpricedState,
  buildUsdcHeldAndPricedState,
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
  AssetsDataSource,
  Context,
  DataRequest,
  DataResponse,
} from '../types.js';
import { buildWsUpdateSources } from './buildWsUpdateSources.js';
import { executeAssetsPipeline } from './executeAssetsPipeline.js';

/**
 * Integration coverage for the websocket update lane against the Mainnet
 * wallet that acquires ETH and USDC over the websocket.
 *
 * Executes the real websocket-update pipeline against realistic APIs.
 *
 * Integration Expectation - surfaced holdings are detected, enriched and
 * priced in the same pass.
 */

type UpdateLane = 'v5' | 'v6';

type ResponseSurface = {
  surface: string;
  lookUp: (response: DataResponse, assetId: string) => unknown;
};

const BALANCES: ResponseSurface = {
  surface: 'balances',
  lookUp: (response, assetId) =>
    getIgnoringCase(response.assetsBalance?.[WS_ACCOUNT_ID] ?? {}, assetId),
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

/** A completed websocket update pass. */
type WsUpdatePassResult = {
  response: DataResponse;
  request: DataRequest;
  priceBatches: string[][];
  assetBatches: string[][];
  rpcFallbackRequests: DataRequest[];
};

/** The update lanes the controller composes. */
const LANES: { name: string; lane: UpdateLane }[] = [
  { name: 'the v5 lane', lane: 'v5' },
  { name: 'the v6 lane', lane: 'v6' },
];

/**
 * Read the price the pass recorded for an asset.
 *
 * @param response - The pass response.
 * @param assetId - The CAIP-19 asset ID.
 * @returns The recorded price.
 */
function priceOf(response: DataResponse, assetId: string): number {
  const price = PRICES.lookUp(response, assetId) as { price: number };
  return price.price;
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

/**
 * Build an RPC fallback middleware that records the requests it sees.
 *
 * @returns The middleware and its recorded requests.
 */
function createRecordingRpcFallback(): {
  middleware: AssetsDataSource;
  requests: DataRequest[];
} {
  const requests: DataRequest[] = [];
  const middleware: AssetsDataSource = {
    getName: (): string => 'RpcFallbackMiddleware',
    assetsMiddleware: async (
      ctx: Context,
      next: (context: Context) => Promise<Context>,
    ): Promise<Context> => {
      requests.push(ctx.request);
      return next(ctx);
    },
  };
  return { middleware, requests };
}

/**
 * Run one websocket update pass through the composed lane.
 *
 * @param options - The pass inputs.
 * @param options.state - The state the pass sees.
 * @param options.event - The websocket event to deliver.
 * @param options.lane - The update lane to compose (`v5` by default).
 * @returns The pass result.
 */
async function runWsUpdatePass({
  state,
  event,
  lane = 'v5',
}: {
  state: ReturnType<typeof buildEmptyAssetsState>;
  event: BalanceUpdatedEventPayload;
  lane?: UpdateLane;
}): Promise<WsUpdatePassResult> {
  cleanAll();
  const { assets, prices } = mockWsApis();

  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (messenger) => {
      registerAccountMocks(messenger, { accounts: [buildWsAccount()] });
      registerMainnetNetwork(messenger);
    },
  });

  const queryApiClient = createTestApiClient();
  const { middleware: rpcFallbackMiddleware, requests: rpcFallbackRequests } =
    createRecordingRpcFallback();

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
      rpcFallbackMiddleware,
      detectionMiddleware: new DetectionMiddleware({
        getAssetsState: (): AssetsControllerState => state,
      }),
      tokenDataSource,
      priceDataSource,
    },
    {
      isBasicFunctionality: true,
      includeCustomAssetGraduation: lane === 'v5',
    },
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
    rpcFallbackRequests,
  };
}

describe('websocket update pipeline: prices for surfaced holdings', () => {
  afterEach(() => {
    cleanAll();
  });

  describe.each(LANES)(
    '$name: brand-new holdings: ETH held and USDC acquired in one websocket event',
    ({ lane }) => {
      let result: WsUpdatePassResult;

      beforeAll(async () => {
        result = await runWsUpdatePass({
          state: buildEmptyAssetsState(),
          event: buildEthAndUsdcBalanceUpdatedEvent(),
          lane,
        });
      });

      it.each([BALANCES, METADATA, PRICES, DETECTED_ASSETS])(
        '$surface - present for the surfaced holdings after one pass',
        ({ lookUp }) => {
          expect(lookUp(result.response, ETH_ASSET_ID)).toBeDefined();
          expect(
            lookUp(result.response, USDC_ASSET_ID_LOWERCASE),
          ).toBeDefined();
        },
      );

      it('carries the websocket balances through', () => {
        expect(BALANCES.lookUp(result.response, ETH_ASSET_ID)).toStrictEqual({
          amount: ETH_WS_AMOUNT,
        });
        expect(
          BALANCES.lookUp(result.response, USDC_ASSET_ID_LOWERCASE),
        ).toStrictEqual({ amount: USDC_WS_AMOUNT });
      });

      it('enriches both holdings with the captured metadata', () => {
        expect(METADATA.lookUp(result.response, ETH_ASSET_ID)).toMatchObject({
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18,
        });
        expect(
          METADATA.lookUp(result.response, USDC_ASSET_ID_LOWERCASE),
        ).toMatchObject({ name: 'USDC', symbol: 'USDC', decimals: 6 });
      });

      it('prices both holdings from the captured spot prices', () => {
        expect(priceOf(result.response, ETH_ASSET_ID)).toBeGreaterThan(0);
        // The captured USDC price is pegged around one dollar.
        expect(
          priceOf(result.response, USDC_ASSET_ID_LOWERCASE),
        ).toBeGreaterThan(0.9);
        expect(priceOf(result.response, USDC_ASSET_ID_LOWERCASE)).toBeLessThan(
          1.1,
        );
      });

      it('queues both surfaced holdings for a price update', () => {
        const queued =
          result.request.assetsForPriceUpdate?.map((id) => id.toLowerCase()) ??
          [];
        expect(queued).toStrictEqual(
          expect.arrayContaining([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
        );
      });

      it('invokes the Price API for both surfaced holdings in the same pass', () => {
        expect(askedAbout(result.priceBatches)).toStrictEqual(
          new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
        );
      });

      it('invokes the Token API for the new token and the native asset', () => {
        expect(askedAbout(result.assetBatches)).toStrictEqual(
          new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
        );
      });
    },
  );

  describe('v6 lane: the RPC fallback on the balance pass', () => {
    let result: WsUpdatePassResult;

    beforeAll(async () => {
      result = await runWsUpdatePass({
        state: buildEmptyAssetsState(),
        event: buildEthAndUsdcBalanceUpdatedEvent(),
        lane: 'v6',
      });
    });

    it('runs the RPC fallback once on the balance pass', () => {
      // A response without errors leaves the fallback a passthrough.
      expect(result.rpcFallbackRequests).toHaveLength(1);
      expect(result.rpcFallbackRequests[0]?.dataTypes).toStrictEqual(
        expect.arrayContaining(['balance']),
      );
    });
  });

  describe('held-but-unpriced native asset: ETH in state without a price', () => {
    let result: WsUpdatePassResult;

    beforeAll(async () => {
      result = await runWsUpdatePass({
        state: buildEthHeldUnpricedState(),
        event: buildEthBalanceUpdatedEvent(),
      });
    });

    it('does not re-detect the holding', () => {
      expect(
        DETECTED_ASSETS.lookUp(result.response, ETH_ASSET_ID),
      ).toBeUndefined();
    });

    it('queues the held-but-unpriced asset for a price update', () => {
      const queued =
        result.request.assetsForPriceUpdate?.map((id) => id.toLowerCase()) ??
        [];
      expect(queued).toStrictEqual([ETH_ASSET_ID]);
    });

    it('invokes the Price API for the held-but-unpriced asset', () => {
      expect(askedAbout(result.priceBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID]),
      );
    });

    it('prices the held asset from the captured spot price', () => {
      expect(priceOf(result.response, ETH_ASSET_ID)).toBeGreaterThan(0);
    });

    it('carries the refreshed websocket balance', () => {
      expect(BALANCES.lookUp(result.response, ETH_ASSET_ID)).toStrictEqual({
        amount: ETH_WS_AMOUNT,
      });
    });
  });

  describe('already-priced token: USDC in state with balance, metadata and price', () => {
    let result: WsUpdatePassResult;

    beforeAll(async () => {
      result = await runWsUpdatePass({
        state: buildUsdcHeldAndPricedState(),
        event: buildUsdcBalanceUpdatedEvent(),
      });
    });

    it('does not re-detect the token', () => {
      expect(
        DETECTED_ASSETS.lookUp(result.response, USDC_ASSET_ID_LOWERCASE),
      ).toBeUndefined();
    });

    it('does not queue the priced token for another price update', () => {
      expect(result.request.assetsForPriceUpdate ?? []).toStrictEqual([]);
    });

    it('does not invoke the Price API', () => {
      expect(result.priceBatches).toStrictEqual([]);
    });

    it('does not refetch metadata for the enriched token, only the native asset', () => {
      expect(askedAbout(result.assetBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID]),
      );
    });

    it('carries the websocket balance refresh', () => {
      expect(
        BALANCES.lookUp(result.response, USDC_ASSET_ID_LOWERCASE),
      ).toStrictEqual({ amount: USDC_WS_AMOUNT });
    });
  });
});
