import type {
  DerivedIdentitiesResponse,
  DerivedIdentity,
  DerivedIdentityMigration,
  FundsTransferStart,
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
  CreateMoneyAccountParams,
  GetMoneyAccountSelector,
  MoneyAccount,
} from '@metamask/money-account-controller';
import type { MoneyAccountRegistrationStatus } from '@metamask/money-account-upgrade-controller';
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerState,
} from '@metamask/remote-feature-flag-controller';
import type {
  PreparedSubscriptionDelegation,
  PrepareSubscriptionDelegationRequest,
  PricingResponse,
  Subscription,
  UpdatePaymentMethodCardResponse,
  UpdatePaymentMethodOpts,
} from '@metamask/subscription-controller';
import type { Hex } from '@metamask/utils';
import { vi } from 'vitest';
import type { Mock } from 'vitest';

import type { MoneyAccountLifecycle } from '../src/get-money-account-lifecycle.js';
import { MoneyAccountLifecycleController } from '../src/money-account-lifecycle-controller.js';
import type { MoneyAccountLifecycleControllerMessenger } from '../src/money-account-lifecycle-controller.js';

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

export const MFA_ACCOUNT_ADDRESS = '0x00000000000000000000000000000000000000Dd';

export const MFA_MONEY_ACCOUNT = {
  id: MPC_ACCOUNT_ID,
  address: MFA_ACCOUNT_ADDRESS,
} as MoneyAccount;

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

export const SUBSCRIPTION_DELEGATION_HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

export const MONEY_ACCOUNT_PLUS_SUBSCRIPTION: Subscription = {
  id: 'money-account-plus-subscription-id',
  products: [
    {
      name: 'money_account_plus',
      currency: 'usd',
      unitAmount: 999,
      unitDecimals: 2,
    },
  ],
  currentPeriodStart: '2026-11-01T00:00:00Z',
  currentPeriodEnd: '2026-12-01T00:00:00Z',
  status: 'active',
  interval: 'month',
  paymentMethod: {
    type: 'crypto',
    crypto: {
      payerAddress: MONEY_ACCOUNT_ADDRESS,
      chainId: '0x8f',
      tokenSymbol: 'mUSD',
    },
  },
  cancelType: 'allowed_at_period_end',
  isEligibleForSupport: true,
};

