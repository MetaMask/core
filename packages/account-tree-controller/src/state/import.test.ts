import {
  AccountWalletType,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { AccountGroupType } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { ImportContext } from './import.js';
import { importState } from './import.js';
import { AccountTreeSnapshot } from './snapshot.js';

// Valid 20-byte hex addresses for use with getUUIDFromAddressOfNormalAccount.
const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ADDR_C = '0xcccccccccccccccccccccccccccccccccccccccc';

const MOCK_ENTROPY_ID = 'mock-entropy-id';
const MOCK_HD_WALLET_ID = toMultichainAccountWalletId(MOCK_ENTROPY_ID);
const MOCK_HD_GROUP_ID_0 = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 0);
const MOCK_HD_GROUP_ID_1 = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 1);
const MOCK_PK_WALLET_ID = toAccountWalletId(
  AccountWalletType.Keyring,
  KeyringTypes.simple,
);

const MOCK_PAYLOAD_WALLET_ID = `wallet:${MOCK_ENTROPY_ID}` as const;

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const MNEMONIC_PAYLOAD = {
  wallets: [
    {
      id: MOCK_PAYLOAD_WALLET_ID,
      type: 'mnemonic',
      metadata: { name: 'My Renamed Wallet' },
      groups: [
        {
          id: `${MOCK_PAYLOAD_WALLET_ID}/0`,
          groupIndex: 0,
          metadata: { name: 'Renamed Account 1', pinned: true, hidden: false },
        },
        {
          id: `${MOCK_PAYLOAD_WALLET_ID}/1`,
          groupIndex: 1,
          metadata: { name: 'Renamed Account 2', pinned: false, hidden: true },
        },
      ],
    },
  ],
};

function makeHdWalletState(): AccountTreeControllerState['accountTree']['wallets'] {
  return {
    [MOCK_HD_WALLET_ID]: {
      id: MOCK_HD_WALLET_ID,
      type: AccountWalletType.Entropy,
      status: 'ready',
      groups: {
        [MOCK_HD_GROUP_ID_0]: {
          id: MOCK_HD_GROUP_ID_0,
          type: AccountGroupType.MultichainAccount,
          accounts: ['account-1'],
          metadata: {
            name: 'Account 1',
            entropy: { groupIndex: 0 },
            pinned: false,
            hidden: false,
            lastSelected: 0,
          },
        },
        [MOCK_HD_GROUP_ID_1]: {
          id: MOCK_HD_GROUP_ID_1,
          type: AccountGroupType.MultichainAccount,
          accounts: ['account-2'],
          metadata: {
            name: 'Account 2',
            entropy: { groupIndex: 1 },
            pinned: false,
            hidden: false,
            lastSelected: 0,
          },
        },
      },
      metadata: { name: 'Wallet 1', entropy: { id: MOCK_ENTROPY_ID } },
    },
  };
}

/**
 * Creates an ImportContext with individual jest mocks per action.
 *
 * `walletsRef.current` can be mutated by tests to simulate state changes that
 * happen during an import (e.g., wallet creation events updating the tree).
 *
 * @param options - Setup options.
 * @param options.wallets - Initial wallet state (default: empty).
 * @returns context, mocks (per-action jest.fn()s), and the mutable walletsRef.
 */
