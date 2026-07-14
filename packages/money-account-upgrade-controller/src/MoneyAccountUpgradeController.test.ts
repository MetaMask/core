import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type {
  MoneyAccountUpgradeControllerMessenger,
  MoneyAccountUpgradeControllerState,
  MoneyAccountUpgradeStepError,
} from '.';
import {
  MoneyAccountUpgradeController,
  getDefaultMoneyAccountUpgradeControllerState,
  isMoneyAccountUpgradeStepError,
  isTerminalMoneyAccountUpgradeError,
} from '.';

const MOCK_CHAIN_ID = '0x1' as Hex; // mainnet, supported in delegation-deployments@1.3.0
const UNSUPPORTED_CHAIN_ID = '0x539' as Hex; // 1337 — local dev, not in registry
const MOCK_ACCOUNT_ADDRESS =
  '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_BORING_VAULT_ADDRESS =
  '0xA20f97813014129E7609171d2D3AA3da5206259e' as Hex;

// CHOMP-API-derived values.
const MOCK_DELEGATE_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Hex;
const MOCK_MUSD_TOKEN_ADDRESS =
  '0x3333333333333333333333333333333333333333' as Hex;
const MOCK_VEDA_VAULT_ADAPTER_ADDRESS =
  '0x4444444444444444444444444444444444444444' as Hex;

// Delegation Framework deployment for mainnet @ 1.3.0 — the controller resolves
// these from `@metamask/delegation-deployments` rather than accepting them via
// `init()`. We re-read from the same source here so the test does not drift if
// the deployment registry is bumped.
const MAINNET_CONTRACTS =
  DELEGATOR_CONTRACTS['1.3.0'][hexToNumber(MOCK_CHAIN_ID)];

const MOCK_SERVICE_DETAILS_RESPONSE = {
  auth: { message: 'CHOMP Authentication' },
  chains: {
    [MOCK_CHAIN_ID]: {
      autoDepositDelegate: MOCK_DELEGATE_ADDRESS,
      protocol: {
        vedaProtocol: {
          supportedTokens: [
            {
              tokenAddress: MOCK_MUSD_TOKEN_ADDRESS,
              tokenDecimals: 18,
            },
          ],
          adapterAddress: MOCK_VEDA_VAULT_ADAPTER_ADDRESS,
          intentTypes: ['cash-deposit', 'cash-withdrawal'] as const,
        },
      },
    },
  },
};

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;

type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

type Mocks = {
  getServiceDetails: jest.Mock;
  signPersonalMessage: jest.Mock;
  associateAddress: jest.Mock;
  getAssociatedAddresses: jest.Mock;
  createUpgrade: jest.Mock;
  signEip7702Authorization: jest.Mock;
  findNetworkClientIdByChainId: jest.Mock;
  getNetworkClientById: jest.Mock;
  providerRequest: jest.Mock;
  listDelegations: jest.Mock;
  createDelegation: jest.Mock;
  signDelegation: jest.Mock;
  verifyDelegation: jest.Mock;
  getIntentsByAddress: jest.Mock;
  createIntents: jest.Mock;
};

