import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/eth-snap-keyring';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import type { SnapControllerState } from '@metamask/snaps-controllers';
import { SnapStatus } from '@metamask/snaps-utils';
import * as uuid from 'uuid';

import type {
  AccountsControllerActions,
  AccountsControllerEvents,
  AccountsControllerState,
} from './AccountsController';
import AccountsController, { keyringTypeToName } from './AccountsController';

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
  name: 'Account 1',
  id: 'mock-id',
  address: '0x123',
  options: {},
  supportedMethods: [
    'personal_sign',
    'eth_sendTransaction',
    'eth_sign',
    'eth_signTransaction',
    'eth_signTypedData',
    'eth_signTypedData_v1',
    'eth_signTypedData_v2',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ],
  type: 'eip155:eoa',
  metadata: {
    keyring: { type: 'HD Key Tree' },
    lastSelected: 1691565967656,
  },
};

const mockAccount2: InternalAccount = {
  name: 'Account 2',
  id: 'mock-id2',
  address: '0x1234',
  options: {},
  supportedMethods: [
    'personal_sign',
    'eth_sendTransaction',
    'eth_sign',
    'eth_signTransaction',
    'eth_signTypedData',
    'eth_signTypedData_v1',
    'eth_signTypedData_v2',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ],
  type: 'eip155:eoa',
  metadata: {
    keyring: { type: 'HD Key Tree' },
    lastSelected: 1691565967656,
  },
};

/**
 * Creates an `InternalAccount` object from the given legacy account properties.
 *
 * @param props - The properties of the legacy account.
 * @param props.id - The ID of the account.
 * @param props.name - The name of the account.
 * @param props.address - The address of the account.
 * @param props.keyringType - The type of the keyring associated with the account.
 * @param props.snapId - The id of the snap.
 * @param props.snapEnabled - The status of the snap
 * @returns The `InternalAccount` object created from the legacy account properties.
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
    name,
    address,
    options: {},
    supportedMethods: [
      'personal_sign',
      'eth_sendTransaction',
      'eth_sign',
      'eth_signTransaction',
      'eth_signTypedData',
      'eth_signTypedData_v1',
      'eth_signTypedData_v2',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
    ],
    type: 'eip155:eoa',
    metadata: {
      keyring: { type: keyringType },
      lastSelected: undefined,
    },
  };

  if (snapId) {
    account.metadata.snap = {
      id: snapId,
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
  });
}

/**
 * Sets up an instance of the AccountsController class with the given initial state and callbacks.
 *
 * @param options - The options object.
 * @param [options.initialState] - The initial state to use for the AccountsController.
 * @param [options.keyringApiEnabled] - Whether or not the keyring API is enabled.
 * @param [options.onKeyringStateChange] - A callback to call when the keyring state changes.
 * @param [options.onSnapStateChange] - A callback to call when the snap state changes.
 * @returns An instance of the AccountsController class.
 */
