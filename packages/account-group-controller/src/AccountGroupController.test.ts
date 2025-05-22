import { Messenger } from '@metamask/base-controller';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  SolAccountType,
  SolScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  AccountGroupController,
  DEFAULT_SUB_GROUP,
  getDefaultAccountGroupControllerState,
  type AccountGroupControllerActions,
  type AccountGroupControllerEvents,
  type AccountGroupControllerState,
  type AllowedActions,
  type AllowedEvents,
} from './AccountGroupController';
import type { AccountGroupControllerMessenger } from './AccountGroupController';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

/**
 *
 */
function getRootMessenger() {
  return new Messenger<
    AccountGroupControllerActions | AllowedActions,
    AccountGroupControllerEvents | AllowedEvents
  >();
}

/**
 *
 * @param messenger
 */
function getAccountGroupControllerMessenger(
  messenger = getRootMessenger(),
): AccountGroupControllerMessenger {
  return messenger.getRestricted({
    name: 'AccountGroupController',
    allowedEvents: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
    ],
    allowedActions: ['AccountsController:listMultichainAccounts'],
  });
}

/**
 *
 * @param options0
 * @param options0.initialState
 * @param options0.messenger
 * @param options0.state
 */
function setup({
  state = {},
  messenger = getRootMessenger(),
}: {
  state?: Partial<AccountGroupControllerState>;
  messenger?: Messenger<
    AccountGroupControllerActions | AllowedActions,
    AccountGroupControllerEvents | AllowedEvents
  >;
}): {
  controller: AccountGroupController;
  messenger: Messenger<
    AccountGroupControllerActions | AllowedActions,
    AccountGroupControllerEvents | AllowedEvents
  >;
} {
  const controller = new AccountGroupController({
    messenger: getAccountGroupControllerMessenger(messenger),
    state: { ...getDefaultAccountGroupControllerState(), ...state },
  });

  return { controller, messenger };
}

const MOCK_HD_ACCOUNT_1: InternalAccount = {
  id: 'mock-id-1',
  address: '0x123',
  options: {
    entropySource: 'mock-keyring-id-1',
  },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Account 1',
    keyring: { type: KeyringTypes.hd },
    importTime: 1691565967600,
    lastSelected: 1691565967656,
    nameLastUpdatedAt: 1691565967656,
  },
};

const MOCK_HD_ACCOUNT_2: InternalAccount = {
  id: 'mock-id-2',
  address: '0x456',
  options: {
    entropySource: 'mock-keyring-id-2',
  },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Account 1',
    keyring: { type: KeyringTypes.hd },
    importTime: 1691565967600,
    lastSelected: 1691565967656,
    nameLastUpdatedAt: 1691565967656,
  },
};

const MOCK_SNAP_ACCOUNT_1: InternalAccount = {
  id: 'mock-snap-id-1',
  address: 'aabbccdd',
  options: {
    entropySource: 'mock-keyring-id-2',
  },
  methods: [...ETH_EOA_METHODS],
  type: SolAccountType.DataAccount,
  scopes: [SolScope.Mainnet, SolScope.Devnet, SolScope.Testnet],
  metadata: {
    name: '',
    keyring: { type: KeyringTypes.snap },
    snap: {
      enabled: true,
      id: 'mock-snap-id-1',
      name: 'snap-name-1',
    },
    importTime: 1691565967600,
    lastSelected: 1955565967656,
  },
};

const MOCK_SNAP_ACCOUNT_2: InternalAccount = {
  id: 'mock-snap-id-2',
  address: '0x789',
  options: {
    // Not an Snap HD account, so no `entropySource`.
  },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: '',
    keyring: { type: KeyringTypes.snap },
    snap: {
      enabled: true,
      id: 'mock-snap-id-2',
      name: 'snap-name-2',
    },
    importTime: 1691565967600,
    lastSelected: 1955565967656,
  },
};

describe('AccountGroupController', () => {
  it('group accounts according to the rules', async () => {
    const { controller, messenger } = setup({});

    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      () => {
        return [
          MOCK_HD_ACCOUNT_1,
          MOCK_HD_ACCOUNT_2,
          MOCK_SNAP_ACCOUNT_1,
          MOCK_SNAP_ACCOUNT_2,
        ];
      },
    );

    await controller.init();

    expect(controller.state).toStrictEqual({
      accountGroups: {
        groups: {
          'mock-keyring-id-1': {
            [DEFAULT_SUB_GROUP]: [MOCK_HD_ACCOUNT_1.id],
          },
          'mock-keyring-id-2': {
            [DEFAULT_SUB_GROUP]: [MOCK_HD_ACCOUNT_2.id, MOCK_SNAP_ACCOUNT_1.id],
          },
          'mock-snap-id-2': {
            [DEFAULT_SUB_GROUP]: [MOCK_SNAP_ACCOUNT_2.id],
          },
        },
        metadata: {},
      },
    } as AccountGroupControllerState);
  });
});
