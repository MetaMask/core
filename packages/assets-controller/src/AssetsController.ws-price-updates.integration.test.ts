import type { ApiPlatformClient } from '@metamask/core-backend';
import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';
import { cleanAll } from 'nock';

import { createMockMessengers } from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from './__fixtures__/mockTokenApi.js';
import {
  waitFor,
  waitUntilStable,
  withZeroedTimestamps,
} from './__fixtures__/test-utils.js';
import { mockWsApis } from './__fixtures__/ws-price-updates/api-responses/index.js';
import { registerWsControllerActions } from './__fixtures__/ws-price-updates/messenger.js';
import {
  ETH_ASSET_ID,
  ETH_SPOT_PRICE,
  USDC_ASSET_ID_LOWERCASE,
  USDC_SPOT_PRICE,
  WS_ACCOUNT_ID,
} from './__fixtures__/ws-price-updates/wallet.js';
import type { BalanceUpdatedEventPayload } from './__fixtures__/ws-price-updates/wsEvents.js';
import {
  buildEthAndUsdcBalanceUpdatedEvent,
  buildEthBalanceUpdatedEvent,
  buildUsdcBalanceUpdatedEvent,
  ETH_WS_AMOUNT,
  USDC_WS_AMOUNT,
} from './__fixtures__/ws-price-updates/wsEvents.js';
import {
  buildEmptyAssetsState,
  buildEthHeldUnpricedState,
  buildUsdcHeldAndPricedState,
  getIgnoringCase,
  SEEDED_USDC_PRICE,
} from './__fixtures__/ws-price-updates/wsWallet.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';

/**
 * Integration coverage for `AssetsController` websocket price updates
 * against the Mainnet wallet that acquires ETH and USDC over the websocket.
 *
 * Boots the real controller, with its lifecycle closed, against realistic
 * APIs.
 *
 * Integration Expectation - surfaced holdings get metadata and spot prices in
 * the same pass as the balance update.
 */

type StateSurface = {
  surface: string;
  lookUp: (state: AssetsControllerState, assetId: string) => unknown;
};

const BALANCES: StateSurface = {
  surface: 'balances',
  lookUp: (state, assetId) =>
    getIgnoringCase(state.assetsBalance[WS_ACCOUNT_ID] ?? {}, assetId),
};

const METADATA: StateSurface = {
  surface: 'metadata',
  lookUp: (state, assetId) => getIgnoringCase(state.assetsInfo, assetId),
};

const PRICES: StateSurface = {
  surface: 'prices',
  lookUp: (state, assetId) => getIgnoringCase(state.assetsPrice, assetId),
};

/** The update lanes the remote feature flags switch the controller between. */
const UPDATE_LANES: { name: string; remoteFeatureFlags?: FeatureFlags }[] = [
  { name: 'the v5 update lane' },
  {
    name: 'the v6 update lane',
    remoteFeatureFlags: { assetsAccountsApiV6: true },
  },
];

/** A settled websocket event run. */
type WsEventResult = {
  state: AssetsControllerState;
  mocks: {
    priceAPI: { priceBatches: string[][] };
    tokenAPI: { assetBatches: string[][] };
  };
};

/**
 * Asset IDs an API was asked about, lower-cased, across all batches.
 *
 * @param batches - The recorded request batches.
 * @returns The lower-cased asset IDs asked about.
 */
function askedAbout(batches: string[][]): Set<string> {
  return new Set(batches.flat().map((assetId) => assetId.toLowerCase()));
}

type WithControllerCallback<ReturnValue> = (args: {
  controller: AssetsController;
  messenger: MockRootMessenger;
}) => Promise<ReturnValue>;