function setupAccountsController({
  // eslint-disable-next-line @typescript-eslint/default-param-last
  initialState = {},
  keyringApiEnabled = true,
  onKeyringStateChange = () => undefined,
  onSnapStateChange = () => undefined,
}: {
  initialState?: Partial<AccountsControllerState>;
  keyringApiEnabled?: boolean;
  onKeyringStateChange?: (
    listener: (state: KeyringControllerState) => void,
  ) => void;
  onSnapStateChange?: (listener: (state: SnapControllerState) => void) => void;
}): AccountsController {
  const accountsControllerMessenger = buildAccountsControllerMessenger(
    new ControllerMessenger(),
  );

  const accountsController = new AccountsController({
    messenger: accountsControllerMessenger,
    state: { ...defaultState, ...initialState },
    getKeyringForAccount: mockGetKeyringForAccount,
    getKeyringByType: mockGetKeyringByType,
    getAccounts: mockGetAccounts,
    onKeyringStateChange,
    onSnapStateChange,
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
      const snapStateChangeSpy = jest.fn();
      setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: false,
        onSnapStateChange: () => {
          snapStateChangeSpy();
        },
      });

      expect(snapStateChangeSpy).not.toHaveBeenCalled();
    });

    it('should be used enable an account if the snap is enabled and not blocked', async () => {
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
      };
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
        onSnapStateChange: (listener: (state: any) => void) => {
          listener(mockSnapChangeState);
        },
      });

      const updatedAccount = accountsController.getAccountExpect(
        mockSnapAccount.id,
      );

      expect(updatedAccount.metadata.snap?.enabled).toBe(true);
    });

    it('should be used disable an account if the snap is disabled', async () => {
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
      };
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
        onSnapStateChange: (listener: (state: any) => void) => {
          listener(mockSnapChangeState);
        },
      });

      const updatedAccount = accountsController.getAccountExpect(
        mockSnapAccount.id,
      );

      expect(updatedAccount.metadata.snap?.enabled).toBe(false);
    });

    it('should be used disable an account if the snap is blocked', async () => {
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
      };
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
        onSnapStateChange: (listener: (state: any) => void) => {
          listener(mockSnapChangeState);
        },
      });

      const updatedAccount = accountsController.getAccountExpect(
        mockSnapAccount.id,
      );

      expect(updatedAccount.metadata.snap?.enabled).toBe(false);
    });
  });

  describe('onKeyringStateChange', () => {
    it('should only update if the keyring is unlocked', async () => {
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
        onKeyringStateChange: (
          listener: (state: KeyringControllerState) => void,
        ) => {
          listener(mockNewKeyringState);
        },
      });

      const accounts = accountsController.listAccounts();

      expect(accounts).toStrictEqual([]);
    });

    it('should add new accounts', async () => {
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');
      mockGetAccounts.mockResolvedValue([
        mockAccount.address,
        mockAccount2.address,
      ]);
      mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' });
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
        onKeyringStateChange: (
          listener: (state: KeyringControllerState) => void,
        ) => {
          listener(mockNewKeyringState);
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const accounts = accountsController.listAccounts();

      expect(accounts).toStrictEqual([
        mockAccount,
        setLastSelectedAsAny(mockAccount2),
      ]);
    });

    it('should handle keyring reinitialization', async () => {
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
      mockGetAccounts.mockResolvedValue([mockReinitialisedAccount.address]);
      mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' });
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
        onKeyringStateChange: (
          listener: (state: KeyringControllerState) => void,
        ) => {
          listener(mockNewKeyringState);
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const selectedAccount = accountsController.getSelectedAccount();
      const accounts = accountsController.listAccounts();
      const expectedAccount = {
        ...setLastSelectedAsAny(mockReinitialisedAccount),
        name: 'Account 1', // since there aren't any other accounts it will be account 1
      };

      expect(selectedAccount).toStrictEqual(expectedAccount);
      expect(accounts).toStrictEqual([expectedAccount]);
    });

    it('should delete accounts if its gone from the keyring state', async () => {
      mockUUID.mockReturnValueOnce('mock-id2');
      mockGetAccounts.mockResolvedValue([mockAccount2.address]);
      mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' });
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
        onKeyringStateChange: (
          listener: (state: KeyringControllerState) => void,
        ) => {
          listener(mockNewKeyringState);
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const accounts = accountsController.listAccounts();

      expect(accounts).toStrictEqual([setLastSelectedAsAny(mockAccount2)]);
      expect(accountsController.getSelectedAccount()).toStrictEqual(
        setLastSelectedAsAny(mockAccount2),
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
        },
        lastSelected: undefined,
      },
    };

    it('should update accounts with legacy accounts', async () => {
      mockUUID.mockReturnValueOnce('mock-id').mockReturnValueOnce('mock-id2');
      mockGetAccounts.mockResolvedValue([mockAddress1, mockAddress2]);
      mockGetKeyringForAccount.mockResolvedValue({ type: 'HD Key Tree' });

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: false,
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

    it('should update accounts with snap accounts', async () => {
      mockGetAccounts.mockResolvedValue([]);
      mockGetKeyringByType.mockReturnValueOnce([
        {
          type: 'Snap Keyring',
          listAccounts: async () => [mockSnapAccount, mockSnapAccount2],
        },
      ]);

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: true,
      });

      const expectedAccount1 = {
        ...mockSnapAccount,
        name: 'Snap Account 1',
      };

      const expectedAccount2 = {
        ...mockSnapAccount2,
        name: 'Snap Account 2',
      };

      const expectedAccounts = [expectedAccount1, expectedAccount2];

      await accountsController.updateAccounts();

      expect(accountsController.listAccounts()).toStrictEqual(expectedAccounts);
    });

    it('should filter snap accounts from legacyAccounts', async () => {
      mockUUID.mockReturnValueOnce('mock-id');
      mockGetKeyringByType.mockReturnValueOnce([
        {
          type: 'Snap Keyring',
          listAccounts: async () => [mockSnapAccount2],
        },
      ]);

      // first account will be legacy, second will be a snap account
      mockGetAccounts.mockResolvedValue([mockAddress1, '0x1234']);
      mockGetKeyringForAccount
        .mockResolvedValueOnce({ type: 'HD Key Tree' })
        .mockResolvedValueOnce({ type: 'Snap Keyring' });

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: true,
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

    it('should filter snap accounts from legacyAccounts even if the snap account is listed before legacy accounts', async () => {
      mockUUID.mockReturnValue('mock-id');
      mockGetKeyringByType.mockReturnValueOnce([
        {
          type: 'Snap Keyring',
          listAccounts: async () => [mockSnapAccount2],
        },
      ]);

      // first account will be legacy, second will be a snap account
      mockGetAccounts.mockResolvedValue(['0x1234', mockAddress1]);
      mockGetKeyringForAccount
        .mockResolvedValueOnce({ type: 'Snap Keyring' })
        .mockResolvedValueOnce({ type: 'HD Key Tree' });

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: true,
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
      mockGetAccounts.mockResolvedValue([mockAddress1]);
      mockGetKeyringForAccount.mockResolvedValue({ type: keyringType });

      const accountsController = setupAccountsController({
        initialState: {
          internalAccounts: {
            accounts: {},
            selectedAccount: '',
          },
        },
        keyringApiEnabled: false,
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
  //   });

  //   it('should update accounts with snap accounts', async () => {
  //
  //     const accountsController = new AccountsController();
  //     const legacyAccounts = [];
  //     const snapAccounts = [
  //       { address: '0x789', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0xabc', metadata: { keyring: { type: 'Simple Keyring' } } },
  //     ];

  //
  //     jest
  //       .spyOn(accountsController, '#listLegacyAccounts')
  //       .mockResolvedValue(legacyAccounts);
  //     jest
  //       .spyOn(accountsController, '#listSnapAccounts')
  //       .mockResolvedValue(snapAccounts);
  //     await accountsController.updateAccounts();

  //
  //     expect(accountsController.state.internalAccounts.accounts).toEqual(
  //       snapAccounts,
  //     );
  //   });

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
        name: '',
        address: '',
        options: {},
        supportedMethods: [],
        type: 'eip155:eoa',
        metadata: {
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

      expect(accountsController.getAccountExpect(mockAccount.id).name).toBe(
        'new name',
      );
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
});
