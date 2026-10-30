import type {
  DerivedIdentitiesResponse,
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type {
  GetMoneyAccountSelector,
  MoneyAccount,
} from '@metamask/money-account-controller';
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerState,
} from '@metamask/remote-feature-flag-controller';
import type { Hex } from '@metamask/utils';
import { vi } from 'vitest';
import type { Mock } from 'vitest';

import type { MoneyAccountLifecycle } from '../src/get-money-account-lifecycle.js';
import { MoneyAccountLifecycleController } from '../src/money-account-lifecycle-controller.js';
import type { MoneyAccountLifecycleControllerMessenger } from '../src/money-account-lifecycle-controller.js';
import type { RegistrationStatus } from '../src/money-account-upgrade-controller-registration-status.js';

const SFA_ACCOUNT_ID = 'sfa-account-id';
export const MPC_ACCOUNT_ID = 'mpc-account-id';
export const MONEY_ACCOUNT_ADDRESS =
  '0x00000000000000000000000000000000000000Aa';

export const MONEY_ACCOUNT_KEY = MONEY_ACCOUNT_ADDRESS.toLowerCase();

export const SUCCESSOR_ADDRESS = '0x00000000000000000000000000000000000000Bb';

export const SFA_IDENTITY: DerivedIdentity = {
  currentAddress: MONEY_ACCOUNT_ADDRESS,
  previousAddresses: [],
  status: 'DONE',
  migration: null,
};

export const MFA_IDENTITY: DerivedIdentity = {
  currentAddress: SUCCESSOR_ADDRESS,
  previousAddresses: [MONEY_ACCOUNT_ADDRESS],
  status: 'DONE',
  migration: null,
};

export const MIGRATING_IDENTITY: DerivedIdentity & {
  migration: DerivedIdentityMigration;
} = {
  currentAddress: MONEY_ACCOUNT_ADDRESS,
  previousAddresses: [],
  status: 'MIGRATING',
  migration: {
    from: MONEY_ACCOUNT_ADDRESS,
    to: SUCCESSOR_ADDRESS,
    steps: [
      { step: 'SUCCESSOR_DEPOSIT_INTENT', completed: false },
      { step: 'ROOT_DELEGATION', completed: false },
    ],
    transfer: null,
    premiumTransfer: null,
  },
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MoneyAccountLifecycleControllerMessenger>,
  MessengerEvents<MoneyAccountLifecycleControllerMessenger>
>;

type Gates = {
  isEnabled: boolean;
  isUnlocked: boolean;
  hasHdKeyring: boolean;
  remoteFeatureFlags: FeatureFlags;
  moneyAccountAddress: string | undefined;
  mpcAccountAddress: string | undefined;
  isMpcAccountDefault: boolean;
};

type Mocks = {
  getDerivedIdentities: Mock<() => Promise<DerivedIdentitiesResponse>>;
  getMoneyAccount: Mock<
    (selector?: GetMoneyAccountSelector) => MoneyAccount | undefined
  >;
  getRegistrationStatus: Mock<(address: string) => Promise<RegistrationStatus>>;
  upgradeAccount: Mock<(address: Hex) => Promise<void>>;
  setDefaultMoneyAccount: Mock<(id: string) => void>;
  isEnabled: Mock<(remoteFeatureFlags: FeatureFlags) => boolean>;
  captureException: Mock<(error: Error) => void>;
};

type WithControllerCallback<ReturnValue> = (payload: {
  controller: MoneyAccountLifecycleController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountLifecycleControllerMessenger;
  mocks: Mocks;
  gates: Gates;
  triggerKeyringChange: () => Promise<void>;
  triggerFlagChange: () => Promise<void>;
  triggerMoneyAccountChange: () => Promise<void>;
  init: () => Promise<void>;
  refetch: () => Promise<void>;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<
    ConstructorParameters<typeof MoneyAccountLifecycleController>[0]
  >;
} & Partial<Gates>;

export function getLifecycle(
  controller: MoneyAccountLifecycleController,
): MoneyAccountLifecycle | undefined {
  return controller.state.moneyAccounts[MONEY_ACCOUNT_KEY];
}

export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function buildKeyringControllerState(gates: Gates): KeyringControllerState {
  return {
    isUnlocked: gates.isUnlocked,
    keyrings:
      gates.isUnlocked && gates.hasHdKeyring
        ? [{ type: KeyringTypes.hd, accounts: [], metadata: { id: 'hd' } }]
        : [],
  } as unknown as KeyringControllerState;
}

function buildRemoteFeatureFlagControllerState(
  gates: Gates,
): RemoteFeatureFlagControllerState {
  return {
    remoteFeatureFlags: gates.remoteFeatureFlags,
    cacheTimestamp: 0,
  };
}

function getRootMessenger(
  captureException: Mocks['captureException'],
): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException,
  });
}

