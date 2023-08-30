import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/eth-snap-keyring';

import type {
  AccountsControllerActions,
  AccountsControllerEvents,
  AccountsControllerState,
} from './AccountsController';
import AccountsController from './AccountsController';

const mockUUIDV4 = jest.fn();

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');

  return {
    ...actual,
    v4: () => mockUUIDV4,
  };
});

const defaultState: AccountsControllerState = {
  internalAccounts: {
    accounts: {},
    selectedAccount: '',
  },
};

const mockGetKeyringForAccount = jest.fn();
const mockGetKeyringByType = jest.fn();
const mockGetAccounts = jest.fn();

const mockAccount = {
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

const mockAccount2 = {
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
  };
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
 *
 * @param initialState - The initial state to use for the AccountsController.
 * @param onKeyringStateChange - A callback to call when the keyring state changes.
 * @param onSnapStateChange - A callback to call when the snap state changes.
 */
/**
 * Sets up an instance of the AccountsController class with the given initial state and callbacks.
 *
 * @param initialState - The initial state to use for the AccountsController.
 * @param keyringApiEnabled - Whether or not the keyring API is enabled.
 * @param onKeyringStateChange - A callback to call when the keyring state changes.
 * @param onSnapStateChange - A callback to call when the snap state changes.
 * @returns An instance of the AccountsController class.
 */
function setupAccountsController(
  // eslint-disable-next-line @typescript-eslint/default-param-last
  initialState = {},
  keyringApiEnabled = true,
  onKeyringStateChange = () => jest.fn(),
  onSnapStateChange = () => jest.fn(),
): AccountsController {
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

  // describe('onSnapStateChange', () => {
  //   it('should disable snap-enabled accounts when a snap is disabled', () => {
  //
  //     const accountsController = new AccountsController();
  //     const snapId = 'snap123';
  //     const accountId = '0x123';
  //     const account = {
  //       id: accountId,
  //       metadata: { snap: { id: snapId, enabled: true } },
  //     };
  //     accountsController.state.internalAccounts.accounts[accountId] = account;

  //     const snapState = {
  //       snaps: {
  //         [snapId]: { id: snapId, enabled: false },
  //       },
  //     };

  //
  //     accountsController.onSnapStateChange(snapState);

  //
  //     expect(
  //       accountsController.state.internalAccounts.accounts[accountId].metadata
  //         .snap.enabled,
  //     ).toBe(false);
  //   });

  //   it('should not disable snap-disabled accounts when a snap is disabled', () => {
  //
  //     const accountsController = new AccountsController();
  //     const snapId = 'snap123';
  //     const accountId = '0x123';
  //     const account = {
  //       id: accountId,
  //       metadata: { snap: { id: snapId, enabled: false } },
  //     };
  //     accountsController.state.internalAccounts.accounts[accountId] = account;

  //     const snapState = {
  //       snaps: {
  //         [snapId]: { id: snapId, enabled: false },
  //       },
  //     };

  //
  //     accountsController.onSnapStateChange(snapState);

  //
  //     expect(
  //       accountsController.state.internalAccounts.accounts[accountId].metadata
  //         .snap.enabled,
  //     ).toBe(false);
  //   });

  //   it('should not disable accounts when a snap is enabled', () => {
  //
  //     const accountsController = new AccountsController();
  //     const snapId = 'snap123';
  //     const accountId = '0x123';
  //     const account = {
  //       id: accountId,
  //       metadata: { snap: { id: snapId, enabled: true } },
  //     };
  //     accountsController.state.internalAccounts.accounts[accountId] = account;

  //     const snapState = {
  //       snaps: {
  //         [snapId]: { id: snapId, enabled: true },
  //       },
  //     };

  //
  //     accountsController.onSnapStateChange(snapState);

  //
  //     expect(
  //       accountsController.state.internalAccounts.accounts[accountId].metadata
  //         .snap.enabled,
  //     ).toBe(true);
  //   });
  // });

  // describe('updateAccounts', () => {
  //   it('should update accounts with legacy accounts', async () => {
  //
  //     const accountsController = new AccountsController();
  //     const legacyAccounts = [
  //       { address: '0x123', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0x456', metadata: { keyring: { type: 'Simple Keyring' } } },
  //     ];
  //     const snapAccounts = [];

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
  //       legacyAccounts,
  //     );
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

  //   it('should remove duplicate accounts from snap and legacy accounts', async () => {
  //
  //     const accountsController = new AccountsController();
  //     const legacyAccounts = [
  //       { address: '0x123', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0x456', metadata: { keyring: { type: 'Simple Keyring' } } },
  //     ];
  //     const snapAccounts = [
  //       { address: '0x456', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0x789', metadata: { keyring: { type: 'Simple Keyring' } } },
  //     ];
  //     const expectedAccounts = [
  //       { address: '0x123', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0x456', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0x789', metadata: { keyring: { type: 'Simple Keyring' } } },
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
  //       expectedAccounts,
  //     );
  //   });

  //   it('should update keyring types', async () => {
  //
  //     const accountsController = new AccountsController();
  //     const legacyAccounts = [
  //       { address: '0x123', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0x456', metadata: { keyring: { type: 'Simple Keyring' } } },
  //     ];
  //     const snapAccounts = [
  //       { address: '0x789', metadata: { keyring: { type: 'Simple Keyring' } } },
  //       { address: '0xabc', metadata: { keyring: { type: 'Ledger Keyring' } } },
  //     ];
  //     const expectedKeyringTypes = new Map([
  //       ['Simple Keyring', 2],
  //       ['Ledger Keyring', 1],
  //     ]);

  //
  //     jest
  //       .spyOn(accountsController, '#listLegacyAccounts')
  //       .mockResolvedValue(legacyAccounts);
  //     jest
  //       .spyOn(accountsController, '#listSnapAccounts')
  //       .mockResolvedValue(snapAccounts);
  //     await accountsController.updateAccounts();

  //
  //     expect(accountsController.state.internalAccounts.keyringTypes).toEqual(
  //       expectedKeyringTypes,
  //     );
  //   });
  // });

  // describe('getAccount', () => {
  //   it('should return an account by ID', () => {
  //     const accountsController = setupAccountsController({
  //       internalAccounts: {
  //         accounts: { [mockAccount.id]: mockAccount },
  //       },
  //     });

  //     const result = accountsController.getAccount(mockAccount.id);

  //     expect(result).toStrictEqual(setLastSelectedAsAny(mockAccount));
  //   });
  // });

  // it('should return undefined for an unknown account ID', () => {
  //   const accountsController = setupAccountsController({
  //     internalAccounts: {
  //       accounts: { [mockAccount.id]: mockAccount },
  //     },
  //   });

  //   const result = accountsController.getAccount("I don't exist");

  //   expect(result).toBeUndefined();
  // });

  // describe('listAccounts', () => {
  //   it('should return a list of accounts', () => {
  //     const accountsController = setupAccountsController({
  //       internalAccounts: {
  //         accounts: {
  //           [mockAccount.id]: mockAccount,
  //           [mockAccount2.id]: mockAccount2,
  //         },
  //       },
  //     });

  //     const result = accountsController.listAccounts();

  //     expect(result).toEqual([
  //       setLastSelectedAsAny(mockAccount),
  //       setLastSelectedAsAny(mockAccount2),
  //     ]);
  //   });
  // });

  // describe('getAccountExpect', () => {
  //   it('should return an account by ID', () => {
  //     const accountsController = setupAccountsController({
  //       internalAccounts: {
  //         accounts: {
  //           [mockAccount.id]: mockAccount,
  //         },
  //       },
  //     });
  //     const result = accountsController.getAccountExpect(mockAccount.id);

  //     expect(result).toStrictEqual(setLastSelectedAsAny(mockAccount));
  //   });

  //   it('should throw an error for an unknown account ID', () => {
  //     const accountsController = setupAccountsController({
  //       internalAccounts: {
  //         accounts: {
  //           [mockAccount.id]: mockAccount,
  //         },
  //       },
  //     });

  //     expect(() => accountsController.getAccountExpect('unknown id')).toThrow(
  //       `Account Id unknown id not found`,
  //     );
  //   });
  // });

  describe('getSelectedAccount', () => {
    it('should return the selected account', () => {
      const accountsController = setupAccountsController({
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
          },
          selectedAccount: mockAccount.id,
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
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
            [mockAccount2.id]: mockAccount2,
          },
          selectedAccount: mockAccount.id,
        },
      });

      accountsController.setSelectedAccount(mockAccount2.id);

      expect(
        accountsController.state.internalAccounts.selectedAccount,
      ).toStrictEqual(mockAccount2.id);
    });

    it('should throw an error for an unknown account ID', () => {
      const accountsController = setupAccountsController({
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
            [mockAccount2.id]: mockAccount2,
          },
          selectedAccount: mockAccount.id,
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
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
          },
          selectedAccount: mockAccount.id,
        },
      });

      accountsController.setAccountName(mockAccount.id, 'new name');

      expect(accountsController.getAccountExpect(mockAccount.id).name).toBe(
        'new name',
      );
    });

    it('should throw an error if the account name already exists', () => {
      const accountsController = setupAccountsController({
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
            [mockAccount2.id]: mockAccount2,
          },
          selectedAccount: mockAccount.id,
        },
      });

      expect(() =>
        accountsController.setAccountName(mockAccount.id, 'Account 2'),
      ).toThrow('Account name already exists');
    });

    it('should throw an error if the account ID is not found', () => {
      const accountsController = setupAccountsController({
        internalAccounts: {
          accounts: {
            [mockAccount.id]: mockAccount,
          },
          selectedAccount: mockAccount.id,
        },
      });
      expect(() =>
        accountsController.setAccountName('unknown account', 'new name'),
      ).toThrow(`Account Id unknown account not found`);
    });
  });
});
