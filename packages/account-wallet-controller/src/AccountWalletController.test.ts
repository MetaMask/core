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
  AccountWalletController,
  AccountWalletCategory,
  getDefaultAccountWalletControllerState,
  type AccountWalletControllerMessenger,
  type AccountWalletControllerActions,
  type AccountWalletControllerEvents,
  type AccountWalletControllerState,
  type AllowedActions,
  type AllowedEvents,
  type AccountGroupMetadata,
  toDefaultAccountGroupId,
  DEFAULT_ACCOUNT_GROUP_NAME,
} from './AccountWalletController';
import { generateAccountWalletName } from './utils';

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const MOCK_HD_ACCOUNT_1: InternalAccount = {
  id: 'mock-id-1',
  address: '0x123',
  options: { entropySource: 'mock-keyring-id-1' },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Account 1',
    keyring: { type: KeyringTypes.hd },
    importTime: 0,
    lastSelected: 0,
    nameLastUpdatedAt: 0,
  },
};

const MOCK_HD_ACCOUNT_2: InternalAccount = {
  id: 'mock-id-2',
  address: '0x456',
  options: { entropySource: 'mock-keyring-id-2' },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Account 2',
    keyring: { type: KeyringTypes.hd },
    importTime: 0,
    lastSelected: 0,
    nameLastUpdatedAt: 0,
  },
};

const MOCK_SNAP_ACCOUNT_1: InternalAccount = {
  id: 'mock-snap-id-1',
  address: 'aabbccdd',
  options: { entropySource: 'mock-keyring-id-2' }, // Note: shares entropy with MOCK_HD_ACCOUNT_2
  methods: [...ETH_EOA_METHODS],
  type: SolAccountType.DataAccount,
  scopes: [SolScope.Mainnet],
  metadata: {
    name: 'Snap Acc 1',
    keyring: { type: KeyringTypes.snap },
    snap: { id: 'mock-snap-id-1', enabled: true, name: 'Test Snap' },
    importTime: 0,
    lastSelected: 0,
  },
};

const MOCK_SNAP_ACCOUNT_2: InternalAccount = {
  id: 'mock-snap-id-2',
  address: '0x789',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Snap Acc 2',
    keyring: { type: KeyringTypes.snap },
    snap: { id: 'mock-snap-id-2', enabled: true, name: 'Another Snap' },
    importTime: 0,
    lastSelected: 0,
  },
};

const MOCK_HARDWARE_ACCOUNT_1: InternalAccount = {
  id: 'mock-hardware-id-1',
  address: '0xABC',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Hardware Acc 1',
    keyring: { type: KeyringTypes.ledger },
    importTime: 0,
    lastSelected: 0,
  },
};

/**
 * Creates a new root messenger instance for testing.
 *
 * @returns A new Messenger instance.
 */
function getRootMessenger() {
  return new Messenger<
    AccountWalletControllerActions | AllowedActions,
    AccountWalletControllerEvents | AllowedEvents
  >();
}

/**
 * Retrieves a restricted messenger for the AccountWalletController.
 *
 * @param messenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the AccountWalletController.
 */
function getAccountWalletControllerMessenger(
  messenger = getRootMessenger(),
): AccountWalletControllerMessenger {
  return messenger.getRestricted({
    name: 'AccountWalletController',
    allowedEvents: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
    ],
    allowedActions: ['AccountsController:listMultichainAccounts'],
  });
}

