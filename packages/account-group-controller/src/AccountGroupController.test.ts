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
import type {
  AccountGroupControllerMessenger,
  AccountGroupId,
} from './AccountGroupController';

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
    it('should group accounts by entropy source, then snapId, then wallet type', async () => {
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

      expect(controller.state.accountGroups.groups).toStrictEqual({
        'mock-keyring-id-1': {
          [DEFAULT_SUB_GROUP]: [MOCK_HD_ACCOUNT_1.id],
        },
        'mock-keyring-id-2': {
          [DEFAULT_SUB_GROUP]: [MOCK_HD_ACCOUNT_2.id, MOCK_SNAP_ACCOUNT_1.id],
        },
        'mock-snap-id-2': {
          [DEFAULT_SUB_GROUP]: [MOCK_SNAP_ACCOUNT_2.id],
        },
        [KeyringTypes.ledger]: {
          [DEFAULT_SUB_GROUP]: [MOCK_HARDWARE_ACCOUNT_1.id],
        },
      });
    });

    it('should warn and fall back to wallet type grouping if an HD account is missing entropySource', async () => {
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const { controller, messenger } = setup({});

      const mockHdAccountWithoutEntropy: InternalAccount = {
        id: 'hd-account-no-entropy',
        address: '0xHDADD',
        metadata: {
          name: 'HD Account Without Entropy',
          keyring: {
            type: KeyringTypes.hd,
          },
          importTime: Date.now(),
          lastSelected: Date.now(),
        },
        methods: [...ETH_EOA_METHODS],
        options: {},
        type: EthAccountType.Eoa,
        scopes: [EthScope.Eoa],
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
        controller.state.accountGroups.groups[KeyringTypes.hd]?.[
          DEFAULT_SUB_GROUP
        ],
      ).toContain(mockHdAccountWithoutEntropy.id);

      expect(
        controller.state.accountGroups.groups[
          undefined as unknown as AccountGroupId
        ],
      ).toBeUndefined();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('listAccountGroups', () => {
    it('should return an empty array if no groups exist', async () => {
      const { controller } = setup({
        state: {
          accountGroups: { groups: {} },
          accountGroupsMetadata: {},
        },
      });

      const result = await controller.listAccountGroups();
      expect(result).toStrictEqual([]);
    });

    it('should correctly map group data and metadata to AccountGroup objects', async () => {
      const group1Id = 'group-id-1' as AccountGroupId;
      const group2Id = 'group-id-2' as AccountGroupId;

      const initialState: AccountGroupControllerState = {
        accountGroups: {
          groups: {
            [group1Id]: {
              [DEFAULT_SUB_GROUP]: ['account-1', 'account-2'],
            },
            [group2Id]: {
              'sub-group-x': ['account-3'],
            },
          },
        },
        accountGroupsMetadata: {
          [group1Id]: { name: 'Group 1 Name' },
          [group2Id]: { name: 'Group 2 Name' },
        },
      };

      const { controller } = setup({ state: initialState });
      const result = await controller.listAccountGroups();

      expect(result).toStrictEqual([
        {
          id: group1Id,
          name: 'Group 1 Name',
          subGroups: {
            [DEFAULT_SUB_GROUP]: ['account-1', 'account-2'],
          },
        },
        {
          id: group2Id,
          name: 'Group 2 Name',
          subGroups: {
            'sub-group-x': ['account-3'],
          },
        },
      ]);
    });

    it('should throw a TypeError if metadata is missing for a group', async () => {
      const groupIdWithMissingMetadata = 'group-missing-meta' as AccountGroupId;
      const initialState: Partial<AccountGroupControllerState> = {
        accountGroups: {
          groups: {
            [groupIdWithMissingMetadata]: {
              [DEFAULT_SUB_GROUP]: ['account-x'],
            },
          },
        },
        // Metadata for groupIdWithMissingMetadata is deliberately omitted
        accountGroupsMetadata: {},
      };

      const { controller } = setup({ state: initialState });

      // Current implementation will throw: Cannot read properties of undefined (reading 'name')
      // which is a TypeError.
      await expect(controller.listAccountGroups()).rejects.toThrow(TypeError);
    });
  });
});
