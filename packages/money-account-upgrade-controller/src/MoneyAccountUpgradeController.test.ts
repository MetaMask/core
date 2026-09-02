import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { MoneyAccountVaultConfig } from '@metamask/money-account-utils';
import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type {
  MoneyAccountUpgradeControllerMessenger,
  MoneyAccountUpgradeControllerState,
  MoneyAccountUpgradeStepError,
} from './index.js';
import {
  MissingMoneyAccountVaultConfigError,
  MoneyAccountUpgradeController,
  getDefaultMoneyAccountUpgradeControllerState,
  isMoneyAccountUpgradeStepError,
  isTerminalMoneyAccountUpgradeError,
} from './index.js';

const MOCK_CHAIN_ID = '0x1' as Hex; // mainnet, supported in delegation-deployments@1.3.0
const UNSUPPORTED_CHAIN_ID = '0x539' as Hex; // 1337 — local dev, not in registry
const MOCK_ACCOUNT_ADDRESS =
  '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_BORING_VAULT_ADDRESS =
  '0xA20f97813014129E7609171d2D3AA3da5206259e' as Hex;

const VAULT_CONFIG: MoneyAccountVaultConfig = {
  chainId: MOCK_CHAIN_ID,
  boringVault: MOCK_BORING_VAULT_ADDRESS,
  tellerAddress: '0x2D49EA58A4C70b62c8B56DE971310d9e999c8117',
  accountantAddress: '0x7382c5b8B51B8C4f127B3123C1039581BAA5A06B',
  lensAddress: '0xA816ECd922de94c6879AD23B9A884dB257F20947',
  underlyingToken: '0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
};

// The same vault, but published under a fresher flag payload with a different
// vmUSD token address — must be treated as a config change.
const CHANGED_VAULT_CONFIG: MoneyAccountVaultConfig = {
  ...VAULT_CONFIG,
  underlyingToken: '0x1111111111111111111111111111111111111111',
};

// CHOMP-API-derived values.
const MOCK_DELEGATE_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Hex;
const MOCK_MUSD_TOKEN_ADDRESS =
  '0x3333333333333333333333333333333333333333' as Hex;
const MOCK_VEDA_VAULT_ADAPTER_ADDRESS =
  '0x4444444444444444444444444444444444444444' as Hex;

// Delegation Framework deployment for mainnet @ 1.3.0 — the controller resolves
// these from `@metamask/delegation-deployments` rather than accepting them via
// the vault config. We re-read from the same source here so the test does not
// drift if the deployment registry is bumped.
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

/**
 * Flush the microtask queue so scheduled bootstraps settle.
 */
const flushPromises = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
};

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
  isEnabled: jest.Mock;
  isEligible: jest.Mock;
  ensureChainConfigured: jest.Mock;
  onBootstrapError: jest.Mock;
};

/**
 * The mutable gate state the messenger and hook mocks read on every call, so
 * tests can flip a gate and re-trigger a sync.
 */
type GateConfig = {
  isEnabled: boolean;
  isUnlocked: boolean;
  hasHdKeyring: boolean;
  isEligible: boolean;
  vaultConfig: unknown;
};

