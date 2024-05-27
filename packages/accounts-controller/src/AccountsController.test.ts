import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import { EthAccountType, EthMethod } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { SnapControllerState } from '@metamask/snaps-controllers';
import { SnapStatus } from '@metamask/snaps-utils';
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

const EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const mockAccount: InternalAccount = {
  id: 'mock-id',
  address: '0x123',
  options: {},
  methods: [...EOA_METHODS],
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
  methods: [...EOA_METHODS],
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
  methods: [...EOA_METHODS],
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
  methods: [...EOA_METHODS],
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
 * @returns The `InternalAccount` object created from the normal account properties.
 */
function createExpectedInternalAccount({
  id,
  name,
  address,
  keyringType,
  snapId,
  snapEnabled = true,
}: {
  id: string;
  name: string;
  address: string;
  keyringType: string;
  snapId?: string;
  snapEnabled?: boolean;
}): InternalAccount {
  const account: InternalAccount = {
    id,
    address,
    options: {},
    methods: [...EOA_METHODS],
    type: EthAccountType.Eoa,
    metadata: {
      name,
      keyring: { type: keyringType },
      importTime: expect.any(Number),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      lastSelected: undefined,
    },
  };

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
}): AccountsController {
  const accountsControllerMessenger =
    buildAccountsControllerMessenger(messenger);

  const accountsController = new AccountsController({
    messenger: accountsControllerMessenger,
    state: { ...defaultState, ...initialState },
  });
  return accountsController;
}

