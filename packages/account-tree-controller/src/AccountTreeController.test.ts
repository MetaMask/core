import type {
  Bip44Account,
  MultichainAccountWalletId,
} from '@metamask/account-api';
import {
  AccountWalletCategory,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { Messenger } from '@metamask/base-controller';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringAccountEntropyTypeOption,
  SolAccountType,
  SolScope,
} from '@metamask/keyring-api';
import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import { AccountTreeController } from './AccountTreeController';
import { AccountTreeGroup } from './AccountTreeGroup';
import { AccountTreeWallet } from './AccountTreeWallet';
import { getAccountWalletNameFromKeyringType } from './rules/keyring';
import {
  type AccountTreeControllerMessenger,
  type AccountTreeControllerActions,
  type AccountTreeControllerEvents,
  type AccountTreeControllerState,
  type AllowedActions,
  type AllowedEvents,
} from './types';

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

const MOCK_HD_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'mock-id-1',
  address: '0x123',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: MOCK_HD_KEYRING_1.metadata.id,
      groupIndex: 0,
      derivationPath: '',
    },
  },
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

const MOCK_HD_ACCOUNT_2: Bip44Account<InternalAccount> = {
  id: 'mock-id-2',
  address: '0x456',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 0,
      derivationPath: '',
    },
  },
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

