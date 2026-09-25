/**
 * Integration coverage for `AssetsController` websocket price updates — the
 * behavior fixed by the "prices after websocket balance updates" change:
 * after a websocket balance update, the Token and Price APIs are invoked so
 * existing and newly-seen tokens get metadata and spot prices in the same
 * pipeline pass.
 *
 * Boots the real controller against the same captured APIs as
 * `buildWsUpdateSources.price-updates.integration.test.ts`, keeps the wallet
 * lifecycle closed so only the websocket event drives the Token and Price
 * APIs, and asserts what lands in persisted controller state.
 */

import type { ApiPlatformClient } from '@metamask/core-backend';
import { cleanAll } from 'nock';

import { createMockMessengers } from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from './__fixtures__/mockTokenApi.js';
import { waitFor, waitUntilStable } from './__fixtures__/test-utils.js';
import { mockWsApis } from './__fixtures__/ws-price-updates/api-responses/index.js';
import { registerWsControllerActions } from './__fixtures__/ws-price-updates/messenger.js';
import {
  ETH_ASSET_ID,
  USDC_ASSET_ID_CHECKSUM,
  USDC_ASSET_ID_LOWERCASE,
  WS_ACCOUNT_ID,
} from './__fixtures__/ws-price-updates/wallet.js';
import {
  buildEthBalanceUpdatedEvent,
  buildUsdcBalanceUpdatedEvent,
  ETH_WS_AMOUNT,
  USDC_WS_AMOUNT,
} from './__fixtures__/ws-price-updates/wsEvents.js';
import {
  buildEmptyAssetsState,
  getIgnoringCase,
} from './__fixtures__/ws-price-updates/wsWallet.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';

type WithControllerCallback<ReturnValue> = (args: {
  controller: AssetsController;
  messenger: MockRootMessenger;
}) => Promise<ReturnValue>;

async function withController<ReturnValue>(
  {
    state,
    queryApiClient = createTestApiClient(),
  }: {
    state: Partial<AssetsControllerState>;
    queryApiClient?: ApiPlatformClient;
  },
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: registerWsControllerActions,
  });

  const controller = new AssetsController({
    messenger: assetsControllerMessenger,
    state,
    queryApiClient,
    isBasicFunctionality: (): boolean => true,
  });

  try {
    return await fn({ controller, messenger: rootMessenger });
  } finally {
    controller.destroy();
    queryApiClient.clear();
  }
}

/**
 * Boot the controller (lifecycle closed: UI shut, keyring locked, account
 * tree uninitialized, so the subscribe lanes stay dormant and only the
 * websocket event can drive the Token and Price APIs), deliver a websocket
 * balance event, and let state settle.
 *
 * @param options - The run options.
 * @param options.state - The state to boot with.
 * @param options.event - The websocket event to deliver.
 * @returns The settled controller state, the asset IDs the Token API was
 * asked about, and the asset IDs the Price API was asked about.
 */
async function runWsEvent({
  state,
  event,
}: {
  state: Partial<AssetsControllerState>;
  event: ReturnType<typeof buildEthBalanceUpdatedEvent>;
}): Promise<{
  state: AssetsControllerState;
  assetBatches: string[][];
  priceBatches: string[][];
}> {
  cleanAll();
  const { accountsSupportedNetworks, assets, prices } = mockWsApis();
  const queryApiClient = createTestApiClient();

  const controllerState = await withController(
    { state, queryApiClient },
    async ({ controller, messenger }) => {
      // Wait for boot (`AccountsApiDataSource` reading the supported networks
      // manifest) so the assertions below cannot pass on a wallet that never
      // finished starting.
      await waitFor(() =>
        expect(accountsSupportedNetworks.isDone()).toBe(true),
      );

      messenger.publish('AccountActivityService:balanceUpdated', event);

      await waitFor(() => {
        // The event's balances must have landed before anything is asserted.
        for (const update of event.updates) {
          const landed = getIgnoringCase(
            controller.state.assetsBalance[WS_ACCOUNT_ID] ?? {},
            update.asset.type,
          );
          if (landed === undefined) {
            throw new Error('Websocket balances have not landed yet');
          }
        }
      });

      await waitUntilStable(() => controller.state);

      return controller.state;
    },
  );

  return {
    state: controllerState,
    assetBatches: assets.requestedBatches,
    priceBatches: prices.requestedBatches,
  };
}