/**
 * Sets up the AccountWalletController for testing.
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
  state?: DeepPartial<AccountWalletControllerState>; // Use DeepPartial for flexibility
  messenger?: Messenger<
    AccountWalletControllerActions | AllowedActions,
    AccountWalletControllerEvents | AllowedEvents
  >;
}): {
  controller: AccountWalletController;
  messenger: Messenger<
    AccountWalletControllerActions | AllowedActions,
    AccountWalletControllerEvents | AllowedEvents
  >;
} {
  const controller = new AccountWalletController({
    messenger: getAccountWalletControllerMessenger(messenger),
    state: {
      ...getDefaultAccountWalletControllerState(),
      ...(state as AccountWalletControllerState),
    }, // Cast state after merging
  });
  return { controller, messenger };
}

describe('AccountWalletController', () => {
  describe('updateAccountWallets', () => {
    it('groups accounts by entropy source, then snapId, then wallet type', async () => {
      const { controller, messenger } = setup({});
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [
          MOCK_HD_ACCOUNT_1,
          MOCK_HD_ACCOUNT_2,
          MOCK_SNAP_ACCOUNT_1, // Belongs to MOCK_HD_ACCOUNT_2's wallet due to shared entropySource
          MOCK_SNAP_ACCOUNT_2, // Has its own Snap wallet
          MOCK_HARDWARE_ACCOUNT_1, // Has its own Keyring wallet
        ],
      );

      await controller.updateAccountWallets();

      const expectedWalletId1 = `${AccountWalletCategory.Entropy}:mock-keyring-id-1`;
      const expectedWalletId1Group = toDefaultAccountGroupId(expectedWalletId1);
      const expectedWalletId2 = `${AccountWalletCategory.Entropy}:mock-keyring-id-2`;
      const expectedWalletId2Group = toDefaultAccountGroupId(expectedWalletId2);
      const expectedSnapWalletId = `${AccountWalletCategory.Snap}:mock-snap-id-2`;
      const expectedSnapWalletIdGroup =
        toDefaultAccountGroupId(expectedSnapWalletId);
      const expectedKeyringWalletId = `${AccountWalletCategory.Keyring}:${KeyringTypes.ledger}`;
      const expectedKeyringWalletIdGroup = toDefaultAccountGroupId(
        expectedKeyringWalletId,
      );

      const mockDefaultGroupMetadata: AccountGroupMetadata = {
        name: DEFAULT_ACCOUNT_GROUP_NAME,
      };

      expect(controller.state.accountWallets).toStrictEqual({
        [expectedWalletId1]: {
          id: expectedWalletId1,
          groups: {
            [expectedWalletId1Group]: {
              id: expectedWalletId1Group,
              accounts: [MOCK_HD_ACCOUNT_1.id],
              metadata: mockDefaultGroupMetadata,
            },
          },
          metadata: { name: 'Wallet 1' },
        },
        [expectedWalletId2]: {
          id: expectedWalletId2,
          groups: {
            [expectedWalletId2Group]: {
              id: expectedWalletId2Group,
              accounts: [MOCK_HD_ACCOUNT_2.id, MOCK_SNAP_ACCOUNT_1.id],
              metadata: mockDefaultGroupMetadata,
            },
          },
          metadata: { name: 'Wallet 2' },
        },
        [expectedSnapWalletId]: {
          id: expectedSnapWalletId,
          groups: {
            [expectedSnapWalletIdGroup]: {
              id: expectedSnapWalletIdGroup,
              accounts: [MOCK_SNAP_ACCOUNT_2.id],
              metadata: mockDefaultGroupMetadata,
            },
          },
          metadata: { name: generateAccountWalletName(expectedSnapWalletId) },
        },
        [expectedKeyringWalletId]: {
          id: expectedKeyringWalletId,
          groups: {
            [expectedKeyringWalletIdGroup]: {
              id: expectedKeyringWalletIdGroup,
              accounts: [MOCK_HARDWARE_ACCOUNT_1.id],
              metadata: mockDefaultGroupMetadata,
            },
          },
          metadata: {
            name: generateAccountWalletName(expectedKeyringWalletId),
          },
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
        id: 'mock-no-entropy-id',
        options: {},
      };
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [mockHdAccountWithoutEntropy],
      );

      await controller.updateAccountWallets();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "! Found an HD account with no entropy source: account won't be associated to its wallet",
      );
      const expectedKeyringWalletId = `${AccountWalletCategory.Keyring}:${KeyringTypes.hd}`;
      const expectedGroupId = toDefaultAccountGroupId(expectedKeyringWalletId);
      expect(
        controller.state.accountWallets[expectedKeyringWalletId]?.groups[
          expectedGroupId
        ]?.accounts,
      ).toContain(mockHdAccountWithoutEntropy.id);
      consoleWarnSpy.mockRestore();
    });
  });
});
