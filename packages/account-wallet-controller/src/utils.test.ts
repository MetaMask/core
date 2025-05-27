import { KeyringTypes } from '@metamask/keyring-controller';

import {
  AccountWalletCategory,
  type AccountWalletControllerState,
  type AccountWalletId,
  type AccountWallet,
  type AccountGroupId,
  type AccountWalletMetadata,
  type AccountGroupMetadata,
  toDefaultAccountGroupId,
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
    const walletId1Group: AccountGroupId = `${walletId1}:groupA`;
    const groupMetadata1: AccountGroupMetadata = { name: 'Group A Meta' };
    const walletMetadata1: AccountWalletMetadata = { name: 'My Wallet Meta' };
    const walletMetadata2: AccountWalletMetadata = { name: 'My Snap Meta' };

    const state: AccountWalletControllerState = {
      accountWallets: {
        [walletId1]: {
          id: walletId1,
          groups: {
            [walletId1Group]: {
              id: walletId1Group,
              accounts: ['acc1', 'acc2'],
              metadata: groupMetadata1,
            },
          },
          metadata: walletMetadata1,
        },
        [walletId2]: {
          id: walletId2,
          groups: {},
          metadata: walletMetadata2,
        },
      },
    };

    const expectedWallet1: AccountWallet = {
      id: walletId1,
      groups: {
        [walletId1Group]: {
          id: walletId1Group,
          accounts: ['acc1', 'acc2'],
          metadata: groupMetadata1,
        },
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
    const walletId1Group = toDefaultAccountGroupId(walletId1);
    const walletId1GroupMetadata: AccountWalletMetadata = { name: '' };
    const walletId2 =
      `${AccountWalletCategory.Keyring}:${KeyringTypes.ledger}` as AccountWalletId;
    const walletId2Group = toDefaultAccountGroupId(walletId2);
    const walletId2GroupMetadata: AccountWalletMetadata = { name: '' };

    const state: AccountWalletControllerState = {
      accountWallets: {
        [walletId1]: {
          id: walletId1,
          groups: {
            [walletId1Group]: {
              id: walletId1Group,
              accounts: ['acc1'],
              metadata: walletId1GroupMetadata,
            },
          },
          metadata: { name: undefined } as unknown as AccountWalletMetadata,
        },
        [walletId2]: {
          id: walletId2,
          groups: {
            [walletId2Group]: {
              id: walletId1Group,
              accounts: ['acc2'],
              metadata: walletId2GroupMetadata,
            },
          },
          metadata: { name: 'Explicit Ledger Name' },
        },
      },
    };

    const result = await toAccountWalletsList(state);

    const wallet1Result = result.find((w) => w.id === walletId1);
    const wallet2Result = result.find((w) => w.id === walletId2);

    expect(wallet1Result?.metadata.name).toBe('Wallet');
    expect(wallet1Result?.groups[walletId1Group].accounts).toStrictEqual([
      'acc1',
    ]);

    expect(wallet2Result?.metadata.name).toBe('Explicit Ledger Name');
    expect(wallet2Result?.groups[walletId2Group].accounts).toStrictEqual([
      'acc2',
    ]);
  });

  it('should return wallets even if their groups are empty', async () => {
    const walletIdWithEmptyGroups =
      `${AccountWalletCategory.Entropy}:emptyGroupWallet` as AccountWalletId;
    const walletMetadata: AccountWalletMetadata = {
      name: 'Wallet With Empty Groups',
    };

    const state: AccountWalletControllerState = {
      accountWallets: {
        [walletIdWithEmptyGroups]: {
          id: walletIdWithEmptyGroups,
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
