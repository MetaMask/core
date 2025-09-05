import type { AccountWalletId, Bip44Account } from '@metamask/account-api';
import {
  AccountGroupType,
  AccountWalletType,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
  type AccountGroupId,
} from '@metamask/account-api';
import { Messenger } from '@metamask/base-controller';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringAccountEntropyTypeOption,
  SolAccountType,
  SolMethod,
  SolScope,
} from '@metamask/keyring-api';
import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import { AccountTreeController } from './AccountTreeController';
import { getAccountWalletNameFromKeyringType } from './rules/keyring';
import {
  type AccountTreeControllerMessenger,
  type AccountTreeControllerActions,
  type AccountTreeControllerEvents,
  type AccountTreeControllerState,
  type AllowedActions,
  type AllowedEvents,
} from './types';

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
  methods: [...Object.values(SolMethod)],
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
  mocks: {
    KeyringController: {
      keyrings: KeyringObject[];
      getState: jest.Mock;
    };
    AccountsController: {
      accounts: InternalAccount[];
      listMultichainAccounts: jest.Mock;
      getSelectedAccount: jest.Mock;
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
      getSelectedAccount: jest.fn(),
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

    // Mock AccountsController:getSelectedAccount to return the first account
    mocks.AccountsController.getSelectedAccount.mockImplementation(
      () => accounts[0] || MOCK_HD_ACCOUNT_1,
    );
    messenger.registerActionHandler(
      'AccountsController:getSelectedAccount',
      mocks.AccountsController.getSelectedAccount,
    );

    // Mock AccountsController:setSelectedAccount
    messenger.registerActionHandler(
      'AccountsController:setSelectedAccount',
      jest.fn(),
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
          MOCK_SNAP_2 as unknown as ReturnType<
            SnapControllerGetSnap['handler']
          >,
      );

      controller.init();

      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedWalletId1Group = toMultichainAccountGroupId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );
      const expectedWalletId2 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedWalletId2Group1 = toMultichainAccountGroupId(
        expectedWalletId2,
        MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
      );
      const expectedWalletId2Group2 = toMultichainAccountGroupId(
        expectedWalletId2,
        MOCK_SNAP_ACCOUNT_1.options.entropy.groupIndex,
      );
      const expectedSnapWalletId = toAccountWalletId(
        AccountWalletType.Snap,
        MOCK_SNAP_2.id,
      );
      const expectedSnapWalletIdGroup = toAccountGroupId(
        expectedSnapWalletId,
        MOCK_SNAP_ACCOUNT_2.address,
      );
      const expectedKeyringWalletId = toAccountWalletId(
        AccountWalletType.Keyring,
        KeyringTypes.ledger,
      );
      const expectedKeyringWalletIdGroup = toAccountGroupId(
        expectedKeyringWalletId,
        MOCK_HARDWARE_ACCOUNT_1.address,
      );

      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [expectedWalletId1]: {
              id: expectedWalletId1,
              type: AccountWalletType.Entropy,
              groups: {
                [expectedWalletId1Group]: {
                  id: expectedWalletId1Group,
                  type: AccountGroupType.MultichainAccount,
                  accounts: [MOCK_HD_ACCOUNT_1.id],
                  metadata: {
                    name: MOCK_HD_ACCOUNT_1.metadata.name,
                    entropy: {
                      groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                },
              },
              metadata: {
                name: 'Wallet 1',
                entropy: {
                  id: MOCK_HD_KEYRING_1.metadata.id,
                },
              },
            },
            [expectedWalletId2]: {
              id: expectedWalletId2,
              type: AccountWalletType.Entropy,
              groups: {
                [expectedWalletId2Group1]: {
                  id: expectedWalletId2Group1,
                  type: AccountGroupType.MultichainAccount,
                  accounts: [MOCK_HD_ACCOUNT_2.id],
                  metadata: {
                    name: MOCK_HD_ACCOUNT_2.metadata.name,
                    entropy: {
                      groupIndex: MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                },
                [expectedWalletId2Group2]: {
                  id: expectedWalletId2Group2,
                  type: AccountGroupType.MultichainAccount,
                  accounts: [MOCK_SNAP_ACCOUNT_1.id],
                  metadata: {
                    name: 'Account 2', // Non-EVM account names no longer bubble up, fallback to default
                    entropy: {
                      groupIndex:
                        MOCK_SNAP_ACCOUNT_1.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                },
              },
              metadata: {
                name: 'Wallet 2',
                entropy: {
                  id: MOCK_HD_KEYRING_2.metadata.id,
                },
              },
            },
            [expectedSnapWalletId]: {
              id: expectedSnapWalletId,
              type: AccountWalletType.Snap,
              groups: {
                [expectedSnapWalletIdGroup]: {
                  id: expectedSnapWalletIdGroup,
                  type: AccountGroupType.SingleAccount,
                  accounts: [MOCK_SNAP_ACCOUNT_2.id],
                  metadata: {
                    name: MOCK_SNAP_ACCOUNT_2.metadata.name,
                    pinned: false,
                    hidden: false,
                  },
                },
              },
              metadata: {
                name: MOCK_SNAP_2.manifest.proposedName,
                snap: {
                  id: MOCK_SNAP_2.id,
                },
              },
            },
            [expectedKeyringWalletId]: {
              id: expectedKeyringWalletId,
              type: AccountWalletType.Keyring,
              groups: {
                [expectedKeyringWalletIdGroup]: {
                  id: expectedKeyringWalletIdGroup,
                  type: AccountGroupType.SingleAccount,
                  accounts: [MOCK_HARDWARE_ACCOUNT_1.id],
                  metadata: {
                    name: MOCK_HARDWARE_ACCOUNT_1.metadata.name,
                    pinned: false,
                    hidden: false,
                  },
                },
              },
              metadata: {
                name: getAccountWalletNameFromKeyringType(
                  MOCK_HARDWARE_ACCOUNT_1.metadata.keyring.type as KeyringTypes,
                ),
                keyring: {
                  type: KeyringTypes.ledger,
                },
              },
            },
          },
          selectedAccountGroup: expect.any(String), // Will be set to some group after init
        },
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
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
      const expectedGroupId = toMultichainAccountGroupId(
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
        AccountWalletType.Snap,
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
        AccountWalletType.Keyring,
        mockHdAccount1.metadata.keyring.type,
      );
      const wallet2Id = toAccountWalletId(
        AccountWalletType.Keyring,
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

    it('re-select a new group when tree is re-initialized and current selected group no longer exists', () => {
      const { controller, mocks } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      mocks.AccountsController.getSelectedAccount.mockImplementation(
        () => MOCK_HD_ACCOUNT_1,
      );

      controller.init();

      const defaultAccountGroupId = toMultichainAccountGroupId(
        toMultichainAccountWalletId(MOCK_HD_ACCOUNT_1.options.entropy.id),
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      expect(controller.state.accountTree.selectedAccountGroup).toStrictEqual(
        defaultAccountGroupId,
      );

      mocks.AccountsController.accounts = [MOCK_HD_ACCOUNT_2];
      mocks.KeyringController.keyrings = [MOCK_HD_KEYRING_2];
      mocks.AccountsController.getSelectedAccount.mockImplementation(
        () => MOCK_HD_ACCOUNT_2,
      );

      controller.init();

      const newDefaultAccountGroupId = toMultichainAccountGroupId(
        toMultichainAccountWalletId(MOCK_HD_ACCOUNT_2.options.entropy.id),
        MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
      );

      expect(controller.state.accountTree.selectedAccountGroup).toStrictEqual(
        newDefaultAccountGroupId,
      );
    });
  });

  describe('getAccountGroupObject', () => {
    it('returns a valid account group object', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      const walletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const groupId = toMultichainAccountGroupId(
        walletId,
        MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
      );
      expect(controller.getAccountGroupObject(groupId)).toBeDefined();
    });

    it('returns undefined if group id is not found', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      const walletId = toAccountWalletId(
        AccountWalletType.Entropy,
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const groupId = toAccountGroupId(walletId, 'bad');
      expect(controller.getAccountGroupObject(groupId)).toBeUndefined();
    });
  });

  describe('getAccountsFromSelectAccountGroup', () => {
    it('selects account without a selector', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      expect(controller.getAccountsFromSelectedAccountGroup()).toStrictEqual([
        MOCK_HD_ACCOUNT_1,
      ]);

      const walletId = toAccountWalletId(
        AccountWalletType.Entropy,
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const groupId = toAccountGroupId(
        walletId,
        `${MOCK_HD_ACCOUNT_2.options.entropy.groupIndex}`,
      );
      controller.setSelectedAccountGroup(groupId);

      expect(controller.getAccountsFromSelectedAccountGroup()).toStrictEqual([
        MOCK_HD_ACCOUNT_2,
      ]);
    });

    it('selects account with a selector', () => {
      const mockSolAccount1: Bip44Account<InternalAccount> = {
        ...MOCK_SNAP_ACCOUNT_1,
        options: {
          entropy: {
            ...MOCK_SNAP_ACCOUNT_1.options.entropy,
            groupIndex: 0,
          },
        },
      };

      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_2, mockSolAccount1],
        keyrings: [MOCK_HD_KEYRING_2],
      });

      controller.init();

      expect(
        controller.getAccountsFromSelectedAccountGroup({
          scopes: [SolScope.Mainnet],
        }),
      ).toStrictEqual([mockSolAccount1]);

      expect(
        controller.getAccountsFromSelectedAccountGroup({
          scopes: [EthScope.Mainnet],
        }),
      ).toStrictEqual([MOCK_HD_ACCOUNT_2]);
    });

    it('returns no account if no group is selected', () => {
      const { controller } = setup({
        accounts: [],
        keyrings: [],
      });

      controller.init();

      expect(controller.getAccountsFromSelectedAccountGroup()).toHaveLength(0);
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
      const walletId1Group = toMultichainAccountGroupId(
        walletId1,
        mockHdAccount1.options.entropy.groupIndex,
      );
      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              id: walletId1,
              type: AccountWalletType.Entropy,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  type: AccountGroupType.MultichainAccount,
                  metadata: {
                    name: mockHdAccount1.metadata.name,
                    entropy: {
                      groupIndex: mockHdAccount1.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                  accounts: [mockHdAccount2.id], // HD account 1 got removed.
                },
              },
              metadata: {
                name: 'Wallet 1',
                entropy: {
                  id: MOCK_HD_KEYRING_1.metadata.id,
                },
              },
            },
          },
          selectedAccountGroup: expect.any(String), // Will be set after init
        },
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
      } as AccountTreeControllerState);
    });

    it('prunes an empty group if it holds no accounts', () => {
      const mockHdAccount1: Bip44Account<InternalAccount> = MOCK_HD_ACCOUNT_1;
      const mockHdAccount2 = {
        ...MOCK_HD_ACCOUNT_2,
        options: {
          entropy: {
            ...MOCK_HD_ACCOUNT_2.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 1,
          },
        },
      };

      const { controller, messenger } = setup({
        accounts: [mockHdAccount1, mockHdAccount2],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      messenger.publish('AccountsController:accountRemoved', mockHdAccount1.id);

      const walletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );

      const walletId1Group2 = toMultichainAccountGroupId(
        walletId1,
        mockHdAccount2.options.entropy.groupIndex,
      );

      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              id: walletId1,
              type: AccountWalletType.Entropy,
              groups: {
                // First group gets removed as a result of pruning.
                [walletId1Group2]: {
                  id: walletId1Group2,
                  type: AccountGroupType.MultichainAccount,
                  metadata: {
                    name: mockHdAccount2.metadata.name,
                    entropy: {
                      groupIndex: mockHdAccount2.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                  accounts: [mockHdAccount2.id],
                },
              },
              metadata: {
                name: 'Wallet 1',
                entropy: {
                  id: MOCK_HD_KEYRING_1.metadata.id,
                },
              },
            },
          },
          selectedAccountGroup: expect.any(String), // Will be set after init
        },
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
      } as AccountTreeControllerState);
    });

    it('prunes an empty wallet if it holds no groups', () => {
      const mockHdAccount1: Bip44Account<InternalAccount> = MOCK_HD_ACCOUNT_1;

      const { controller, messenger } = setup({
        accounts: [mockHdAccount1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      messenger.publish('AccountsController:accountRemoved', mockHdAccount1.id);

      expect(controller.state).toStrictEqual({
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
        accountTree: {
          // No wallets should be present.
          wallets: {},
          selectedAccountGroup: expect.any(String), // Will be set after init
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
      const walletId1Group = toMultichainAccountGroupId(
        walletId1,
        mockHdAccount1.options.entropy.groupIndex,
      );
      expect(controller.state).toStrictEqual({
        accountTree: {
          selectedAccountGroup: walletId1Group,
          wallets: {
            [walletId1]: {
              id: walletId1,
              type: AccountWalletType.Entropy,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  type: AccountGroupType.MultichainAccount,
                  metadata: {
                    name: mockHdAccount1.metadata.name,
                    entropy: {
                      groupIndex: mockHdAccount1.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                  accounts: [mockHdAccount1.id, mockHdAccount2.id], // HD account 2 got added.
                },
              },
              metadata: {
                name: 'Wallet 1',
                entropy: {
                  id: MOCK_HD_KEYRING_1.metadata.id,
                },
              },
            },
          },
        },
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
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
      const walletId1Group = toMultichainAccountGroupId(
        walletId1,
        mockHdAccount1.options.entropy.groupIndex,
      );
      const walletId2 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const walletId2Group = toMultichainAccountGroupId(
        walletId2,
        mockHdAccount2.options.entropy.groupIndex,
      );
      expect(controller.state).toStrictEqual({
        accountTree: {
          wallets: {
            [walletId1]: {
              id: walletId1,
              type: AccountWalletType.Entropy,
              groups: {
                [walletId1Group]: {
                  id: walletId1Group,
                  type: AccountGroupType.MultichainAccount,
                  metadata: {
                    name: mockHdAccount1.metadata.name,
                    entropy: {
                      groupIndex: mockHdAccount1.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                  accounts: [mockHdAccount1.id],
                },
              },
              metadata: {
                name: 'Wallet 1',
                entropy: {
                  id: MOCK_HD_KEYRING_1.metadata.id,
                },
              },
            },
            [walletId2]: {
              // New wallet automatically added.
              id: walletId2,
              type: AccountWalletType.Entropy,
              groups: {
                [walletId2Group]: {
                  id: walletId2Group,
                  type: AccountGroupType.MultichainAccount,
                  metadata: {
                    name: mockHdAccount2.metadata.name,
                    entropy: {
                      groupIndex: mockHdAccount2.options.entropy.groupIndex,
                    },
                    pinned: false,
                    hidden: false,
                  },
                  accounts: [mockHdAccount2.id],
                },
              },
              metadata: {
                name: 'Wallet 2',
                entropy: {
                  id: MOCK_HD_KEYRING_2.metadata.id,
                },
              },
            },
          },
          selectedAccountGroup: expect.any(String), // Will be set after init
        },
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
      } as AccountTreeControllerState);
    });
  });

  describe('getAccountWalletObject', () => {
    it('gets a wallet using its ID', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });
      controller.init();

      const walletId = toAccountWalletId(
        AccountWalletType.Entropy,
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const wallet = controller.getAccountWalletObject(walletId);
      expect(wallet).toBeDefined();
    });

    it('gets undefined is wallet ID if not matching any wallet', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });
      controller.init();

      const badGroupId: AccountWalletId = 'entropy:unknown';

      const wallet = controller.getAccountWalletObject(badGroupId);
      expect(wallet).toBeUndefined();
    });
  });

  describe('getAccountWalletObjects', () => {
    it('gets all wallets', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });
      controller.init();

      const wallets = controller.getAccountWalletObjects();
      expect(wallets).toHaveLength(2);
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

    it('updates AccountsController selected account (with EVM account) when selectedAccountGroup changes', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      const setSelectedAccountSpy = jest.spyOn(messenger, 'call');

      controller.init();

      const expectedWalletId2 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedGroupId2 = toMultichainAccountGroupId(
        expectedWalletId2,
        MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
      );

      controller.setSelectedAccountGroup(expectedGroupId2);

      expect(setSelectedAccountSpy).toHaveBeenCalledWith(
        'AccountsController:setSelectedAccount',
        expect.any(String),
      );
    });

    it('updates AccountsController selected account (with non-EVM account) when selectedAccountGroup changes', () => {
      const nonEvmAccount2 = {
        ...MOCK_SNAP_ACCOUNT_1,
        options: {
          ...MOCK_SNAP_ACCOUNT_1.options,
          entropy: {
            ...MOCK_SNAP_ACCOUNT_1.options.entropy,
            id: MOCK_HD_KEYRING_2.metadata.id, // Wallet 2.
            groupIndex: 0, // Account 1
          },
        },
      } as const;
      const { controller, messenger } = setup({
        accounts: [
          MOCK_HD_ACCOUNT_1,
          nonEvmAccount2, // Wallet 2 > Account 1.
        ],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      const setSelectedAccountSpy = jest.spyOn(messenger, 'call');

      controller.init();

      const expectedWalletId2 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedGroupId2 = toMultichainAccountGroupId(
        expectedWalletId2,
        nonEvmAccount2.options.entropy.groupIndex,
      );

      controller.setSelectedAccountGroup(expectedGroupId2);

      expect(setSelectedAccountSpy).toHaveBeenLastCalledWith(
        'AccountsController:setSelectedAccount',
        nonEvmAccount2.id,
      );
    });

    it('is idempotent - setting same selectedAccountGroup should not trigger AccountsController update', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      const setSelectedAccountSpy = jest.spyOn(messenger, 'call');

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(
        expectedWalletId,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

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

      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

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
      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

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
      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

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
      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );
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
      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );
      controller.setSelectedAccountGroup(expectedGroupId1);

      const expectedWalletId2 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const expectedGroupId2 = toMultichainAccountGroupId(
        expectedWalletId2,
        MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
      );

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

    it('handles removal gracefully when account is not found in reverse mapping', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();
      const initialState = { ...controller.state };

      // Try to remove an account that was never added
      const unknownAccountId = 'unknown-account-id';
      messenger.publish('AccountsController:accountRemoved', unknownAccountId);

      // State should remain unchanged
      expect(controller.state).toStrictEqual(initialState);
    });

    it('handles edge cases gracefully in account removal', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      expect(() => {
        messenger.publish(
          'AccountsController:accountRemoved',
          'non-existent-account',
        );
      }).not.toThrow();

      expect(controller.getSelectedAccountGroup()).not.toBe('');
    });
  });

  describe('Persistence - Custom Names', () => {
    it('persists custom account group names across init calls', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId1,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      const customName = 'My Custom Trading Group';
      controller.setAccountGroupName(expectedGroupId1, customName);

      // Re-init to test persistence
      controller.init();

      const wallet = controller.state.accountTree.wallets[expectedWalletId1];
      const group = wallet?.groups[expectedGroupId1];
      expect(group?.metadata.name).toBe(customName);

      expect(
        controller.state.accountGroupsMetadata[expectedGroupId1],
      ).toStrictEqual({
        name: {
          value: customName,
          lastUpdatedAt: expect.any(Number),
        },
      });
    });

    it('persists custom account wallet names across init calls', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      controller.init();

      const expectedWalletId1 = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );

      const customName = 'My Primary Wallet';
      controller.setAccountWalletName(expectedWalletId1, customName);

      controller.init();

      const wallet = controller.state.accountTree.wallets[expectedWalletId1];
      expect(wallet?.metadata.name).toBe(customName);

      expect(
        controller.state.accountWalletsMetadata[expectedWalletId1],
      ).toStrictEqual({
        name: {
          value: customName,
          lastUpdatedAt: expect.any(Number),
        },
      });
    });

    it('custom names take priority over default rule-generated names', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(
        expectedWalletId,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      // Check default names
      const walletBeforeCustom =
        controller.state.accountTree.wallets[expectedWalletId];
      const groupBeforeCustom = walletBeforeCustom?.groups[expectedGroupId];
      const defaultWalletName = walletBeforeCustom?.metadata.name;
      const defaultGroupName = groupBeforeCustom?.metadata.name;

      // Set custom names
      const customWalletName = 'Custom Wallet Name';
      const customGroupName = 'Custom Group Name';
      controller.setAccountWalletName(expectedWalletId, customWalletName);
      controller.setAccountGroupName(expectedGroupId, customGroupName);

      // Verify custom names override defaults
      const walletAfterCustom =
        controller.state.accountTree.wallets[expectedWalletId];
      const groupAfterCustom = walletAfterCustom?.groups[expectedGroupId];

      expect(walletAfterCustom?.metadata.name).toBe(customWalletName);
      expect(walletAfterCustom?.metadata.name).not.toBe(defaultWalletName);
      expect(groupAfterCustom?.metadata.name).toBe(customGroupName);
      expect(groupAfterCustom?.metadata.name).not.toBe(defaultGroupName);
    });

    it('updates lastUpdatedAt when setting custom names', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(
        expectedWalletId,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      const beforeTime = Date.now();

      controller.setAccountWalletName(expectedWalletId, 'Test Wallet');
      controller.setAccountGroupName(expectedGroupId, 'Test Group');

      const afterTime = Date.now();

      const walletMetadata =
        controller.state.accountWalletsMetadata[expectedWalletId];
      const groupMetadata =
        controller.state.accountGroupsMetadata[expectedGroupId];

      expect(walletMetadata?.name?.lastUpdatedAt).toBeGreaterThanOrEqual(
        beforeTime,
      );
      expect(walletMetadata?.name?.lastUpdatedAt).toBeLessThanOrEqual(
        afterTime,
      );
      expect(groupMetadata?.name?.lastUpdatedAt).toBeGreaterThanOrEqual(
        beforeTime,
      );
      expect(groupMetadata?.name?.lastUpdatedAt).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Persistence - Pinning and Hiding', () => {
    it('persists account group pinned state across init calls', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(
        expectedWalletId,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      // Set pinned state
      controller.setAccountGroupPinned(expectedGroupId, true);

      // Re-init to test persistence
      controller.init();

      // Verify pinned state persists
      expect(
        controller.state.accountGroupsMetadata[expectedGroupId],
      ).toStrictEqual({
        pinned: {
          value: true,
          lastUpdatedAt: expect.any(Number),
        },
      });
    });

    it('persists account group hidden state across init calls', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(
        expectedWalletId,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      // Set hidden state
      controller.setAccountGroupHidden(expectedGroupId, true);

      // Re-init to test persistence
      controller.init();

      // Verify hidden state persists
      expect(
        controller.state.accountGroupsMetadata[expectedGroupId],
      ).toStrictEqual({
        hidden: {
          value: true,
          lastUpdatedAt: expect.any(Number),
        },
      });
    });

    it('updates lastUpdatedAt when setting pinned/hidden state', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(
        expectedWalletId,
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      const beforeTime = Date.now();

      controller.setAccountGroupPinned(expectedGroupId, true);

      const afterTime = Date.now();

      const groupMetadata =
        controller.state.accountGroupsMetadata[expectedGroupId];
      expect(groupMetadata?.pinned?.lastUpdatedAt).toBeGreaterThanOrEqual(
        beforeTime,
      );
      expect(groupMetadata?.pinned?.lastUpdatedAt).toBeLessThanOrEqual(
        afterTime,
      );
    });
  });

  describe('Persistence - State Structure', () => {
    it('initializes with empty metadata maps', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      expect(controller.state.accountGroupsMetadata).toStrictEqual({});
      expect(controller.state.accountWalletsMetadata).toStrictEqual({});
    });

    it('preserves existing metadata when initializing with partial state', () => {
      const existingGroupMetadata = {
        'test-group-id': {
          name: {
            value: 'Existing Group',
            lastUpdatedAt: 123456789,
          },
          pinned: {
            value: true,
            lastUpdatedAt: 123456789,
          },
        },
      };
      const existingWalletMetadata = {
        'test-wallet-id': {
          name: {
            value: 'Existing Wallet',
            lastUpdatedAt: 123456789,
          },
        },
      };

      const { controller } = setup({
        state: {
          accountGroupsMetadata: existingGroupMetadata,
          accountWalletsMetadata: existingWalletMetadata,
        },
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      expect(controller.state.accountGroupsMetadata).toStrictEqual(
        existingGroupMetadata,
      );
      expect(controller.state.accountWalletsMetadata).toStrictEqual(
        existingWalletMetadata,
      );
    });

    it('throws error when setting metadata for non-existent groups/wallets', () => {
      const { controller } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const nonExistentGroupId = 'non-existent-group-id' as AccountGroupId;
      const nonExistentWalletId = 'non-existent-wallet-id' as AccountWalletId;

      // Should throw for non-existent group operations
      expect(() => {
        controller.setAccountGroupName(nonExistentGroupId, 'Test Name');
      }).toThrow(
        `Account group with ID "${nonExistentGroupId}" not found in tree`,
      );

      expect(() => {
        controller.setAccountGroupPinned(nonExistentGroupId, true);
      }).toThrow(
        `Account group with ID "${nonExistentGroupId}" not found in tree`,
      );

      expect(() => {
        controller.setAccountGroupHidden(nonExistentGroupId, true);
      }).toThrow(
        `Account group with ID "${nonExistentGroupId}" not found in tree`,
      );

      // Should throw for non-existent wallet operations
      expect(() => {
        controller.setAccountWalletName(nonExistentWalletId, 'Test Wallet');
      }).toThrow(
        `Account wallet with ID "${nonExistentWalletId}" not found in tree`,
      );

      // Metadata should NOT be stored since the operations threw
      expect(
        controller.state.accountGroupsMetadata[nonExistentGroupId],
      ).toBeUndefined();
      expect(
        controller.state.accountWalletsMetadata[nonExistentWalletId],
      ).toBeUndefined();
    });
  });

  describe('Fallback Naming', () => {
    it('uses consistent default naming regardless of account import time', () => {
      const mockAccount1: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_1.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0,
          },
        },
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          importTime: Date.now() + 1000, // Import time no longer affects naming
        },
      };

      const mockAccount2: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_2,
        options: {
          ...MOCK_HD_ACCOUNT_2.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_2.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 1,
          },
        },
        metadata: {
          ...MOCK_HD_ACCOUNT_2.metadata,
          importTime: Date.now() - 1000, // Import time no longer affects naming
        },
      };

      const { controller } = setup({
        accounts: [mockAccount2, mockAccount1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );

      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId,
        mockAccount1.options.entropy.groupIndex,
      );

      const expectedGroupId2 = toMultichainAccountGroupId(
        expectedWalletId,
        mockAccount2.options.entropy.groupIndex,
      );

      const wallet = controller.state.accountTree.wallets[expectedWalletId];
      const group1 = wallet?.groups[expectedGroupId1];
      const group2 = wallet?.groups[expectedGroupId2];

      // Groups should use consistent default naming regardless of import time
      // This verifies that the serviceStartTime inconsistency bug has been fixed
      expect(group1?.metadata.name).toBe('Account 1');
      expect(group2?.metadata.name).toBe('Account 2');
    });

    it('uses fallback naming when rule-based naming returns empty string', () => {
      // Create accounts with empty names to trigger fallback naming
      const mockAccountWithEmptyName1: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'account-1',
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: '', // Empty name will cause rule-based naming to fail
        },
      };

      const mockAccountWithEmptyName2: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'account-2',
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_1.options.entropy,
            groupIndex: 1, // Different group index
          },
        },
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: '', // Empty name will cause rule-based naming to fail
        },
      };

      const { controller } = setup({
        accounts: [mockAccountWithEmptyName1, mockAccountWithEmptyName2],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );

      const expectedGroupId1 = toMultichainAccountGroupId(
        expectedWalletId,
        0, // First group
      );

      const expectedGroupId2 = toMultichainAccountGroupId(
        expectedWalletId,
        1, // Second group
      );

      const wallet = controller.state.accountTree.wallets[expectedWalletId];
      const group1 = wallet?.groups[expectedGroupId1];
      const group2 = wallet?.groups[expectedGroupId2];

      // Verify fallback naming: "Account 1", "Account 2" within the same wallet
      expect(group1?.metadata.name).toBe('Account 1');
      expect(group2?.metadata.name).toBe('Account 2');
    });

    it('handles adding new accounts to existing groups correctly', () => {
      // Create an existing account
      const existingAccount: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'existing-account',
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_1.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0,
          },
        },
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: '', // Empty name to trigger naming logic
          importTime: Date.now() - 1000,
        },
      };

      // Create a new account for the same group
      const newAccount: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'new-account',
        options: {
          ...MOCK_HD_ACCOUNT_1.options,
          entropy: {
            ...MOCK_HD_ACCOUNT_1.options.entropy,
            id: MOCK_HD_KEYRING_1.metadata.id,
            groupIndex: 0, // Same group as existing account
          },
        },
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: '', // Empty name to trigger naming logic
          importTime: Date.now() + 1000, // Import time no longer affects naming
        },
      };

      const { controller, messenger, mocks } = setup({
        accounts: [existingAccount],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      // Add the new account to the existing group
      mocks.AccountsController.accounts = [existingAccount, newAccount];
      messenger.publish('AccountsController:accountAdded', newAccount);

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(
        expectedWalletId,
        0, // Same group index
      );

      const wallet = controller.state.accountTree.wallets[expectedWalletId];
      const group = wallet?.groups[expectedGroupId];

      // The group should use consistent default naming
      expect(group?.metadata.name).toBe('Account 1');
      expect(group?.accounts).toHaveLength(2);
      expect(group?.accounts).toContain(existingAccount.id);
      expect(group?.accounts).toContain(newAccount.id);
    });

    it('uses default naming when rule-based naming returns empty', () => {
      // Create an account with empty name to trigger fallback to default naming
      const mockAccountWithEmptyName: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'account-with-empty-name',
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: '',
          importTime: Date.now() - 1000,
        },
      };

      const { controller } = setup({
        accounts: [mockAccountWithEmptyName],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(expectedWalletId, 0);

      const wallet = controller.state.accountTree.wallets[expectedWalletId];
      const group = wallet?.groups[expectedGroupId];

      // Should use computed name first, then fallback to default
      // Since the account has empty name, computed name will be empty, so it falls back to default
      expect(group?.metadata.name).toBe('Account 1');
    });

    it('prevents chain-specific names like "Solana Account 2" from becoming group names', () => {
      // Create a mock Solana account that would have caused the naming bug
      const mockSolanaAccount: Bip44Account<InternalAccount> = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'solana-account-id',
        type: 'solana:data-account' as any, // Non-EVM account type
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: 'Solana Account 2', // This should NOT become the group name
          importTime: Date.now() - 1000, // Old account
        },
      };

      const { controller } = setup({
        accounts: [mockSolanaAccount],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const expectedWalletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const expectedGroupId = toMultichainAccountGroupId(expectedWalletId, 0);

      const wallet = controller.state.accountTree.wallets[expectedWalletId];
      const group = wallet?.groups[expectedGroupId];

      // The group should use default naming "Account 1", not "Solana Account 2"
      // This verifies the fix for Daniel's reported bug
      expect(group?.metadata.name).toBe('Account 1');
      expect(group?.metadata.name).not.toBe('Solana Account 2');
    });
  });

  describe('actions', () => {
    const walletId = toMultichainAccountWalletId(MOCK_HD_KEYRING_1.metadata.id);
    const groupId = toMultichainAccountGroupId(
      walletId,
      MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
    );

    it('gets a multichain account with AccountTreeController:getSelectedAccountGroup', () => {
      const spy = jest.spyOn(
        AccountTreeController.prototype,
        'getSelectedAccountGroup',
      );

      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      messenger.call('AccountTreeController:getSelectedAccountGroup');
      expect(spy).toHaveBeenCalled();
    });

    it('gets a multichain account with AccountTreeController:setSelectedAccountGroup', () => {
      const spy = jest.spyOn(
        AccountTreeController.prototype,
        'setSelectedAccountGroup',
      );

      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      messenger.call('AccountTreeController:setSelectedAccountGroup', groupId);
      expect(spy).toHaveBeenCalledWith(groupId);
    });

    it('gets a multichain account with AccountTreeController:getAccountsFromSelectedAccountGroup', () => {
      const spy = jest.spyOn(
        AccountTreeController.prototype,
        'getAccountsFromSelectedAccountGroup',
      );

      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      messenger.call(
        'AccountTreeController:getAccountsFromSelectedAccountGroup',
      );
      expect(spy).toHaveBeenCalled();
    });

    it('gets a multichain account with AccountTreeController:setAccountWalletName', () => {
      const spy = jest.spyOn(
        AccountTreeController.prototype,
        'setAccountWalletName',
      );

      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const name = 'Test';

      messenger.call(
        'AccountTreeController:setAccountWalletName',
        walletId,
        name,
      );
      expect(spy).toHaveBeenCalledWith(walletId, name);
    });

    it('gets a multichain account with AccountTreeController:setAccountGroupName', () => {
      const spy = jest.spyOn(
        AccountTreeController.prototype,
        'setAccountGroupName',
      );

      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const name = 'Test';

      messenger.call(
        'AccountTreeController:setAccountGroupName',
        groupId,
        name,
      );
      expect(spy).toHaveBeenCalledWith(groupId, name);
    });

    it('gets a multichain account with AccountTreeController:setAccountGroupPinned', () => {
      const spy = jest.spyOn(
        AccountTreeController.prototype,
        'setAccountGroupPinned',
      );

      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const pinned = true;

      messenger.call(
        'AccountTreeController:setAccountGroupPinned',
        groupId,
        pinned,
      );
      expect(spy).toHaveBeenCalledWith(groupId, pinned);
    });

    it('gets a multichain account with AccountTreeController:setAccountGroupHidden', () => {
      const spy = jest.spyOn(
        AccountTreeController.prototype,
        'setAccountGroupHidden',
      );

      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      controller.init();

      const hidden = false;

      messenger.call(
        'AccountTreeController:setAccountGroupHidden',
        groupId,
        hidden,
      );
      expect(spy).toHaveBeenCalledWith(groupId, hidden);
    });
  });

  describe('Event Emissions', () => {
    it('does NOT emit accountTreeChange when tree is initialized', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      const accountTreeChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:accountTreeChange',
        accountTreeChangeListener,
      );

      controller.init();

      expect(accountTreeChangeListener).not.toHaveBeenCalled();
    });

    it('emits accountTreeChange when account is added', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      const accountTreeChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:accountTreeChange',
        accountTreeChangeListener,
      );

      controller.init();
      jest.clearAllMocks();

      messenger.publish('AccountsController:accountAdded', {
        ...MOCK_HD_ACCOUNT_2,
      });

      expect(accountTreeChangeListener).toHaveBeenCalledWith(
        controller.state.accountTree,
      );
      expect(accountTreeChangeListener).toHaveBeenCalledTimes(1);
    });

    it('emits accountTreeChange when account is removed', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      const accountTreeChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:accountTreeChange',
        accountTreeChangeListener,
      );

      controller.init();
      jest.clearAllMocks();

      messenger.publish(
        'AccountsController:accountRemoved',
        MOCK_HD_ACCOUNT_2.id,
      );

      expect(accountTreeChangeListener).toHaveBeenCalledWith(
        controller.state.accountTree,
      );
      expect(accountTreeChangeListener).toHaveBeenCalledTimes(1);
    });

    it('emits selectedAccountGroupChange when account removal causes empty group and auto-selection', () => {
      // Set up with two accounts in different groups to ensure group change on removal
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_SNAP_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      const selectedAccountGroupChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:selectedAccountGroupChange',
        selectedAccountGroupChangeListener,
      );

      controller.init();

      // Set selected group to be the group we're about to empty
      const walletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const groupId = toMultichainAccountGroupId(walletId, 1);
      controller.setSelectedAccountGroup(groupId);

      jest.clearAllMocks();

      // Remove the only account in the selected group, which should trigger auto-selection
      messenger.publish(
        'AccountsController:accountRemoved',
        MOCK_SNAP_ACCOUNT_1.id,
      );

      const newSelectedGroup =
        controller.state.accountTree.selectedAccountGroup;

      expect(selectedAccountGroupChangeListener).toHaveBeenCalledWith(
        newSelectedGroup,
        groupId,
      );
      expect(selectedAccountGroupChangeListener).toHaveBeenCalledTimes(1);
    });

    it('emits selectedAccountGroupChange when tree is initialized', () => {
      const { controller, messenger, mocks } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      mocks.AccountsController.getSelectedAccount.mockImplementation(
        () => MOCK_HD_ACCOUNT_1,
      );

      const selectedAccountGroupChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:selectedAccountGroupChange',
        selectedAccountGroupChangeListener,
      );

      controller.init();

      const defaultAccountGroupId = toMultichainAccountGroupId(
        toMultichainAccountWalletId(MOCK_HD_ACCOUNT_1.options.entropy.id),
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      expect(selectedAccountGroupChangeListener).toHaveBeenCalledWith(
        defaultAccountGroupId,
        '',
      );
    });

    it('emits selectedAccountGroupChange when tree is re-initialized and current selected group no longer exists', () => {
      const { controller, messenger, mocks } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      mocks.AccountsController.getSelectedAccount.mockImplementation(
        () => MOCK_HD_ACCOUNT_1,
      );

      controller.init();

      const defaultAccountGroupId = toMultichainAccountGroupId(
        toMultichainAccountWalletId(MOCK_HD_ACCOUNT_1.options.entropy.id),
        MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
      );

      expect(controller.state.accountTree.selectedAccountGroup).toStrictEqual(
        defaultAccountGroupId,
      );

      const selectedAccountGroupChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:selectedAccountGroupChange',
        selectedAccountGroupChangeListener,
      );

      mocks.AccountsController.accounts = [MOCK_HD_ACCOUNT_2];
      mocks.KeyringController.keyrings = [MOCK_HD_KEYRING_2];
      mocks.AccountsController.getSelectedAccount.mockImplementation(
        () => MOCK_HD_ACCOUNT_2,
      );

      controller.init();

      const oldDefaultAccountGroupId = defaultAccountGroupId;
      const newDefaultAccountGroupId = toMultichainAccountGroupId(
        toMultichainAccountWalletId(MOCK_HD_ACCOUNT_2.options.entropy.id),
        MOCK_HD_ACCOUNT_2.options.entropy.groupIndex,
      );

      expect(controller.state.accountTree.selectedAccountGroup).toStrictEqual(
        newDefaultAccountGroupId,
      );
      expect(selectedAccountGroupChangeListener).toHaveBeenCalledWith(
        newDefaultAccountGroupId,
        oldDefaultAccountGroupId,
      );
    });

    it('emits selectedAccountGroupChange when setSelectedAccountGroup is called', () => {
      // Use different keyring types to ensure different groups
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_SNAP_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      const selectedAccountGroupChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:selectedAccountGroupChange',
        selectedAccountGroupChangeListener,
      );

      controller.init();

      const initialSelectedGroup =
        controller.state.accountTree.selectedAccountGroup;
      const walletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_2.metadata.id,
      );
      const targetGroupId = toMultichainAccountGroupId(walletId, 1);

      jest.clearAllMocks();

      controller.setSelectedAccountGroup(targetGroupId);

      expect(selectedAccountGroupChangeListener).toHaveBeenCalledWith(
        targetGroupId,
        initialSelectedGroup,
      );
      expect(selectedAccountGroupChangeListener).toHaveBeenCalledTimes(1);
    });

    it('emits selectedAccountGroupChange when selected account changes via AccountsController', () => {
      // Use different keyring types to ensure different groups
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1, MOCK_SNAP_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1, MOCK_HD_KEYRING_2],
      });

      const selectedAccountGroupChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:selectedAccountGroupChange',
        selectedAccountGroupChangeListener,
      );

      controller.init();

      const initialSelectedGroup =
        controller.state.accountTree.selectedAccountGroup;

      jest.clearAllMocks();

      messenger.publish(
        'AccountsController:selectedAccountChange',
        MOCK_SNAP_ACCOUNT_1,
      );

      const newSelectedGroup =
        controller.state.accountTree.selectedAccountGroup;

      expect(selectedAccountGroupChangeListener).toHaveBeenCalledWith(
        newSelectedGroup,
        initialSelectedGroup,
      );
      expect(selectedAccountGroupChangeListener).toHaveBeenCalledTimes(1);
    });

    it('does NOT emit selectedAccountGroupChange when the same account group is already selected', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      const selectedAccountGroupChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:selectedAccountGroupChange',
        selectedAccountGroupChangeListener,
      );

      controller.init();

      jest.clearAllMocks();

      // Try to trigger selectedAccountChange with same account
      messenger.publish(
        'AccountsController:selectedAccountChange',
        MOCK_HD_ACCOUNT_1,
      );

      expect(selectedAccountGroupChangeListener).not.toHaveBeenCalled();
    });

    it('does NOT emit selectedAccountGroupChange when setSelectedAccountGroup is called with same group', () => {
      const { controller, messenger } = setup({
        accounts: [MOCK_HD_ACCOUNT_1],
        keyrings: [MOCK_HD_KEYRING_1],
      });

      const selectedAccountGroupChangeListener = jest.fn();
      messenger.subscribe(
        'AccountTreeController:selectedAccountGroupChange',
        selectedAccountGroupChangeListener,
      );

      controller.init();

      const walletId = toMultichainAccountWalletId(
        MOCK_HD_KEYRING_1.metadata.id,
      );
      const groupId = toMultichainAccountGroupId(walletId, 0);

      jest.clearAllMocks();

      controller.setSelectedAccountGroup(groupId);

      expect(selectedAccountGroupChangeListener).not.toHaveBeenCalled();
    });
  });
});