function setup({
  wallets = {} as AccountTreeControllerState['accountTree']['wallets'],
}: {
  wallets?: AccountTreeControllerState['accountTree']['wallets'];
} = {}): {
  context: ImportContext;
  /* eslint-disable @typescript-eslint/naming-convention */
  mocks: {
    KeyringController: {
      withKeyringV2Unsafe: jest.Mock;
      withController: jest.Mock;
    };
    MultichainAccountService: {
      createMultichainAccountWallet: jest.Mock;
      createMultichainAccountGroups: jest.Mock;
    };
    setters: {
      setWalletName: jest.Mock;
      setGroupName: jest.Mock;
      setGroupPinned: jest.Mock;
      setGroupHidden: jest.Mock;
    };
  };
  /* eslint-enable @typescript-eslint/naming-convention */
  walletsRef: { current: AccountTreeControllerState['accountTree']['wallets'] };
} {
  const walletsRef = { current: wallets };

  const mocks = {
    KeyringController: {
      withKeyringV2Unsafe: jest.fn(),
      withController: jest.fn(),
    },
    MultichainAccountService: {
      createMultichainAccountWallet: jest.fn(),
      createMultichainAccountGroups: jest.fn().mockResolvedValue(undefined),
    },
    setters: {
      setWalletName: jest.fn(),
      setGroupName: jest.fn(),
      setGroupPinned: jest.fn(),
      setGroupHidden: jest.fn(),
    },
  };

  const messenger = {
    call: jest.fn().mockImplementation((action: string, ...args: unknown[]) => {
      switch (action) {
        case 'KeyringController:withKeyringV2Unsafe':
          return mocks.KeyringController.withKeyringV2Unsafe(...args);
        case 'KeyringController:withController':
          return mocks.KeyringController.withController(...args);
        case 'MultichainAccountService:createMultichainAccountWallet':
          return mocks.MultichainAccountService.createMultichainAccountWallet(
            ...args,
          );
        case 'MultichainAccountService:createMultichainAccountGroups':
          return mocks.MultichainAccountService.createMultichainAccountGroups(
            ...args,
          );
        default:
          return undefined;
      }
    }),
  } as unknown as AccountTreeControllerMessenger;

  const context: ImportContext = {
    getState: () => ({
      accountTree: { wallets: walletsRef.current },
      selectedAccountGroup: '',
      isAccountTreeSyncingInProgress: false,
      hasAccountTreeSyncingSyncedAtLeastOnce: false,
      accountGroupsMetadata: {},
      accountWalletsMetadata: {},
    }),
    messenger,
    setWalletName: mocks.setters.setWalletName,
    setGroupName: mocks.setters.setGroupName,
    setGroupPinned: mocks.setters.setGroupPinned,
    setGroupHidden: mocks.setters.setGroupHidden,
  };

  return { context, mocks, walletsRef };
}

function makeWithKeyringV2UnsafeMock(keyring: unknown): jest.Mock {
  return jest
    .fn()
    .mockImplementation(
      async (_selector: unknown, fn: (ctx: { keyring: unknown }) => unknown) =>
        fn({ keyring }),
    );
}

type WithControllerFn = (ctx: {
  keyrings: { keyring: { type: string }; keyringV2: unknown }[];
  addNewKeyring: jest.Mock;
}) => Promise<unknown>;

function makeWithControllerMock({
  existingKeyringV2,
  newKeyringV2,
}: {
  existingKeyringV2?: unknown;
  newKeyringV2?: unknown;
} = {}): jest.Mock {
  return jest.fn().mockImplementation(async (fn: WithControllerFn) => {
    const keyrings = existingKeyringV2
      ? [
          {
            keyring: { type: KeyringTypes.simple },
            keyringV2: existingKeyringV2,
          },
        ]
      : [];
    const addNewKeyring = jest.fn().mockResolvedValue({
      keyring: { type: KeyringTypes.simple },
      keyringV2: newKeyringV2,
    });
    return fn({ keyrings, addNewKeyring });
  });
}

async function importSnapshot(
  context: ImportContext,
  payload: unknown,
): ReturnType<typeof importState> {
  return importState(context, await AccountTreeSnapshot.deserialize(payload));
}

