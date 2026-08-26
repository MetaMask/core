import type { ApiPlatformClient } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import nock from 'nock';

import {
  createMockAssetControllerMessenger,
  createMockInternalAccount,
  registerAssetsControllerActions,
} from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import {
  createTestApiClient,
  mockSuggestedOccurrenceFloors,
  mockV3Assets,
  waitForTokenApiRequests,
} from './__fixtures__/mockTokenApi.js';
import {
  ACCOUNT_ONE_ADDRESS,
  ACCOUNT_ONE_ID,
  ACCOUNT_TWO_ADDRESS,
  ACCOUNT_TWO_ID,
  ARBITRUM_GMX,
  BASE_FARTCOIN,
  MAINNET_NATIVE,
  MAINNET_SPAM,
  MAINNET_USDT,
  OPTIMISM_SPAM,
  OPTIMISM_USDC,
  SEI_USDCN,
  SPAM_WALLET_ASSETS_INFO,
  SURVIVING_ASSET_IDS,
  SWEEPABLE_ASSET_IDS,
  buildAssetsInfo,
  buildSpamWalletState,
} from './__fixtures__/spamWalletState.js';
import { waitFor } from './__fixtures__/test-utils.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';

/**
 * End-to-end coverage for the spam sweep the controller runs on
 * `KeyringController:unlock`, driven through a real `ApiPlatformClient` with
 * the Token API stubbed at the HTTP boundary. Lives outside
 * `AssetsController.test.ts`, which is already very large.
 */

type WithControllerOptions = {
  state?: Partial<AssetsControllerState>;
  queryApiClient?: ApiPlatformClient;
  isBasicFunctionality?: () => boolean;
  captureException?: (error: Error) => void;
};

type WithControllerCallback<ReturnValue> = (args: {
  controller: AssetsController;
  messenger: MockRootMessenger;
}) => Promise<ReturnValue>;

/**
 * Construct a controller wired to a root messenger with the handlers its
 * constructor and data sources need, then tear it down afterwards.
 *
 * @param options - Controller overrides.
 * @param options.state - Persisted state to boot from.
 * @param options.queryApiClient - The API client to query.
 * @param options.isBasicFunctionality - Basic functionality getter.
 * @param options.captureException - Sentry-compatible failure reporter.
 * @param fn - Callback run with the controller and messenger.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  {
    state = buildSpamWalletState(),
    queryApiClient = createTestApiClient(),
    isBasicFunctionality = (): boolean => true,
    captureException,
  }: WithControllerOptions,
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const { rootMessenger, assetsControllerMessenger } =
    createMockAssetControllerMessenger();
  const accounts = [
    createMockInternalAccount({
      id: ACCOUNT_ONE_ID,
      address: ACCOUNT_ONE_ADDRESS,
      metadata: { name: 'Account 1' } as InternalAccount['metadata'],
    }),
    createMockInternalAccount({
      id: ACCOUNT_TWO_ID,
      address: ACCOUNT_TWO_ADDRESS,
      metadata: { name: 'Account 2' } as InternalAccount['metadata'],
    }),
  ];

  registerAssetsControllerActions(rootMessenger, {
    accounts,
    enabledNetworkMap: { eip155: { '1': true, '10': true } },
    nativeAssetIdentifiers: { 'eip155:1': MAINNET_NATIVE },
  });

  const controller = new AssetsController({
    messenger: assetsControllerMessenger,
    state,
    queryApiClient,
    isBasicFunctionality,
    captureException,
  });

  try {
    return await fn({ controller, messenger: rootMessenger });
  } finally {
    controller.destroy();
  }
}

/**
 * Put the controller into the active lifecycle state where spam cleanup runs:
 * UI open, keyring unlocked, and account tree initialized.
 *
 * @param messenger - Root messenger used to publish lifecycle events.
 */
function activateSpamCleanupEnvironment(messenger: MockRootMessenger): void {
  (
    messenger as unknown as {
      publish: (topic: string, payload?: unknown) => void;
    }
  ).publish('ClientController:stateChange', { isUiOpen: true });
  messenger.publish('KeyringController:unlock');
  (messenger.publish as CallableFunction)(
    'AccountTreeController:initialized',
    {},
  );
}

