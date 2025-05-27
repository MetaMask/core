import { KeyringTypes } from '@metamask/keyring-controller';

import {
  AccountWalletCategory,
  DEFAULT_SUB_GROUP,
  type AccountWalletControllerState,
  type AccountWalletId,
  type AccountWallet,
  type AccountGroupId,
  type Metadata,
} from './AccountWalletController';
import { generateAccountWalletName, toAccountWalletsList } from './utils';

describe('generateAccountWalletName', () => {
  const testCases = [
    // Entropy category
    {
      id: `${AccountWalletCategory.Entropy}:abcdef123456` as AccountWalletId,
      expected: 'Wallet',
      description: 'Entropy category (HD Wallet fallback)',
    },
    // Snap category
    {
      id: `${AccountWalletCategory.Snap}:my-snap-id` as AccountWalletId,
      expected: 'Snap (my-snap-id)',
      description: 'Snap category',
    },
    // Keyring category variations
    {
      id: `${AccountWalletCategory.Keyring}:${KeyringTypes.hd}` as AccountWalletId,
      expected: 'HD Wallet',
      description: 'Keyring category - HD',
    },
    {
      id: `${AccountWalletCategory.Keyring}:${KeyringTypes.ledger}` as AccountWalletId,
      expected: 'Ledger',
      description: 'Keyring category - Ledger',
    },
    {
      id: `${AccountWalletCategory.Keyring}:${KeyringTypes.trezor}` as AccountWalletId,
      expected: 'Trezor',
      description: 'Keyring category - Trezor',
    },
    {
      id: `${AccountWalletCategory.Keyring}:${KeyringTypes.snap}` as AccountWalletId,
      expected: 'Snap Wallet',
      description: 'Keyring category - Snap Keyring',
    },
    {
      id: `${AccountWalletCategory.Keyring}:` as AccountWalletId,
      expected: 'Keyring',
      description: 'Keyring category - Empty Type',
    },
    {
      id: `${AccountWalletCategory.Keyring}:someBrandNewKeyring` as AccountWalletId,
      expected: 'SomeBrandNewKeyring',
      description: 'Keyring category - Generic Unhandled Type',
    },
    // Malformed IDs
    {
      id: 'malformedId' as AccountWalletId,
      expected: 'Unnamed Wallet',
      description: 'Malformed ID - no colon',
    },
    {
      id: '' as AccountWalletId,
      expected: 'Unnamed Wallet',
      description: 'Malformed ID - empty string',
    },
    // Unknown category
    {
      id: 'unknownCategory:specificPart' as AccountWalletId,
      expected: 'specificPart',
      description: 'Unknown category with specificIdentifier',
    },
    {
      id: 'unknownCategory:' as AccountWalletId,
      expected: 'Unnamed Wallet',
      description: 'Unknown category with empty specificIdentifier',
    },
  ];

  it.each(testCases)(
    'should generate name for $description',
    ({ id, expected }) => {
      expect(generateAccountWalletName(id)).toBe(expected);
    },
  );
});

describe('toAccountWalletsList', () => {
  it('should return an empty array for empty state', async () => {
    const emptyState: AccountWalletControllerState = {
      accountWallets: {},
    };
    const result = await toAccountWalletsList(emptyState);
    expect(result).toStrictEqual([]);
  });

  it('should map wallets with their groups and metadata', async () => {
    const walletId1 =
      `${AccountWalletCategory.Entropy}:gid1` as AccountWalletId;
    const walletId2 = `${AccountWalletCategory.Snap}:gid2` as AccountWalletId;
    const groupId1_1: AccountGroupId = 'groupA';
    const groupMetadata1: Metadata = { name: 'Group A Meta' };
    const walletMetadata1: Metadata = { name: 'My Wallet Meta' };
    const walletMetadata2: Metadata = { name: 'My Snap Meta' };

    const state: AccountWalletControllerState = {
      accountWallets: {
        [walletId1]: {
          groups: {
            [groupId1_1]: {
              accounts: ['acc1', 'acc2'],
              metadata: groupMetadata1,
            },
          },
          metadata: walletMetadata1,
        },
        [walletId2]: {
          groups: {},
          metadata: walletMetadata2,
        },
      },
    };

    const expectedWallet1: AccountWallet = {
      id: walletId1,
      groups: {
        [groupId1_1]: { accounts: ['acc1', 'acc2'], metadata: groupMetadata1 },
      },
      metadata: walletMetadata1,
    };
    const expectedWallet2: AccountWallet = {
      id: walletId2,
      groups: {},
      metadata: walletMetadata2,
    };

    const result = await toAccountWalletsList(state);
    expect(result).toStrictEqual([expectedWallet1, expectedWallet2]);
  });

  it('should use generated names for wallet metadata if name is missing', async () => {
    const walletId1 = `${AccountWalletCategory.Entropy}:abc` as AccountWalletId;
    const walletId2 =
      `${AccountWalletCategory.Keyring}:${KeyringTypes.ledger}` as AccountWalletId;
    const group1_meta: Metadata = { name: '' };

    const state: AccountWalletControllerState = {
      accountWallets: {
        [walletId1]: {
          groups: {
            [DEFAULT_SUB_GROUP]: { accounts: ['acc1'], metadata: group1_meta },
          },
          metadata: { name: undefined } as unknown as Metadata,
        },
        [walletId2]: {
          groups: {
            [DEFAULT_SUB_GROUP]: { accounts: ['acc2'], metadata: group1_meta },
          },
          metadata: { name: 'Explicit Ledger Name' },
        },
      },
    };

    const result = await toAccountWalletsList(state);

    const wallet1Result = result.find((w) => w.id === walletId1);
    const wallet2Result = result.find((w) => w.id === walletId2);

    expect(wallet1Result?.metadata.name).toBe('Wallet');
    expect(wallet1Result?.groups[DEFAULT_SUB_GROUP].accounts).toStrictEqual([
      'acc1',
    ]);

    expect(wallet2Result?.metadata.name).toBe('Explicit Ledger Name');
    expect(wallet2Result?.groups[DEFAULT_SUB_GROUP].accounts).toStrictEqual([
      'acc2',
    ]);
  });

  it('should return wallets even if their groups are empty', async () => {
    const walletIdWithEmptyGroups =
      `${AccountWalletCategory.Entropy}:emptyGroupWallet` as AccountWalletId;
    const walletMetadata: Metadata = { name: 'Wallet With Empty Groups' };

    const state: AccountWalletControllerState = {
      accountWallets: {
        [walletIdWithEmptyGroups]: {
          groups: {},
          metadata: walletMetadata,
        },
      },
    };

    const expectedWallet: AccountWallet = {
      id: walletIdWithEmptyGroups,
      groups: {},
      metadata: walletMetadata,
    };

    const result = await toAccountWalletsList(state);
    expect(result).toStrictEqual([expectedWallet]);
  });
});
