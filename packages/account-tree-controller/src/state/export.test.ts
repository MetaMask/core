import {
  AccountWalletType,
  toAccountGroupId,
  toMultichainAccountGroupId,
  toAccountWalletId,
} from '@metamask/account-api';
import { AccountGroupType } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import { SnapId } from '@metamask/snaps-sdk';

import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from '../types.js';
import type { ExportContext } from './export.js';
import {
  exportState,
  isMnemonicWalletObject,
  isPrivateKeyWalletObject,
} from './export.js';
import {
  AccountWalletMnemonicGroupEntry,
  AccountWalletPayloadType,
  AccountWalletPrivateKeyEncoding,
  toGroupPayloadId,
  toWalletPayloadId,
} from './payload.js';

const MOCK_PRIVATE_KEY_PAYLOAD_ID = toWalletPayloadId(
  AccountWalletPayloadType.PrivateKey,
);

const MOCK_HD_WALLET_ID = toAccountWalletId(
  AccountWalletType.Entropy,
  'mock-entropy-id',
);
const MOCK_HD_GROUP_ID = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 0);
const MOCK_PRIVATE_KEY_WALLET_ID = toAccountWalletId(
  AccountWalletType.Keyring,
  KeyringTypes.simple,
);
const MOCK_PRIVATE_KEY_GROUP_ID = toAccountGroupId(
  MOCK_PRIVATE_KEY_WALLET_ID,
  '0xabc',
);