describe('AssetsController spam cleanup', () => {
  afterEach(async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    nock.cleanAll();
  });

  it('does not sweep before the wallet is unlocked', async () => {
    const floorsScope = mockSuggestedOccurrenceFloors();
    const { scope: assetsScope } = mockV3Assets();

    await withController({}, async ({ controller }) => {
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(floorsScope.isDone()).toBe(false);
      expect(assetsScope.isDone()).toBe(false);
      expect(controller.state.assetsInfo).toStrictEqual(
        SPAM_WALLET_ASSETS_INFO,
      );
    });
  });

  it('does not sweep while basic functionality is off', async () => {
    const floorsScope = mockSuggestedOccurrenceFloors();
    mockV3Assets();

    await withController(
      { isBasicFunctionality: () => false },
      async ({ controller, messenger }) => {
        messenger.publish('KeyringController:unlock');
        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(floorsScope.isDone()).toBe(false);
        expect(controller.state.assetsInfo).toStrictEqual(
          SPAM_WALLET_ASSETS_INFO,
        );
      },
    );
  });

  it('stops tracking spam tokens across the whole wallet when it is unlocked', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();

    await withController({}, async ({ controller, messenger }) => {
      activateSpamCleanupEnvironment(messenger);
      await waitForTokenApiRequests();

      await waitFor(() => {
        expect(controller.state.assetsInfo).toStrictEqual(
          buildAssetsInfo(SURVIVING_ASSET_IDS),
        );
        expect(controller.state.assetsInfo[MAINNET_SPAM]).toBeUndefined();
        expect(controller.state.assetsInfo[OPTIMISM_SPAM]).toBeUndefined();
        expect(
          controller.state.assetsBalance[ACCOUNT_ONE_ID]?.[MAINNET_USDT],
        ).toBeDefined();
        expect(
          controller.state.assetsBalance[ACCOUNT_ONE_ID]?.[MAINNET_SPAM],
        ).toBeUndefined();
      });
    });
  });

  it('never asks the Token API about assets it is not allowed to sweep', async () => {
    mockSuggestedOccurrenceFloors();
    const { requestedBatches } = mockV3Assets();

    await withController({}, async ({ messenger }) => {
      activateSpamCleanupEnvironment(messenger);
      await waitForTokenApiRequests();

      await waitFor(() => {
        expect([...requestedBatches[0]].sort()).toStrictEqual(
          [...SWEEPABLE_ASSET_IDS].sort(),
        );
      });
    });
  });

  it('leaves prices and the imported token alone', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();
    const state = buildSpamWalletState();

    await withController({ state }, async ({ controller, messenger }) => {
      activateSpamCleanupEnvironment(messenger);
      await waitForTokenApiRequests();

      await waitFor(() => {
        expect(controller.state.customAssets).toStrictEqual({
          [ACCOUNT_TWO_ID]: [ARBITRUM_GMX],
        });
        expect(controller.state.assetsPrice).toStrictEqual(state.assetsPrice);
      });
    });
  });

  it('writes the swept state in a single update', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();

    await withController({}, async ({ messenger }) => {
      const stateChanges: AssetsControllerState[] = [];
      (
        messenger as unknown as {
          subscribe: (
            topic: string,
            handler: (state: AssetsControllerState) => void,
          ) => void;
        }
      ).subscribe('AssetsController:stateChanged', (state) => {
        stateChanges.push(state);
      });

      activateSpamCleanupEnvironment(messenger);
      await waitForTokenApiRequests();

      await waitFor(() => {
        expect(
          stateChanges.some(
            (state) => state.assetsInfo[MAINNET_SPAM] === undefined,
          ),
        ).toBe(true);
      });
    });
  });

  it('leaves the wallet untouched and reports when the Token API is down', async () => {
    mockSuggestedOccurrenceFloors({ status: 503 });
    const state = buildSpamWalletState();
    const captureException = jest.fn();

    await withController(
      { state, captureException },
      async ({ controller, messenger }) => {
        activateSpamCleanupEnvironment(messenger);
        await waitForTokenApiRequests();

        await waitFor(() => {
          expect(captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: expect.stringContaining('503'),
            }),
          );
        });

        expect(controller.state.assetsInfo).toStrictEqual(
          SPAM_WALLET_ASSETS_INFO,
        );
      },
    );
  });

  it('sweeps again on the next unlock, since occurrence counts move', async () => {
    // USDT clears mainnet's floor of four on the first unlock, and is missing
    // from the token lists by the second.
    mockSuggestedOccurrenceFloors();
    mockV3Assets();

    await withController({}, async ({ controller, messenger }) => {
      activateSpamCleanupEnvironment(messenger);
      await waitForTokenApiRequests();

      await waitFor(() => {
        expect(controller.state.assetsInfo[MAINNET_USDT]).toStrictEqual(
          SPAM_WALLET_ASSETS_INFO[MAINNET_USDT],
        );
      });

      mockSuggestedOccurrenceFloors();
      mockV3Assets({ occurrences: {} });
      messenger.publish('KeyringController:lock');
      messenger.publish('KeyringController:unlock');
      await waitForTokenApiRequests();

      await waitFor(() => {
        expect(controller.state.assetsInfo[MAINNET_USDT]).toBeUndefined();
      });
    });
  });

  it('sweeps during a normal app start, alongside asset tracking', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();

    await withController({}, async ({ controller, messenger }) => {
      activateSpamCleanupEnvironment(messenger);
      await waitForTokenApiRequests();

      await waitFor(() => {
        expect(controller.state.assetsInfo[MAINNET_SPAM]).toBeUndefined();
        expect(controller.state.assetsInfo[OPTIMISM_SPAM]).toBeUndefined();
        expect(controller.state.assetsInfo[OPTIMISM_USDC]).toStrictEqual(
          SPAM_WALLET_ASSETS_INFO[OPTIMISM_USDC],
        );
      });
    });
  });

  it('preserves concurrent state updates during the sweep', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();

    await withController({}, async ({ controller, messenger }) => {
      activateSpamCleanupEnvironment(messenger);

      // Simulate a concurrent update while the sweep is awaiting the Token API
      // @ts-expect-error - we are forcing a concurrent update to the state
      controller.update((state) => {
        return {
          ...state,
          assetsInfo: {
            ...state.assetsInfo,
            'eip155:1/erc20:0xconcurrent': {
              type: 'erc20',
              symbol: 'CON',
              name: 'Concurrent Token',
              decimals: 18,
            },
          },
        };
      });

      await waitForTokenApiRequests();

      await waitFor(() => {
        expect(controller.state.assetsInfo[MAINNET_SPAM]).toBeUndefined();
        expect(
          controller.state.assetsInfo['eip155:1/erc20:0xconcurrent'],
        ).toBeDefined();
      });
    });
  });
});