const MONEY_ACCOUNT_PLUS_PRICING: PricingResponse = {
  products: [
    {
      name: 'shield',
      prices: [
        {
          interval: 'month',
          unitAmount: 999,
          unitDecimals: 2,
          currency: 'usd',
          trialPeriodDays: 0,
          minBillingCycles: 1,
          minBillingCyclesForBalance: 1,
        },
      ],
    },
    {
      name: 'money_account_plus',
      prices: [
        {
          interval: 'year',
          unitAmount: 9999,
          unitDecimals: 2,
          currency: 'usd',
          trialPeriodDays: 0,
          minBillingCycles: 1,
          minBillingCyclesForBalance: 1,
        },
        {
          interval: 'month',
          unitAmount: 999,
          unitDecimals: 2,
          currency: 'usd',
          trialPeriodDays: 0,
          minBillingCycles: 12,
          minBillingCyclesForBalance: 3,
        },
      ],
    },
  ],
  paymentMethods: [],
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
  startFundsTransfer: Mock<(address: Hex) => Promise<FundsTransferStart>>;
  createMoneyAccount: Mock<
    (params: CreateMoneyAccountParams) => Promise<MoneyAccount>
  >;
  getMoneyAccount: Mock<
    (selector?: GetMoneyAccountSelector) => MoneyAccount | undefined
  >;
  getRegistrationStatus: Mock<
    (address: Hex) => Promise<MoneyAccountRegistrationStatus>
  >;
  upgradeAccount: Mock<(address: Hex) => Promise<void>>;
  upgradeSuccessorAccount: Mock<
    (address: Hex, predecessorAddress: Hex) => Promise<void>
  >;
  registerMigrationIntents: Mock<(predecessorAddress: Hex) => Promise<void>>;
  getSubscriptions: Mock<() => Promise<Subscription[]>>;
  getPricing: Mock<() => Promise<PricingResponse>>;
  prepareDelegation: Mock<
    (
      request: PrepareSubscriptionDelegationRequest,
    ) => Promise<PreparedSubscriptionDelegation>
  >;
  updatePaymentMethod: Mock<
    (
      opts: UpdatePaymentMethodOpts,
    ) => Promise<UpdatePaymentMethodCardResponse | Subscription[]>
  >;
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
      'ChompApiService:startFundsTransfer',
      'KeyringController:getState',
      'MoneyAccountController:createMoneyAccount',
      'MoneyAccountController:getMoneyAccount',
      'MoneyAccountController:setDefaultMoneyAccount',
      'MoneyAccountUpgradeController:getRegistrationStatus',
      'MoneyAccountUpgradeController:upgradeAccount',
      'MoneyAccountUpgradeController:upgradeSuccessorAccount',
      'MoneyAccountUpgradeController:registerMigrationIntents',
      'RemoteFeatureFlagController:getState',
      'SubscriptionController:getPricing',
      'SubscriptionController:getSubscriptions',
      'SubscriptionController:updatePaymentMethod',
      'SubscriptionDelegationService:prepareDelegation',
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
    startFundsTransfer: vi
      .fn<(address: Hex) => Promise<FundsTransferStart>>()
      .mockResolvedValue({
        from: MONEY_ACCOUNT_KEY as Hex,
        to: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
        transfer: { requestId: 'transfer-request-id', status: 'PENDING' },
        premiumTransfer: null,
      }),
    createMoneyAccount: vi
      .fn<(params: CreateMoneyAccountParams) => Promise<MoneyAccount>>()
      .mockResolvedValue(MFA_MONEY_ACCOUNT),
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
      .fn<(address: Hex) => Promise<MoneyAccountRegistrationStatus>>()
      .mockResolvedValue({ isRegistered: true }),
    upgradeAccount: vi
      .fn<(address: Hex) => Promise<void>>()
      .mockResolvedValue(undefined),
    upgradeSuccessorAccount: vi
      .fn<(address: Hex, predecessorAddress: Hex) => Promise<void>>()
      .mockResolvedValue(undefined),
    registerMigrationIntents: vi
      .fn<(predecessorAddress: Hex) => Promise<void>>()
      .mockResolvedValue(undefined),
    getSubscriptions: vi
      .fn<() => Promise<Subscription[]>>()
      .mockResolvedValue([]),
    getPricing: vi
      .fn<() => Promise<PricingResponse>>()
      .mockResolvedValue(MONEY_ACCOUNT_PLUS_PRICING),
    prepareDelegation: vi
      .fn<
        (
          request: PrepareSubscriptionDelegationRequest,
        ) => Promise<PreparedSubscriptionDelegation>
      >()
      .mockResolvedValue({
        delegationHash: SUBSCRIPTION_DELEGATION_HASH,
        disposition: 'created',
      }),
    updatePaymentMethod: vi
      .fn<
        (
          opts: UpdatePaymentMethodOpts,
        ) => Promise<UpdatePaymentMethodCardResponse | Subscription[]>
      >()
      .mockResolvedValue([]),
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
  rootMessenger.registerActionHandler(
    'ChompApiService:startFundsTransfer',
    mocks.startFundsTransfer,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountController:createMoneyAccount',
    mocks.createMoneyAccount,
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
    'MoneyAccountUpgradeController:upgradeSuccessorAccount',
    mocks.upgradeSuccessorAccount,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountUpgradeController:registerMigrationIntents',
    mocks.registerMigrationIntents,
  );
  rootMessenger.registerActionHandler(
    'SubscriptionController:getSubscriptions',
    mocks.getSubscriptions,
  );
  rootMessenger.registerActionHandler(
    'SubscriptionController:getPricing',
    mocks.getPricing,
  );
  rootMessenger.registerActionHandler(
    'SubscriptionDelegationService:prepareDelegation',
    mocks.prepareDelegation,
  );
  rootMessenger.registerActionHandler(
    'SubscriptionController:updatePaymentMethod',
    mocks.updatePaymentMethod,
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
