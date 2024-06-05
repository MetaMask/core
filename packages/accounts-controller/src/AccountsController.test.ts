import { ControllerMessenger } from '@metamask/base-controller';
import type {
  InternalAccount,
  InternalAccountType,
} from '@metamask/keyring-api';
import {
  BtcAccountType,
  BtcMethod,
  EthAccountType,
  EthMethod,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { SnapControllerState } from '@metamask/snaps-controllers';
import { SnapStatus } from '@metamask/snaps-utils';
import type { CaipChainId } from '@metamask/utils';
import * as uuid from 'uuid';
import type { V4Options } from 'uuid';

import type {
  AccountsControllerActions,
  AccountsControllerEvents,
  AccountsControllerState,
  AllowedActions,
  AllowedEvents,
} from './AccountsController';
import { AccountsController } from './AccountsController';
import { createMockInternalAccount } from './tests/mocks';
import {
  getUUIDOptionsFromAddressOfNormalAccount,
  keyringTypeToName,
} from './utils';

jest.mock('uuid');
const mockUUID = jest.spyOn(uuid, 'v4');
const actualUUID = jest.requireActual('uuid').v4; // We also use uuid.v4 in our mocks

const defaultState: AccountsControllerState = {
  internalAccounts: {
    accounts: {},
    selectedAccount: '',
  },
};

const mockGetKeyringForAccount = jest.fn();
const mockGetKeyringByType = jest.fn();
const mockGetAccounts = jest.fn();

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const ETH_ERC_4337_METHODS = [
  EthMethod.PatchUserOperation,
  EthMethod.PrepareUserOperation,
  EthMethod.SignUserOperation,
] as const;

const mockAccount: InternalAccount = {
  id: 'mock-id',
  address: '0x123',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  metadata: {
    name: 'Account 1',
    keyring: { type: KeyringTypes.hd },
    importTime: 1691565967600,
    lastSelected: 1691565967656,
  },
};

const mockAccount2: InternalAccount = {
  id: 'mock-id2',
  address: '0x1234',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  metadata: {
    name: 'Account 2',
    keyring: { type: KeyringTypes.hd },
    importTime: 1691565967600,
    lastSelected: 1955565967656,
  },
};

const mockAccount3: InternalAccount = {
  id: 'mock-id3',
  address: '0x3333',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  metadata: {
    name: '',
    keyring: { type: KeyringTypes.snap },
    snap: {
      enabled: true,
      id: 'mock-snap-id',
      name: 'snap-name',
    },
    importTime: 1691565967600,
    lastSelected: 1955565967656,
  },
};

const mockAccount4: InternalAccount = {
  id: 'mock-id4',
  address: '0x4444',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  metadata: {
    name: 'Custom Name',
    keyring: { type: KeyringTypes.snap },
    snap: {
      enabled: true,
      id: 'mock-snap-id',
      name: 'snap-name',
    },
    importTime: 1955565967656,
    lastSelected: 1955565967656,
  },
};

/**
 * Mock generated normal account ID to an actual "hard-coded" one.
 */
class MockNormalAccountUUID {
  #accountIds: Record<string, string> = {};

  constructor(accounts: InternalAccount[]) {
    for (const account of accounts) {
      const accountId = actualUUID(
        getUUIDOptionsFromAddressOfNormalAccount(account.address),
      );

      // Register "hard-coded" (from test) account ID with the actual account UUID
      this.#accountIds[accountId] = account.id;
    }
  }

  mock(options?: V4Options | undefined) {
    const accountId = actualUUID(options);

    // If not found, we returns the generated UUID
    return this.#accountIds[accountId] ?? accountId;
  }
}

/**
 * Creates an `InternalAccount` object from the given normal account properties.
 *
 * @param props - The properties of the normal account.
 * @param props.id - The ID of the account.
 * @param props.name - The name of the account.
 * @param props.address - The address of the account.
 * @param props.keyringType - The type of the keyring associated with the account.
 * @param props.snapId - The id of the snap.
 * @param props.snapEnabled - The status of the snap
 * @param props.type - Account Type to create
 * @param props.importTime - The import time of the account.
 * @param props.lastSelected - The last selected time of the account.
 * @returns The `InternalAccount` object created from the normal account properties.
 */
function createExpectedInternalAccount({
  id,
  name,
  address,
  keyringType,
  snapId,
  snapEnabled = true,
  type = EthAccountType.Eoa,
  importTime,
  lastSelected,
}: {
  id: string;
  name: string;
  address: string;
  keyringType: string;
  snapId?: string;
  snapEnabled?: boolean;
  type?: InternalAccountType;
  importTime?: number;
  lastSelected?: number;
}): InternalAccount {
  const accountTypeToMethods = {
    [`${EthAccountType.Eoa}`]: [...Object.values(ETH_EOA_METHODS)],
    [`${EthAccountType.Erc4337}`]: [...Object.values(ETH_ERC_4337_METHODS)],
    [`${BtcAccountType.P2wpkh}`]: [...Object.values(BtcMethod)],
  };

  const methods =
    accountTypeToMethods[type as unknown as keyof typeof accountTypeToMethods];

  const account = {
    id,
    address,
    options: {},
    methods,
    type,
    metadata: {
      name,
      keyring: { type: keyringType },
      importTime: importTime || expect.any(Number),
      lastSelected: lastSelected || expect.any(Number),
    },
  } as InternalAccount;

  if (snapId) {
    account.metadata.snap = {
      id: snapId,
      name: 'snap-name',
      enabled: Boolean(snapEnabled),
    };
  }

  return account;
}

/**
 * Sets the `lastSelected` property of the given `account` to `expect.any(Number)`.
 *
 * @param account - The account to modify.
 * @returns The modified account.
 */
function setLastSelectedAsAny(account: InternalAccount): InternalAccount {
  const deepClonedAccount = JSON.parse(
    JSON.stringify({
      ...account,
      metadata: {
        ...account.metadata,
        lastSelected: expect.any(Number),
      },
    }),
  ) as InternalAccount;

  deepClonedAccount.metadata.lastSelected = expect.any(Number);
  deepClonedAccount.metadata.importTime = expect.any(Number);
  return deepClonedAccount;
}

/**
 * Builds a new instance of the ControllerMessenger class for the AccountsController.
 *
 * @returns A new instance of the ControllerMessenger class for the AccountsController.
 */
function buildMessenger() {
  return new ControllerMessenger<
    AccountsControllerActions | AllowedActions,
    AccountsControllerEvents | AllowedEvents
  >();
}

/**
 * Builds a restricted messenger for the AccountsController.
 *
 * @param messenger - The messenger to restrict.
 * @returns The restricted messenger.
 */
function buildAccountsControllerMessenger(messenger = buildMessenger()) {
  return messenger.getRestricted({
    name: 'AccountsController',
    allowedEvents: [
      'SnapController:stateChange',
      'KeyringController:stateChange',
    ],
    allowedActions: [
      'KeyringController:getAccounts',
      'KeyringController:getKeyringForAccount',
      'KeyringController:getKeyringsByType',
    ],
  });
}

/**
 * Sets up an instance of the AccountsController class with the given initial state and callbacks.
 *
 * @param options - The options object.
 * @param [options.initialState] - The initial state to use for the AccountsController.
 * @param [options.messenger] - Messenger to use for the AccountsController.
 * @returns An instance of the AccountsController class.
 */
function setupAccountsController({
  initialState = {},
  messenger = buildMessenger(),
}: {
  initialState?: Partial<AccountsControllerState>;
  messenger?: ControllerMessenger<
    AccountsControllerActions | AllowedActions,
    AccountsControllerEvents | AllowedEvents
  >;
}): {
  accountsController: AccountsController;
  messenger: ControllerMessenger<
    AccountsControllerActions | AllowedActions,
    AccountsControllerEvents | AllowedEvents
  >;
} {
  const accountsControllerMessenger =
    buildAccountsControllerMessenger(messenger);

  const accountsController = new AccountsController({
    messenger: accountsControllerMessenger,
    state: { ...defaultState, ...initialState },
  });
  return { accountsController, messenger };
}

describe('AccountsController', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('onSnapStateChange', () => {
    it('be used enable an account if the Snap is enabled and not blocked', async () => {
      const messenger = buildMessenger();
      const mockSnapAccount = createExpectedInternalAccount({
        id: 'mock-id',
        name: 'Snap Account 1',
        address: '0x0',
        keyringType: KeyringTypes.snap,
        snapId: 'mock-snap',
        snapEnabled: false,
      });
      const mockSnapChangeState = {
        snaps: {
          'mock-snap': {
            enabled: true,
            id: 'mock-snap',
            blocked: false,
            status: SnapStatus.Running,
          },
        },
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any as SnapControllerState;
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockSnapAccount.id]: mockSnapAccount,
            },
            selectedAccount: mockSnapAccount.id,
          },
        },
        messenger,
      });

      messenger.publish('SnapController:stateChange', mockSnapChangeState, []);

      const updatedAccount = accountsController.getAccountExpect(
        mockSnapAccount.id,
      );

      expect(updatedAccount.metadata.snap?.enabled).toBe(true);
    });

    it('be used disable an account if the Snap is disabled', async () => {
      const messenger = buildMessenger();
      const mockSnapAccount = createExpectedInternalAccount({
        id: 'mock-id',
        name: 'Snap Account 1',
        address: '0x0',
        keyringType: KeyringTypes.snap,
        snapId: 'mock-snap',
      });
      const mockSnapChangeState = {
        snaps: {
          'mock-snap': {
            enabled: false,
            id: 'mock-snap',
            blocked: false,
            status: SnapStatus.Running,
          },
        },
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any as SnapControllerState;
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockSnapAccount.id]: mockSnapAccount,
            },
            selectedAccount: mockSnapAccount.id,
          },
        },
        messenger,
      });

      messenger.publish('SnapController:stateChange', mockSnapChangeState, []);

      const updatedAccount = accountsController.getAccountExpect(
        mockSnapAccount.id,
      );

      expect(updatedAccount.metadata.snap?.enabled).toBe(false);
    });

    it('be used disable an account if the Snap is blocked', async () => {
      const messenger = buildMessenger();
      const mockSnapAccount = createExpectedInternalAccount({
        id: 'mock-id',
        name: 'Snap Account 1',
        address: '0x0',
        keyringType: KeyringTypes.snap,
        snapId: 'mock-snap',
      });
      const mockSnapChangeState = {
        snaps: {
          'mock-snap': {
            enabled: true,
            id: 'mock-snap',
            blocked: true,
            status: SnapStatus.Running,
          },
        },
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any as SnapControllerState;
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockSnapAccount.id]: mockSnapAccount,
            },
            selectedAccount: mockSnapAccount.id,
          },
        },
        messenger,
      });

      messenger.publish('SnapController:stateChange', mockSnapChangeState, []);

      const updatedAccount = accountsController.getAccountExpect(
        mockSnapAccount.id,
      );

      expect(updatedAccount.metadata.snap?.enabled).toBe(false);
    });
  });

  describe('onKeyringStateChange', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('not update state when only keyring is unlocked without any keyrings', async () => {
      const messenger = buildMessenger();
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        { isUnlocked: true, keyrings: [] },
        [],
      );

      const accounts = accountsController.listAccounts();

      expect(accounts).toStrictEqual([]);
    });

    it('only update if the keyring is unlocked and when there are keyrings', async () => {
      const messenger = buildMessenger();

      const mockNewKeyringState = {
        isUnlocked: false,
        keyrings: [
          {
            accounts: [mockAccount.address, mockAccount2.address],
            type: KeyringTypes.hd,
          },
        ],
      };
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      const accounts = accountsController.listAccounts();

      expect(accounts).toStrictEqual([]);
    });

    describe('adding accounts', () => {
      it('add new accounts', async () => {
        const messenger = buildMessenger();
        mockUUID
          .mockReturnValueOnce('mock-id') // call to check if its a new account
          .mockReturnValueOnce('mock-id2') // call to check if its a new account
          .mockReturnValueOnce('mock-id2'); // call to add account

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [mockAccount.address, mockAccount2.address],
            },
          ],
        };
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockAccount.id]: mockAccount,
                [mockAccount3.id]: mockAccount3,
              },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([
          mockAccount,
          setLastSelectedAsAny(mockAccount2),
        ]);
      });

      it('add Snap accounts', async () => {
        mockUUID.mockReturnValueOnce('mock-id'); // call to check if its a new account

        const messenger = buildMessenger();
        messenger.registerActionHandler(
          'KeyringController:getKeyringsByType',
          mockGetKeyringByType.mockReturnValue([
            {
              type: KeyringTypes.snap,
              getAccountByAddress: jest
                .fn()
                .mockReturnValueOnce(mockAccount3)
                .mockReturnValueOnce(mockAccount4),
            },
          ]),
        );

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [mockAccount.address],
            },
            {
              type: KeyringTypes.snap,
              accounts: [mockAccount3.address, mockAccount4.address],
            },
          ],
        };

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockAccount.id]: mockAccount,
                [mockAccount4.id]: mockAccount4,
              },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([
          mockAccount,
          setLastSelectedAsAny(mockAccount4),
          setLastSelectedAsAny(
            createExpectedInternalAccount({
              id: 'mock-id3',
              name: 'Snap Account 2',
              address: mockAccount3.address,
              keyringType: mockAccount3.metadata.keyring.type,
              snapId: mockAccount3.metadata.snap?.id,
            }),
          ),
        ]);
      });

      it('handle the event when a Snap deleted the account before the it was added', async () => {
        mockUUID.mockReturnValueOnce('mock-id'); // call to check if its a new account
        const messenger = buildMessenger();
        messenger.registerActionHandler(
          'KeyringController:getKeyringsByType',
          mockGetKeyringByType.mockReturnValue([
            {
              type: KeyringTypes.snap,
              getAccountByAddress: jest
                .fn()
                .mockReturnValueOnce(null)
                .mockReturnValueOnce(mockAccount4),
            },
          ]),
        );

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [mockAccount.address],
            },
            {
              type: KeyringTypes.snap,
              accounts: [mockAccount3.address, mockAccount4.address],
            },
          ],
        };

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockAccount.id]: mockAccount,
                [mockAccount4.id]: mockAccount4,
              },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([
          mockAccount,
          setLastSelectedAsAny(mockAccount4),
        ]);
      });

      it('increment the default account number when adding an account', async () => {
        const messenger = buildMessenger();
        mockUUID
          .mockReturnValueOnce('mock-id') // call to check if its a new account
          .mockReturnValueOnce('mock-id2') // call to check if its a new account
          .mockReturnValueOnce('mock-id3') // call to check if its a new account
          .mockReturnValueOnce('mock-id3'); // call to add account

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [
                mockAccount.address,
                mockAccount2.address,
                mockAccount3.address,
              ],
            },
          ],
        };
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockAccount.id]: mockAccount,
                [mockAccount2.id]: mockAccount2,
              },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([
          mockAccount,
          mockAccount2,
          setLastSelectedAsAny(
            createExpectedInternalAccount({
              id: 'mock-id3',
              name: 'Account 3',
              address: mockAccount3.address,
              keyringType: KeyringTypes.hd,
            }),
          ),
        ]);
      });

      it('use the next number after the total number of accounts of a keyring when adding an account, if the index is lower', async () => {
        const messenger = buildMessenger();
        mockUUID
          .mockReturnValueOnce('mock-id') // call to check if its a new account
          .mockReturnValueOnce('mock-id2') // call to check if its a new account
          .mockReturnValueOnce('mock-id3') // call to check if its a new account
          .mockReturnValueOnce('mock-id3'); // call to add account

        const mockAccount2WithCustomName = createExpectedInternalAccount({
          id: 'mock-id2',
          name: 'Custom Name',
          address: mockAccount2.address,
          keyringType: KeyringTypes.hd,
          importTime: 1955565967656,
          lastSelected: 1955565967656,
        });

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [
                mockAccount.address,
                mockAccount2.address,
                mockAccount3.address,
              ],
            },
          ],
        };
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockAccount.id]: mockAccount,
                [mockAccount2WithCustomName.id]: mockAccount2WithCustomName,
              },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts.map(setLastSelectedAsAny)).toStrictEqual([
          mockAccount,
          mockAccount2WithCustomName,
          createExpectedInternalAccount({
            id: 'mock-id3',
            name: 'Account 3',
            address: mockAccount3.address,
            keyringType: KeyringTypes.hd,
          }),
        ]);
      });

      it('handle when the account to set as selectedAccount is undefined', async () => {
        mockUUID.mockReturnValueOnce('mock-id'); // call to check if its a new account

        const messenger = buildMessenger();
        messenger.registerActionHandler(
          'KeyringController:getKeyringsByType',
          mockGetKeyringByType.mockReturnValue([
            {
              type: KeyringTypes.snap,
              getAccountByAddress: jest.fn().mockReturnValueOnce(null),
            },
          ]),
        );

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [],
            },
            {
              type: KeyringTypes.snap,
              accounts: [mockAccount3.address],
            },
          ],
        };

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {},
              selectedAccount: 'missing',
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const { selectedAccount } = accountsController.state.internalAccounts;

        expect(selectedAccount).toBe('');
      });
    });

    describe('deleting account', () => {
      it('delete accounts if its gone from the keyring state', async () => {
        const messenger = buildMessenger();
        mockUUID.mockReturnValueOnce('mock-id2');

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [mockAccount2.address],
            },
          ],
        };
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockAccount.id]: mockAccount,
                [mockAccount2.id]: mockAccount2,
              },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([setLastSelectedAsAny(mockAccount2)]);
        expect(accountsController.getSelectedAccount()).toStrictEqual(
          setLastSelectedAsAny(mockAccount2),
        );
      });

      it('delete accounts and set the most recent lastSelected account', async () => {
        const messenger = buildMessenger();
        mockUUID
          .mockReturnValueOnce('mock-id')
          .mockReturnValueOnce('mock-id2')
          .mockReturnValueOnce('mock-id')
          .mockReturnValueOnce('mock-id2');

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [mockAccount.address, mockAccount2.address],
            },
          ],
        };
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                'missing-account': {
                  id: 'missing-account',
                  address: '0x999',
                  metadata: {
                    keyring: {
                      type: KeyringTypes.hd,
                    },
                  },
                } as unknown as InternalAccount,
                [mockAccount.id]: mockAccount,
                [mockAccount2.id]: mockAccount2,
              },
              selectedAccount: 'missing-account',
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([
          setLastSelectedAsAny(mockAccount),
          setLastSelectedAsAny(mockAccount2),
        ]);
        expect(accountsController.getSelectedAccount()).toStrictEqual(
          setLastSelectedAsAny(mockAccount2),
        );
      });

      it('delete accounts and set the most recent lastSelected account when there are accounts that have never been selected', async () => {
        const messenger = buildMessenger();
        mockUUID
          .mockReturnValueOnce('mock-id')
          .mockReturnValueOnce('mock-id2')
          .mockReturnValueOnce('mock-id')
          .mockReturnValueOnce('mock-id2');

        const mockAccount2WithoutLastSelected = {
          ...mockAccount2,
          metadata: {
            ...mockAccount2.metadata,
            lastSelected: undefined,
          },
        };
        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [mockAccount.address, mockAccount2.address],
            },
          ],
        };
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                'missing-account': {
                  id: 'missing-account',
                  address: '0x999',
                  metadata: {
                    keyring: {
                      type: KeyringTypes.hd,
                    },
                  },
                } as unknown as InternalAccount,
                [mockAccount.id]: mockAccount,
                [mockAccount2.id]: mockAccount2WithoutLastSelected,
              },
              selectedAccount: 'missing-account',
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([
          setLastSelectedAsAny(mockAccount),
          mockAccount2WithoutLastSelected,
        ]);
        expect(accountsController.getSelectedAccount()).toStrictEqual(
          setLastSelectedAsAny(mockAccount),
        );
      });

      it('delete the account and select the account with the most recent lastSelected', async () => {
        const messenger = buildMessenger();
        mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');

        const mockAccountWithoutLastSelected = {
          ...mockAccount,
          metadata: {
            ...mockAccount.metadata,
            lastSelected: undefined,
          },
        };

        const mockAccount2WithoutLastSelected = {
          ...mockAccount2,
          metadata: {
            ...mockAccount2.metadata,
            lastSelected: undefined,
          },
        };

        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [
                mockAccountWithoutLastSelected.address,
                mockAccount2.address,
              ],
            },
          ],
        };
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                'missing-account': {
                  id: 'missing-account',
                  address: '0x999',
                  metadata: {
                    keyring: {
                      type: KeyringTypes.hd,
                    },
                  },
                  [mockAccount2.id]: mockAccount2WithoutLastSelected,
                } as unknown as InternalAccount,
                [mockAccount.id]: mockAccountWithoutLastSelected,
                [mockAccount2.id]: mockAccount2WithoutLastSelected,
              },
              selectedAccount: 'missing-account',
            },
          },
          messenger,
        });

        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const accounts = accountsController.listAccounts();

        expect(accounts).toStrictEqual([
          mockAccountWithoutLastSelected,
          mockAccount2WithoutLastSelected,
        ]);
        expect(accountsController.getSelectedAccount()).toStrictEqual(
          mockAccountWithoutLastSelected,
        );
      });
    });

    it('handle keyring reinitialization', async () => {
      const messenger = buildMessenger();
      const mockInitialAccount = createExpectedInternalAccount({
        id: 'mock-id',
        name: 'Account 1',
        address: '0x123',
        keyringType: KeyringTypes.hd,
      });
      const mockReinitialisedAccount = createExpectedInternalAccount({
        id: 'mock-id2',
        name: 'Account 1',
        address: '0x456',
        keyringType: KeyringTypes.hd,
      });
      mockUUID
        .mockReturnValueOnce('mock-id2') // call to check if its a new account
        .mockReturnValueOnce('mock-id2'); // call to add account

      const mockNewKeyringState = {
        isUnlocked: true,
        keyrings: [
          {
            type: KeyringTypes.hd,
            accounts: [mockReinitialisedAccount.address],
          },
        ],
      };
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockInitialAccount.id]: mockInitialAccount,
            },
            selectedAccount: mockInitialAccount.id,
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      const selectedAccount = accountsController.getSelectedAccount();
      const accounts = accountsController.listAccounts();
      const expectedAccount = setLastSelectedAsAny(mockReinitialisedAccount);

      expect(selectedAccount).toStrictEqual(expectedAccount);
      expect(accounts).toStrictEqual([expectedAccount]);
    });

    it.each([
      {
        lastSelectedForAccount1: 1111,
        lastSelectedForAccount2: 9999,
        expectedSelectedId: 'mock-id2',
      },
      {
        lastSelectedForAccount1: undefined,
        lastSelectedForAccount2: 9999,
        expectedSelectedId: 'mock-id2',
      },
      {
        lastSelectedForAccount1: 1111,
        lastSelectedForAccount2: undefined,
        expectedSelectedId: 'mock-id',
      },
      {
        lastSelectedForAccount1: 1111,
        lastSelectedForAccount2: 0,
        expectedSelectedId: 'mock-id',
      },
    ])(
      'handle keyring reinitialization with multiple accounts. Account 1 lastSelected $lastSelectedForAccount1, Account 2 lastSelected $lastSelectedForAccount2. Expected selected account: $expectedSelectedId',
      async ({
        lastSelectedForAccount1,
        lastSelectedForAccount2,
        expectedSelectedId,
      }) => {
        const messenger = buildMessenger();
        const mockExistingAccount1 = createExpectedInternalAccount({
          id: 'mock-id',
          name: 'Account 1',
          address: '0x123',
          keyringType: KeyringTypes.hd,
        });
        mockExistingAccount1.metadata.lastSelected = lastSelectedForAccount1;
        const mockExistingAccount2 = createExpectedInternalAccount({
          id: 'mock-id2',
          name: 'Account 2',
          address: '0x456',
          keyringType: KeyringTypes.hd,
        });
        mockExistingAccount2.metadata.lastSelected = lastSelectedForAccount2;

        mockUUID
          .mockReturnValueOnce('mock-id') // call to check if its a new account
          .mockReturnValueOnce('mock-id2'); // call to check if its a new account

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockExistingAccount1.id]: mockExistingAccount1,
                [mockExistingAccount2.id]: mockExistingAccount2,
              },
              selectedAccount: 'unknown',
            },
          },
          messenger,
        });
        const mockNewKeyringState = {
          isUnlocked: true,
          keyrings: [
            {
              type: KeyringTypes.hd,
              accounts: [
                mockExistingAccount1.address,
                mockExistingAccount2.address,
              ],
            },
          ],
        };
        messenger.publish(
          'KeyringController:stateChange',
          mockNewKeyringState,
          [],
        );

        const selectedAccount = accountsController.getSelectedAccount();

        expect(selectedAccount.id).toStrictEqual(expectedSelectedId);
      },
    );
  });

  describe('updateAccounts', () => {
    const mockAddress1 = '0x123';
    const mockAddress2 = '0x456';
    let mockSnapAccount: InternalAccount;
    let mockSnapAccount2: InternalAccount;

    // Creating deep clones
    beforeEach(() => {
      mockSnapAccount = JSON.parse(
        JSON.stringify({
          ...mockAccount,
          metadata: {
            ...mockAccount.metadata,
            keyring: {
              type: KeyringTypes.snap,
            },
            snap: {
              enabled: true,
              id: 'mock-snap-id',
              name: '',
            },
            lastSelected: undefined,
          },
        }),
      );
      mockSnapAccount2 = JSON.parse(
        JSON.stringify({
          ...mockAccount2,
          metadata: {
            ...mockAccount2.metadata,
            keyring: {
              type: KeyringTypes.snap,
            },
            snap: {
              enabled: true,
              id: 'mock-snap-id2',
              name: 'snap-name',
            },
            lastSelected: undefined,
          },
        }),
      );
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('update accounts with normal accounts', async () => {
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([mockAddress1, mockAddress2]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: KeyringTypes.hd }),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValue([
          {
            type: KeyringTypes.snap,
            listAccounts: async () => [],
          },
        ]),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });
      const expectedAccounts = [
        createExpectedInternalAccount({
          name: 'Account 1',
          id: 'mock-id',
          address: mockAddress1,
          keyringType: KeyringTypes.hd,
        }),
        createExpectedInternalAccount({
          name: 'Account 2',
          id: 'mock-id2',
          address: mockAddress2,
          keyringType: KeyringTypes.hd,
        }),
      ];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it('update accounts with Snap accounts when snap keyring is defined and has accounts', async () => {
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValue([
          {
            type: KeyringTypes.snap,
            listAccounts: async () => [mockSnapAccount, mockSnapAccount2],
          },
        ]),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });

      const expectedAccount1 = {
        ...mockSnapAccount,
        metadata: {
          ...mockSnapAccount.metadata,
          name: 'Snap Account 1',
          lastSelected: expect.any(Number),
          importTime: expect.any(Number),
        },
      };

      const expectedAccount2 = {
        ...mockSnapAccount2,
        metadata: {
          ...mockSnapAccount2.metadata,
          name: 'Snap Account 2',
          lastSelected: expect.any(Number),
          importTime: expect.any(Number),
        },
      };

      const expectedAccounts = [expectedAccount1, expectedAccount2];

      await accountsController.updateAccounts();

      expect(
        accountsController.listAccounts().map(setLastSelectedAsAny),
      ).toStrictEqual(expectedAccounts);
    });

    it('return an empty array if the Snap keyring is not defined', async () => {
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValueOnce([undefined]),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });

      const expectedAccounts: InternalAccount[] = [];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it('set the account with the correct index', async () => {
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([mockAddress1, mockAddress2]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: KeyringTypes.hd }),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValue([
          {
            type: KeyringTypes.snap,
            listAccounts: async () => [],
          },
        ]),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
        messenger,
      });
      const expectedAccounts = [
        mockAccount,
        createExpectedInternalAccount({
          name: 'Account 2',
          id: 'mock-id2',
          address: mockAddress2,
          keyringType: KeyringTypes.hd,
        }),
      ];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it('filter Snap accounts from normalAccounts', async () => {
      mockUUID.mockReturnValueOnce('mock-id');
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValueOnce([
          {
            type: KeyringTypes.snap,
            listAccounts: async () => [mockSnapAccount2],
          },
        ]),
      );

      // first account will be normal, second will be a snap account
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValue([mockAddress1, '0x1234']),
      );
      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount
          .mockResolvedValueOnce({ type: KeyringTypes.hd })
          .mockResolvedValueOnce({ type: KeyringTypes.snap }),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });
      const expectedAccounts = [
        createExpectedInternalAccount({
          name: 'Account 1',
          id: 'mock-id',
          address: mockAddress1,
          keyringType: KeyringTypes.hd,
        }),
        createExpectedInternalAccount({
          name: 'Snap Account 1', // it is Snap Account 1 because it is the only snap account
          id: mockSnapAccount2.id,
          address: mockSnapAccount2.address,
          keyringType: KeyringTypes.snap,
          snapId: 'mock-snap-id2',
        }),
      ];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it('filter Snap accounts from normalAccounts even if the snap account is listed before normal accounts', async () => {
      mockUUID.mockReturnValue('mock-id');
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValueOnce([
          {
            type: KeyringTypes.snap,
            listAccounts: async () => [mockSnapAccount2],
          },
        ]),
      );

      // first account will be normal, second will be a snap account
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValue(['0x1234', mockAddress1]),
      );
      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount
          .mockResolvedValueOnce({ type: KeyringTypes.snap })
          .mockResolvedValueOnce({ type: KeyringTypes.hd }),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });
      const expectedAccounts = [
        createExpectedInternalAccount({
          name: 'Account 1',
          id: 'mock-id',
          address: mockAddress1,
          keyringType: KeyringTypes.hd,
        }),
        createExpectedInternalAccount({
          name: 'Snap Account 1', // it is Snap Account 1 because it is the only snap account
          id: mockSnapAccount2.id,
          address: mockSnapAccount2.address,
          keyringType: KeyringTypes.snap,
          snapId: 'mock-snap-id2',
          snapEnabled: true,
        }),
      ];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it.each([
      KeyringTypes.simple,
      KeyringTypes.hd,
      KeyringTypes.trezor,
      KeyringTypes.ledger,
      KeyringTypes.lattice,
      KeyringTypes.qr,
      'Custody - JSON - RPC',
    ])('should add accounts for %s type', async (keyringType) => {
      mockUUID.mockReturnValue('mock-id');

      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValue([mockAddress1]),
      );
      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: keyringType }),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValue([
          {
            type: KeyringTypes.snap,
            listAccounts: async () => [],
          },
        ]),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });

      const expectedAccounts = [
        createExpectedInternalAccount({
          name: `${keyringTypeToName(keyringType)} 1`,
          id: 'mock-id',
          address: mockAddress1,
          keyringType,
        }),
      ];

      await accountsController.updateAccounts();

      expect(
        accountsController.listAccounts().map(setLastSelectedAsAny),
      ).toStrictEqual(expectedAccounts);
    });

    it('throw an error if the keyring type is unknown', async () => {
      mockUUID.mockReturnValue('mock-id');

      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValue([mockAddress1]),
      );
      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'unknown' }),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValue([
          {
            type: KeyringTypes.snap,
            listAccounts: async () => [],
          },
        ]),
      );

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        messenger,
      });

      await expect(accountsController.updateAccounts()).rejects.toThrow(
        'Unknown keyring unknown',
      );
    });
  });

  describe('loadBackup', () => {
    it('load a backup', async () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
      });

      accountsController.loadBackup({
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
          },
          selectedAccount: mockAccount.id,
        },
      });

      expect(accountsController.state).toStrictEqual({
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
          },
          selectedAccount: mockAccount.id,
        },
      });
    });

    it('not load backup if the data is undefined', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      // @ts-expect-error incorrect state
      accountsController.loadBackup({});

      expect(accountsController.state).toStrictEqual({
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
          },
          selectedAccount: mockAccount.id,
        },
      });
    });
  });

  describe('getAccount', () => {
    it('return an account by ID', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      const result = accountsController.getAccount(mockAccount.id);

      expect(result).toStrictEqual(
        setLastSelectedAsAny(mockAccount as InternalAccount),
      );
    });
    it('return undefined for an unknown account ID', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      const result = accountsController.getAccount("I don't exist");

      expect(result).toBeUndefined();
    });
  });

  describe('getSelectedAccount', () => {
    const mockNonEvmAccount = createExpectedInternalAccount({
      id: 'mock-non-evm',
      name: 'non-evm',
      address: 'bc1qzqc2aqlw8nwa0a05ehjkk7dgt8308ac7kzw9a6',
      keyringType: KeyringTypes.snap,
      type: BtcAccountType.P2wpkh,
    });

    const mockOlderEvmAccount = createExpectedInternalAccount({
      id: 'mock-id-1',
      name: 'mock account 1',
      address: 'mock-address-1',
      keyringType: KeyringTypes.hd,
      lastSelected: 11111,
    });
    const mockNewerEvmAccount = createExpectedInternalAccount({
      id: 'mock-id-2',
      name: 'mock account 2',
      address: 'mock-address-2',
      keyringType: KeyringTypes.hd,
      lastSelected: 22222,
    });

    it.each([
      {
        lastSelectedAccount: mockNewerEvmAccount,
        expected: mockNewerEvmAccount,
      },
      {
        lastSelectedAccount: mockOlderEvmAccount,
        expected: mockOlderEvmAccount,
      },
      {
        lastSelectedAccount: mockNonEvmAccount,
        expected: mockNewerEvmAccount,
      },
    ])(
      'last selected account type is $lastSelectedAccount.type should return the selectedAccount with id $expected.id',
      ({ lastSelectedAccount, expected }) => {
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockOlderEvmAccount.id]: mockOlderEvmAccount,
                [mockNewerEvmAccount.id]: mockNewerEvmAccount,
                [mockNonEvmAccount.id]: mockNonEvmAccount,
              },
              selectedAccount: lastSelectedAccount.id,
            },
          },
        });

        expect(accountsController.getSelectedAccount()).toStrictEqual(expected);
      },
    );

    it("throw error if there aren't any EVM accounts", () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockNonEvmAccount.id]: mockNonEvmAccount,
            },
            selectedAccount: mockNonEvmAccount.id,
          },
        },
      });

      expect(() => accountsController.getSelectedAccount()).toThrow(
        'No EVM accounts',
      );
    });
  });

  describe('getSelectedMultichainAccount', () => {
    const mockNonEvmAccount = createExpectedInternalAccount({
      id: 'mock-non-evm',
      name: 'non-evm',
      address: 'bc1qzqc2aqlw8nwa0a05ehjkk7dgt8308ac7kzw9a6',
      keyringType: KeyringTypes.snap,
      type: BtcAccountType.P2wpkh,
    });

    const mockOlderEvmAccount = createExpectedInternalAccount({
      id: 'mock-id-1',
      name: 'mock account 1',
      address: 'mock-address-1',
      keyringType: KeyringTypes.hd,
      lastSelected: 11111,
    });
    const mockNewerEvmAccount = createExpectedInternalAccount({
      id: 'mock-id-2',
      name: 'mock account 2',
      address: 'mock-address-2',
      keyringType: KeyringTypes.hd,
      lastSelected: 22222,
    });

    it.each([
      {
        chainId: undefined,
        selectedAccount: mockNewerEvmAccount,
        expected: mockNewerEvmAccount,
      },
      {
        chainId: undefined,
        selectedAccount: mockNonEvmAccount,
        expected: mockNonEvmAccount,
      },
      {
        chainId: 'eip155:1',
        selectedAccount: mockNonEvmAccount,
        expected: mockNewerEvmAccount,
      },
      {
        chainId: 'bip122:000000000019d6689c085ae165831e93',
        selectedAccount: mockNonEvmAccount,
        expected: mockNonEvmAccount,
      },
    ])(
      "chainId $chainId with selectedAccount '$selectedAccount.id' should return $expected.id",
      ({ chainId, selectedAccount, expected }) => {
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockOlderEvmAccount.id]: mockOlderEvmAccount,
                [mockNewerEvmAccount.id]: mockNewerEvmAccount,
                [mockNonEvmAccount.id]: mockNonEvmAccount,
              },
              selectedAccount: selectedAccount.id,
            },
          },
        });

        expect(
          accountsController.getSelectedMultichainAccount(
            chainId as CaipChainId,
          ),
        ).toStrictEqual(expected);
      },
    );

    // Testing error cases
    it.each([['eip155.'], ['bip122'], ['bip122:...']])(
      'invalid chainId %s will throw',
      (chainId) => {
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: {
                [mockOlderEvmAccount.id]: mockOlderEvmAccount,
                [mockNewerEvmAccount.id]: mockNewerEvmAccount,
                [mockNonEvmAccount.id]: mockNonEvmAccount,
              },
              selectedAccount: mockNonEvmAccount.id,
            },
          },
        });

        expect(() =>
          accountsController.getSelectedMultichainAccount(
            chainId as CaipChainId,
          ),
        ).toThrow(`Invalid CAIP-2 chain ID: ${chainId}`);
      },
    );
  });

  describe('listAccounts', () => {
    it('returns a list of evm accounts', () => {
      const mockNonEvmAccount = createMockInternalAccount({
        id: 'mock-id-non-evm',
        address: 'mock-non-evm-address',
        type: BtcAccountType.P2wpkh,
        keyringType: KeyringTypes.snap,
      });

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
              [mockAccount2.id]: mockAccount2,
              [mockNonEvmAccount.id]: mockNonEvmAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
      });

      expect(accountsController.listAccounts()).toStrictEqual([
        mockAccount,
        mockAccount2,
      ]);
    });
  });

  describe('listMultichainAccounts', () => {
    const mockNonEvmAccount = createMockInternalAccount({
      id: 'mock-id-non-evm',
      address: 'mock-non-evm-address',
      type: BtcAccountType.P2wpkh,
      keyringType: KeyringTypes.snap,
    });

    it.each([
      [undefined, [mockAccount, mockAccount2, mockNonEvmAccount]],
      ['eip155:1', [mockAccount, mockAccount2]],
      ['bip122:000000000019d6689c085ae165831e93', [mockNonEvmAccount]],
    ])(`%s should return %s`, (chainId, expected) => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
              [mockAccount2.id]: mockAccount2,
              [mockNonEvmAccount.id]: mockNonEvmAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
      });
      expect(
        accountsController.listMultichainAccounts(chainId as CaipChainId),
      ).toStrictEqual(expected);
    });

    it('throw if invalid CAIP-2 was passed', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
              [mockAccount2.id]: mockAccount2,
            },
            selectedAccount: mockAccount.id,
          },
        },
      });

      const invalidCaip2 = 'ethereum';

      expect(() =>
        // @ts-expect-error testing invalid caip2
        accountsController.listMultichainAccounts(invalidCaip2),
      ).toThrow(`Invalid CAIP-2 chain ID: ${invalidCaip2}`);
    });
  });

  describe('getAccountExpect', () => {
    it('return an account by ID', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });
      const result = accountsController.getAccountExpect(mockAccount.id);

      expect(result).toStrictEqual(
        setLastSelectedAsAny(mockAccount as InternalAccount),
      );
    });

    it('throw an error for an unknown account ID', () => {
      const accountId = 'unknown id';
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      expect(() => accountsController.getAccountExpect(accountId)).toThrow(
        `Account Id "${accountId}" not found`,
      );
    });

    it('handle the edge case of undefined accountId during onboarding', async () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      // @ts-expect-error forcing undefined accountId
      expect(accountsController.getAccountExpect(undefined)).toStrictEqual({
        id: '',
        address: '',
        options: {},
        methods: [],
        type: EthAccountType.Eoa,
        metadata: {
          name: '',
          keyring: {
            type: '',
          },
          importTime: 0,
        },
      });
    });
  });

  describe('setSelectedAccount', () => {
    it('set the selected account', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
              [mockAccount2.id]: mockAccount2,
            },
            selectedAccount: mockAccount.id,
          },
        },
      });

      accountsController.setSelectedAccount(mockAccount2.id);

      expect(
        accountsController.state.internalAccounts.selectedAccount,
      ).toStrictEqual(mockAccount2.id);
    });

    it('not emit setSelectedEvmAccountChange if the account is non-EVM', () => {
      const mockNonEvmAccount = createExpectedInternalAccount({
        id: 'mock-non-evm',
        name: 'non-evm',
        address: 'bc1qzqc2aqlw8nwa0a05ehjkk7dgt8308ac7kzw9a6',
        keyringType: KeyringTypes.snap,
        type: BtcAccountType.P2wpkh,
      });
      const { accountsController, messenger } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
              [mockNonEvmAccount.id]: mockNonEvmAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
      });

      const messengerSpy = jest.spyOn(messenger, 'publish');

      accountsController.setSelectedAccount(mockNonEvmAccount.id);

      expect(
        accountsController.state.internalAccounts.selectedAccount,
      ).toStrictEqual(mockNonEvmAccount.id);

      expect(messengerSpy.mock.calls).toHaveLength(2); // state change and then selectedAccountChange

      expect(messengerSpy).not.toHaveBeenCalledWith(
        'AccountsController:selectedEvmAccountChange',
        mockNonEvmAccount,
      );

      expect(messengerSpy).toHaveBeenCalledWith(
        'AccountsController:selectedAccountChange',
        mockNonEvmAccount,
      );
    });
  });

  describe('setAccountName', () => {
    it('set the name of an existing account', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });
      accountsController.setAccountName(mockAccount.id, 'new name');

      expect(
        accountsController.getAccountExpect(mockAccount.id).metadata.name,
      ).toBe('new name');
    });

    it('throw an error if the account name already exists', () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
              [mockAccount2.id]: mockAccount2,
            },
            selectedAccount: mockAccount.id,
          },
        },
      });

      expect(() =>
        accountsController.setAccountName(mockAccount.id, 'Account 2'),
      ).toThrow('Account name already exists');
    });
  });

  describe('#getNextAccountNumber', () => {
    // Account names start at 2 since have 1 HD account + 2 simple keypair accounts (and both
    // those keyring types are "grouped" together)
    const mockSimpleKeyring1 = createExpectedInternalAccount({
      id: 'mock-id2',
      name: 'Account 2',
      address: '0x555',
      keyringType: 'Simple Key Pair',
    });
    const mockSimpleKeyring2 = createExpectedInternalAccount({
      id: 'mock-id3',
      name: 'Account 3',
      address: '0x666',
      keyringType: 'Simple Key Pair',
    });
    const mockSimpleKeyring3 = createExpectedInternalAccount({
      id: 'mock-id4',
      name: 'Account 4',
      address: '0x777',
      keyringType: 'Simple Key Pair',
    });

    const mockNewKeyringStateWith = (simpleAddressess: string[]) => {
      return {
        isUnlocked: true,
        keyrings: [
          {
            type: 'HD Key Tree',
            accounts: [mockAccount.address],
          },
          {
            type: 'Simple Key Pair',
            accounts: simpleAddressess,
          },
        ],
      };
    };

    it('return the next account number', async () => {
      const messenger = buildMessenger();
      mockUUID
        .mockReturnValueOnce('mock-id') // call to check if its a new account
        .mockReturnValueOnce('mock-id2') // call to check if its a new account
        .mockReturnValueOnce('mock-id3') // call to check if its a new account
        .mockReturnValueOnce('mock-id2') // call to add account
        .mockReturnValueOnce('mock-id3'); // call to add account

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringStateWith([
          mockSimpleKeyring1.address,
          mockSimpleKeyring2.address,
        ]),
        [],
      );

      const accounts = accountsController.listAccounts();
      expect(accounts).toStrictEqual([
        mockAccount,
        setLastSelectedAsAny(mockSimpleKeyring1),
        setLastSelectedAsAny(mockSimpleKeyring2),
      ]);
    });

    it('return the next account number even with an index gap', async () => {
      const messenger = buildMessenger();
      const mockAccountUUIDs = new MockNormalAccountUUID([
        mockAccount,
        mockSimpleKeyring1,
        mockSimpleKeyring2,
        mockSimpleKeyring3,
      ]);
      mockUUID.mockImplementation(mockAccountUUIDs.mock.bind(mockAccountUUIDs));

      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringStateWith([
          mockSimpleKeyring1.address,
          mockSimpleKeyring2.address,
        ]),
        [],
      );

      // We then remove "Acccount 2" to create a gap
      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringStateWith([mockSimpleKeyring2.address]),
        [],
      );

      // Finally we add a 3rd account, and it should be named "Account 4" (despite having a gap
      // since "Account 2" no longer exists)
      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringStateWith([
          mockSimpleKeyring2.address,
          mockSimpleKeyring3.address,
        ]),
        [],
      );

      const accounts = accountsController.listAccounts();
      expect(accounts).toStrictEqual([
        mockAccount,
        setLastSelectedAsAny(mockSimpleKeyring2),
        setLastSelectedAsAny(mockSimpleKeyring3),
      ]);
    });
  });

  describe('getAccountByAddress', () => {
    it('return an account by address', async () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      const account = accountsController.getAccountByAddress(
        mockAccount.address,
      );

      expect(account).toStrictEqual(mockAccount);
    });

    it("should return undefined if there isn't an account with the address", () => {
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      const account = accountsController.getAccountByAddress('unknown address');

      expect(account).toBeUndefined();
    });

    it('returns a non-EVM account by address', async () => {
      const mockNonEvmAccount = createExpectedInternalAccount({
        id: 'mock-non-evm',
        name: 'non-evm',
        address: 'bc1qzqc2aqlw8nwa0a05ehjkk7dgt8308ac7kzw9a6',
        keyringType: KeyringTypes.snap,
        type: BtcAccountType.P2wpkh,
      });
      const { accountsController } = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
              [mockNonEvmAccount.id]: mockNonEvmAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
      });

      const account = accountsController.getAccountByAddress(
        mockNonEvmAccount.address,
      );

      expect(account).toStrictEqual(mockNonEvmAccount);
    });
  });

  describe('actions', () => {
    beforeEach(() => {
      jest.spyOn(AccountsController.prototype, 'setSelectedAccount');
      jest.spyOn(AccountsController.prototype, 'listAccounts');
      jest.spyOn(AccountsController.prototype, 'setAccountName');
      jest.spyOn(AccountsController.prototype, 'updateAccounts');
      jest.spyOn(AccountsController.prototype, 'getAccountByAddress');
      jest.spyOn(AccountsController.prototype, 'getSelectedAccount');
      jest.spyOn(AccountsController.prototype, 'getAccount');
    });

    describe('setSelectedAccount', () => {
      it('set the selected account', async () => {
        const messenger = buildMessenger();
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: { [mockAccount.id]: mockAccount },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.call('AccountsController:setSelectedAccount', 'mock-id');
        expect(accountsController.setSelectedAccount).toHaveBeenCalledWith(
          'mock-id',
        );
      });
    });

    describe('listAccounts', () => {
      it('retrieve a list of accounts', async () => {
        const messenger = buildMessenger();
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: { [mockAccount.id]: mockAccount },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.call('AccountsController:listAccounts');
        expect(accountsController.listAccounts).toHaveBeenCalledWith();
      });
    });

    describe('setAccountName', () => {
      it('set the account name', async () => {
        const messenger = buildMessenger();
        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: { [mockAccount.id]: mockAccount },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        messenger.call(
          'AccountsController:setAccountName',
          'mock-id',
          'new name',
        );
        expect(accountsController.setAccountName).toHaveBeenCalledWith(
          'mock-id',
          'new name',
        );
      });
    });

    describe('updateAccounts', () => {
      it('update accounts', async () => {
        const messenger = buildMessenger();
        messenger.registerActionHandler(
          'KeyringController:getAccounts',
          mockGetAccounts.mockResolvedValueOnce([]),
        );
        messenger.registerActionHandler(
          'KeyringController:getKeyringsByType',
          mockGetKeyringByType.mockReturnValueOnce([]),
        );
        messenger.registerActionHandler(
          'KeyringController:getKeyringForAccount',
          mockGetKeyringForAccount.mockResolvedValueOnce([]),
        );

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: { [mockAccount.id]: mockAccount },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        await messenger.call('AccountsController:updateAccounts');
        expect(accountsController.updateAccounts).toHaveBeenCalledWith();
      });
    });

    describe('getAccountByAddress', () => {
      it('get account by address', async () => {
        const messenger = buildMessenger();

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: { [mockAccount.id]: mockAccount },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        const account = messenger.call(
          'AccountsController:getAccountByAddress',
          mockAccount.address,
        );
        expect(accountsController.getAccountByAddress).toHaveBeenCalledWith(
          mockAccount.address,
        );
        expect(account).toStrictEqual(mockAccount);
      });
    });

    describe('getSelectedAccount', () => {
      it('get account by address', async () => {
        const messenger = buildMessenger();

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: { [mockAccount.id]: mockAccount },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        const account = messenger.call('AccountsController:getSelectedAccount');
        expect(accountsController.getSelectedAccount).toHaveBeenCalledWith();
        expect(account).toStrictEqual(mockAccount);
      });
    });

    describe('getAccount', () => {
      it('get account by id', async () => {
        const messenger = buildMessenger();

        const { accountsController } = setupAccountsController({
          initialState: {
            internalAccounts: {
              accounts: { [mockAccount.id]: mockAccount },
              selectedAccount: mockAccount.id,
            },
          },
          messenger,
        });

        const account = messenger.call(
          'AccountsController:getAccount',
          mockAccount.id,
        );
        expect(accountsController.getAccount).toHaveBeenCalledWith(
          mockAccount.id,
        );
        expect(account).toStrictEqual(mockAccount);
      });

      describe('getNextAvailableAccountName', () => {
        it('gets the next account name', async () => {
          const messenger = buildMessenger();

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const accountsController = setupAccountsController({
            initialState: {
              internalAccounts: {
                accounts: {
                  [mockAccount.id]: mockAccount,
                  // Next name should be: "Account 2"
                },
                selectedAccount: mockAccount.id,
              },
            },
            messenger,
          });

          const accountName = messenger.call(
            'AccountsController:getNextAvailableAccountName',
          );
          expect(accountName).toBe('Account 2');
        });

        it('gets the next account name with a gap', async () => {
          const messenger = buildMessenger();

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const accountsController = setupAccountsController({
            initialState: {
              internalAccounts: {
                accounts: {
                  [mockAccount.id]: mockAccount,
                  // We have a gap, cause there is no "Account 2"
                  [mockAccount3.id]: {
                    ...mockAccount3,
                    metadata: {
                      ...mockAccount3.metadata,
                      name: 'Account 3',
                      keyring: { type: KeyringTypes.hd },
                    },
                  },
                  // Next name should be: "Account 4"
                },
                selectedAccount: mockAccount.id,
              },
            },
            messenger,
          });

          const accountName = messenger.call(
            'AccountsController:getNextAvailableAccountName',
          );
          expect(accountName).toBe('Account 4');
        });
      });
    });
  });
});
