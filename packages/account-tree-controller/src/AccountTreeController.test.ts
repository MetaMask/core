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
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import {
  AccountTreeController,
  AccountWalletCategory,
  type AccountTreeControllerMessenger,
  type AccountTreeControllerActions,
  type AccountTreeControllerEvents,
  type AccountTreeControllerState,
  type AllowedActions,
  type AllowedEvents,
  type AccountGroupMetadata,
  toDefaultAccountGroupId,
  DEFAULT_ACCOUNT_GROUP_NAME,
  toAccountWalletId,
} from './AccountTreeController';
import { getAccountWalletNameFromKeyringType } from './names';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const MOCK_SNAP_1 = {
  id: 'local:mock-snap-id-1',
  name: 'Mock Snap 1',
  enabled: true,
  manifest: {
    proposedName: 'Mock Snap 1',
  },
};

const MOCK_SNAP_2 = {
  id: 'local:mock-snap-id-2',
  name: 'Mock Snap 2',
  enabled: true,
  manifest: {
    proposedName: 'Mock Snap 2',
  },
};

const MOCK_HD_KEYRING_1 = {
  type: KeyringTypes.hd,
  metadata: { id: 'mock-keyring-id-1', name: 'HD Keyring 1' },
  accounts: ['0x123'],
};

const MOCK_HD_KEYRING_2 = {
  type: KeyringTypes.hd,
  metadata: { id: 'mock-keyring-id-2', name: 'HD Keyring 1' },
  accounts: ['0x456'],
};

const MOCK_HD_ACCOUNT_1: InternalAccount = {
  id: 'mock-id-1',
  address: '0x123',
  options: { entropySource: MOCK_HD_KEYRING_1.metadata.id },
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
  options: { entropySource: MOCK_HD_KEYRING_2.metadata.id },
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
  options: { entropySource: MOCK_HD_KEYRING_2.metadata.id }, // Note: shares entropy with MOCK_HD_ACCOUNT_2
  methods: [...ETH_EOA_METHODS],
  type: SolAccountType.DataAccount,
  scopes: [SolScope.Mainnet],
  metadata: {
    name: 'Snap Acc 1',
    keyring: { type: KeyringTypes.snap },
    snap: MOCK_SNAP_1,
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
    snap: MOCK_SNAP_2,
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
    AccountTreeControllerActions | AllowedActions,
    AccountTreeControllerEvents | AllowedEvents
  >();
}

/**
 * Retrieves a restricted messenger for the AccountTreeController.
 *
 * @param messenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the AccountTreeController.
 */
function getAccountTreeControllerMessenger(
  messenger = getRootMessenger(),
): AccountTreeControllerMessenger {
  return messenger.getRestricted({
    name: 'AccountTreeController',
    allowedEvents: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
    ],
    allowedActions: [
      'AccountsController:listMultichainAccounts',
      'KeyringController:getState',
      'SnapController:get',
    ],
  });
}

