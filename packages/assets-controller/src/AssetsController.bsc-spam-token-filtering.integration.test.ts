import type { ApiPlatformClient } from '@metamask/core-backend';
import { cleanAll } from 'nock';

import { mockBscSpamApis } from './__fixtures__/bsc-spam-token/api-responses/index.js';
import {
  buildBscSpamAccount,
  buildEmptyAssetsState,
  getIgnoringCase,
} from './__fixtures__/bsc-spam-token/bscSpamWallet.js';
import { registerBscSpamControllerActions } from './__fixtures__/bsc-spam-token/messenger.js';
import {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  CDOGE_ASSET_ID_CHECKSUM,
  CDOGE_ASSET_ID_LOWERCASE,
} from './__fixtures__/bsc-spam-token/wallet.js';
import { createMockMessengers } from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from './__fixtures__/mockTokenApi.js';
import { waitFor, waitUntilStable } from './__fixtures__/test-utils.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';

/**
 * Integration coverage for `AssetsController` against the BNB Chain wallet
 * from the `$$$DOGECHAIN` (`CDOGE`) spam-token report.
 *
 * Boots the real controller, answers the same captured APIs as
 * `buildFastFetchSources.bsc-spam-token-filtering.integration.test.ts`, and
 * asserts CDOGE never lands in persisted state.
 *
 * Integration Expectation - CDOGE is correctly filtered out of controller state.
 */

type StateSurface = {
  surface: string;
  lookUp: (state: AssetsControllerState, assetId: string) => unknown;
};

const BALANCES: StateSurface = {
  surface: 'balances',
  lookUp: (state, assetId) =>
    getIgnoringCase(state.assetsBalance[BSC_SPAM_ACCOUNT_ID] ?? {}, assetId),
};

const METADATA: StateSurface = {
  surface: 'metadata',
  lookUp: (state, assetId) => getIgnoringCase(state.assetsInfo, assetId),
};

const PRICES: StateSurface = {
  surface: 'prices',
  lookUp: (state, assetId) => getIgnoringCase(state.assetsPrice, assetId),
};

type WithControllerCallback<ReturnValue> = (args: {
  controller: AssetsController;
  messenger: MockRootMessenger;
}) => Promise<ReturnValue>;

async function withController<ReturnValue>(
  {
    state = buildEmptyAssetsState(),
    queryApiClient = createTestApiClient(),
  }: {
    state?: Partial<AssetsControllerState>;
    queryApiClient?: ApiPlatformClient;
  },
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    registerCustomRootActions: registerBscSpamControllerActions,
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

async function fetchWallet(
  state: Partial<AssetsControllerState> = buildEmptyAssetsState(),
): Promise<AssetsControllerState> {
  const { accountsSupportedNetworks } = mockBscSpamApis();

  return await withController({ state }, async ({ controller }) => {
    // wait for `AccountsApiDataSource` to ask `/v2/supportedNetworks` to indicate the fast-lane is ready
    await waitFor(() => expect(accountsSupportedNetworks.isDone()).toBe(true));

    await controller.getAssets([buildBscSpamAccount()], {
      chainIds: [BSC_CHAIN_ID],
      forceUpdate: true,
    });

    // `getAssets` awaits the fast lane only; the slow lane is fire-and-forget
    // and can still be writing. Let state settle so the assertions about CDOGE
    // being absent cannot pass just because nothing has landed yet.
    await waitUntilStable(() => controller.state);

    return controller.state;
  });
}

const WALLET_PASSES = [
  {
    pass: 'first pass over a fresh wallet',
    run: (): Promise<AssetsControllerState> => fetchWallet(),
  },
  {
    pass: 'second pass over the wallet the first pass left behind',
    run: async (): Promise<AssetsControllerState> => {
      const firstPass = await fetchWallet();
      cleanAll();

      const secondPass = await fetchWallet(
        buildEmptyAssetsState({
          assetsBalance: firstPass.assetsBalance,
          assetsInfo: firstPass.assetsInfo,
          assetsPrice: firstPass.assetsPrice,
        }),
      );
      return secondPass;
    },
  },
];

describe('AssetsController: BNB Chain spam token (CDOGE)', () => {
  afterEach(() => {
    cleanAll();
  });

  describe.each(WALLET_PASSES)('$pass', ({ run }) => {
    let state: AssetsControllerState;

    beforeAll(async () => {
      state = await run();
    });

    it.each([BALANCES, METADATA])(
      '$surface - filter out the spam token',
      ({ lookUp }) => {
        expect(lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
        expect(lookUp(state, CDOGE_ASSET_ID_CHECKSUM)).toBeUndefined();
      },
    );

    it.each([BALANCES, METADATA])(
      '$surface - keeps the native BNB asset despite low occurrences',
      ({ lookUp }) => {
        expect(lookUp(state, BNB_ASSET_ID)).toBeDefined();
      },
    );

    // Same gap as the pipeline suite: prices are not occurrence-filtered.
    // Unlock cleanup eventually strips them; this flags the hole.
    it.failing('keeps the spam token out of prices', () => {
      expect(PRICES.lookUp(state, CDOGE_ASSET_ID_LOWERCASE)).toBeUndefined();
    });
  });
});
