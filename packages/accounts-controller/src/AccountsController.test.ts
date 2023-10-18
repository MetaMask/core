import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import { EthAccountType, EthMethod } from '@metamask/keyring-api';
import type { SnapControllerState } from '@metamask/snaps-controllers';
import { SnapStatus } from '@metamask/snaps-utils';
import * as uuid from 'uuid';

import type {
  AccountsControllerActions,
  AccountsControllerEvents,
  AccountsControllerState,
} from './AccountsController';
import { AccountsController, keyringTypeToName } from './AccountsController';

jest.mock('uuid');
const mockUUID = jest.spyOn(uuid, 'v4');

const defaultState: AccountsControllerState = {
  internalAccounts: {
    accounts: {},
    selectedAccount: '',
  },
};

const mockGetKeyringForAccount = jest.fn();
const mockGetKeyringByType = jest.fn();
const mockGetAccounts = jest.fn();

const mockAccount: InternalAccount = {
  id: 'mock-id',
  address: '0x123',
  options: {},
  methods: [...Object.values(EthMethod)],
  type: EthAccountType.Eoa,
  metadata: {
    name: 'Account 1',
    keyring: { type: 'HD Key Tree' },
    lastSelected: 1691565967656,
  },
};

const mockAccount2: InternalAccount = {
  id: 'mock-id2',
  address: '0x1234',
  options: {},
  methods: [...Object.values(EthMethod)],
  type: EthAccountType.Eoa,
  metadata: {
    name: 'Account 2',
    keyring: { type: 'HD Key Tree' },
    lastSelected: 1955565967656,
  },
};

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
    methods: [...Object.values(EthMethod)],
    type: EthAccountType.Eoa,
    metadata: {
      name,
      keyring: { type: keyringType },
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
  return {
    ...account,
    metadata: {
      ...account.metadata,
      lastSelected: expect.any(Number),
    },
  } as InternalAccount;
}

/**
 * Builds a new instance of the ControllerMessenger class for the AccountsController.
 *
 * @returns A new instance of the ControllerMessenger class for the AccountsController.
 */
function buildMessenger() {
  return new ControllerMessenger<
    AccountsControllerActions,
    AccountsControllerEvents
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
      'KeyringController:accountRemoved',
      'KeyringController:stateChange',
    ],
    allowedActions: [
      'KeyringController:getAccounts',
      'KeyringController:getKeyringForAccount',
      'KeyringController:getKeyringsByType',
      'AccountsController:listAccounts',
      'AccountsController:setAccountName',
      'AccountsController:setSelectedAccount',
      'AccountsController:updateAccounts',
      'AccountsController:getSelectedAccount',
      'AccountsController:getAccountByAddress',
    ],
  });
}

/**
 * Sets up an instance of the AccountsController class with the given initial state and callbacks.
 *
 * @param options - The options object.
 * @param [options.initialState] - The initial state to use for the AccountsController.
 * @param [options.keyringApiEnabled] - Whether or not the keyring API is enabled.
 * @param [options.messenger] - Messenger to use for the AccountsController.
 * @returns An instance of the AccountsController class.
 */
function setupAccountsController({
  initialState = {},
  keyringApiEnabled = true,
  messenger = buildMessenger(),
}: {
  initialState?: Partial<AccountsControllerState>;
  keyringApiEnabled?: boolean;
  messenger?: ControllerMessenger<
    AccountsControllerActions,
    AccountsControllerEvents
  >;
}): AccountsController {
  const accountsControllerMessenger =
    buildAccountsControllerMessenger(messenger);

  const accountsController = new AccountsController({
    messenger: accountsControllerMessenger,
    state: { ...defaultState, ...initialState },
    keyringApiEnabled,
  });
  return accountsController;
}