function setup({
  state,
}: {
  state?: Partial<MoneyAccountUpgradeControllerState>;
} = {}): {
  controller: MoneyAccountUpgradeController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  // 65-byte signature — r (32 bytes) + s (32 bytes) + v = 0x1c (28).
  const signature = `0x${'1'.repeat(64)}${'2'.repeat(64)}1c`;

  // Default provider responses: account is a plain EOA with nonce 0.
  const providerRequest = jest
    .fn()
    .mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_getCode') {
        return '0x';
      }
      if (method === 'eth_getTransactionCount') {
        return '0x0';
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

  const mocks: Mocks = {
    getServiceDetails: jest
      .fn()
      .mockResolvedValue(MOCK_SERVICE_DETAILS_RESPONSE),
    signPersonalMessage: jest.fn().mockResolvedValue('0xdeadbeef'),
    associateAddress: jest.fn().mockResolvedValue({
      profileId: 'profile-1',
      address: MOCK_ACCOUNT_ADDRESS,
      status: 'created',
    }),
    getAssociatedAddresses: jest.fn().mockResolvedValue([]),
    createUpgrade: jest.fn().mockResolvedValue({
      signerAddress: MOCK_ACCOUNT_ADDRESS,
      address: MAINNET_CONTRACTS.EIP7702StatelessDeleGatorImpl,
      chainId: MOCK_CHAIN_ID,
      nonce: '0x0',
      status: 'pending',
      createdAt: '2026-04-21T12:00:00.000Z',
    }),
    signEip7702Authorization: jest.fn().mockResolvedValue(signature),
    findNetworkClientIdByChainId: jest
      .fn()
      .mockReturnValue('network-client-id'),
    getNetworkClientById: jest.fn().mockReturnValue({
      provider: { request: providerRequest },
    }),
    providerRequest,
    listDelegations: jest.fn().mockResolvedValue([]),
    createDelegation: jest.fn().mockResolvedValue(undefined),
    signDelegation: jest.fn().mockResolvedValue(`0x${'cd'.repeat(65)}`),
    verifyDelegation: jest.fn().mockResolvedValue({ valid: true }),
    getIntentsByAddress: jest.fn().mockResolvedValue([]),
    createIntents: jest.fn().mockResolvedValue([]),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'ChompApiService:getServiceDetails',
    mocks.getServiceDetails,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    mocks.signPersonalMessage,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:associateAddress',
    mocks.associateAddress,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getAssociatedAddresses',
    mocks.getAssociatedAddresses,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createUpgrade',
    mocks.createUpgrade,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:signEip7702Authorization',
    mocks.signEip7702Authorization,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    mocks.findNetworkClientIdByChainId,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mocks.getNetworkClientById,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:listDelegations',
    mocks.listDelegations,
  );
  rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:createDelegation',
    mocks.createDelegation,
  );
  rootMessenger.registerActionHandler(
    'DelegationController:signDelegation',
    mocks.signDelegation,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:verifyDelegation',
    mocks.verifyDelegation,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getIntentsByAddress',
    mocks.getIntentsByAddress,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createIntents',
    mocks.createIntents,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
      'ChompApiService:getServiceDetails',
      'KeyringController:signPersonalMessage',
      'ChompApiService:associateAddress',
      'ChompApiService:getAssociatedAddresses',
      'ChompApiService:createUpgrade',
      'KeyringController:signEip7702Authorization',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
      'AuthenticatedUserStorageService:listDelegations',
      'AuthenticatedUserStorageService:createDelegation',
      'DelegationController:signDelegation',
      'ChompApiService:verifyDelegation',
      'ChompApiService:getIntentsByAddress',
      'ChompApiService:createIntents',
    ],
    events: [],
    messenger,
  });

  const controller = new MoneyAccountUpgradeController({
    messenger,
    state,
  });

  return { controller, rootMessenger, messenger, mocks };
}

/**
 * Resets the call history of every mock in the bag, preserving their
 * configured implementations. Useful for asserting that a later
 * `upgradeAccount` call performs no work.
 *
 * @param mocks - The mocks bag from `setup`.
 */
function clearMockCalls(mocks: Mocks): void {
  for (const mock of Object.values(mocks)) {
    mock.mockClear();
  }
}

