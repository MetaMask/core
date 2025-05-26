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
  AccountGroupCategory,
  DEFAULT_SUB_GROUP,
  getDefaultAccountGroupControllerState,
  type AccountGroupControllerMessenger,
  type AccountGroupId,
  type AccountGroupControllerActions,
  type AccountGroupControllerEvents,
  type AccountGroupControllerState,
  type AllowedActions,
  type AllowedEvents,
} from './AccountGroupController';
import { generateAccountGroupName } from './utils';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

/**
 * Creates a new root messenger instance for testing.
 *
 * @returns A new Messenger instance.
 */
function getRootMessenger() {
  return new Messenger<
    AccountGroupControllerActions | AllowedActions,
    AccountGroupControllerEvents | AllowedEvents
  >();
}

/**
 * Retrieves a restricted messenger for the AccountGroupController.
 *
 * @param messenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the AccountGroupController.
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
 * Sets up the AccountGroupController for testing.
 *
 * @param options - Configuration options for setup.
 * @param options.state - Partial initial state for the controller. Defaults to empty object.
 * @param options.messenger - An optional messenger instance to use. Defaults to a new Messenger.
 * @returns An object containing the controller instance and the messenger.
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

const MOCK_HARDWARE_ACCOUNT_1: InternalAccount = {
  id: 'mock-hardware-id-1',
  address: '0x123',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: '',
    keyring: { type: KeyringTypes.ledger },
    importTime: 1691565967600,
    lastSelected: 1955565967656,
  },
};

describe('AccountGroupController', () => {
  describe('updateAccountGroups', () => {
    it('groups accounts by entropy source, then snapId, then wallet type', async () => {
      const { controller, messenger } = setup({});

      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => {
          return [
            MOCK_HD_ACCOUNT_1,
            MOCK_HD_ACCOUNT_2,
            MOCK_SNAP_ACCOUNT_1,
            MOCK_SNAP_ACCOUNT_2,
            MOCK_HARDWARE_ACCOUNT_1,
          ];
        },
      );

      await controller.updateAccountGroups();

      const expectedGroupId1 = `${AccountGroupCategory.Entropy}:mock-keyring-id-1`;
      const expectedGroupId2 = `${AccountGroupCategory.Entropy}:mock-keyring-id-2`;
      const expectedSnapGroupId = `${AccountGroupCategory.Snap}:mock-snap-id-2`;
      const expectedKeyringGroupId = `${AccountGroupCategory.Keyring}:${KeyringTypes.ledger}`;

      expect(controller.state.accountGroups.groups).toStrictEqual({
        [expectedGroupId1]: {
          [DEFAULT_SUB_GROUP]: [MOCK_HD_ACCOUNT_1.id],
        },
        [expectedGroupId2]: {
          [DEFAULT_SUB_GROUP]: [MOCK_HD_ACCOUNT_2.id, MOCK_SNAP_ACCOUNT_1.id],
        },
        [expectedSnapGroupId]: {
          [DEFAULT_SUB_GROUP]: [MOCK_SNAP_ACCOUNT_2.id],
        },
        [expectedKeyringGroupId]: {
          [DEFAULT_SUB_GROUP]: [MOCK_HARDWARE_ACCOUNT_1.id],
        },
      });

      expect(controller.state.accountGroupsMetadata).toStrictEqual({
        [expectedGroupId1]: { name: 'Wallet 1' },
        [expectedGroupId2]: { name: 'Wallet 2' },
        [expectedSnapGroupId]: {
          name: generateAccountGroupName(expectedSnapGroupId),
        },
        [expectedKeyringGroupId]: {
          name: generateAccountGroupName(expectedKeyringGroupId),
        },
      });
    });

    it('warns and fall back to wallet type grouping if an HD account is missing entropySource', async () => {
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const { controller, messenger } = setup({});

      const mockHdAccountWithoutEntropy: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          // No entropySource.
        },
      };
      const listAccountsMock = jest
        .fn()
        .mockReturnValue([mockHdAccountWithoutEntropy]);
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        listAccountsMock,
      );

      await controller.updateAccountGroups();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "! Found an HD account with no entropy source: account won't be associated to its wallet",
      );

      expect(
        controller.state.accountGroups.groups[
          `${AccountGroupCategory.Keyring}:${KeyringTypes.hd}`
        ]?.[DEFAULT_SUB_GROUP],
      ).toContain(mockHdAccountWithoutEntropy.id);

      expect(
        controller.state.accountGroups.groups[
          undefined as unknown as AccountGroupId
        ],
      ).toBeUndefined();

      consoleWarnSpy.mockRestore();
    });
  });
});
