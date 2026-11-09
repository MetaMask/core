import type { ApiPlatformClient } from '@metamask/core-backend';
import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';
import nock from 'nock';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  STATE_METADATA_SURFACE,
  stateBalancesSurface,
} from './__fixtures__/assetSurfaces.js';
import {
  mockLaunchpadApis,
  mockLaunchpadBalances,
} from './__fixtures__/launchpad/api-responses.js';
import {
  ESTABLISHED_ASSET_ID,
  LAUNCHPAD_ASSET_ID,
  MALICIOUS_LAUNCHPAD_ASSET_ID,
  SPAM_ASSET_ID,
} from './__fixtures__/launchpad/wallet.js';
import {
  bootstrapAssetsController,
  createMockMessengers,
} from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import { createTestApiClient } from './__fixtures__/mockTokenApi.js';
import { waitFor, waitUntilStable } from './__fixtures__/test-utils.js';
import { registerWsControllerActions } from './__fixtures__/ws-price-updates/messenger.js';
import {
  MAINNET_CHAIN_ID,
  WS_ACCOUNT_ID,
  WS_WALLET_ADDRESS,
} from './__fixtures__/ws-price-updates/wallet.js';
import type { BalanceUpdatedEventPayload } from './__fixtures__/ws-price-updates/wsEvents.js';
import {
  buildEmptyAssetsState,
  buildWsAccount,
} from './__fixtures__/ws-price-updates/wsWallet.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';

/**
 * Integration coverage for launchpad token filtering. The Tokens API reports
 * every token below with its occurrence count; only Token API `/v2/assets`
 * knows which are launchpad tokens.
 *
 * Expectation, on the websocket path and on the Accounts API fetch path:
 * - a low-occurrence launchpad token is kept;
 * - a low-occurrence launchpad token classified `Malicious` is dropped;
 * - a low-occurrence token that is not a launchpad token is dropped;
 * - a token above the occurrence floor is kept.
 */

const BALANCES = stateBalancesSurface(WS_ACCOUNT_ID);
const METADATA = STATE_METADATA_SURFACE;

const LANES: {
  name: string;
  version: 'v5' | 'v6';
  remoteFeatureFlags?: FeatureFlags;
}[] = [
  { name: 'the v5 update lane', version: 'v5' },
  {
    name: 'the v6 update lane',
    version: 'v6',
    remoteFeatureFlags: { assetsAccountsApiV6: true },
  },
];

const ALL_ASSET_IDS = [
  LAUNCHPAD_ASSET_ID,
  MALICIOUS_LAUNCHPAD_ASSET_ID,
  SPAM_ASSET_ID,
  ESTABLISHED_ASSET_ID,
];

/** Hex quantity for 5 whole tokens at 18 decimals. */
const FIVE_TOKENS_HEX = '0x4563918244f40000';

function buildBalanceUpdatedEvent(): BalanceUpdatedEventPayload {
  return {
    address: WS_WALLET_ADDRESS,
    chain: MAINNET_CHAIN_ID,
    updates: ALL_ASSET_IDS.map((assetId) => ({
      asset: { fungible: true, type: assetId, unit: 'TKN', decimals: 18 },
      postBalance: { amount: FIVE_TOKENS_HEX },
      transfers: [],
    })),
  };
}

async function withController<ReturnValue>(
  {
    remoteFeatureFlags,
    state = buildEmptyAssetsState(),
  }: {
    remoteFeatureFlags?: FeatureFlags;
    state?: Partial<AssetsControllerState>;
  },
  fn: (args: {
    controller: AssetsController;
    messenger: MockRootMessenger;
  }) => Promise<ReturnValue>,
): Promise<ReturnValue> {
  const queryApiClient: ApiPlatformClient = createTestApiClient();
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
  bootstrapAssetsController(rootMessenger);

  try {
    return await fn({ controller, messenger: rootMessenger });
  } finally {
    controller.destroy();
    queryApiClient.clear();
  }
}