describe('AccountsController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onSnapStateChange', () => {
    it('should not be used when keyringApiEnabled is false', async () => {
      const messenger = buildMessenger();
      const snapStateChangeSpy = jest.fn();
      setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: false,
        messenger,
      });

      messenger.publish(
        'SnapController:stateChange',
        {} as any as SnapControllerState,
        [],
      );

      expect(snapStateChangeSpy).not.toHaveBeenCalled();
    });

    it('should be used enable an account if the snap is enabled and not blocked', async () => {
      const messenger = buildMessenger();
      const mockSnapAccount = createExpectedInternalAccount({
        id: 'mock-id',
        name: 'Snap Account 1',
        address: '0x0',
        keyringType: 'Snap Keyring',
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
        keyringApiEnabled: true,
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
        keyringType: 'Snap Keyring',
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
        keyringApiEnabled: true,
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
        keyringType: 'Snap Keyring',
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
        keyringApiEnabled: true,
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
    it('should only update if the keyring is unlocked', async () => {
      const messenger = buildMessenger();

      const mockNewKeyringState = {
        isUnlocked: false,
        keyrings: [
          {
            accounts: [mockAccount.address, mockAccount2.address],
            type: 'HD Key Tree',
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
        keyringApiEnabled: true,
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

    it('should add new accounts', async () => {
      const messenger = buildMessenger();
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');

      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([
          mockAccount.address,
          mockAccount2.address,
        ]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' }),
      );

      const mockNewKeyringState = {
        isUnlocked: true,
        keyrings: [
          {
            type: 'HD Key Tree',
            accounts: [mockAccount.address, mockAccount2.address],
          },
        ],
      };
      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
            },
            selectedAccount: mockAccount.id,
          },
        },
        keyringApiEnabled: false,
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const accounts = accountsController.listAccounts();

      expect(accounts).toStrictEqual([
        mockAccount,
        setLastSelectedAsAny(mockAccount2),
      ]);
    });

    it('should handle keyring reinitialization', async () => {
      const messenger = buildMessenger();
      const mockInitialAccount = createExpectedInternalAccount({
        id: 'mock-id',
        name: 'Account 1',
        address: '0x123',
        keyringType: 'HD Key Tree',
      });
      const mockReinitialisedAccount = createExpectedInternalAccount({
        id: 'mock-id2',
        name: 'Account 1',
        address: '0x456',
        keyringType: 'HD Key Tree',
      });
      mockUUID.mockReturnValueOnce('mock-id2');
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([
          mockReinitialisedAccount.address,
        ]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' }),
      );
      const mockNewKeyringState = {
        isUnlocked: true,
        keyrings: [
          {
            type: 'HD Key Tree',
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
        keyringApiEnabled: false,
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const selectedAccount = accountsController.getSelectedAccount();
      const accounts = accountsController.listAccounts();
      const expectedAccount = setLastSelectedAsAny(mockReinitialisedAccount);

      expect(selectedAccount).toStrictEqual(expectedAccount);
      expect(accounts).toStrictEqual([expectedAccount]);
    });

    it('should delete accounts if its gone from the keyring state', async () => {
      const messenger = buildMessenger();
      mockUUID.mockReturnValueOnce('mock-id2');
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([mockAccount2.address]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' }),
      );

      const mockNewKeyringState = {
        isUnlocked: true,
        keyrings: [
          {
            type: 'HD Key Tree',
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
        keyringApiEnabled: false,
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const accounts = accountsController.listAccounts();

      expect(accounts).toStrictEqual([setLastSelectedAsAny(mockAccount2)]);
      expect(accountsController.getSelectedAccount()).toStrictEqual(
        setLastSelectedAsAny(mockAccount2),
      );
    });

    it('should delete accounts and set the most recent lastSelected account', async () => {
      const messenger = buildMessenger();
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValue([
          mockAccount.address,
          mockAccount2.address,
        ]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' }),
      );

      const mockNewKeyringState = {
        isUnlocked: true,
        keyrings: [
          {
            type: 'HD Key Tree',
            accounts: [mockAccount.address, mockAccount2.address],
          },
        ],
      };
      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              'missing-account': {
                address: '0x999',
              } as InternalAccount,
              [mockAccount.id]: mockAccount,
              [mockAccount2.id]: mockAccount2,
            },
            selectedAccount: 'missing-account',
          },
        },
        keyringApiEnabled: false,
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

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
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValue([
          mockAccount.address,
          mockAccount2.address,
        ]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' }),
      );

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
            type: 'HD Key Tree',
            accounts: [mockAccount.address, mockAccount2.address],
          },
        ],
      };
      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              'missing-account': {
                address: '0x999',
              } as InternalAccount,
              [mockAccount.id]: mockAccount,
              [mockAccount2.id]: mockAccount2WithoutLastSelected,
            },
            selectedAccount: 'missing-account',
          },
        },
        keyringApiEnabled: false,
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

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
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValue([
          mockAccount.address,
          mockAccount2.address,
        ]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' }),
      );

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
            type: 'HD Key Tree',
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
                address: '0x999',
              } as InternalAccount,
              [mockAccount2.id]: mockAccount2WithoutLastSelected,
              [mockAccount.id]: mockAccountWithoutLastSelected,
            },
            selectedAccount: 'missing-account',
          },
        },
        keyringApiEnabled: false,
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        mockNewKeyringState,
        [],
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

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

  describe('constructor', () => {
    it('should select next account if selectedAccount is not found', async () => {
      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {
              [mockAccount.id]: mockAccount,
            },
            selectedAccount: 'missing account',
          },
        },
        keyringApiEnabled: true,
      });

      const selectedAccount = accountsController.getSelectedAccount();

      expect(setLastSelectedAsAny(selectedAccount)).toStrictEqual(
        setLastSelectedAsAny(mockAccount),
      );
    });
  });

  describe('updateAccounts', () => {
    const mockAddress1 = '0x123';
    const mockAddress2 = '0x456';
    const mockSnapAccount = {
      ...mockAccount,
      metadata: {
        ...mockAccount.metadata,
        keyring: {
          type: 'Snap Keyring',
        },
        snap: {
          enabled: true,
          id: 'mock-snap-id',
          name: '',
        },
        lastSelected: undefined,
      },
    };
    const mockSnapAccount2 = {
      ...mockAccount2,
      metadata: {
        ...mockAccount2.metadata,
        keyring: {
          type: 'Snap Keyring',
        },
        snap: {
          enabled: true,
          id: 'mock-snap-id2',
          name: 'snap-name',
        },
        lastSelected: undefined,
      },
    };

    it('should update accounts with normal accounts', async () => {
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');
      const messenger = buildMessenger();
      messenger.registerActionHandler(
        'KeyringController:getAccounts',
        mockGetAccounts.mockResolvedValueOnce([mockAddress1, mockAddress2]),
      );

      messenger.registerActionHandler(
        'KeyringController:getKeyringForAccount',
        mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' }),
      );

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: false,
        messenger,
      });
      const expectedAccounts = [
        createExpectedInternalAccount({
          name: 'Account 1',
          id: 'mock-id',
          address: mockAddress1,
          keyringType: 'HD Key Tree',
        }),
        createExpectedInternalAccount({
          name: 'Account 2',
          id: 'mock-id2',
          address: mockAddress2,
          keyringType: 'HD Key Tree',
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
        mockGetKeyringByType.mockResolvedValue([
          {
            type: 'Snap Keyring',
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
        keyringApiEnabled: true,
        messenger,
      });

      const expectedAccount1 = {
        ...mockSnapAccount,
        metadata: {
          ...mockSnapAccount.metadata,
          name: 'Snap Account 1',
        },
      };

      const expectedAccount2 = {
        ...mockSnapAccount2,
        metadata: {
          ...mockSnapAccount2.metadata,
          name: 'Snap Account 2',
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
        keyringApiEnabled: true,
        messenger,
      });

      const expectedAccounts: InternalAccount[] = [];

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
            type: 'Snap Keyring',
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
          .mockResolvedValueOnce({ type: 'HD Key Tree' })
          .mockResolvedValueOnce({ type: 'Snap Keyring' }),
      );

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: true,
        messenger,
      });
      const expectedAccounts = [
        createExpectedInternalAccount({
          name: 'Account 1',
          id: 'mock-id',
          address: mockAddress1,
          keyringType: 'HD Key Tree',
        }),
        createExpectedInternalAccount({
          name: 'Snap Account 1', // it is Snap Account 1 because it is the only snap account
          id: mockSnapAccount2.id,
          address: mockSnapAccount2.address,
          keyringType: 'Snap Keyring',
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
            type: 'Snap Keyring',
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
          .mockResolvedValueOnce({ type: 'Snap Keyring' })
          .mockResolvedValueOnce({ type: 'HD Key Tree' }),
      );

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: true,
        messenger,
      });
      const expectedAccounts = [
        createExpectedInternalAccount({
          name: 'Account 1',
          id: 'mock-id',
          address: mockAddress1,
          keyringType: 'HD Key Tree',
        }),
        createExpectedInternalAccount({
          name: 'Snap Account 1', // it is Snap Account 1 because it is the only snap account
          id: mockSnapAccount2.id,
          address: mockSnapAccount2.address,
          keyringType: 'Snap Keyring',
          snapId: 'mock-snap-id2',
          snapEnabled: true,
        }),
      ];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it.each([
      'Simple Key Pair',
      'HD Key Tree',
      'Trezor Hardware',
      'Ledger Hardware',
      'Lattice Hardware',
      'QR Hardware Wallet Device',
      'Custody',
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

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: false,
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

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: false,
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
      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });

      expect(() => accountsController.getAccountExpect('unknown id')).toThrow(
        `Account Id unknown id not found`,
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

    it('should throw an error for an unknown account ID', () => {
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

      expect(() => accountsController.setSelectedAccount('unknown id')).toThrow(
        `Account Id unknown id not found`,
      );
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

    it('should throw an error if the account ID is not found', () => {
      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: { [mockAccount.id]: mockAccount },
            selectedAccount: mockAccount.id,
          },
        },
      });
      expect(() =>
        accountsController.setAccountName('unknown account', 'new name'),
      ).toThrow(`Account Id unknown account not found`);
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

        await messenger.call(
          'AccountsController:setSelectedAccount',
          'mock-id',
        );
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

        await messenger.call('AccountsController:listAccounts');
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

        await messenger.call(
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
          mockGetKeyringByType.mockResolvedValueOnce([]),
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

          const account = messenger.call(
            'AccountsController:getSelectedAccount',
          );
          expect(accountsController.getSelectedAccount).toHaveBeenCalledWith();
          expect(account).toStrictEqual(mockAccount);
        });
      });
    });
  });
});