function setup({
  state,
  isEnabled = true,
  isUnlocked = true,
  hasHdKeyring = true,
  isEligible = true,
  vaultConfig = VAULT_CONFIG,
  withOptionalHooks = true,
}: {
  state?: Partial<MoneyAccountUpgradeControllerState>;
  isEnabled?: boolean;
  isUnlocked?: boolean;
  hasHdKeyring?: boolean;
  isEligible?: boolean;
  vaultConfig?: unknown;
  withOptionalHooks?: boolean;
} = {}): {
  controller: MoneyAccountUpgradeController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
  config: GateConfig;
  bootstrap: () => Promise<void>;
  triggerFlagChange: () => Promise<void>;
  triggerKeyringChange: () => Promise<void>;
} {
  const config: GateConfig = {
    isEnabled,
    isUnlocked,
    hasHdKeyring,
    isEligible,
    vaultConfig,
  };

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
    isEnabled: jest.fn().mockImplementation(() => config.isEnabled),
    isEligible: jest.fn().mockImplementation(async () => config.isEligible),
    ensureChainConfigured: jest.fn().mockResolvedValue(undefined),
    onBootstrapError: jest.fn(),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    (): RemoteFeatureFlagControllerState =>
      ({
        remoteFeatureFlags: {
          moneyAccountVaultConfig: config.vaultConfig,
        },
        cacheTimestamp: 0,
      }) as RemoteFeatureFlagControllerState,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    (): KeyringControllerState =>
      ({
        isUnlocked: config.isUnlocked,
        keyrings:
          config.isUnlocked && config.hasHdKeyring
            ? [{ type: 'HD Key Tree', accounts: [], metadata: { id: 'hd' } }]
            : [],
      }) as unknown as KeyringControllerState,
  );
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
      'KeyringController:getState',
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
      'RemoteFeatureFlagController:getState',
    ],
    events: [
      'KeyringController:stateChanged',
      'RemoteFeatureFlagController:stateChanged',
    ],
    messenger,
  });

  const controller = new MoneyAccountUpgradeController({
    messenger,
    state,
    hooks: withOptionalHooks
      ? {
          isEnabled: mocks.isEnabled,
          isEligible: mocks.isEligible,
          ensureChainConfigured: mocks.ensureChainConfigured,
          onBootstrapError: mocks.onBootstrapError,
        }
      : { isEnabled: mocks.isEnabled },
  });

  const bootstrap = async (): Promise<void> => {
    controller.init();
    await flushPromises();
  };

  const triggerFlagChange = async (): Promise<void> => {
    rootMessenger.publish(
      'RemoteFeatureFlagController:stateChanged',
      {} as RemoteFeatureFlagControllerState,
      [],
    );
    await flushPromises();
  };

  const triggerKeyringChange = async (): Promise<void> => {
    rootMessenger.publish(
      'KeyringController:stateChanged',
      {} as KeyringControllerState,
      [],
    );
    await flushPromises();
  };

  return {
    controller,
    rootMessenger,
    messenger,
    mocks,
    config,
    bootstrap,
    triggerFlagChange,
    triggerKeyringChange,
  };
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
    it('makes no messenger calls before init()', () => {
      const { mocks } = setup();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
      expect(mocks.isEnabled).not.toHaveBeenCalled();
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

  describe('bootstrap gating', () => {
    it('bootstraps at init when the gates are open', async () => {
      const { mocks, bootstrap } = setup();

      await bootstrap();

      expect(mocks.getServiceDetails).toHaveBeenCalledWith([MOCK_CHAIN_ID]);
    });

    it('configures the chain before fetching service details', async () => {
      const order: string[] = [];
      const { mocks, bootstrap } = setup();
      mocks.ensureChainConfigured.mockImplementation(async () => {
        order.push('ensureChainConfigured');
      });
      mocks.getServiceDetails.mockImplementation(async () => {
        order.push('getServiceDetails');
        return MOCK_SERVICE_DETAILS_RESPONSE;
      });

      await bootstrap();

      expect(order).toStrictEqual(['ensureChainConfigured', 'getServiceDetails']);
      expect(mocks.ensureChainConfigured).toHaveBeenCalledWith(VAULT_CONFIG);
    });

    it('is idempotent: a second init() does not re-subscribe or re-bootstrap', async () => {
      const { controller, mocks, bootstrap, triggerFlagChange } = setup();
      await bootstrap();

      controller.init();
      await flushPromises();
      await triggerFlagChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('does not bootstrap when the isEnabled hook returns false', async () => {
      const { mocks, bootstrap } = setup({ isEnabled: false });

      await bootstrap();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('passes the current remote feature flags to the isEnabled hook', async () => {
      const { mocks, bootstrap } = setup();

      await bootstrap();

      expect(mocks.isEnabled).toHaveBeenCalledWith(
        expect.objectContaining({
          moneyAccountVaultConfig: VAULT_CONFIG,
        }),
      );
    });

    it('does not bootstrap while the wallet is locked', async () => {
      const { mocks, bootstrap } = setup({ isUnlocked: false });

      await bootstrap();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('does not bootstrap while the keyring list has no HD keyring', async () => {
      const { mocks, bootstrap } = setup({ hasHdKeyring: false });

      await bootstrap();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('bootstraps on unlock via the keyring state change', async () => {
      const { config, mocks, bootstrap, triggerKeyringChange } = setup({
        isUnlocked: false,
      });
      await bootstrap();
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();

      config.isUnlocked = true;
      await triggerKeyringChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('bootstraps when the isEnabled hook flips to true on a flag change', async () => {
      const { config, mocks, bootstrap, triggerFlagChange } = setup({
        isEnabled: false,
      });
      await bootstrap();
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();

      config.isEnabled = true;
      await triggerFlagChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('bootstraps when an external sync() reports a client gate reopened', async () => {
      const { config, controller, mocks, bootstrap } = setup({
        isEnabled: false,
      });
      await bootstrap();
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();

      config.isEnabled = true;
      controller.sync();
      await flushPromises();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('does not bootstrap while ineligible, then bootstraps once eligible', async () => {
      const { config, mocks, bootstrap, triggerFlagChange } = setup({
        isEligible: false,
      });
      await bootstrap();

      expect(mocks.ensureChainConfigured).not.toHaveBeenCalled();
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();

      config.isEligible = true;
      await triggerFlagChange();

      expect(mocks.ensureChainConfigured).toHaveBeenCalledTimes(1);
      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('skips the CHOMP call when the wallet locks while the chain is being configured', async () => {
      let resolveEnsure: (value?: unknown) => void = () => undefined;
      const { config, mocks, bootstrap, triggerKeyringChange } = setup();
      mocks.ensureChainConfigured
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveEnsure = resolve;
            }),
        )
        .mockResolvedValue(undefined);

      await bootstrap();
      expect(mocks.ensureChainConfigured).toHaveBeenCalledTimes(1);

      config.isUnlocked = false;
      resolveEnsure();
      await flushPromises();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();

      config.isUnlocked = true;
      await triggerKeyringChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('skips the CHOMP call when isEnabled flips off while the chain is being configured', async () => {
      let resolveEnsure: (value?: unknown) => void = () => undefined;
      const { config, mocks, bootstrap, triggerFlagChange } = setup();
      mocks.ensureChainConfigured
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveEnsure = resolve;
            }),
        )
        .mockResolvedValue(undefined);

      await bootstrap();

      config.isEnabled = false;
      resolveEnsure();
      await flushPromises();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();

      config.isEnabled = true;
      await triggerFlagChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('reports a missing vault config through onBootstrapError only once', async () => {
      const { mocks, bootstrap, triggerFlagChange } = setup({
        vaultConfig: null,
      });
      await bootstrap();
      await triggerFlagChange();
      await triggerFlagChange();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
      expect(mocks.onBootstrapError).toHaveBeenCalledTimes(1);
      expect(mocks.onBootstrapError).toHaveBeenCalledWith(
        expect.any(MissingMoneyAccountVaultConfigError),
      );
    });

    it('reports a malformed vault config the same as a missing one', async () => {
      const { mocks, bootstrap } = setup({
        vaultConfig: { ...VAULT_CONFIG, chainId: 'not-hex' },
      });
      await bootstrap();

      expect(mocks.onBootstrapError).toHaveBeenCalledWith(
        expect.any(MissingMoneyAccountVaultConfigError),
      );
    });

    it('does not re-bootstrap when triggers repeat with the same config', async () => {
      const { mocks, bootstrap, triggerFlagChange, triggerKeyringChange } =
        setup();
      await bootstrap();
      await triggerFlagChange();
      await triggerKeyringChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
    });

    it('re-bootstraps when the vault config changes', async () => {
      const { config, mocks, bootstrap, triggerFlagChange } = setup();
      await bootstrap();

      config.vaultConfig = CHANGED_VAULT_CONFIG;
      await triggerFlagChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(2);
    });

    it('serializes a config-change bootstrap after the in-flight one', async () => {
      let resolveFirst: (value?: unknown) => void = () => undefined;
      const { config, mocks, bootstrap, triggerFlagChange } = setup();
      mocks.getServiceDetails
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockResolvedValue(MOCK_SERVICE_DETAILS_RESPONSE);

      await bootstrap();
      config.vaultConfig = CHANGED_VAULT_CONFIG;
      await triggerFlagChange();
      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);

      resolveFirst(MOCK_SERVICE_DETAILS_RESPONSE);
      await flushPromises();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(2);
    });

    it('keeps a newer scheduled config when the superseded bootstrap fails', async () => {
      let rejectFirst: (error: Error) => void = () => undefined;
      const { config, mocks, bootstrap, triggerFlagChange } = setup();
      mocks.getServiceDetails
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirst = reject;
            }),
        )
        .mockResolvedValue(MOCK_SERVICE_DETAILS_RESPONSE);

      await bootstrap();
      config.vaultConfig = CHANGED_VAULT_CONFIG;
      await triggerFlagChange();

      rejectFirst(new Error('CHOMP outage'));
      await flushPromises();
      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(2);

      // The failure of the superseded run must not forget the newer config:
      // a repeat trigger with the same config schedules nothing new.
      await triggerFlagChange();
      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(2);
    });

    it('retries a failed bootstrap on the next trigger and reports the failure', async () => {
      const { mocks, bootstrap, triggerKeyringChange } = setup();
      const failure = new Error('CHOMP outage');
      mocks.getServiceDetails
        .mockRejectedValueOnce(failure)
        .mockResolvedValue(MOCK_SERVICE_DETAILS_RESPONSE);

      await bootstrap();
      await triggerKeyringChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(2);
      expect(mocks.onBootstrapError).toHaveBeenCalledWith(failure);
    });

    it('reports a bootstrap failure from the chain configuration hook', async () => {
      const { mocks, bootstrap } = setup();
      const failure = new Error('addNetwork failed');
      mocks.ensureChainConfigured.mockRejectedValueOnce(failure);

      await bootstrap();

      expect(mocks.onBootstrapError).toHaveBeenCalledWith(failure);
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('bootstraps with only the required isEnabled hook, defaulting the others', async () => {
      const { controller, mocks, bootstrap } = setup({
        withOptionalHooks: false,
      });

      await bootstrap();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);
      expect(
        await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).toBeUndefined();
    });

    it('swallows a bootstrap failure when no onBootstrapError hook is given', async () => {
      const { controller, mocks, bootstrap } = setup({
        withOptionalHooks: false,
      });
      mocks.getServiceDetails.mockRejectedValueOnce(new Error('CHOMP outage'));

      await bootstrap();

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('MoneyAccountUpgradeController is not bootstrapped');
    });

    it('swallows a missing vault config when no onBootstrapError hook is given', async () => {
      const { mocks, bootstrap } = setup({
        withOptionalHooks: false,
        vaultConfig: null,
      });

      await bootstrap();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('survives a throwing messenger call during sync', async () => {
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
      const failure = new Error('handler not registered');
      mocks.isEnabled.mockImplementationOnce(() => {
        throw failure;
      });

      expect(() => controller.sync()).not.toThrow();
      expect(mocks.onBootstrapError).toHaveBeenCalledWith(failure);
    });
  });

  describe('bootstrap failures', () => {
    it('reports when the chain has no Delegation Framework deployment', async () => {
      const { mocks, bootstrap } = setup({
        vaultConfig: { ...VAULT_CONFIG, chainId: UNSUPPORTED_CHAIN_ID },
      });

      await bootstrap();

      expect(mocks.onBootstrapError).toHaveBeenCalledWith(
        new Error(
          `Delegation Framework 1.3.0 is not deployed on chain ${UNSUPPORTED_CHAIN_ID}`,
        ),
      );
      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });

    it('reports when the chain is not found in service details', async () => {
      const { mocks, bootstrap } = setup();
      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {},
      });

      await bootstrap();

      expect(mocks.onBootstrapError).toHaveBeenCalledWith(
        new Error(`Chain ${MOCK_CHAIN_ID} not found in service details response`),
      );
    });

    it('reports when vedaProtocol is not found', async () => {
      const { mocks, bootstrap } = setup();
      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {
          [MOCK_CHAIN_ID]: {
            autoDepositDelegate: MOCK_DELEGATE_ADDRESS,
            protocol: {},
          },
        },
      });

      await bootstrap();

      expect(mocks.onBootstrapError).toHaveBeenCalledWith(
        new Error(
          `vedaProtocol not found for chain ${MOCK_CHAIN_ID} in service details response`,
        ),
      );
    });

    it('reports when supportedTokens is empty', async () => {
      const { mocks, bootstrap } = setup();
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

      await bootstrap();

      expect(mocks.onBootstrapError).toHaveBeenCalledWith(
        new Error(
          `No supported tokens found for vedaProtocol on chain ${MOCK_CHAIN_ID}`,
        ),
      );
    });
  });

  describe('upgradeAccount', () => {
    it('throws when no bootstrap has been scheduled', async () => {
      const { controller } = setup({ isEnabled: false });
      controller.init();

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('MoneyAccountUpgradeController is not bootstrapped');
    });

    it('throws when the bootstrap failed', async () => {
      const { controller, mocks, bootstrap } = setup();
      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {},
      });
      await bootstrap();

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('MoneyAccountUpgradeController is not bootstrapped');
    });

    it('waits for an in-flight bootstrap instead of throwing', async () => {
      let resolveServiceDetails: (value?: unknown) => void = () => undefined;
      const { controller, mocks } = setup();
      mocks.getServiceDetails.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveServiceDetails = resolve;
          }),
      );
      controller.init();
      await flushPromises();

      const upgrade = controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);
      resolveServiceDetails(MOCK_SERVICE_DETAILS_RESPONSE);

      expect(await upgrade).toBeUndefined();
      expect(mocks.signPersonalMessage).toHaveBeenCalled();
    });

    it('throws after the isEnabled hook flips off and a sync disarms the controller', async () => {
      const { controller, config, mocks, bootstrap, triggerFlagChange } =
        setup();
      await bootstrap();
      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(1);

      config.isEnabled = false;
      await triggerFlagChange();

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('MoneyAccountUpgradeController is not bootstrapped');
    });

    it('re-bootstraps from scratch after being disarmed', async () => {
      const { config, mocks, bootstrap, triggerFlagChange } = setup();
      await bootstrap();

      config.isEnabled = false;
      await triggerFlagChange();
      config.isEnabled = true;
      await triggerFlagChange();

      expect(mocks.getServiceDetails).toHaveBeenCalledTimes(2);
    });

    it('runs each step against the deployment-derived contract addresses', async () => {
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();

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

    it('uses the vault config boring vault as the withdrawal-side delegation token', async () => {
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();

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

    it('is callable via the messenger', async () => {
      const { rootMessenger, bootstrap } = setup();
      await bootstrap();

      expect(
        await rootMessenger.call(
          'MoneyAccountUpgradeController:upgradeAccount',
          MOCK_ACCOUNT_ADDRESS,
        ),
      ).toBeUndefined();
    });

    it('propagates errors thrown by a step', async () => {
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
      mocks.signPersonalMessage.mockRejectedValue(new Error('signing failed'));

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('signing failed');
    });

    it('wraps a step failure in a MoneyAccountUpgradeStepError that records the step and cause', async () => {
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
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
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
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
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
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
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
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
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
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
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
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
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);
      clearMockCalls(mocks);

      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
      expect(mocks.providerRequest).not.toHaveBeenCalled();
      expect(mocks.listDelegations).not.toHaveBeenCalled();
      expect(mocks.getIntentsByAddress).not.toHaveBeenCalled();
    });

    it('treats recorded upgrades case-insensitively', async () => {
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);
      clearMockCalls(mocks);

      await controller.upgradeAccount(
        MOCK_ACCOUNT_ADDRESS.replace('0xabc', '0xABC') as Hex,
      );

      expect(mocks.signPersonalMessage).not.toHaveBeenCalled();
    });

    it('skips the steps when constructed with state from a previous successful upgrade', async () => {
      const first = setup();
      await first.bootstrap();
      await first.controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      const second = setup({ state: first.controller.state });
      await second.bootstrap();
      await second.controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(second.mocks.signPersonalMessage).not.toHaveBeenCalled();
      expect(second.mocks.providerRequest).not.toHaveBeenCalled();
    });

    it('does not record the account when a step fails, and re-runs on the next call', async () => {
      const { controller, mocks, bootstrap } = setup();
      await bootstrap();
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
      const { controller, config, mocks, bootstrap, triggerFlagChange } =
        setup();
      await bootstrap();
      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);
      const { configFingerprint: originalFingerprint } =
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS];

      // CHOMP rotates its delegate address, published alongside a vault
      // config refresh — the recorded upgrade no longer reflects the active
      // config.
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
      config.vaultConfig = CHANGED_VAULT_CONFIG;
      await triggerFlagChange();
      clearMockCalls(mocks);

      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(mocks.signPersonalMessage).toHaveBeenCalled();
      expect(
        controller.state.upgradedAccounts[MOCK_ACCOUNT_ADDRESS]
          .configFingerprint,
      ).not.toBe(originalFingerprint);
    });
  });
});
