import {
  AccountWalletCategory,
  toAccountWalletId,
  toDefaultAccountGroupId,
  type AccountGroupId,
  type AccountWalletId,
} from '@metamask/account-api';
import { Messenger } from '@metamask/base-controller';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  SolAccountType,
  SolScope,
} from '@metamask/keyring-api';
import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import {
  AccountTreeController,
  type AccountTreeControllerMessenger,
  type AccountTreeControllerActions,
  type AccountTreeControllerEvents,
  type AccountTreeControllerState,
  type AllowedActions,
  type AllowedEvents,
  type AccountGroupMetadata,
} from './AccountTreeController';
import { DEFAULT_ACCOUNT_GROUP_NAME } from './AccountTreeGroup';
import { getAccountWalletNameFromKeyringType } from './rules/KeyringWalletRule';

// Local mock of EMPTY_ACCOUNT to avoid circular dependency
const EMPTY_ACCOUNT_MOCK: InternalAccount = {
  id: '',
  address: '',
  options: {},
  methods: [],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: '',
    keyring: {
      type: '',
    },
    importTime: 0,
  },
};

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
      'AccountsController:selectedAccountChange',
    ],
    allowedActions: [
      'AccountsController:listMultichainAccounts',
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
      'AccountsController:setSelectedAccount',
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
 * @param options.accounts - Accounts to use for AccountsController:listMultichainAccounts handler.
 * @param options.keyrings - Keyring objects to use for KeyringController:getState handler.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  state = {},
  messenger = getRootMessenger(),
  accounts = [],
  keyrings = [],
}: {
  state?: Partial<AccountTreeControllerState>;
  messenger?: Messenger<
    AccountTreeControllerActions | AllowedActions,
    AccountTreeControllerEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
  keyrings?: KeyringObject[];
} = {}): {
  controller: AccountTreeController;
  messenger: Messenger<
    AccountTreeControllerActions | AllowedActions,
    AccountTreeControllerEvents | AllowedEvents
  >;
  spies: {
    consoleWarn: jest.SpyInstance;
  };
} {
  const controller = new AccountTreeController({
    messenger: getAccountTreeControllerMessenger(messenger),
    state,
  });

  if (accounts) {
    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      () => accounts,
    );
  }

  if (accounts) {
    // Mock AccountsController:getSelectedAccount to return the first account
    messenger.registerActionHandler(
      'AccountsController:getSelectedAccount',
      () => accounts[0] || MOCK_HD_ACCOUNT_1,
    );

    // Mock AccountsController:setSelectedAccount
    messenger.registerActionHandler(
      'AccountsController:setSelectedAccount',
      jest.fn(),
    );
  }

  if (keyrings) {
    messenger.registerActionHandler('KeyringController:getState', () => ({
      isUnlocked: true,
      keyrings,
    }));
  }

  const consoleWarnSpy = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);

  return { controller, messenger, spies: { consoleWarn: consoleWarnSpy } };
}