describe('MoneyAccountUpgradeController', () => {
  describe('constructor', () => {
    it('does not make async init calls when constructed', () => {
      const { mocks } = setup();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('starts with the default empty state', () => {
      const { controller } = setup();

      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountUpgradeControllerState(),
      );
      expect(controller.state.upgradedAccounts).toStrictEqual({});
    });

    it('merges provided partial state with the defaults', () => {
      const status = { configFingerprint: 'fingerprint', completedAt: 123 };

      const { controller } = setup({
        state: { upgradedAccounts: { [MOCK_ACCOUNT_ADDRESS]: status } },
      });

      expect(
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS],
      ).toStrictEqual(status);
    });
  });

  describe('init', () => {
    it('fetches service details and builds config', async () => {
      const { controller, mocks } = setup();

      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });

      expect(mocks.getServiceDetails).toHaveBeenCalledWith([MOCK_CHAIN_ID]);
    });

    it('throws when the chain has no Delegation Framework deployment', async () => {
      const { controller, mocks } = setup();

      await expect(
        controller.init({
          chainId: UNSUPPORTED_CHAIN_ID,
          boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
        }),
      ).rejects.toThrow(
        `Delegation Framework 1.3.0 is not deployed on chain ${UNSUPPORTED_CHAIN_ID}`,
      );
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('uses the supplied boring vault address as the withdrawal-side delegation token', async () => {
      const { controller, mocks } = setup();

      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      // Both delegations were signed; the boring-vault address shows up in the
      // ABI-encoded ERC20TransferAmount caveat terms of one of them.
      expect(mocks.signDelegation).toHaveBeenCalledTimes(2);
      const allCaveatTerms = mocks.verifyDelegation.mock.calls
        .flatMap(([{ signedDelegation }]) => signedDelegation.caveats)
        .map((caveat) => caveat.terms.toLowerCase());
      expect(
        allCaveatTerms.some((terms) =>
          terms.includes(MOCK_BORING_VAULT_ADDRESS.toLowerCase().slice(2)),
        ),
      ).toBe(true);
    });

    it('throws when the chain is not found in service details', async () => {
      const { controller, mocks } = setup();

      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {},
      });

      await expect(
        controller.init({
          chainId: MOCK_CHAIN_ID,
          boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
        }),
      ).rejects.toThrow(
        `Chain ${MOCK_CHAIN_ID} not found in service details response`,
      );
    });

    it('throws when vedaProtocol is not found', async () => {
      const { controller, mocks } = setup();

      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {
          [MOCK_CHAIN_ID]: {
            autoDepositDelegate: MOCK_DELEGATE_ADDRESS,
            protocol: {},
          },
        },
      });

      await expect(
        controller.init({
          chainId: MOCK_CHAIN_ID,
          boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
        }),
      ).rejects.toThrow(
        `vedaProtocol not found for chain ${MOCK_CHAIN_ID} in service details response`,
      );
    });

    it('throws when supportedTokens is empty', async () => {
      const { controller, mocks } = setup();

      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {
          [MOCK_CHAIN_ID]: {
            autoDepositDelegate: MOCK_DELEGATE_ADDRESS,
            protocol: {
              vedaProtocol: {
                supportedTokens: [],
                adapterAddress: MOCK_VEDA_VAULT_ADAPTER_ADDRESS,
                intentTypes: ['cash-deposit', 'cash-withdrawal'],
              },
            },
          },
        },
      });

      await expect(
        controller.init({
          chainId: MOCK_CHAIN_ID,
          boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
        }),
      ).rejects.toThrow(
        `No supported tokens found for vedaProtocol on chain ${MOCK_CHAIN_ID}`,
      );
    });
  });

  describe('upgradeAccount', () => {
    it('throws when called before init', async () => {
      const { controller } = setup();

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );
    });

    it('throws when a previous init attempt failed', async () => {
      const { controller, mocks } = setup();
      mocks.getServiceDetails.mockResolvedValueOnce({
        auth: { message: 'CHOMP Authentication' },
        chains: {},
      });
      await expect(
        controller.init({
          chainId: MOCK_CHAIN_ID,
          boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
        }),
      ).rejects.toThrow('Chain 0x1 not found in service details response');

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );
    });

    it('runs each step against the deployment-derived contract addresses', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });

      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(mocks.signPersonalMessage).toHaveBeenCalledWith(
        expect.objectContaining({ from: MOCK_ACCOUNT_ADDRESS }),
      );
      expect(mocks.associateAddress).toHaveBeenCalledWith(
        expect.objectContaining({ address: MOCK_ACCOUNT_ADDRESS }),
      );
      expect(mocks.signEip7702Authorization).toHaveBeenCalledWith(
        expect.objectContaining({
          from: MOCK_ACCOUNT_ADDRESS,
          contractAddress: MAINNET_CONTRACTS.EIP7702StatelessDeleGatorImpl,
        }),
      );
      expect(mocks.createUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          address: MAINNET_CONTRACTS.EIP7702StatelessDeleGatorImpl,
          chainId: MOCK_CHAIN_ID,
          nonce: '0x0',
        }),
      );
    });

    it('is callable via the messenger', async () => {
      const { controller, rootMessenger } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });

      expect(
        await rootMessenger.call(
          'MoneyAccountUpgradeController:upgradeAccount',
          MOCK_ACCOUNT_ADDRESS,
        ),
      ).toBeUndefined();
    });

    it('propagates errors thrown by a step', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValue(new Error('signing failed'));

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('signing failed');
    });

    it('wraps a step failure in a MoneyAccountUpgradeStepError that records the step and cause', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      const cause = new Error('signing failed');
      // The associate-address step (first in the sequence) signs a personal
      // message before calling CHOMP, so failing this surfaces that step.
      mocks.signPersonalMessage.mockRejectedValue(cause);

      const error = await controller
        .upgradeAccount(MOCK_ACCOUNT_ADDRESS)
        .catch((thrown: unknown) => thrown);

      expect(isMoneyAccountUpgradeStepError(error)).toBe(true);
      expect(error).toMatchObject({
        step: 'associate-address',
        cause,
      });
      expect((error as MoneyAccountUpgradeStepError).message).toBe(
        'Money Account upgrade failed at step "associate-address": signing failed',
      );
    });

    it('records the name of the specific step that failed', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      // The first step (associate-address) passes; fail at the second step
      // (eip-7702-authorization), which signs the authorization.
      mocks.signEip7702Authorization.mockRejectedValue(
        new Error('authorization rejected'),
      );

      const error = await controller
        .upgradeAccount(MOCK_ACCOUNT_ADDRESS)
        .catch((thrown: unknown) => thrown);

      expect(error).toMatchObject({ step: 'eip-7702-authorization' });
    });

    it('wraps a non-Error thrown by a step, stringifying it as the cause message', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValue('plain string failure');

      const error = await controller
        .upgradeAccount(MOCK_ACCOUNT_ADDRESS)
        .catch((thrown: unknown) => thrown);

      expect(error).toMatchObject({
        step: 'associate-address',
        cause: 'plain string failure',
      });
      expect((error as MoneyAccountUpgradeStepError).message).toBe(
        'Money Account upgrade failed at step "associate-address": plain string failure',
      );
    });

    it('marks the failure terminal when the account is delegated to another implementation', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      // EIP-7702 delegation code pointing at a third-party impl.
      mocks.providerRequest.mockImplementation(
        async ({ method }: { method: string }) => {
          if (method === 'eth_getCode') {
            return `0xef0100${'9'.repeat(40)}`;
          }
          return '0x0';
        },
      );

      const error = await controller
        .upgradeAccount(MOCK_ACCOUNT_ADDRESS)
        .catch((thrown: unknown) => thrown);

      expect(isTerminalMoneyAccountUpgradeError(error)).toBe(true);
    });

    it('marks ordinary step failures as non-terminal', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValue(new Error('network down'));

      const error = await controller
        .upgradeAccount(MOCK_ACCOUNT_ADDRESS)
        .catch((thrown: unknown) => thrown);

      expect(isMoneyAccountUpgradeStepError(error)).toBe(true);
      expect(isTerminalMoneyAccountUpgradeError(error)).toBe(false);
    });
  });

  describe('upgrade status tracking', () => {
    it('records a successful upgrade against the lowercased address', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      const mixedCaseAddress = MOCK_ACCOUNT_ADDRESS.replace(
        '0xabc',
        '0xABC',
      ) as Hex;

      await controller.upgradeAccount(mixedCaseAddress);

      expect(mocks.signPersonalMessage).toHaveBeenCalled();
      expect(
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS],
      ).toStrictEqual({
        configFingerprint: expect.any(String),
        completedAt: expect.any(Number),
      });
    });

    it('skips the steps on a subsequent call for an already-upgraded account', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);
      clearMockCalls(mocks);

      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
      expect(mocks.providerRequest).not.toHaveBeenCalled();
      expect(mocks.listDelegations).not.toHaveBeenCalled();
      expect(mocks.getIntentsByAddress).not.toHaveBeenCalled();
    });

    it('treats recorded upgrades case-insensitively', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);
      clearMockCalls(mocks);

      await controller.upgradeAccount(
        MOCK_ACCOUNT_ADDRESS.replace('0xabc', '0xABC') as Hex,
      );

      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
    });

    it('skips the steps when constructed with state from a previous successful upgrade', async () => {
      const first = setup();
      await first.controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      await first.controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      const second = setup({ state: first.controller.state });
      await second.controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      await second.controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(second.mocks.signPersonalMessage).not.toHaveBeenCalled();
      expect(second.mocks.providerRequest).not.toHaveBeenCalled();
    });

    it('does not record the account when a step fails, and re-runs on the next call', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValueOnce(
        new Error('signing failed'),
      );

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('signing failed');

      expect(controller.state.upgradedAccounts).toStrictEqual({});

      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS],
      ).toBeDefined();
    });

    it('re-runs the sequence when the active config no longer matches the recorded fingerprint', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);
      const { configFingerprint: originalFingerprint } =
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS];

      // CHOMP rotates its delegate address — the recorded upgrade no longer
      // reflects the active config.
      mocks.getServiceDetails.mockResolvedValue({
        ...MOCK_SERVICE_DETAILS_RESPONSE,
        chains: {
          [MOCK_CHAIN_ID]: {
            ...MOCK_SERVICE_DETAILS_RESPONSE.chains[MOCK_CHAIN_ID],
            autoDepositDelegate:
              '0x2222222222222222222222222222222222222222' as Hex,
          },
        },
      });
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      clearMockCalls(mocks);

      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(mocks.signPersonalMessage).toHaveBeenCalled();
      expect(
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS]
          .configFingerprint,
      ).not.toBe(originalFingerprint);
    });
  });

  describe('upgradeAccountWithRetry', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves after a single attempt when the upgrade succeeds', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });

      await controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS);

      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);
      expect(
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS],
      ).toBeDefined();
    });

    it('retries a failed attempt after 10 seconds', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValueOnce(
        new Error('network down'),
      );
      jest.useFakeTimers();

      const promise = controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS);
      await jest.advanceTimersByTimeAsync(0);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(9_999);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      await promise;

      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(2);
      expect(
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS],
      ).toBeDefined();
    });

    it('backs off exponentially between attempts, capped at 60 seconds', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValue(new Error('network down'));
      jest.useFakeTimers();

      const promise = controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS, {
        maxAttempts: 6,
      });
      // Swallow the eventual rejection so advancing timers doesn't surface an
      // unhandled rejection; the real assertion happens below.
      promise.catch(() => undefined);

      await jest.advanceTimersByTimeAsync(0);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(20_000);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(40_000);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(4);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(5);
      // The cap repeats once the schedule is exhausted.
      await jest.advanceTimersByTimeAsync(60_000);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(6);

      await expect(promise).rejects.toThrow('network down');
    });

    it('gives up after maxAttempts and rethrows the last step error', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValue(new Error('network down'));
      jest.useFakeTimers();

      const promise = controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS, {
        maxAttempts: 2,
      });
      promise.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(promise).rejects.toMatchObject({
        step: 'associate-address',
      });
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(2);
      expect(controller.state.upgradedAccounts).toStrictEqual({});
    });

    it('does not retry terminal failures', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      // Account delegated to a third-party impl — retrying cannot help.
      mocks.providerRequest.mockImplementation(
        async ({ method }: { method: string }) => {
          if (method === 'eth_getCode') {
            return `0xef0100${'9'.repeat(40)}`;
          }
          return '0x0';
        },
      );

      await expect(
        controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('already upgraded to another smart account');

      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);
    });

    it('does not retry non-step errors such as calling before init', async () => {
      const { controller, mocks } = setup();

      await expect(
        controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );

      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
    });

    it('throws without attempting when the signal is already aborted', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS, {
          signal: abortController.signal,
        }),
      ).rejects.toThrow('Money Account upgrade retry aborted');

      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
    });

    it('stops retrying when the signal aborts during the backoff wait', async () => {
      const { controller, mocks } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });
      mocks.signPersonalMessage.mockRejectedValue(new Error('network down'));
      jest.useFakeTimers();
      const abortController = new AbortController();

      const promise = controller.upgradeAccountWithRetry(MOCK_ACCOUNT_ADDRESS, {
        signal: abortController.signal,
      });
      promise.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);

      abortController.abort();
      await expect(promise).rejects.toThrow(
        'Money Account upgrade retry aborted',
      );

      // The pending wait was cancelled — advancing time runs no further attempts.
      await jest.advanceTimersByTimeAsync(120_000);
      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);
    });

    it('is callable via the messenger', async () => {
      const { controller, rootMessenger } = setup();
      await controller.init({
        chainId: MOCK_CHAIN_ID,
        boringVaultAddress: MOCK_BORING_VAULT_ADDRESS,
      });

      expect(
        await rootMessenger.call(
          'MoneyAccountUpgradeController:upgradeAccountWithRetry',
          MOCK_ACCOUNT_ADDRESS,
        ),
      ).toBeUndefined();
    });
  });
});