describe('AccountsController', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('onSnapStateChange', () => {
    it('should be used enable an account if the snap is enabled and not blocked', async () => {
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
      const accountsController = setupAccountsController({
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

    it('should be used disable an account if the snap is disabled', async () => {
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
      const accountsController = setupAccountsController({
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

    it('should be used disable an account if the snap is blocked', async () => {
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
      const accountsController = setupAccountsController({
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
    it('should not update state when only keyring is unlocked without any keyrings', async () => {
      const messenger = buildMessenger();
      const accountsController = setupAccountsController({
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

    it('should only update if the keyring is unlocked and when there are keyrings', async () => {
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
      const accountsController = setupAccountsController({
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
      it('should add new accounts', async () => {
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
        const accountsController = setupAccountsController({
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

      it('should add snap accounts', async () => {
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

        const accountsController = setupAccountsController({
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

      it('should handle the event when a snap deleted the account before the it was added', async () => {
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

        const accountsController = setupAccountsController({
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

      it('should increment the default account number when adding an account', async () => {
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
        const accountsController = setupAccountsController({
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

      it('should use the next number after the total number of accounts of a keyring when adding an account, if the index is lower', async () => {
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
        const accountsController = setupAccountsController({
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

        expect(accounts).toStrictEqual([
          mockAccount,
          mockAccount2WithCustomName,
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

      it('should handle when the account to set as selectedAccount is undefined', async () => {
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

        const accountsController = setupAccountsController({
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
      it('should delete accounts if its gone from the keyring state', async () => {
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
        const accountsController = setupAccountsController({
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

      it('should delete accounts and set the most recent lastSelected account', async () => {
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
        const accountsController = setupAccountsController({
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

      it('should delete accounts and set the most recent lastSelected account when there are accounts that have never been selected', async () => {
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
        const accountsController = setupAccountsController({
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

      it('should delete the account and select the account with the most recent lastSelected', async () => {
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
        const accountsController = setupAccountsController({
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
          setLastSelectedAsAny(mockAccountWithoutLastSelected),
          mockAccount2WithoutLastSelected,
        ]);
        expect(accountsController.getSelectedAccount()).toStrictEqual(
          setLastSelectedAsAny(mockAccountWithoutLastSelected),
        );
      });
    });

    it('should handle keyring reinitialization', async () => {
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
      const accountsController = setupAccountsController({
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

    it('should update accounts with normal accounts', async () => {
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

      const accountsController = setupAccountsController({
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

    it('should update accounts with snap accounts when snap keyring is defined and has accounts', async () => {
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

      const accountsController = setupAccountsController({
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
          lastSelected: undefined,
          importTime: expect.any(Number),
        },
      };

      const expectedAccount2 = {
        ...mockSnapAccount2,
        metadata: {
          ...mockSnapAccount2.metadata,
          name: 'Snap Account 2',
          lastSelected: undefined,
          importTime: expect.any(Number),
        },
      };

      const expectedAccounts = [expectedAccount1, expectedAccount2];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it('should return an empty array if the snap keyring is not defined', async () => {
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringsByType',
        mockGetKeyringByType.mockReturnValueOnce([undefined]),
      );

      const accountsController = setupAccountsController({
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

    it('should set the account with the correct index', async () => {
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

      const accountsController = setupAccountsController({
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

    it('should filter snap accounts from normalAccounts', async () => {
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

      const accountsController = setupAccountsController({
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

    it('should filter snap accounts from normalAccounts even if the snap account is listed before normal accounts', async () => {
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

      const accountsController = setupAccountsController({
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

      const accountsController = setupAccountsController({
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

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it('should throw an error if the keyring type is unknown', async () => {
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

      const accountsController = setupAccountsController({
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
    it('should load a backup', async () => {
      const accountsController = setupAccountsController({
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

    it('should not load backup if the data is undefined', () => {
      const accountsController = setupAccountsController({
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
    it('should return an account by ID', () => {
      const accountsController = setupAccountsController({
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
    it('should return undefined for an unknown account ID', () => {
      const accountsController = setupAccountsController({
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

  describe('listAccounts', () => {
    it('should return a list of accounts', () => {
      const accountsController = setupAccountsController({
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

      const result = accountsController.listAccounts();

      expect(result).toStrictEqual([
        setLastSelectedAsAny(mockAccount as InternalAccount),
        setLastSelectedAsAny(mockAccount2 as InternalAccount),
      ]);
    });
  });

  describe('getAccountExpect', () => {
    it('should return an account by ID', () => {
      const accountsController = setupAccountsController({
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

    it('should throw an error for an unknown account ID', () => {
      const accountId = 'unknown id';
      const accountsController = setupAccountsController({
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

    it('should handle the edge case of undefined accountId during onboarding', async () => {
      const accountsController = setupAccountsController({
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

  describe('getSelectedAccount', () => {
    it('should return the selected account', () => {
      const accountsController = setupAccountsController({
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
  });

  describe('setSelectedAccount', () => {
    it('should set the selected account', () => {
      const accountsController = setupAccountsController({
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
  });

  describe('setAccountName', () => {
    it('should set the name of an existing account', () => {
      const accountsController = setupAccountsController({
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

    it('should throw an error if the account name already exists', () => {
      const accountsController = setupAccountsController({
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

    it('should return the next account number', async () => {
      const messenger = buildMessenger();
      mockUUID
        .mockReturnValueOnce('mock-id') // call to check if its a new account
        .mockReturnValueOnce('mock-id2') // call to check if its a new account
        .mockReturnValueOnce('mock-id3') // call to check if its a new account
        .mockReturnValueOnce('mock-id2') // call to add account
        .mockReturnValueOnce('mock-id3'); // call to add account

      const accountsController = setupAccountsController({
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

    it('should return the next account number even with an index gap', async () => {
      const messenger = buildMessenger();
      const mockAccountUUIDs = new MockNormalAccountUUID([
        mockAccount,
        mockSimpleKeyring1,
        mockSimpleKeyring2,
        mockSimpleKeyring3,
      ]);
      mockUUID.mockImplementation(mockAccountUUIDs.mock.bind(mockAccountUUIDs));

      const accountsController = setupAccountsController({
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
    it('should return an account by address', async () => {
      const accountsController = setupAccountsController({
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
      const accountsController = setupAccountsController({
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
      jest.spyOn(AccountsController.prototype, 'getNextAvailableAccountName');
    });

    describe('setSelectedAccount', () => {
      it('should set the selected account', async () => {
        const messenger = buildMessenger();
        const accountsController = setupAccountsController({
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
      it('should retrieve a list of accounts', async () => {
        const messenger = buildMessenger();
        const accountsController = setupAccountsController({
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
      it('should set the account name', async () => {
        const messenger = buildMessenger();
        const accountsController = setupAccountsController({
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
      it('should update accounts', async () => {
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

        const accountsController = setupAccountsController({
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
      it('should get account by address', async () => {
        const messenger = buildMessenger();

        const accountsController = setupAccountsController({
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
      it('should get account by address', async () => {
        const messenger = buildMessenger();

        const accountsController = setupAccountsController({
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
      it('should get account by id', async () => {
        const messenger = buildMessenger();

        const accountsController = setupAccountsController({
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