describe('importState', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('mnemonic wallets', () => {
    it('applies metadata to existing groups when the wallet already exists locally', async () => {
      const { context, mocks } = setup({ wallets: makeHdWalletState() });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );

      await importSnapshot(context, MNEMONIC_PAYLOAD);

      expect(mocks.setters.setWalletName).toHaveBeenCalledWith(
        MOCK_HD_WALLET_ID,
        'My Renamed Wallet',
      );
      expect(mocks.setters.setGroupName).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        'Renamed Account 1',
      );
      expect(mocks.setters.setGroupPinned).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        true,
      );
      expect(mocks.setters.setGroupHidden).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_0,
        false,
      );
      expect(mocks.setters.setGroupName).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        'Renamed Account 2',
      );
      expect(mocks.setters.setGroupPinned).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        false,
      );
      expect(mocks.setters.setGroupHidden).toHaveBeenCalledWith(
        MOCK_HD_GROUP_ID_1,
        true,
      );
    });

    it('skips non-mnemonic wallets when searching for a matching entropy source', async () => {
      const pkWalletId = toAccountWalletId(
        AccountWalletType.Keyring,
        KeyringTypes.simple,
      );
      const pkOnlyWallets: AccountTreeControllerState['accountTree']['wallets'] =
        {
          [pkWalletId]: {
            id: pkWalletId,
            type: AccountWalletType.Keyring,
            status: 'ready',
            groups: {},
            metadata: {
              name: 'Imported',
              keyring: { type: KeyringTypes.simple },
            },
          },
        };
      const { context, mocks } = setup({ wallets: pkOnlyWallets });

      const payload = {
        wallets: [
          {
            id: 'wallet:entropy-only',
            type: 'mnemonic',
            // No mnemonic -> will early-return after not finding the wallet.
            metadata: { name: 'X' },
            groups: [],
          },
        ],
      };

      await importSnapshot(context, payload);
      expect(mocks.setters.setWalletName).not.toHaveBeenCalled();
    });

    it('skips import when no local wallet matches and no mnemonic is in the payload', async () => {
      const { context, mocks } = setup({ wallets: makeHdWalletState() });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => 'different-entropy-id',
        },
      );

      const payloadWithoutMnemonic = {
        wallets: [
          {
            id: 'wallet:unknown-entropy',
            type: 'mnemonic',
            metadata: { name: 'Unknown' },
            groups: [],
          },
        ],
      };
      await importSnapshot(context, payloadWithoutMnemonic);
      expect(mocks.setters.setWalletName).not.toHaveBeenCalled();
    });

    it('throws when createMultichainAccountWallet returns an id not found in state', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => 'no-match-entropy',
        },
      );
      mocks.MultichainAccountService.createMultichainAccountWallet.mockResolvedValue(
        {
          id: 'entropy:wallet-that-does-not-exist',
        },
      );

      await expect(
        importSnapshot(context, {
          wallets: [
            {
              id: 'wallet:no-match-entropy',
              type: 'mnemonic',
              value: TEST_MNEMONIC,
              metadata: { name: 'Wallet' },
              groups: [],
            },
          ],
        }),
      ).rejects.toThrow('wallet not found after creation');
    });

    it('throws when the wallet found after creation is not a mnemonic wallet', async () => {
      const { context, mocks, walletsRef } = setup();
      const fakeWalletId = toAccountWalletId(
        AccountWalletType.Keyring,
        KeyringTypes.simple,
      );

      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => 'no-match',
        },
      );
      mocks.MultichainAccountService.createMultichainAccountWallet.mockImplementation(
        async () => {
          // Inject a keyring wallet (not entropy) at the returned ID.
          walletsRef.current = {
            [fakeWalletId]: {
              id: fakeWalletId,
              type: AccountWalletType.Keyring,
              status: 'ready',
              groups: {},
              metadata: {
                name: 'Not Mnemonic',
                keyring: { type: KeyringTypes.simple },
              },
            },
          };
          return { id: fakeWalletId };
        },
      );

      await expect(
        importSnapshot(context, {
          wallets: [
            {
              id: 'wallet:no-match',
              type: 'mnemonic',
              value: TEST_MNEMONIC,
              metadata: { name: 'Wallet' },
              groups: [],
            },
          ],
        }),
      ).rejects.toThrow("wallet is not of type 'mnemonic'");
    });

    it('creates a new HD wallet when not found locally and mnemonic is provided', async () => {
      const { context, mocks, walletsRef } = setup();

      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );
      mocks.MultichainAccountService.createMultichainAccountWallet.mockImplementation(
        async () => {
          walletsRef.current = makeHdWalletState();
          return { id: MOCK_HD_WALLET_ID };
        },
      );

      const payloadWithMnemonic = {
        wallets: [
          {
            id: 'wallet:unknown-entropy',
            type: 'mnemonic',
            value: TEST_MNEMONIC,
            metadata: { name: 'My Renamed Wallet' },
            groups: [
              {
                id: 'wallet:unknown-entropy/0',
                groupIndex: 0,
                metadata: { name: 'Account 1', pinned: false, hidden: false },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payloadWithMnemonic);

      expect(
        mocks.MultichainAccountService.createMultichainAccountWallet,
      ).toHaveBeenCalledWith(expect.objectContaining({ type: 'import' }));
      expect(mocks.setters.setWalletName).toHaveBeenCalledWith(
        MOCK_HD_WALLET_ID,
        'My Renamed Wallet',
      );
    });

    it('creates missing groups at the end of the payload list', async () => {
      const stateWithOneGroup: AccountTreeControllerState['accountTree']['wallets'] =
        {
          [MOCK_HD_WALLET_ID]: {
            id: MOCK_HD_WALLET_ID,
            type: AccountWalletType.Entropy,
            status: 'ready',
            groups: {
              [MOCK_HD_GROUP_ID_0]: {
                id: MOCK_HD_GROUP_ID_0,
                type: AccountGroupType.MultichainAccount,
                accounts: ['account-1'],
                metadata: {
                  name: 'Account 1',
                  entropy: { groupIndex: 0 },
                  pinned: false,
                  hidden: false,
                  lastSelected: 0,
                },
              },
            },
            metadata: { name: 'Wallet 1', entropy: { id: MOCK_ENTROPY_ID } },
          },
        };

      const { context, mocks } = setup({ wallets: stateWithOneGroup });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );

      const payload = {
        wallets: [
          {
            id: MOCK_PAYLOAD_WALLET_ID,
            type: 'mnemonic',
            metadata: { name: 'Wallet 1' },
            groups: [
              {
                id: `${MOCK_PAYLOAD_WALLET_ID}/0`,
                groupIndex: 0,
                metadata: { name: 'Account 1', pinned: false, hidden: false },
              },
              {
                id: `${MOCK_PAYLOAD_WALLET_ID}/1`,
                groupIndex: 1,
                metadata: { name: 'Account 2', pinned: true, hidden: false },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payload);

      expect(
        mocks.MultichainAccountService.createMultichainAccountGroups,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          entropySource: MOCK_ENTROPY_ID,
          fromGroupIndex: 1,
          toGroupIndex: 1,
        }),
      );
    });

    it('creates missing groups in the middle of the payload list', async () => {
      const group2Id = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 2);
      const stateWithGap: AccountTreeControllerState['accountTree']['wallets'] =
        {
          [MOCK_HD_WALLET_ID]: {
            id: MOCK_HD_WALLET_ID,
            type: AccountWalletType.Entropy,
            status: 'ready',
            groups: {
              [MOCK_HD_GROUP_ID_0]: {
                id: MOCK_HD_GROUP_ID_0,
                type: AccountGroupType.MultichainAccount,
                accounts: ['account-0'],
                metadata: {
                  name: 'Account 0',
                  entropy: { groupIndex: 0 },
                  pinned: false,
                  hidden: false,
                  lastSelected: 0,
                },
              },
              [group2Id]: {
                id: group2Id,
                type: AccountGroupType.MultichainAccount,
                accounts: ['account-2'],
                metadata: {
                  name: 'Account 2',
                  entropy: { groupIndex: 2 },
                  pinned: false,
                  hidden: false,
                  lastSelected: 0,
                },
              },
            },
            metadata: { name: 'Wallet 1', entropy: { id: MOCK_ENTROPY_ID } },
          },
        };

      const { context, mocks } = setup({ wallets: stateWithGap });
      mocks.KeyringController.withKeyringV2Unsafe = makeWithKeyringV2UnsafeMock(
        {
          toEntropySourceId: async () => MOCK_ENTROPY_ID,
        },
      );

      const payload = {
        wallets: [
          {
            id: MOCK_PAYLOAD_WALLET_ID,
            type: 'mnemonic',
            metadata: { name: 'Wallet 1' },
            groups: [
              {
                id: `${MOCK_PAYLOAD_WALLET_ID}/0`,
                groupIndex: 0,
                metadata: { name: 'Account 0', pinned: false, hidden: false },
              },
              {
                id: `${MOCK_PAYLOAD_WALLET_ID}/1`,
                groupIndex: 1,
                metadata: {
                  name: 'Account 1 (missing)',
                  pinned: false,
                  hidden: false,
                },
              },
              {
                id: `${MOCK_PAYLOAD_WALLET_ID}/2`,
                groupIndex: 2,
                metadata: { name: 'Account 2', pinned: false, hidden: false },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payload);

      expect(
        mocks.MultichainAccountService.createMultichainAccountGroups,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ fromGroupIndex: 1, toGroupIndex: 1 }),
      );
    });
  });

  describe('private-key wallets', () => {
    it('applies metadata to an existing private-key account group', async () => {
      const accountId = getUUIDFromAddressOfNormalAccount(ADDR_A);
      const pkGroupId = toAccountGroupId(MOCK_PK_WALLET_ID, ADDR_A);

      const pkWallets: AccountTreeControllerState['accountTree']['wallets'] = {
        [MOCK_PK_WALLET_ID]: {
          id: MOCK_PK_WALLET_ID,
          type: AccountWalletType.Keyring,
          status: 'ready',
          groups: {
            [pkGroupId]: {
              id: pkGroupId,
              type: AccountGroupType.SingleAccount,
              accounts: [accountId],
              metadata: {
                name: 'Imported 1',
                pinned: false,
                hidden: false,
                lastSelected: 0,
              },
            },
          },
          metadata: {
            name: 'Imported Accounts',
            keyring: { type: KeyringTypes.simple },
          },
        },
      };

      const { context, mocks } = setup({ wallets: pkWallets });

      const payload = {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_A}`,
                metadata: {
                  name: 'Renamed Imported',
                  pinned: true,
                  hidden: false,
                },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payload);

      expect(mocks.setters.setGroupName).toHaveBeenCalledWith(
        pkGroupId,
        'Renamed Imported',
      );
      expect(mocks.setters.setGroupPinned).toHaveBeenCalledWith(
        pkGroupId,
        true,
      );
      expect(mocks.setters.setGroupHidden).toHaveBeenCalledWith(
        pkGroupId,
        false,
      );
    });

    it('creates a new simple keyring when none exists (onboarding)', async () => {
      const newAccountId = getUUIDFromAddressOfNormalAccount(ADDR_B);
      const pkGroupId = toAccountGroupId(MOCK_PK_WALLET_ID, ADDR_B);

      const { context, mocks, walletsRef } = setup();

      const keyringV2 = {
        createAccounts: jest.fn().mockImplementation(async () => {
          walletsRef.current = {
            [MOCK_PK_WALLET_ID]: {
              id: MOCK_PK_WALLET_ID,
              type: AccountWalletType.Keyring,
              status: 'ready',
              groups: {
                [pkGroupId]: {
                  id: pkGroupId,
                  type: AccountGroupType.SingleAccount,
                  accounts: [newAccountId],
                  metadata: {
                    name: 'New Import',
                    pinned: false,
                    hidden: false,
                    lastSelected: 0,
                  },
                },
              },
              metadata: {
                name: 'Imported Accounts',
                keyring: { type: KeyringTypes.simple },
              },
            },
          };
          return [{ id: newAccountId }];
        }),
      };
      // No existingKeyringV2 -> addNewKeyring will be called.
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: keyringV2,
      });

      await importSnapshot(context, {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_B}`,
                value: { privateKey: '0xdeadbeef', encoding: 'hexadecimal' },
                metadata: { name: 'New Import', pinned: false, hidden: false },
              },
            ],
          },
        ],
      });

      // addNewKeyring was invoked (keyrings array was empty).
      const [[fn]] = mocks.KeyringController.withController.mock.calls as [
        [WithControllerFn],
      ];
      const addNewKeyring = jest.fn().mockResolvedValue({
        keyring: { type: KeyringTypes.simple },
        keyringV2,
      });
      await fn({ keyrings: [], addNewKeyring });
      expect(addNewKeyring).toHaveBeenCalledWith(KeyringTypes.simple);
      expect(keyringV2.createAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'private-key:import',
          accountType: EthAccountType.Eoa,
          privateKey: '0xdeadbeef',
          encoding: 'hexadecimal',
        }),
      );
    });

    it('reuses the existing simple keyring when one is already present', async () => {
      const newAccountId = getUUIDFromAddressOfNormalAccount(ADDR_B);
      const pkGroupId = toAccountGroupId(MOCK_PK_WALLET_ID, ADDR_B);

      const { context, mocks, walletsRef } = setup();

      const keyringV2 = {
        createAccounts: jest.fn().mockImplementation(async () => {
          walletsRef.current = {
            [MOCK_PK_WALLET_ID]: {
              id: MOCK_PK_WALLET_ID,
              type: AccountWalletType.Keyring,
              status: 'ready',
              groups: {
                [pkGroupId]: {
                  id: pkGroupId,
                  type: AccountGroupType.SingleAccount,
                  accounts: [newAccountId],
                  metadata: {
                    name: 'New Import',
                    pinned: false,
                    hidden: false,
                    lastSelected: 0,
                  },
                },
              },
              metadata: {
                name: 'Imported Accounts',
                keyring: { type: KeyringTypes.simple },
              },
            },
          };
          return [{ id: newAccountId }];
        }),
      };
      // existingKeyringV2 provided -> addNewKeyring must NOT be called.
      mocks.KeyringController.withController = makeWithControllerMock({
        existingKeyringV2: keyringV2,
      });

      await importSnapshot(context, {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_B}`,
                value: { privateKey: '0xdeadbeef', encoding: 'hexadecimal' },
                metadata: { name: 'New Import', pinned: false, hidden: false },
              },
            ],
          },
        ],
      });

      // addNewKeyring was NOT invoked (existing keyring was reused).
      const [[fn]] = mocks.KeyringController.withController.mock.calls as [
        [WithControllerFn],
      ];
      const addNewKeyring = jest.fn();
      await fn({
        keyrings: [{ keyring: { type: KeyringTypes.simple }, keyringV2 }],
        addNewKeyring,
      });
      expect(addNewKeyring).not.toHaveBeenCalled();
      expect(keyringV2.createAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'private-key:import',
          accountType: EthAccountType.Eoa,
          privateKey: '0xdeadbeef',
          encoding: 'hexadecimal',
        }),
      );
    });

    it('imports a private key when the account does not exist locally', async () => {
      const newAccountId = getUUIDFromAddressOfNormalAccount(ADDR_B);
      const pkGroupId = toAccountGroupId(MOCK_PK_WALLET_ID, ADDR_B);

      const { context, mocks, walletsRef } = setup();

      // Simulate the wallet tree being updated during the import and the
      // new account being returned by createAccounts.
      const keyringV2 = {
        createAccounts: jest.fn().mockImplementation(async () => {
          walletsRef.current = {
            [MOCK_PK_WALLET_ID]: {
              id: MOCK_PK_WALLET_ID,
              type: AccountWalletType.Keyring,
              status: 'ready',
              groups: {
                [pkGroupId]: {
                  id: pkGroupId,
                  type: AccountGroupType.SingleAccount,
                  accounts: [newAccountId],
                  metadata: {
                    name: 'New Import',
                    pinned: false,
                    hidden: false,
                    lastSelected: 0,
                  },
                },
              },
              metadata: {
                name: 'Imported Accounts',
                keyring: { type: KeyringTypes.simple },
              },
            },
          };
          return [{ id: newAccountId }];
        }),
      };
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: keyringV2,
      });

      const payload = {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_B}`,
                value: { privateKey: '0xdeadbeef', encoding: 'hexadecimal' },
                metadata: { name: 'New Import', pinned: false, hidden: false },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payload);

      expect(mocks.KeyringController.withController).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(keyringV2.createAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'private-key:import',
          accountType: EthAccountType.Eoa,
          privateKey: '0xdeadbeef',
          encoding: 'hexadecimal',
        }),
      );
      expect(mocks.setters.setGroupName).toHaveBeenCalledWith(
        pkGroupId,
        'New Import',
      );
    });

    it('throws when createAccounts returns an empty account list', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: { createAccounts: jest.fn().mockResolvedValue([]) },
      });

      await expect(
        importSnapshot(context, {
          wallets: [
            {
              id: 'wallet:private-key',
              type: 'private-key',
              metadata: { name: 'Imported Accounts' },
              groups: [
                {
                  id: `wallet:private-key/${ADDR_C}`,
                  value: { privateKey: '0xdeadbeef', encoding: 'hexadecimal' },
                  metadata: { name: 'Fail', pinned: false, hidden: false },
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow('Failed to import private key for account');
    });

    it('throws when the keyring has no v2 interface', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: undefined,
      });

      await expect(
        importSnapshot(context, {
          wallets: [
            {
              id: 'wallet:private-key',
              type: 'private-key',
              metadata: { name: 'Imported Accounts' },
              groups: [
                {
                  id: `wallet:private-key/${ADDR_C}`,
                  value: { privateKey: '0xdeadbeef', encoding: 'hexadecimal' },
                  metadata: { name: 'Fail', pinned: false, hidden: false },
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow('Simple keyring has no v2 interface');
    });

    it('skips a private-key group whose value carries a non-EVM type', async () => {
      const { context, mocks } = setup();

      const payload = {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_A}`,
                value: {
                  privateKey: '5Kb8kLf9z...',
                  encoding: 'base58',
                  type: 'bip122:p2wpkh',
                },
                metadata: {
                  name: 'Bitcoin Account',
                  pinned: false,
                  hidden: false,
                },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payload);
      expect(mocks.KeyringController.withController).not.toHaveBeenCalled();
      expect(mocks.setters.setGroupName).not.toHaveBeenCalled();
    });

    it('does not skip a private-key group whose value type is eip155:eoa', async () => {
      const { context, mocks } = setup();
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: { createAccounts: jest.fn().mockResolvedValue([]) },
      });

      const payload = {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_A}`,
                value: {
                  privateKey: '0xdeadbeef',
                  encoding: 'hexadecimal',
                  type: EthAccountType.Eoa,
                },
                metadata: { name: 'EVM Account', pinned: false, hidden: false },
              },
            ],
          },
        ],
      };

      // withController is called (not skipped), but createAccounts returns [] so it throws.
      await expect(importSnapshot(context, payload)).rejects.toThrow(
        'Failed to import private key for account',
      );
      expect(mocks.KeyringController.withController).toHaveBeenCalled();
    });

    it('skips a private-key group that has no value and account does not exist locally', async () => {
      const { context, mocks } = setup();

      const payload = {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_C}`,
                // No value -> skip.
                metadata: { name: 'Missing', pinned: false, hidden: false },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payload);
      expect(mocks.setters.setGroupName).not.toHaveBeenCalled();
    });

    it('skips metadata when the local group is not found after import', async () => {
      const { context, mocks } = setup();
      // State stays empty -- the import succeeds but leaves no group in the tree.
      mocks.KeyringController.withController = makeWithControllerMock({
        newKeyringV2: {
          createAccounts: jest
            .fn()
            .mockResolvedValue([{ id: 'some-account-id' }]),
        },
      });

      const payload = {
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: 'Imported Accounts' },
            groups: [
              {
                id: `wallet:private-key/${ADDR_C}`,
                value: { privateKey: '0xdeadbeef', encoding: 'hexadecimal' },
                metadata: { name: 'Orphan', pinned: false, hidden: false },
              },
            ],
          },
        ],
      };

      await importSnapshot(context, payload);
      expect(mocks.setters.setGroupName).not.toHaveBeenCalled();
    });
  });
});