function getMessenger(
  rootMessenger: RootMessenger,
): MoneyAccountLifecycleControllerMessenger {
  const messenger: MoneyAccountLifecycleControllerMessenger = new Messenger({
    namespace: 'MoneyAccountLifecycleController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'ChompApiService:getDerivedIdentities',
      'KeyringController:getState',
      'MoneyAccountController:getMoneyAccount',
      'MoneyAccountController:setDefaultMoneyAccount',
      'MoneyAccountUpgradeController:getRegistrationStatus',
      'MoneyAccountUpgradeController:upgradeAccount',
      'RemoteFeatureFlagController:getState',
    ],
    events: [
      'KeyringController:stateChange',
      'MoneyAccountController:stateChange',
      'RemoteFeatureFlagController:stateChange',
    ],
    messenger,
  });
  return messenger;
}

export async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [
    {
      options = {},
      isEnabled = true,
      isUnlocked = true,
      hasHdKeyring = true,
      remoteFeatureFlags = {},
      ...gateOverrides
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];
  const gates: Gates = {
    isEnabled,
    isUnlocked,
    hasHdKeyring,
    remoteFeatureFlags,
    moneyAccountAddress:
      'moneyAccountAddress' in gateOverrides
        ? gateOverrides.moneyAccountAddress
        : MONEY_ACCOUNT_ADDRESS,
    mpcAccountAddress: gateOverrides.mpcAccountAddress,
    isMpcAccountDefault: gateOverrides.isMpcAccountDefault ?? false,
  };

  const mocks: Mocks = {
    getDerivedIdentities: vi
      .fn<() => Promise<DerivedIdentitiesResponse>>()
      .mockResolvedValue({ identities: [SFA_IDENTITY] }),
    getMoneyAccount: vi
      .fn<(selector?: GetMoneyAccountSelector) => MoneyAccount | undefined>()
      .mockImplementation((selector) => {
        const sfaAccount =
          gates.moneyAccountAddress === undefined
            ? undefined
            : ({
                id: SFA_ACCOUNT_ID,
                address: gates.moneyAccountAddress,
              } as MoneyAccount);
        const mpcAccount =
          gates.mpcAccountAddress === undefined
            ? undefined
            : ({
                id: MPC_ACCOUNT_ID,
                address: gates.mpcAccountAddress,
              } as MoneyAccount);

        if (selector === undefined) {
          return gates.isMpcAccountDefault ? mpcAccount : sfaAccount;
        }
        return 'type' in selector && selector.type === 'mpc'
          ? mpcAccount
          : sfaAccount;
      }),
    getRegistrationStatus: vi
      .fn<(address: string) => Promise<RegistrationStatus>>()
      .mockResolvedValue({ isRegistered: true }),
    upgradeAccount: vi
      .fn<(address: Hex) => Promise<void>>()
      .mockResolvedValue(undefined),
    setDefaultMoneyAccount: vi
      .fn<(id: string) => void>()
      .mockImplementation(() => {
        gates.isMpcAccountDefault = true;
      }),
    isEnabled: vi
      .fn<(remoteFeatureFlags: FeatureFlags) => boolean>()
      .mockImplementation(() => gates.isEnabled),
    captureException: vi.fn<(error: Error) => void>(),
  };

  const rootMessenger = getRootMessenger(mocks.captureException);
  rootMessenger.registerActionHandler(
    'ChompApiService:getDerivedIdentities',
    mocks.getDerivedIdentities,
  );
  rootMessenger.registerActionHandler('KeyringController:getState', () =>
    buildKeyringControllerState(gates),
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountController:getMoneyAccount',
    mocks.getMoneyAccount,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountController:setDefaultMoneyAccount',
    mocks.setDefaultMoneyAccount,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountUpgradeController:getRegistrationStatus',
    mocks.getRegistrationStatus,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountUpgradeController:upgradeAccount',
    mocks.upgradeAccount,
  );
  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => buildRemoteFeatureFlagControllerState(gates),
  );

  const triggerKeyringChange = async (): Promise<void> => {
    rootMessenger.publish(
      'KeyringController:stateChange',
      buildKeyringControllerState(gates),
      [],
    );
    await flushPromises();
  };

  const triggerFlagChange = async (): Promise<void> => {
    rootMessenger.publish(
      'RemoteFeatureFlagController:stateChange',
      buildRemoteFeatureFlagControllerState(gates),
      [],
    );
    await flushPromises();
  };

  const triggerMoneyAccountChange = async (): Promise<void> => {
    rootMessenger.publish(
      'MoneyAccountController:stateChange',
      { moneyAccounts: {}, defaultMoneyAccountId: null },
      [],
    );
    await flushPromises();
  };

  const messenger = getMessenger(rootMessenger);
  const controller = new MoneyAccountLifecycleController({
    messenger,
    hooks: { isEnabled: mocks.isEnabled },
    ...options,
  });

  const init = async (): Promise<void> => {
    controller.init();
    await flushPromises();
  };

  let refetchCount = 0;
  const refetch = async (): Promise<void> => {
    refetchCount += 1;
    gates.remoteFeatureFlags = { refetchCount };
    await triggerFlagChange();
  };

  return await testFunction({
    controller,
    rootMessenger,
    messenger,
    mocks,
    gates,
    triggerKeyringChange,
    triggerFlagChange,
    triggerMoneyAccountChange,
    init,
    refetch,
  });
}