describe('AssetsController: websocket price updates', () => {
  afterEach(() => {
    cleanAll();
  });

  describe('brand-new holdings: ETH held and USDC acquired in one websocket event', () => {
    let result: Awaited<ReturnType<typeof runWsEvent>>;

    beforeAll(async () => {
      result = await runWsEvent({
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

    it('persists both websocket balances', () => {
      const balances = result.state.assetsBalance[WS_ACCOUNT_ID] ?? {};

      expect(getIgnoringCase(balances, ETH_ASSET_ID)).toStrictEqual({
        amount: ETH_WS_AMOUNT,
      });
      expect(getIgnoringCase(balances, USDC_ASSET_ID_LOWERCASE)).toStrictEqual({
        amount: USDC_WS_AMOUNT,
      });
    });

    it('persists metadata for both holdings from the captured Token API', () => {
      const eth = getIgnoringCase(result.state.assetsInfo, ETH_ASSET_ID) as {
        name: string;
        symbol: string;
        decimals: number;
      };
      const usdc = getIgnoringCase(
        result.state.assetsInfo,
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

    it('prices both holdings from the captured Price API in the same pass', () => {
      const ethPrice = getIgnoringCase(
        result.state.assetsPrice,
        ETH_ASSET_ID,
      ) as { price: number };
      const usdcPrice = getIgnoringCase(
        result.state.assetsPrice,
        USDC_ASSET_ID_LOWERCASE,
      ) as { price: number };

      expect(ethPrice).toBeDefined();
      expect(ethPrice.price).toBeGreaterThan(0);
      expect(usdcPrice).toBeDefined();
      // The captured USDC price is pegged around one dollar.
      expect(usdcPrice.price).toBeGreaterThan(0.9);
      expect(usdcPrice.price).toBeLessThan(1.1);
    });

    it('invoked the Price API for both holdings', () => {
      const askedAbout = new Set(
        result.priceBatches.flat().map((assetId) => assetId.toLowerCase()),
      );
      expect(askedAbout).toStrictEqual(
        new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
      );
    });

    it('invoked the Token API for the new token and the native asset', () => {
      const askedAbout = new Set(
        result.assetBatches.flat().map((assetId) => assetId.toLowerCase()),
      );
      expect(askedAbout).toStrictEqual(
        new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
      );
    });
  });

  describe('held-but-unpriced native asset: ETH in state without a price', () => {
    let result: Awaited<ReturnType<typeof runWsEvent>>;

    beforeAll(async () => {
      result = await runWsEvent({
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

    it('persists the refreshed websocket balance', () => {
      const balances = result.state.assetsBalance[WS_ACCOUNT_ID] ?? {};
      expect(getIgnoringCase(balances, ETH_ASSET_ID)).toStrictEqual({
        amount: ETH_WS_AMOUNT,
      });
    });

    it('prices the held-but-unpriced asset from the captured Price API', () => {
      const ethPrice = getIgnoringCase(
        result.state.assetsPrice,
        ETH_ASSET_ID,
      ) as { price: number };
      expect(ethPrice).toBeDefined();
      expect(ethPrice.price).toBeGreaterThan(0);
    });

    it('invoked the Price API for the held-but-unpriced asset', () => {
      const askedAbout = new Set(
        result.priceBatches.flat().map((assetId) => assetId.toLowerCase()),
      );
      expect(askedAbout).toStrictEqual(new Set([ETH_ASSET_ID]));
    });
  });

  describe('already-priced token: USDC in state with balance, metadata and price', () => {
    const SEEDED_USDC_PRICE = {
      assetPriceType: 'fungible' as const,
      price: 1,
      usdPrice: 1,
      pricePercentChange1d: 0.01,
      lastUpdated: 1_756_100_000_000,
    };

    let result: Awaited<ReturnType<typeof runWsEvent>>;

    beforeAll(async () => {
      result = await runWsEvent({
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
            [USDC_ASSET_ID_CHECKSUM]: SEEDED_USDC_PRICE,
          },
        }),
        event: buildUsdcBalanceUpdatedEvent(),
      });
    });

    it('persists the refreshed websocket balance', () => {
      const balances = result.state.assetsBalance[WS_ACCOUNT_ID] ?? {};
      expect(getIgnoringCase(balances, USDC_ASSET_ID_LOWERCASE)).toStrictEqual({
        amount: USDC_WS_AMOUNT,
      });
    });

    it('keeps the seeded price untouched', () => {
      expect(
        getIgnoringCase(result.state.assetsPrice, USDC_ASSET_ID_LOWERCASE),
      ).toStrictEqual(SEEDED_USDC_PRICE);
    });

    it('did not invoke the Price API for the priced token', () => {
      expect(result.priceBatches).toStrictEqual([]);
    });

    it('did not refetch metadata for the enriched token', () => {
      // Native metadata is refreshed every pass, so the Token API is still
      // asked about the native asset — but not about USDC.
      const askedAbout = new Set(
        result.assetBatches.flat().map((assetId) => assetId.toLowerCase()),
      );
      expect(askedAbout).toStrictEqual(new Set([ETH_ASSET_ID]));
    });
  });
});