type Result = {
  state: AssetsControllerState;
  launchpadLookups: string[][];
};

async function runWebsocketEvent(
  remoteFeatureFlags?: FeatureFlags,
): Promise<Result> {
  nock.cleanAll();
  const { accountsSupportedNetworks, launchpadLookups } = mockLaunchpadApis();

  const state = await withController(
    { remoteFeatureFlags },
    async ({ controller, messenger }) => {
      await waitFor(() =>
        expect(accountsSupportedNetworks.isDone()).toBe(true),
      );

      messenger.publish(
        'AccountActivityService:balanceUpdated',
        buildBalanceUpdatedEvent(),
      );

      await waitFor(() => {
        if (
          BALANCES.lookUp(controller.state, ESTABLISHED_ASSET_ID) === undefined
        ) {
          throw new Error('Websocket balances have not landed yet');
        }
      });
      await waitUntilStable(() => controller.state);

      return controller.state;
    },
  );

  return { state, launchpadLookups };
}

async function runAccountsApiFetch(
  version: 'v5' | 'v6',
  remoteFeatureFlags?: FeatureFlags,
): Promise<Result> {
  nock.cleanAll();
  const { accountsSupportedNetworks, launchpadLookups } = mockLaunchpadApis();
  mockLaunchpadBalances(version);

  const state = await withController(
    { remoteFeatureFlags },
    async ({ controller }) => {
      await waitFor(() =>
        expect(accountsSupportedNetworks.isDone()).toBe(true),
      );

      await controller.getAssets([buildWsAccount()], {
        chainIds: [MAINNET_CHAIN_ID],
        forceUpdate: true,
      });
      await waitUntilStable(() => controller.state);

      return controller.state;
    },
  );

  return { state, launchpadLookups };
}

function describeScenarios(getResult: () => Result): void {
  it.each([BALANCES, METADATA])(
    '$surface - keeps the low-occurrence launchpad token',
    ({ lookUp }) => {
      expect(lookUp(getResult().state, LAUNCHPAD_ASSET_ID)).toBeDefined();
    },
  );

  it.each([BALANCES, METADATA])(
    '$surface - drops the launchpad token classified as malicious',
    ({ lookUp }) => {
      expect(
        lookUp(getResult().state, MALICIOUS_LAUNCHPAD_ASSET_ID),
      ).toBeUndefined();
    },
  );

  it.each([BALANCES, METADATA])(
    '$surface - drops the low-occurrence token that is not a launchpad token',
    ({ lookUp }) => {
      expect(lookUp(getResult().state, SPAM_ASSET_ID)).toBeUndefined();
    },
  );

  it.each([BALANCES, METADATA])(
    '$surface - keeps the token above the occurrence floor',
    ({ lookUp }) => {
      expect(lookUp(getResult().state, ESTABLISHED_ASSET_ID)).toBeDefined();
    },
  );

  it('only looks up launchpad status for tokens below the occurrence floor', () => {
    const asked = new Set(
      getResult()
        .launchpadLookups.flat()
        .map((assetId) => assetId.toLowerCase()),
    );

    expect(asked.has(ESTABLISHED_ASSET_ID.toLowerCase())).toBe(false);
    expect(asked.has(LAUNCHPAD_ASSET_ID.toLowerCase())).toBe(true);
  });
}

describe('AssetsController: launchpad token filtering', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe.each(LANES)('$name', ({ version, remoteFeatureFlags }) => {
    describe('websocket balance update', () => {
      let result: Result;

      beforeAll(async () => {
        result = await runWebsocketEvent(remoteFeatureFlags);
      });

      describeScenarios(() => result);
    });

    describe('Accounts API balance fetch', () => {
      let result: Result;

      beforeAll(async () => {
        result = await runAccountsApiFetch(version, remoteFeatureFlags);
      });

      describeScenarios(() => result);
    });
  });
});
