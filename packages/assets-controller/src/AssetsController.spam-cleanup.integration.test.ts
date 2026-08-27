import type { ApiPlatformClient } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';

import {
  createMockAssetControllerMessenger,
  createMockInternalAccount,
  registerAssetsControllerActions,
} from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import { mockSweepApis } from './__fixtures__/scam-token-cleanup/api-responses/index.js';
import {
  createTestApiClient,
  waitForTokenApiRequests,
} from './__fixtures__/mockTokenApi.js';
import {
  SCAM_WALLET_ACCOUNT_ADDRESS,
  SCAM_WALLET_ACCOUNT_ID,
  SCAM_WALLET_CUSTOM_ASSETS,
  SCAM_WALLET_NATIVE_ASSET_IDENTIFIERS,
  SCAM_WALLET_SPAM_ASSET_IDS,
  SCAM_WALLET_SURVIVING_ASSET_IDS,
  buildScamWalletState,
} from './__fixtures__/scam-token-cleanup/scamWalletState.js';
import { waitFor } from './__fixtures__/test-utils.js';
import { AssetsController } from './AssetsController.js';
import type { AssetsControllerState } from './AssetsController.js';

/**
 * True-to-life integration coverage for the unlock-time scam-token sweep.
 * Unlike `AssetsController.spam-cleanup.test.ts`, which drives a hand-built
 * wallet and hand-written API bodies, this boots the controller from the
 * example scam-token wallet state (see
 * `__fixtures__/scam-token-cleanup/scamWalletState.ts`) and answers the
 * Token/Tokens API from captured live responses (see
 * `__fixtures__/scam-token-cleanup/api-responses/`). Only the messenger and
 * the HTTP boundary are mocked.
 */

/**
 * Mirror & subset of `assetsUnifyState`
 */
const UNLOCK_CLEANUP_ENABLED_FLAGS = {
  assetsUnifyState: { useUnlockCleanup: true },
};

type WithControllerOptions = {
  state?: Partial<AssetsControllerState>;
  queryApiClient?: ApiPlatformClient;
  isBasicFunctionality?: () => boolean;
  captureException?: (error: Error) => void;
  remoteFeatureFlags?: FeatureFlags;
};

type WithControllerCallback<ReturnValue> = (args: {
  controller: AssetsController;
  messenger: MockRootMessenger;
}) => Promise<ReturnValue>;

async function withController<ReturnValue>(
  {
    state = buildScamWalletState(),
    queryApiClient = createTestApiClient(),
    isBasicFunctionality = (): boolean => true,
    captureException,
    remoteFeatureFlags = UNLOCK_CLEANUP_ENABLED_FLAGS,
  }: WithControllerOptions,
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const { rootMessenger, assetsControllerMessenger } =
    createMockAssetControllerMessenger({ delegateGetState: false });

  // Every account the wallet tracks balances for: the synthetic catch-all
  // account plus the real custom-asset owner.
  const accounts = [
    createMockInternalAccount({
      id: SCAM_WALLET_ACCOUNT_ID,
      address: SCAM_WALLET_ACCOUNT_ADDRESS,
      metadata: { name: 'Spam Wallet' } as InternalAccount['metadata'],
    }),
    ...Object.keys(SCAM_WALLET_CUSTOM_ASSETS).map((accountId) =>
      createMockInternalAccount({
        id: accountId,
        address: '0x5c269fd64c004dd3df2c44ca5d25fbe7ab959e02',
        metadata: { name: 'Imported USDC' } as InternalAccount['metadata'],
      }),
    ),
  ];

  registerAssetsControllerActions(rootMessenger, {
    accounts,
    enabledNetworkMap: { eip155: { '1': true, '10': true, '8453': true } },
    nativeAssetIdentifiers: SCAM_WALLET_NATIVE_ASSET_IDENTIFIERS,
    remoteFeatureFlags,
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

describe('AssetsController scam-token cleanup (example state)', () => {
  it('sweeps the airdrop scam tokens out of the example wallet on unlock', async () => {
    mockSweepApis();

    await withController({}, async ({ controller, messenger }) => {
      messenger.publish('KeyringController:unlock');
      await waitForTokenApiRequests();

      await waitFor(() => {
        // Every captured sub-floor airdrop is gone.
        for (const spamId of SCAM_WALLET_SPAM_ASSET_IDS) {
          expect(controller.state.assetsInfo[spamId]).toBeUndefined();
        }
        // And the surviving set is exactly the genuine holdings, the custom
        // import, the mUSD entries and every native / non-EVM asset.
        expect(Object.keys(controller.state.assetsInfo).sort()).toStrictEqual(
          [...SCAM_WALLET_SURVIVING_ASSET_IDS].sort(),
        );
      });
    });
  });

  it('keeps the hand-imported custom asset and clears spam from balances', async () => {
    mockSweepApis();
    const state = buildScamWalletState();

    await withController({ state }, async ({ controller, messenger }) => {
      messenger.publish('KeyringController:unlock');
      await waitForTokenApiRequests();

      await waitFor(() => {
        // The custom Arbitrum USDC survives whatever its occurrence count.
        expect(controller.state.customAssets).toStrictEqual(
          SCAM_WALLET_CUSTOM_ASSETS,
        );
        // No swept asset is left behind in any account's balances.
        for (const balances of Object.values(controller.state.assetsBalance)) {
          for (const spamId of SCAM_WALLET_SPAM_ASSET_IDS) {
            expect(balances[spamId]).toBeUndefined();
          }
        }
      });
    });
  });

  it('asks the Tokens API about every sweepable ERC-20 and nothing else', async () => {
    const { requestedBatches } = mockSweepApis();

    await withController({}, async ({ messenger }) => {
      messenger.publish('KeyringController:unlock');
      await waitForTokenApiRequests();

      await waitFor(() => {
        const requested = requestedBatches.flat();
        // Natives, non-EVM assets and the default-tracked mUSD are never sent.
        expect(requested).not.toContain(
          'eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
        );
        expect(requested.some((id) => !id.startsWith('eip155:'))).toBe(false);
        // Spam and genuine sweepable ERC-20s are both queried.
        expect(requested.length).toBeGreaterThan(0);
      });
    });
  });

  it('does not sweep before the wallet is unlocked', async () => {
    mockSweepApis();

    await withController({}, async ({ controller }) => {
      await new Promise((resolve) => setTimeout(resolve, 250));

      // The full 83-asset registry is untouched until unlock.
      expect(Object.keys(controller.state.assetsInfo)).toHaveLength(83);
    });
  });

  it('does not sweep when the useUnlockCleanup feature flag is off', async () => {
    mockSweepApis();

    await withController(
      {
        remoteFeatureFlags: {
          assetsUnifyState: { useUnlockCleanup: false },
        },
      },
      async ({ controller, messenger }) => {
        messenger.publish('KeyringController:unlock');
        await new Promise((resolve) => setTimeout(resolve, 250));

        // The full 83-asset registry is untouched while the flag is off.
        expect(Object.keys(controller.state.assetsInfo)).toHaveLength(83);
      },
    );
  });
});