describe('AccountTreeController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('init', () => {
    it('groups accounts by entropy source, then snapId, then wallet type', () => {
      const { controller, messenger } = setup({
        accounts: [
          MOCK_HD_ACCOUNT_1,
          MOCK_HD_ACCOUNT_2,
          MOCK_SNAP_ACCOUNT_1, // Belongs to MOCK_HD_ACCOUNT_2's wallet due to shared entropySource
          MOCK_SNAP_ACCOUNT_2, // Has its own Snap wallet
          MOCK_HARDWARE_ACCOUNT_1, // Has its own Keyring wallet
        ],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

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
        selectedAccountGroup: expect.any(String), // Will be set to some group after init
      } as AccountTreeControllerState);
    });

    it('warns and fall back to wallet type grouping if an HD account is missing entropySource', () => {
      const mockHdAccountWithoutEntropy: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'mock-no-entropy-id',
        options: {},
      };

      const { controller, spies } = setup({
        accounts: [mockHdAccountWithoutEntropy],
        keyrings: [],
      });

      controller.init();
      expect(spies.consoleWarn).toHaveBeenCalledWith(
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
    });

    it('handles Snap accounts with entropy source', () => {
      const mockSnapAccountWithEntropy: InternalAccount = {
        ...MOCK_SNAP_ACCOUNT_2,
        options: { entropySource: MOCK_HD_KEYRING_2.metadata.id },
        metadata: {
          ...MOCK_SNAP_ACCOUNT_2.metadata,
          snap: MOCK_SNAP_2,
        },
      };

      const { controller } = setup({
        accounts: [mockSnapAccountWithEntropy],
        keyrings: [MOCK_HD_KEYRING_2],
      });

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
      const { controller, messenger } = setup({
        accounts: [MOCK_SNAP_ACCOUNT_1],
        keyrings: [],
      });

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
      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
      const mockHdAccount1: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        options: { entropySource: MOCK_HD_KEYRING_1.metadata.id },
      };
      const mockHdAccount2: InternalAccount = {
        ...MOCK_HD_ACCOUNT_2,
        options: { entropySource: MOCK_HD_KEYRING_2.metadata.id },
      };

      const { controller } = setup({
        accounts: [mockHdAccount1, mockHdAccount2],
        keyrings: [],
      });

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

      const { controller, messenger } = setup({
        accounts: [mockHdAccount1, mockHdAccount2],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
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
        selectedAccountGroup: expect.any(String), // Will be set after init
      } as AccountTreeControllerState);
    });
  });

  describe('on AccountsController:accountAdded', () => {
    it('adds an account from the tree', () => {
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

      const { controller, messenger } = setup({
        accounts: [mockHdAccount1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
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
        selectedAccountGroup: expect.any(String), // Will be set after init
      } as AccountTreeControllerState);
    });
  });

  describe('getWallet', () => {
    it('gets a wallet using its ID', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });
      controller.init();

      const walletId = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const wallet = controller.getWallet(walletId);
      expect(wallet).toBeDefined();
    });

    it('gets undefined is wallet ID is not matching any wallet', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });
      controller.init();

      const wallet = controller.getWallet('entropy:unknown');
      expect(wallet).toBeUndefined();
    });
  });

  describe('getWallets', () => {
    it('gets all wallets', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });
      controller.init();

      const wallets = controller.getWallets();
      expect(wallets).toHaveLength(2);
    });
  });

  describe('AccountTreeWallet', () => {
    it('gets account groups from a wallet', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });
      controller.init();

      const wallets = controller.getWallets();
      expect(wallets).toHaveLength(1);

      const wallet = wallets[0];
      const groups = wallet.getAccountGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toStrictEqual(toDefaultAccountGroupId(wallet.id));
    });

    it('gets a specific account group using its ID', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });
      controller.init();

      const wallets = controller.getWallets();
      expect(wallets).toHaveLength(1);

      const wallet = wallets[0];
      const groupId = toDefaultAccountGroupId(wallet.id);
      const group = wallet.getAccountGroup(groupId);
      expect(group).toBeDefined();
      expect(group?.id).toStrictEqual(groupId);
    });
  });

  describe('AccountTreeGroup', () => {
    it('gets accounts from an account group', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });
      controller.init();

      // Required by `getAccounts` below.
      messenger.registerActionHandler(
        'AccountsController:getAccount',
        () => MOCK_HD_ACCOUNT_1,
      );

      const wallets = controller.getWallets();
      expect(wallets).toHaveLength(1);

      const wallet = wallets[0];
      const groups = wallet.getAccountGroups();
      expect(groups).toHaveLength(1);

      const group = groups[0];
      const accounts = group.getAccounts();
      const accountIds = group.getAccountIds();
      expect(accounts).toHaveLength(1);
      expect(accounts.map((account) => account.id)).toStrictEqual(accountIds);
    });

    it('skips account if it cannot be resolved', () => {
      const { controller, messenger, spies } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });
      controller.init();

      // Required by `getAccounts` below.
      messenger.registerActionHandler(
        'AccountsController:getAccount',
        () => undefined, // Not resolved
      );

      const wallets = controller.getWallets();
      const wallet = wallets[0];
      const groups = wallet.getAccountGroups();
      const group = groups[0];

      const accountIds = group.getAccountIds();
      expect(accountIds).toHaveLength(1);

      const accounts = group.getAccounts();
      expect(spies.consoleWarn).toHaveBeenCalledWith(
        `! Unable to get account: "${accountIds[0]}"`,
      );
      expect(accounts).toHaveLength(0); // None account could be resolved.
    });
  });

  describe('selectedAccountGroup bidirectional synchronization', () => {
    it('initializes selectedAccountGroup based on currently selected account', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      expect(controller.getSelectedAccountGroup()).not.toBe('');
    });

    it('updates selectedAccountGroup when AccountsController selected account changes', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();
      const initialGroup = controller.getSelectedAccountGroup();

      messenger.publish(
        'AccountsController:selectedAccountChange',
        MOCK_HD_ACCOUNT_2,
      );

      const newGroup = controller.getSelectedAccountGroup();
      expect(newGroup).not.toBe(initialGroup);
    });

    it('updates AccountsController selected account when selectedAccountGroup changes', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      const setSelectedAccountSpy = jest.spyOn(messenger, 'call');

      controller.init();

      const expectedWalletId2 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedGroupId2 = toDefaultAccountGroupId(expectedWalletId2);

      controller.setSelectedAccountGroup(expectedGroupId2);

      expect(setSelectedAccountSpy).toHaveBeenCalledWith(
        'AccountsController:setSelectedAccount',
        expect.any(String),
      );
    });

    it('is idempotent - setting same selectedAccountGroup should not trigger AccountsController update', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      const setSelectedAccountSpy = jest.spyOn(messenger, 'call');

      controller.init();

      const expectedWalletId = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toDefaultAccountGroupId(expectedWalletId);

      expect(controller.getSelectedAccountGroup()).toBe(expectedGroupId);

      setSelectedAccountSpy.mockClear();

      const initialState = { ...controller.state };

      controller.setSelectedAccountGroup(expectedGroupId);

      expect(setSelectedAccountSpy).not.toHaveBeenCalledWith(
        'AccountsController:setSelectedAccount',
        expect.any(String),
      );

      expect(controller.state).toStrictEqual(initialState);
      expect(controller.getSelectedAccountGroup()).toBe(expectedGroupId);
    });

    it('is idempotent - receiving selectedAccountChange for account in same group should not update state', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      const expectedWalletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toDefaultAccountGroupId(expectedWalletId1);

      controller.setSelectedAccountGroup(expectedGroupId1);

      const initialState = { ...controller.state };

      messenger.publish(
        'AccountsController:selectedAccountChange',
        MOCK_HD_ACCOUNT_1,
      );

      expect(controller.state).toStrictEqual(initialState);
      expect(controller.getSelectedAccountGroup()).toBe(expectedGroupId1);
    });

    it('throws error when trying to select non-existent group', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      expect(() => {
        controller.setSelectedAccountGroup(
          'non-existent-group-id' as AccountGroupId,
        );
      }).toThrow('No accounts found in group: non-existent-group-id');
    });

    it('handles AccountsController selectedAccountChange for account not in tree gracefully', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();
      const initialGroup = controller.getSelectedAccountGroup();

      const unknownAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_2,
        id: 'unknown-account-id',
      };

      messenger.publish(
        'AccountsController:selectedAccountChange',
        unknownAccount,
      );

      expect(controller.getSelectedAccountGroup()).toBe(initialGroup);
    });

    it('falls back to first wallet first group when AccountsController returns EMPTY_ACCOUNT', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      // Unregister existing handler and register new one BEFORE init
      messenger.unregisterActionHandler(
        'AccountsController:getSelectedAccount',
      );
      messenger.registerActionHandler(
        'AccountsController:getSelectedAccount',
        () => EMPTY_ACCOUNT_MOCK,
      );

      controller.init();

      // Should fall back to first wallet's first group
      const expectedWalletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toDefaultAccountGroupId(expectedWalletId1);

      expect(controller.getSelectedAccountGroup()).toBe(expectedGroupId1);
    });

    it('falls back to first wallet first group when selected account is not in tree', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      // Mock getSelectedAccount to return an account not in the tree BEFORE init
      const unknownAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'unknown-account-id',
      };

      messenger.unregisterActionHandler(
        'AccountsController:getSelectedAccount',
      );
      messenger.registerActionHandler(
        'AccountsController:getSelectedAccount',
        () => unknownAccount,
      );

      controller.init();

      // Should fall back to first wallet's first group
      const expectedWalletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toDefaultAccountGroupId(expectedWalletId1);

      expect(controller.getSelectedAccountGroup()).toBe(expectedGroupId1);
    });

    it('returns empty string when no wallets exist and getSelectedAccount returns EMPTY_ACCOUNT', () => {
      const { controller, messenger } = setup({
        accounts: [],
        keyrings: [],
      });

      // Mock getSelectedAccount to return EMPTY_ACCOUNT_MOCK (id is '') BEFORE init
      messenger.unregisterActionHandler(
        'AccountsController:getSelectedAccount',
      );
      messenger.registerActionHandler(
        'AccountsController:getSelectedAccount',
        () => EMPTY_ACCOUNT_MOCK,
      );

      controller.init();

      // Should return empty string when no wallets exist
      expect(controller.getSelectedAccountGroup()).toBe('');
    });
  });

  describe('account removal and memory management', () => {
    it('cleans up reverse mapping and does not change selectedAccountGroup when removing from non-selected group', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      // Select the first group explicitly
      const expectedWalletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toDefaultAccountGroupId(expectedWalletId1);
      controller.setSelectedAccountGroup(expectedGroupId1);

      const initialSelectedGroup = controller.getSelectedAccountGroup();

      // Remove account from the second group (not selected) - tests false branch and reverse cleanup
      messenger.publish(
        'AccountsController:accountRemoved',
        MOCK_HD_ACCOUNT_2.id,
      );

      // selectedAccountGroup should remain unchanged (tests false branch of if condition)
      expect(controller.getSelectedAccountGroup()).toBe(initialSelectedGroup);

      // Test that subsequent selectedAccountChange for removed account is handled gracefully (indirect test of reverse cleanup)
      messenger.publish(
        'AccountsController:selectedAccountChange',
        MOCK_HD_ACCOUNT_2,
      );
      expect(controller.getSelectedAccountGroup()).toBe(initialSelectedGroup);
    });

    it('updates selectedAccountGroup when last account in selected group is removed and other groups exist', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      // Select the first group
      const expectedWalletId1 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toDefaultAccountGroupId(expectedWalletId1);
      controller.setSelectedAccountGroup(expectedGroupId1);

      const expectedWalletId2 = toAccountWalletId(
        AccountWalletCategory.Entropy,
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedGroupId2 = toDefaultAccountGroupId(expectedWalletId2);

      // Remove the account from the selected group - tests true branch and findFirstNonEmptyGroup finding a group
      messenger.publish(
        'AccountsController:accountRemoved',
        MOCK_HD_ACCOUNT_1.id,
      );

      // Should automatically switch to the remaining group (tests findFirstNonEmptyGroup returning a group)
      expect(controller.getSelectedAccountGroup()).toBe(expectedGroupId2);
    });

    it('sets selectedAccountGroup to empty when no non-empty groups exist', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      // Remove the only account - tests findFirstNonEmptyGroup returning empty string
      messenger.publish(
        'AccountsController:accountRemoved',
        MOCK_HD_ACCOUNT_1.id,
      );

      // Should fall back to empty string when no groups have accounts
      expect(controller.getSelectedAccountGroup()).toBe('');
    });
  });
});