/**
 * Sets up the AccountTreeController for testing.
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
  state?: Partial<AccountTreeControllerState>;
  messenger?: Messenger<
    AccountTreeControllerActions | AllowedActions,
    AccountTreeControllerEvents | AllowedEvents
  >;
} = {}): {
  controller: AccountTreeController;
  messenger: Messenger<
    AccountTreeControllerActions | AllowedActions,
    AccountTreeControllerEvents | AllowedEvents
  >;
} {
  const controller = new AccountTreeController({
    messenger: getAccountTreeControllerMessenger(messenger),
    state,
  });
  return { controller, messenger };
}

describe('AccountTreeController', () => {
  describe('init', () => {
    it('groups accounts by entropy source, then snapId, then wallet type', () => {
      const { controller, messenger } = setup();
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
      messenger.registerActionHandler('KeyringController:getState', () => ({
        isUnlocked: true,
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      }));
      messenger.registerActionHandler(
        'SnapController:get',
        () =>
          // TODO: Update this to avoid the unknown cast if possible.
          MOCK_SNAP_1 as unknown as ReturnType<
            SnapControllerGetSnap['handler']
          >,
      );

      controller.init();

      const expectedWalletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedWalletId1Group = toDefaultAccountGroupId(expectedWalletId1);
      const expectedWalletId2 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedWalletId2Group = toDefaultAccountGroupId(expectedWalletId2);
      const expectedSnapWalletId = toAccountWalletId(
        AccountWalletCategory.Snap,
        MOCK_SNAP_2.id,
      );
      const expectedSnapWalletIdGroup =
        toDefaultAccountGroupId(expectedSnapWalletId);
      const expectedKeyringWalletId = `${AccountWalletCategory.Keyring}:${KeyringTypes.ledger}`;
      const expectedKeyringWalletIdGroup = toDefaultAccountGroupId(
        expectedKeyringWalletId,
      );

      const mockDefaultGroupMetadata: AccountGroupMetadata = {
        name: DEFAULT_ACCOUNT_GROUP_NAME,
      };

      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
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
              metadata: { name: MOCK_SNAP_1.manifest.proposedName },
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
                name: getAccountWalletNameFromKeyringType(
                  MOCK_HARDWARE_ACCOUNT_1.metadata.keyring.type as KeyringTypes,
                ),
              },
            },
          },
        },
      } as AccountTreeControllerState);
    });

    it('warns and fall back to wallet type grouping if an HD account is missing entropySource', () => {
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const { controller, messenger } = setup();
      const mockHdAccountWithoutEntropy: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'mock-no-entropy-id',
        options: {},
      };
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [mockHdAccountWithoutEntropy],
      );
      messenger.registerActionHandler('KeyringController:getState', () => ({
        isUnlocked: true,
        keyrings: [],
      }));

      controller.init();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "! Found an HD account with no entropy source: account won't be associated to its wallet",
      );
      const expectedKeyringWalletId = toAccountWalletId(
        AccountWalletCategory.Keyring,
        KeyringTypes.hd,
      );
      const expectedGroupId = toDefaultAccountGroupId(expectedKeyringWalletId);
      expect(
        controller.state.accountTree.wallets[expectedKeyringWalletId]?.groups[
          expectedGroupId
        ]?.accounts,
      ).toContain(mockHdAccountWithoutEntropy.id);
      consoleWarnSpy.mockRestore();
    });

    it('handles Snap accounts with entropy source', () => {
      const { controller, messenger } = setup();
      const mockSnapAccountWithEntropy: InternalAccount = {
        ...MOCK_SNAP_ACCOUNT_2,
        options: { entropySource: MOCK_HD_KEYRING_2.metadata.id },
        metadata: {
          ...MOCK_SNAP_ACCOUNT_2.metadata,
          snap: MOCK_SNAP_2,
        },
      };
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [mockSnapAccountWithEntropy],
      );
      messenger.registerActionHandler('KeyringController:getState', () => ({
        isUnlocked: true,
        keyrings: [MOCK_HD_KEYRING_2],
      }));

      controller.init();

      const expectedWalletId = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedGroupId = toDefaultAccountGroupId(expectedWalletId);
      expect(
        controller.state.accountTree.wallets[expectedWalletId]?.groups[
          expectedGroupId
        ]?.accounts,
      ).toContain(mockSnapAccountWithEntropy.id);
    });

    it('fallback to Snap ID if Snap cannot be found', () => {
      const { controller, messenger } = setup();
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [MOCK_SNAP_ACCOUNT_1],
      );
      messenger.registerActionHandler('KeyringController:getState', () => ({
        isUnlocked: true,
        keyrings: [],
      }));
      messenger.registerActionHandler('SnapController:get', () => undefined); // Snap won't be found.

      controller.init();

      // Since no entropy sources will be found, it will be categorized as a
      // "Keyring" wallet
      const wallet1Id = toAccountWalletId(
        AccountWalletCategory.Snap,
        MOCK_SNAP_1.id,
      );

      // FIXME: Do we really want this behavior?
      expect(
        controller.state.accountTree.wallets[wallet1Id]?.metadata.name,
      ).toBe('mock-snap-id-1');
    });

    it('fallback to HD keyring category if entropy sources cannot be found', () => {
      const { controller, messenger } = setup();
      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
      const mockHdAccount1: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        options: { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      };
      const mockHdAccount2: InternalAccount = {
        ...MOCK_HD_ACCOUNT_2,
        options: { entropySource: MOCK_HD_KEYRING_2.metadata.id },
      };
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [mockHdAccount1, mockHdAccount2],
      );
      messenger.registerActionHandler('KeyringController:getState', () => ({
        isUnlocked: true,
        keyrings: [], // Entropy sources won't be found.
      }));

      controller.init();

      // Since no entropy sources will be found, it will be categorized as a
      // "Keyring" wallet
      const wallet1Id = toAccountWalletId(
        AccountWalletCategory.Keyring,
        mockHdAccount1.metadata.keyring.type,
      );
      const wallet2Id = toAccountWalletId(
        AccountWalletCategory.Keyring,
        mockHdAccount1.metadata.keyring.type,
      );

      // FIXME: Do we really want this behavior?
      expect(
        controller.state.accountTree.wallets[wallet1Id]?.metadata.name,
      ).toBe('HD Wallet');
      expect(
        controller.state.accountTree.wallets[wallet2Id]?.metadata.name,
      ).toBe('HD Wallet');
    });
  });

  describe('on AccountsController:accountRemoved', () => {
    it('removes an account from the tree', () => {
      const { controller, messenger } = setup();
      //
      // 2 accounts that share the same entropy source (thus, same wallet).
      const mockHdAccount1 = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        },
      };
      const mockHdAccount2 = {
        ...MOCK_HD_ACCOUNT_2,
        options: {
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        },
      };

      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [mockHdAccount1, mockHdAccount2],
      );
      messenger.registerActionHandler('KeyringController:getState', () => ({
        isUnlocked: true,
        keyrings: [MOCK_HD_KEYRING_1],
      }));

      controller.init();

      messenger.publish('AccountsController:accountRemoved', mockHdAccount1.id);

      const walletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const walletId1Group = toDefaultAccountGroupId(walletId1);
      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              id: walletId1,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  metadata: { name: DEFAULT_ACCOUNT_GROUP_NAME },
                  accounts: [mockHdAccount2.id], // HD account 1 got removed.
                },
              },
              metadata: { name: 'Wallet 1' },
            },
          },
        },
      } as AccountTreeControllerState);
    });
  });

  describe('on AccountsController:accountAdded', () => {
    it('adds an account from the tree', () => {
      const { controller, messenger } = setup();
      //
      // 2 accounts that share the same entropy source (thus, same wallet).
      const mockHdAccount1 = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        },
      };
      const mockHdAccount2 = {
        ...MOCK_HD_ACCOUNT_2,
        options: {
          entropySource: MOCK_HD_KEYRING_1.metadata.id,
        },
      };

      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [mockHdAccount1],
      );
      messenger.registerActionHandler('KeyringController:getState', () => ({
        isUnlocked: true,
        keyrings: [MOCK_HD_KEYRING_1],
      }));

      controller.init();

      messenger.publish('AccountsController:accountAdded', mockHdAccount2);

      const walletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const walletId1Group = toDefaultAccountGroupId(walletId1);
      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              id: walletId1,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  metadata: { name: DEFAULT_ACCOUNT_GROUP_NAME },
                  accounts: [mockHdAccount1.id, mockHdAccount2.id], // HD account 2 got added.
                },
              },
              metadata: { name: 'Wallet 1' },
            },
          },
        },
      } as AccountTreeControllerState);
    });
  });
});