const MOCK_SNAP_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'mock-snap-id-1',
  address: 'aabbccdd',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: MOCK_HD_KEYRING_2.metadata.id,
      groupIndex: 1,
      derivationPath: '',
    },
  },
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
      'AccountsController:getAccount',
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
  mocks: {
    KeyringController: {
      keyrings: KeyringObject[];
      getState: jest.Mock;
    };
    AccountsController: {
      accounts: InternalAccount[];
      listMultichainAccounts: jest.Mock;
      getAccount: jest.Mock;
    };
  };
} {
  const mocks = {
    KeyringController: {
      keyrings,
      getState: jest.fn(),
    },
    AccountsController: {
      accounts,
      listMultichainAccounts: jest.fn(),
      getAccount: jest.fn(),
    },
  };

  if (accounts) {
    mocks.AccountsController.listMultichainAccounts.mockImplementation(
      () => mocks.AccountsController.accounts,
    );
    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      mocks.AccountsController.listMultichainAccounts,
    );

    mocks.AccountsController.getAccount.mockImplementation((id) =>
      mocks.AccountsController.accounts.find((account) => account.id === id),
    );
    messenger.registerActionHandler(
      'AccountsController:getAccount',
      mocks.AccountsController.getAccount,
    );
  }

  if (keyrings) {
    mocks.KeyringController.getState.mockImplementation(() => ({
      isUnlocked: true,
      keyrings: mocks.KeyringController.keyrings,
    }));
    messenger.registerActionHandler(
      'KeyringController:getState',
      mocks.KeyringController.getState,
    );
  }

  const controller = new AccountTreeController({
    messenger: getAccountTreeControllerMessenger(messenger),
    state,
  });

  const consoleWarnSpy = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);

  return {
    controller,
    messenger,
    spies: { consoleWarn: consoleWarnSpy },
    mocks,
  };
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

      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedWalletId1Group = toMultichainAccountId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );
      const expectedWalletId2 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedWalletId2Group1 = toMultichainAccountId(
        expectedWalletId2,
        MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
      );
      const expectedWalletId2Group2 = toMultichainAccountId(
        expectedWalletId2,
        MOCK_SNAP_ACCOUNT_1.options.entropy.groupIndex,
      );
      const expectedSnapWalletId = toAccountWalletId(
        AccountWalletCategory.Snap,
        MOCK_SNAP_2.id,
      );
      const expectedSnapWalletIdGroup = toAccountGroupId(
        expectedSnapWalletId,
        MOCK_SNAP_ACCOUNT_2.address,
      );
      const expectedKeyringWalletId = `${AccountWalletCategory.Keyring}:${KeyringTypes.ledger}`;
      const expectedKeyringWalletIdGroup = toAccountGroupId(
        expectedKeyringWalletId,
        MOCK_HARDWARE_ACCOUNT_1.address,
      );

      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [expectedWalletId1]: {
              category: AccountWalletCategory.Entropy,
              id: expectedWalletId1,
              groups: {
                [expectedWalletId1Group]: {
                  id: expectedWalletId1Group,
                  accounts: [MOCK_HD_ACCOUNT_1.id],
                  metadata: {
                    name: MOCK_HD_ACCOUNT_1.metadata.name,
                  },
                },
              },
              metadata: { name: 'Wallet 1' },
            },
            [expectedWalletId2]: {
              category: AccountWalletCategory.Entropy,
              id: expectedWalletId2,
              groups: {
                [expectedWalletId2Group1]: {
                  id: expectedWalletId2Group1,
                  accounts: [MOCK_HD_ACCOUNT_2.id],
                  metadata: {
                    name: MOCK_HD_ACCOUNT_2.metadata.name,
                  },
                },
                [expectedWalletId2Group2]: {
                  id: expectedWalletId2Group2,
                  accounts: [MOCK_SNAP_ACCOUNT_1.id],
                  metadata: {
                    name: MOCK_SNAP_ACCOUNT_1.metadata.name,
                  },
                },
              },
              metadata: { name: 'Wallet 2' },
            },
            [expectedSnapWalletId]: {
              category: AccountWalletCategory.Snap,
              id: expectedSnapWalletId,
              groups: {
                [expectedSnapWalletIdGroup]: {
                  id: expectedSnapWalletIdGroup,
                  accounts: [MOCK_SNAP_ACCOUNT_2.id],
                  metadata: {
                    name: MOCK_SNAP_ACCOUNT_2.metadata.name,
                  },
                },
              },
              metadata: { name: MOCK_SNAP_1.manifest.proposedName },
            },
            [expectedKeyringWalletId]: {
              category: AccountWalletCategory.Keyring,
              id: expectedKeyringWalletId,
              groups: {
                [expectedKeyringWalletIdGroup]: {
                  id: expectedKeyringWalletIdGroup,
                  accounts: [MOCK_HARDWARE_ACCOUNT_1.id],
                  metadata: {
                    name: MOCK_HARDWARE_ACCOUNT_1.metadata.name,
                  },
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

    it('handles Snap accounts with entropy source', () => {
      const mockSnapAccountWithEntropy: Bip44Account<InternalAccount> = {
        ...MOCK_SNAP_ACCOUNT_2,
        options: {
          entropy: {
            type: KeyringAccountEntropyTypeOption.Mnemonic,
            id: MOCK_HD_KEYRING_2.metadata.id,
            groupIndex: 0,
            derivationPath: '',
          },
        },
        metadata: {
          ...MOCK_SNAP_ACCOUNT_2.metadata,
          snap: MOCK_SNAP_2,
        },
      } as const;

      const { controller, messenger } = setup({
        accounts: [mockSnapAccountWithEntropy],
        keyrings: [MOCK_HD_KEYRING_2],
      });

      messenger.registerActionHandler(
        'SnapController:get',
        () =>
          ({
            manifest: {
              proposedName: 'Test',
            },
          }) as ReturnType<SnapControllerGetSnap['handler']>,
      );

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedGroupId = toMultichainAccountId(
        expectedWalletId,
        mockSnapAccountWithEntropy.options.entropy.groupIndex,
      );
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
      const mockHdAccount1: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_1.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0,
          },
        },
      };
      const mockHdAccount2 = {
        ...MOCK_HD_ACCOUNT_2,
        options: {
          ...MOCK_HD_ACCOUNT_2.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_2.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0,
          },
        },
      };

      const { controller, messenger } = setup({
        accounts: [mockHdAccount1, mockHdAccount2],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
      controller.init();

      messenger.publish('AccountsController:accountRemoved', mockHdAccount1.id);

      const walletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const walletId1Group = toMultichainAccountId(
        walletId1,
        mockHdAccount1.options.entropy.groupIndex,
      );
      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              category: AccountWalletCategory.Entropy,
              id: walletId1,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  metadata: { name: mockHdAccount1.metadata.name },
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
    it('adds an account to the tree', () => {
      // 2 accounts that share the same entropy source (thus, same wallet).
      const mockHdAccount1: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_1.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0,
          },
        },
      };
      const mockHdAccount2 = {
        ...MOCK_HD_ACCOUNT_2,
        options: {
          ...MOCK_HD_ACCOUNT_2.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_2.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0,
          },
        },
      };

      const { controller, messenger } = setup({
        accounts: [mockHdAccount1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
      controller.init();

      messenger.publish('AccountsController:accountAdded', mockHdAccount2);

      const walletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const walletId1Group = toMultichainAccountId(
        walletId1,
        mockHdAccount1.options.entropy.groupIndex,
      );
      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              category: AccountWalletCategory.Entropy,
              id: walletId1,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  metadata: { name: mockHdAccount1.metadata.name },
                  accounts: [mockHdAccount1.id, mockHdAccount2.id], // HD account 2 got added.
                },
              },
              metadata: { name: 'Wallet 1' },
            },
          },
        },
      } as AccountTreeControllerState);
    });

    it('adds a new wallet to the tree', () => {
      // 2 accounts that share the same entropy source (thus, same wallet).
      const mockHdAccount1: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_1.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0,
          },
        },
      };
      const mockHdAccount2 = {
        ...MOCK_HD_ACCOUNT_2,
        options: {
          ...MOCK_HD_ACCOUNT_2.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_2.options.entropy,
            id: MOCK_HD_KEYRING_2.metadata.id,
            groupIndex: 0,
          },
        },
      };

      const { controller, messenger, mocks } = setup({
        accounts: [mockHdAccount1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      // Create entropy wallets that will both get "Wallet" as base name, then get numbered
      controller.init();

      mocks.KeyringController.keyrings = [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2];
      mocks.AccountsController.accounts = [mockHdAccount1, mockHdAccount2];
      messenger.publish('AccountsController:accountAdded', mockHdAccount2);

      const walletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const walletId1Group = toMultichainAccountId(
        walletId1,
        mockHdAccount1.options.entropy.groupIndex,
      );
      const walletId2 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const walletId2Group = toMultichainAccountId(
        walletId2,
        mockHdAccount2.options.entropy.groupIndex,
      );
      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              category: AccountWalletCategory.Entropy,
              id: walletId1,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  metadata: { name: mockHdAccount1.metadata.name },
                  accounts: [mockHdAccount1.id],
                },
              },
              metadata: { name: 'Wallet 1' },
            },
            [walletId2]: {
              // New wallet automatically added.
              category: AccountWalletCategory.Entropy,
              id: walletId2,
              groups: {
                [walletId2Group]: {
                  id: walletId2Group,
                  metadata: { name: mockHdAccount2.metadata.name },
                  accounts: [mockHdAccount2.id],
                },
              },
              metadata: { name: 'Wallet 2' },
            },
          },
        },
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
      expect(wallet.id).toBeDefined();
      expect(wallet.name).toBeDefined();

      const groups = wallet.getAccountGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toStrictEqual(
        toMultichainAccountId(
          wallet.id as MultichainAccountWalletId,
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
      );
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
      const groupId = toMultichainAccountId(
        wallet.id as MultichainAccountWalletId,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );
      const group = wallet.getAccountGroup(groupId);
      expect(group).toBeDefined();
      expect(group?.id).toStrictEqual(groupId);
    });
  });

  describe('AccountTreeGroup', () => {
    it('gets accounts from an account group', () => {
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

      const group = groups[0];
      expect(group.id).toBeDefined();
      expect(group.wallet).toBeDefined();
      expect(group.name).toBeDefined();

      const accounts = group.getAccounts();
      const accountIds = group.getAccountIds();
      expect(accounts).toHaveLength(1);
      expect(accounts.map((account) => account.id)).toStrictEqual(accountIds);
    });

    it('throws if an account cannot be resolved', () => {
      const { controller, mocks } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });
      controller.init();

      const wallets = controller.getWallets();
      const wallet = wallets[0];
      const groups = wallet.getAccountGroups();
      const group = groups[0];

      const accountIds = group.getAccountIds();
      expect(accountIds).toHaveLength(1);

      mocks.AccountsController.getAccount.mockReturnValue(undefined);
      expect(() => group.getAccounts()).toThrow(
        `Unable to get account with ID: "${MOCK_HD_ACCOUNT_1.id}"`,
      );
    });

    it('throws if the group has no account', () => {
      const messenger = getAccountTreeControllerMessenger();

      const wallet = new AccountTreeWallet({
        messenger,
        wallet: {
          id: toAccountWalletId(
            AccountWalletCategory.Keyring,
            KeyringTypes.simple,
          ),
          category: AccountWalletCategory.Keyring,
          groups: {},
          metadata: {
            name: '',
          },
        },
        options: {
          type: AccountWalletCategory.Keyring,
          keyring: {
            type: KeyringTypes.hd,
          },
        },
      });
      const group = new AccountTreeGroup({
        messenger,
        wallet,
        group: {
          id: toAccountGroupId(wallet.id, 'bad'),
          accounts: [],
          metadata: {
            name: '',
          },
        },
      });

      expect(() => group.getOnlyAccount()).toThrow('Group contains no account');
    });

    it('throws if the group has more than 1 account when calling getOnlyAccount', () => {
      const messenger = getAccountTreeControllerMessenger();

      const wallet = new AccountTreeWallet({
        messenger,
        wallet: {
          id: toAccountWalletId(
            AccountWalletCategory.Keyring,
            KeyringTypes.simple,
          ),
          category: AccountWalletCategory.Keyring,
          groups: {},
          metadata: {
            name: '',
          },
        },
        options: {
          type: AccountWalletCategory.Keyring,
          keyring: {
            type: KeyringTypes.hd,
          },
        },
      });
      const group = new AccountTreeGroup({
        messenger,
        wallet,
        group: {
          id: toAccountGroupId(wallet.id, 'bad'),
          accounts: ['mock-id-1', 'mock-id-2'],
          metadata: {
            name: '',
          },
        },
      });

      expect(() => group.getOnlyAccount()).toThrow(
        'Group contains more than 1 account',
      );
    });
  });
});