const MOCK_HD_WALLET_STATE: AccountTreeControllerState['accountTree']['wallets'] =
  {
    [MOCK_HD_WALLET_ID]: {
      id: MOCK_HD_WALLET_ID,
      type: AccountWalletType.Entropy,
      status: 'ready',
      groups: {
        [MOCK_HD_GROUP_ID]: {
          id: MOCK_HD_GROUP_ID,
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
      metadata: {
        name: 'Wallet 1',
        entropy: { id: 'mock-entropy-id' },
      },
    },
  };

const MOCK_PRIVATE_KEY_WALLET_STATE: AccountTreeControllerState['accountTree']['wallets'] =
  {
    [MOCK_PRIVATE_KEY_WALLET_ID]: {
      id: MOCK_PRIVATE_KEY_WALLET_ID,
      type: AccountWalletType.Keyring,
      status: 'ready',
      groups: {
        [MOCK_PRIVATE_KEY_GROUP_ID]: {
          id: MOCK_PRIVATE_KEY_GROUP_ID,
          type: AccountGroupType.SingleAccount,
          accounts: ['account-pk-1'],
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

/**
 * Creates an ExportContext with individual jest mocks per action so tests can
 * configure them with `.mockReturnValue` / `.mockImplementation`.
 *
 * @param options - Setup options.
 * @param options.wallets - Initial wallet state.
 * @param options.isUnlocked - Whether the vault reports as unlocked (default: true).
 * @returns context, mocks (per-action jest.fn()s), and the raw messenger mock.
 */
function setup({
  wallets = {} as AccountTreeControllerState['accountTree']['wallets'],
  isUnlocked = true,
}: {
  wallets?: AccountTreeControllerState['accountTree']['wallets'];
  isUnlocked?: boolean;
} = {}): {
  context: ExportContext;
  /* eslint-disable @typescript-eslint/naming-convention */
  mocks: {
    KeyringController: {
      getState: jest.Mock;
      withKeyringV2Unsafe: jest.Mock;
      withKeyringV2: jest.Mock;
    };
    AccountsController: { getAccount: jest.Mock };
  };
  /* eslint-enable @typescript-eslint/naming-convention */
  messenger: AccountTreeControllerMessenger;
} {
  const mocks = {
    KeyringController: {
      getState: jest.fn().mockReturnValue({ isUnlocked, keyrings: [] }),
      withKeyringV2Unsafe: jest.fn(),
      withKeyringV2: jest.fn(),
    },
    AccountsController: {
      getAccount: jest.fn(),
    },
  };

  const messenger = {
    call: jest.fn().mockImplementation((action: string, ...args: unknown[]) => {
      switch (action) {
        case 'KeyringController:getState':
          return mocks.KeyringController.getState();
        case 'KeyringController:withKeyringV2Unsafe':
          return mocks.KeyringController.withKeyringV2Unsafe(...args);
        case 'KeyringController:withKeyringV2':
          return mocks.KeyringController.withKeyringV2(...args);
        case 'AccountsController:getAccount':
          return mocks.AccountsController.getAccount(...args);
        default:
          return undefined;
      }
    }),
  } as unknown as AccountTreeControllerMessenger;

  const state: AccountTreeControllerState = {
    accountTree: { wallets },
    selectedAccountGroup: '',
    isAccountTreeSyncingInProgress: false,
    hasAccountTreeSyncingSyncedAtLeastOnce: false,
    accountGroupsMetadata: {},
    accountWalletsMetadata: {},
  };

  const context: ExportContext = {
    getState: () => state,
    messenger,
  };

  return { context, mocks, messenger };
}

function makeHdKeyringHandler(
  entropySourceId: string,
  mnemonic: Uint8Array | null = null,
): jest.Mock {
  return jest
    .fn()
    .mockImplementation(
      async (
        _selector: unknown,
        callback: (ctx: { keyring: unknown }) => unknown,
      ) =>
        callback({
          keyring: {
            toEntropySourceId: async () => entropySourceId,
            mnemonic,
          },
        }),
    );
}

function makePrivateKeyExportHandler(
  result: { privateKey: string; encoding: string } | undefined,
): jest.Mock {
  return jest
    .fn()
    .mockImplementation(
      async (
        _selector: unknown,
        callback: (ctx: { keyring: unknown }) => unknown,
      ) =>
        callback({
          keyring: {
            exportAccount: async () => result,
          },
        }),
    );
}

describe('isMnemonicWalletObject', () => {
  it('returns true for an entropy wallet', () => {
    expect(
      isMnemonicWalletObject(MOCK_HD_WALLET_STATE[MOCK_HD_WALLET_ID]),
    ).toBe(true);
  });

  it('returns false for a keyring wallet', () => {
    expect(
      isMnemonicWalletObject(
        MOCK_PRIVATE_KEY_WALLET_STATE[MOCK_PRIVATE_KEY_WALLET_ID],
      ),
    ).toBe(false);
  });
});

describe('isPrivateKeyWalletObject', () => {
  it('returns true for a simple-keyring wallet', () => {
    expect(
      isPrivateKeyWalletObject(
        MOCK_PRIVATE_KEY_WALLET_STATE[MOCK_PRIVATE_KEY_WALLET_ID],
      ),
    ).toBe(true);
  });

  it('returns false for an entropy wallet', () => {
    expect(
      isPrivateKeyWalletObject(MOCK_HD_WALLET_STATE[MOCK_HD_WALLET_ID]),
    ).toBe(false);
  });

  it('returns false for a non-simple keyring wallet (e.g. ledger)', () => {
    const ledgerWalletId = toAccountWalletId(
      AccountWalletType.Keyring,
      KeyringTypes.ledger,
    );
    const ledgerGroupId = toAccountGroupId(ledgerWalletId, '0xhw');
    const ledgerWallet: AccountTreeControllerState['accountTree']['wallets'][string] =
      {
        id: ledgerWalletId,
        type: AccountWalletType.Keyring,
        status: 'ready',
        groups: {
          [ledgerGroupId]: {
            id: ledgerGroupId,
            type: AccountGroupType.SingleAccount,
            accounts: ['account-hw-1'],
            metadata: {
              name: 'Ledger 1',
              pinned: false,
              hidden: false,
              lastSelected: 0,
            },
          },
        },
        metadata: { name: 'Ledger', keyring: { type: KeyringTypes.ledger } },
      };
    expect(isPrivateKeyWalletObject(ledgerWallet)).toBe(false);
  });
});

describe('exportState', () => {
  describe('vault locking', () => {
    it('throws when includeSecrets is true and the vault is locked', async () => {
      const { context } = setup({ isUnlocked: false });
      await expect(
        exportState(context, { includeSecrets: true }),
      ).rejects.toThrow(
        'Cannot include secrets in export when vault is locked',
      );
    });

    it('does not throw when includeSecrets is false and vault is locked', async () => {
      const { context } = setup({ isUnlocked: false });
      expect(await exportState(context)).toBeDefined();
    });
  });

  describe('with no wallets', () => {
    it('returns an empty snapshot', async () => {
      const { context } = setup();
      const snapshot = await exportState(context);
      expect(snapshot.serialize().wallets).toHaveLength(0);
    });
  });

  describe('with an HD wallet', () => {
    it('exports the wallet without secrets by default', async () => {
      const { context, mocks } = setup({ wallets: MOCK_HD_WALLET_STATE });
      // encodeMnemonic uses Uint16Array internally -- must be even-length.
      mocks.KeyringController.withKeyringV2Unsafe = makeHdKeyringHandler(
        'stable-entropy-id',
        new Uint8Array([1, 2, 3, 4]),
      );

      const snapshot = await exportState(context);
      const wallet = snapshot.serialize().wallets[0];

      expect(wallet?.id).toBe(toWalletPayloadId('stable-entropy-id'));
      expect(wallet?.type).toBe(AccountWalletPayloadType.Mnemonic);
      expect(wallet?.metadata.name).toBe('Wallet 1');
      expect((wallet as { value?: string }).value).toBeUndefined();
    });

    it('exports the wallet with the mnemonic when includeSecrets is true', async () => {
      const { context, mocks } = setup({ wallets: MOCK_HD_WALLET_STATE });
      mocks.KeyringController.withKeyringV2Unsafe = makeHdKeyringHandler(
        'stable-entropy-id',
        new Uint8Array([1, 2, 3, 4]),
      );

      const snapshot = await exportState(context, { includeSecrets: true });
      const wallet = snapshot.serialize().wallets[0] as { value?: string };

      expect(Array.isArray(wallet.value)).toBe(true);
    });

    it('throws when includeSecrets is true but mnemonic is unavailable', async () => {
      const { context, mocks } = setup({ wallets: MOCK_HD_WALLET_STATE });
      // mnemonic: null -> includeMnemonic will be false -> throws after export.
      mocks.KeyringController.withKeyringV2Unsafe = makeHdKeyringHandler(
        'stable-entropy-id',
        null,
      );

      await expect(
        exportState(context, { includeSecrets: true }),
      ).rejects.toThrow('Failed to export mnemonic');
    });

    it('populates the idMap with wallet and group local↔payload ID pairs', async () => {
      const { context, mocks } = setup({ wallets: MOCK_HD_WALLET_STATE });
      mocks.KeyringController.withKeyringV2Unsafe =
        makeHdKeyringHandler('stable-entropy-id');

      const snapshot = await exportState(context);

      expect(snapshot.toLocalId(toWalletPayloadId('stable-entropy-id'))).toBe(
        MOCK_HD_WALLET_ID,
      );
      expect(
        snapshot.toLocalId(
          toGroupPayloadId(toWalletPayloadId('stable-entropy-id'), 0),
        ),
      ).toBe(MOCK_HD_GROUP_ID);
      expect(snapshot.toPayloadId(MOCK_HD_WALLET_ID)).toBe(
        toWalletPayloadId('stable-entropy-id'),
      );
      expect(snapshot.toPayloadId(MOCK_HD_GROUP_ID)).toBe(
        toGroupPayloadId(toWalletPayloadId('stable-entropy-id'), 0),
      );
    });

    it('exports groups sorted by groupIndex regardless of insertion order', async () => {
      const group0Id = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 0);
      const group1Id = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 1);
      const group2Id = toMultichainAccountGroupId(MOCK_HD_WALLET_ID, 2);

      // Insert groups in reverse order so Object.values() returns them as [2, 1, 0].
      const walletsWithReversedGroups: AccountTreeControllerState['accountTree']['wallets'] =
        {
          [MOCK_HD_WALLET_ID]: {
            id: MOCK_HD_WALLET_ID,
            type: AccountWalletType.Entropy,
            status: 'ready',
            groups: {
              [group2Id]: {
                id: group2Id,
                type: AccountGroupType.MultichainAccount,
                accounts: ['account-3'],
                metadata: {
                  name: 'Account 3',
                  entropy: { groupIndex: 2 },
                  pinned: false,
                  hidden: false,
                  lastSelected: 0,
                },
              },
              [group1Id]: {
                id: group1Id,
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
              [group0Id]: {
                id: group0Id,
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
            metadata: { name: 'Wallet 1', entropy: { id: 'mock-entropy-id' } },
          },
        };

      const { context, mocks } = setup({ wallets: walletsWithReversedGroups });
      mocks.KeyringController.withKeyringV2Unsafe =
        makeHdKeyringHandler('stable-entropy-id');

      const snapshot = await exportState(context);
      const groups = snapshot.serialize().wallets[0]
        ?.groups as AccountWalletMnemonicGroupEntry[];

      expect(groups?.map((group) => group.groupIndex)).toStrictEqual([0, 1, 2]);
    });

    it('skips snap and hardware wallets', async () => {
      const snapWalletId = toAccountWalletId(
        AccountWalletType.Snap,
        'local:mock-snap',
      );
      const ledgerWalletId = toAccountWalletId(
        AccountWalletType.Keyring,
        KeyringTypes.ledger,
      );
      const snapGroupId = toAccountGroupId(snapWalletId, '0xsnap');
      const ledgerGroupId = toAccountGroupId(ledgerWalletId, '0xhw');

      const mixedWallets: AccountTreeControllerState['accountTree']['wallets'] =
        {
          [snapWalletId]: {
            id: snapWalletId,
            type: AccountWalletType.Snap,
            status: 'ready',
            groups: {
              [snapGroupId]: {
                id: snapGroupId,
                type: AccountGroupType.SingleAccount,
                accounts: ['snap-account-1'],
                metadata: {
                  name: 'Snap 1',
                  pinned: false,
                  hidden: false,
                  lastSelected: 0,
                },
              },
            },
            metadata: {
              name: 'Snap Wallet',
              snap: { id: 'local:mock-snap' as SnapId },
            },
          },
          [ledgerWalletId]: {
            id: ledgerWalletId,
            type: AccountWalletType.Keyring,
            status: 'ready',
            groups: {
              [ledgerGroupId]: {
                id: ledgerGroupId,
                type: AccountGroupType.SingleAccount,
                accounts: ['hw-account-1'],
                metadata: {
                  name: 'Ledger 1',
                  pinned: false,
                  hidden: false,
                  lastSelected: 0,
                },
              },
            },
            metadata: {
              name: 'Ledger',
              keyring: { type: KeyringTypes.ledger },
            },
          },
        };

      const { context } = setup({ wallets: mixedWallets });
      const snapshot = await exportState(context);
      expect(snapshot.serialize().wallets).toHaveLength(0);
    });
  });

  describe('with a private-key wallet', () => {
    it('exports the wallet without secrets', async () => {
      const { context, mocks } = setup({
        wallets: MOCK_PRIVATE_KEY_WALLET_STATE,
      });
      mocks.AccountsController.getAccount.mockReturnValue({
        id: 'account-pk-1',
        address: '0xabc',
      });

      const snapshot = await exportState(context);
      const payload = snapshot.serialize();

      expect(payload.wallets).toHaveLength(1);
      const wallet = payload.wallets[0];
      expect(wallet?.id).toBe(MOCK_PRIVATE_KEY_PAYLOAD_ID);
      expect(wallet?.type).toBe(AccountWalletPayloadType.PrivateKey);
      expect(wallet?.groups).toHaveLength(1);
      expect(wallet?.groups[0]?.id).toBe(
        toGroupPayloadId(MOCK_PRIVATE_KEY_PAYLOAD_ID, '0xabc'),
      );
      expect((wallet?.groups[0] as { value?: unknown })?.value).toBeUndefined();
    });

    it('exports the wallet with secrets when includeSecrets is true', async () => {
      const { context, mocks } = setup({
        wallets: MOCK_PRIVATE_KEY_WALLET_STATE,
      });
      mocks.AccountsController.getAccount.mockReturnValue({
        id: 'account-pk-1',
        address: '0xabc',
      });
      mocks.KeyringController.withKeyringV2 = makePrivateKeyExportHandler({
        privateKey: '0xdeadbeef',
        encoding: AccountWalletPrivateKeyEncoding.Hexadecimal,
      });

      const snapshot = await exportState(context, { includeSecrets: true });
      const group = snapshot.serialize().wallets[0]?.groups[0] as {
        value?: { privateKey: number[]; encoding: string; type: string };
      };

      expect(group.value?.privateKey).toStrictEqual(
        Array.from(new TextEncoder().encode('0xdeadbeef')),
      );
      expect(group.value?.encoding).toBe(
        AccountWalletPrivateKeyEncoding.Hexadecimal,
      );
      expect(group.value?.type).toBe('eip155:eoa');
    });

    it('throws when includeSecrets is true but keyring does not support exportAccount', async () => {
      const { context, mocks } = setup({
        wallets: MOCK_PRIVATE_KEY_WALLET_STATE,
      });
      mocks.AccountsController.getAccount.mockReturnValue({
        id: 'account-pk-1',
        address: '0xabc',
      });
      mocks.KeyringController.withKeyringV2.mockImplementation(
        async (
          _selector: unknown,
          callback: (ctx: { keyring: unknown }) => unknown,
        ) => callback({ keyring: {} }), // No exportAccount method.
      );

      await expect(
        exportState(context, { includeSecrets: true }),
      ).rejects.toThrow('does not support exportAccount');
    });

    it('throws when includeSecrets is true but the exported value is absent', async () => {
      const { context, mocks } = setup({
        wallets: MOCK_PRIVATE_KEY_WALLET_STATE,
      });
      mocks.AccountsController.getAccount.mockReturnValue({
        id: 'account-pk-1',
        address: '0xabc',
      });
      mocks.KeyringController.withKeyringV2 =
        makePrivateKeyExportHandler(undefined);

      await expect(
        exportState(context, { includeSecrets: true }),
      ).rejects.toThrow('Failed to export private key');
    });

    it('skips groups whose first account cannot be found', async () => {
      const { context, mocks } = setup({
        wallets: MOCK_PRIVATE_KEY_WALLET_STATE,
      });
      mocks.AccountsController.getAccount.mockReturnValue(undefined);

      const snapshot = await exportState(context);
      expect(snapshot.serialize().wallets[0]?.groups).toHaveLength(0);
    });

    it('skips groups with no accounts', async () => {
      const emptyGroupWalletId = toAccountWalletId(
        AccountWalletType.Keyring,
        KeyringTypes.simple,
      );
      const emptyGroupId = toAccountGroupId(emptyGroupWalletId, '0xempty');
      const wallets: AccountTreeControllerState['accountTree']['wallets'] = {
        [emptyGroupWalletId]: {
          id: emptyGroupWalletId,
          type: AccountWalletType.Keyring,
          status: 'ready',
          groups: {
            [emptyGroupId]: {
              id: emptyGroupId,
              type: AccountGroupType.SingleAccount,
              // @ts-expect-error -- deliberately empty for the test
              accounts: [],
              metadata: {
                name: 'Empty',
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

      const { context } = setup({ wallets });
      const snapshot = await exportState(context);
      expect(snapshot.serialize().wallets[0]?.groups).toHaveLength(0);
    });

    it('populates the idMap with private-key wallet and group pairs', async () => {
      const { context, mocks } = setup({
        wallets: MOCK_PRIVATE_KEY_WALLET_STATE,
      });
      mocks.AccountsController.getAccount.mockReturnValue({
        id: 'account-pk-1',
        address: '0xabc',
      });

      const snapshot = await exportState(context);

      expect(snapshot.toLocalId(MOCK_PRIVATE_KEY_PAYLOAD_ID)).toBe(
        MOCK_PRIVATE_KEY_WALLET_ID,
      );
      expect(
        snapshot.toLocalId(
          toGroupPayloadId(MOCK_PRIVATE_KEY_PAYLOAD_ID, '0xabc'),
        ),
      ).toBe(MOCK_PRIVATE_KEY_GROUP_ID);
    });

    it('merges multiple simple-keyring wallets into one private-key payload entry', async () => {
      const secondPkWalletId =
        'keyring:simple:legacy' as typeof MOCK_PRIVATE_KEY_WALLET_ID;
      const secondPkGroupId = toAccountGroupId(secondPkWalletId, '0xdef');

      const wallets: AccountTreeControllerState['accountTree']['wallets'] = {
        ...MOCK_PRIVATE_KEY_WALLET_STATE,
        [secondPkWalletId]: {
          id: secondPkWalletId,
          type: AccountWalletType.Keyring,
          status: 'ready',
          groups: {
            [secondPkGroupId]: {
              id: secondPkGroupId,
              type: AccountGroupType.SingleAccount,
              accounts: ['account-pk-2'],
              metadata: {
                name: 'Imported 2',
                pinned: false,
                hidden: false,
                lastSelected: 0,
              },
            },
          },
          metadata: {
            name: 'Imported Accounts 2',
            keyring: { type: KeyringTypes.simple },
          },
        },
      };

      const { context, mocks } = setup({ wallets });
      mocks.AccountsController.getAccount.mockImplementation((accountId) => {
        if (accountId === 'account-pk-1') {
          return { id: 'account-pk-1', address: '0xabc' };
        }
        if (accountId === 'account-pk-2') {
          return { id: 'account-pk-2', address: '0xdef' };
        }
        return undefined;
      });

      const snapshot = await exportState(context);
      const payload = snapshot.serialize();

      expect(payload.wallets).toHaveLength(1);
      expect(payload.wallets[0]?.type).toBe(
        AccountWalletPayloadType.PrivateKey,
      );
      expect(payload.wallets[0]?.groups).toHaveLength(2);
      expect(payload.wallets[0]?.groups.map((group) => group.id)).toStrictEqual(
        [
          toGroupPayloadId(MOCK_PRIVATE_KEY_PAYLOAD_ID, '0xabc'),
          toGroupPayloadId(MOCK_PRIVATE_KEY_PAYLOAD_ID, '0xdef'),
        ],
      );
    });
  });
});