async function withController<ReturnValue>(
  {
    state,
    queryApiClient = createTestApiClient(),
    remoteFeatureFlags,
  }: {
    state: Partial<AssetsControllerState>;
    queryApiClient?: ApiPlatformClient;
    remoteFeatureFlags?: FeatureFlags;
  },
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: (messenger: MockRootMessenger): void =>
      registerWsControllerActions(messenger, { remoteFeatureFlags }),
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
 * Boot the controller (lifecycle closed), deliver a websocket balance event,
 * and let state settle.
 *
 * @param options - The run options.
 * @param options.state - The state to boot with.
 * @param options.event - The websocket event to deliver.
 * @param options.remoteFeatureFlags - Flags to boot with
 * (`assetsAccountsApiV6: true` selects the v6 update lane).
 * @returns The event result.
 */
async function runWsEvent({
  state,
  event,
  remoteFeatureFlags,
}: {
  state: Partial<AssetsControllerState>;
  event: BalanceUpdatedEventPayload;
  remoteFeatureFlags?: FeatureFlags;
}): Promise<WsEventResult> {
  cleanAll();
  const { accountsSupportedNetworks, assets, prices } = mockWsApis();
  const queryApiClient = createTestApiClient();

  const controllerState = await withController(
    { state, queryApiClient, remoteFeatureFlags },
    async ({ controller, messenger }) => {
      // Wait for boot so the assertions cannot pass on a half-started wallet.
      await waitFor(() =>
        expect(accountsSupportedNetworks.isDone()).toBe(true),
      );

      messenger.publish('AccountActivityService:balanceUpdated', event);

      await waitFor(() => {
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
    mocks: {
      priceAPI: { priceBatches: prices.requestedBatches },
      tokenAPI: { assetBatches: assets.requestedBatches },
    },
  };
}

describe('AssetsController: websocket price updates', () => {
  afterEach(() => {
    cleanAll();
  });

  describe.each(UPDATE_LANES)(
    '$name: brand-new holdings: ETH held and USDC acquired in one websocket event',
    ({ remoteFeatureFlags }) => {
      let result: WsEventResult;

      beforeAll(async () => {
        result = await runWsEvent({
          state: buildEmptyAssetsState(),
          event: buildEthAndUsdcBalanceUpdatedEvent(),
          remoteFeatureFlags,
        });
      });

      it.each([BALANCES, METADATA, PRICES])(
        '$surface - persisted for the surfaced holdings after one pass',
        ({ lookUp }) => {
          expect(lookUp(result.state, ETH_ASSET_ID)).toBeDefined();
          expect(lookUp(result.state, USDC_ASSET_ID_LOWERCASE)).toBeDefined();
        },
      );

      it('persists the websocket balances', () => {
        expect(BALANCES.lookUp(result.state, ETH_ASSET_ID)).toStrictEqual({
          amount: ETH_WS_AMOUNT,
        });
        expect(
          BALANCES.lookUp(result.state, USDC_ASSET_ID_LOWERCASE),
        ).toStrictEqual({ amount: USDC_WS_AMOUNT });
      });

      it('persists metadata for both holdings from the captured Token API', () => {
        expect(METADATA.lookUp(result.state, ETH_ASSET_ID)).toMatchObject({
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18,
        });
        expect(
          METADATA.lookUp(result.state, USDC_ASSET_ID_LOWERCASE),
        ).toMatchObject({ name: 'USDC', symbol: 'USDC', decimals: 6 });
      });

      it('prices both holdings from the captured Price API in the same pass', () => {
        expect(PRICES.lookUp(result.state, ETH_ASSET_ID)).toMatchObject({
          assetPriceType: 'fungible',
          price: ETH_SPOT_PRICE,
          usdPrice: ETH_SPOT_PRICE,
        });
        expect(
          PRICES.lookUp(result.state, USDC_ASSET_ID_LOWERCASE),
        ).toMatchObject({
          assetPriceType: 'fungible',
          price: USDC_SPOT_PRICE,
          usdPrice: USDC_SPOT_PRICE,
        });
      });

      it('invoked the Price API for both holdings', () => {
        expect(askedAbout(result.mocks.priceAPI.priceBatches)).toStrictEqual(
          new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
        );
      });

      it('invoked the Token API for the new token and the native asset', () => {
        expect(askedAbout(result.mocks.tokenAPI.assetBatches)).toStrictEqual(
          new Set([ETH_ASSET_ID, USDC_ASSET_ID_LOWERCASE]),
        );
      });
    },
  );

  it('generates snapshot (source of truth)', async () => {
    const { state } = await runWsEvent({
      state: buildEmptyAssetsState(),
      event: buildEthAndUsdcBalanceUpdatedEvent(),
    });

    // eslint-disable-next-line jest/no-restricted-matchers
    expect(withZeroedTimestamps(state)).toMatchSnapshot();
  });

  describe('held-but-unpriced native asset: ETH in state without a price', () => {
    let result: WsEventResult;

    beforeAll(async () => {
      result = await runWsEvent({
        state: buildEthHeldUnpricedState(),
        event: buildEthBalanceUpdatedEvent(),
      });
    });

    it('persists the refreshed websocket balance', () => {
      expect(BALANCES.lookUp(result.state, ETH_ASSET_ID)).toStrictEqual({
        amount: ETH_WS_AMOUNT,
      });
    });

    it('prices the held-but-unpriced asset from the captured Price API in the same pass', () => {
      expect(askedAbout(result.mocks.priceAPI.priceBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID]),
      );
      expect(PRICES.lookUp(result.state, ETH_ASSET_ID)).toMatchObject({
        assetPriceType: 'fungible',
        price: ETH_SPOT_PRICE,
        usdPrice: ETH_SPOT_PRICE,
      });
    });
  });

  describe('already-priced token: USDC in state with balance, metadata and price', () => {
    let result: WsEventResult;

    beforeAll(async () => {
      result = await runWsEvent({
        state: buildUsdcHeldAndPricedState(),
        event: buildUsdcBalanceUpdatedEvent(),
      });
    });

    it('persists the refreshed websocket balance', () => {
      expect(
        BALANCES.lookUp(result.state, USDC_ASSET_ID_LOWERCASE),
      ).toStrictEqual({ amount: USDC_WS_AMOUNT });
    });

    it('does not re-price the already-priced token', () => {
      expect(result.mocks.priceAPI.priceBatches).toStrictEqual([]);
      expect(
        PRICES.lookUp(result.state, USDC_ASSET_ID_LOWERCASE),
      ).toStrictEqual(SEEDED_USDC_PRICE);
    });

    it('did not refetch metadata for the enriched token', () => {
      expect(askedAbout(result.mocks.tokenAPI.assetBatches)).toStrictEqual(
        new Set([ETH_ASSET_ID]),
      );
    });
  });
});
