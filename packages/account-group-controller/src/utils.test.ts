import { KeyringTypes } from '@metamask/keyring-controller';

import {
  AccountGroupCategory,
  DEFAULT_SUB_GROUP,
  type AccountGroupControllerState,
  type AccountGroupId,
} from './AccountGroupController';
import { generateAccountGroupName, toAccountGroupsList } from './utils';

describe('generateAccountGroupName', () => {
  const testCases = [
    // Entropy category
    {
      id: `${AccountGroupCategory.Entropy}:abcdef123456` as AccountGroupId,
      expected: 'Wallet',
      description: 'Entropy category (HD Wallet fallback)',
    },
    // Snap category
    {
      id: `${AccountGroupCategory.Snap}:my-snap-id` as AccountGroupId,
      expected: 'Snap (my-snap-id)',
      description: 'Snap category',
    },
    // Keyring category variations
    {
      id: `${AccountGroupCategory.Keyring}:${KeyringTypes.hd}` as AccountGroupId,
      expected: 'HD Wallet',
      description: 'Keyring category - HD',
    },
    {
      id: `${AccountGroupCategory.Keyring}:${KeyringTypes.ledger}` as AccountGroupId,
      expected: 'Ledger',
      description: 'Keyring category - Ledger',
    },
    {
      id: `${AccountGroupCategory.Keyring}:${KeyringTypes.trezor}` as AccountGroupId,
      expected: 'Trezor',
      description: 'Keyring category - Trezor',
    },
    {
      id: `${AccountGroupCategory.Keyring}:${KeyringTypes.snap}` as AccountGroupId,
      expected: 'Snap Wallet',
      description: 'Keyring category - Snap Keyring',
    },
    {
      id: `${AccountGroupCategory.Keyring}:` as AccountGroupId,
      expected: 'Keyring',
      description: 'Keyring category - Empty Type',
    },
    // Add back a test for a generic/unknown keyring type to cover the capitalization fallback
    {
      id: `${AccountGroupCategory.Keyring}:someBrandNewKeyring` as AccountGroupId,
      expected: 'SomeBrandNewKeyring', // Expects default capitalization
      description: 'Keyring category - Generic Unhandled Type',
    },
    // Malformed IDs
    {
      id: 'malformedId' as AccountGroupId,
      expected: 'Unnamed Group',
      description: 'Malformed ID - no colon',
    },
    {
      id: '' as AccountGroupId,
      expected: 'Unnamed Group',
      description: 'Malformed ID - empty string',
    },
    // Unknown category
    {
      id: 'unknownCategory:specificPart' as AccountGroupId,
      expected: 'specificPart',
      description: 'Unknown category with specificIdentifier',
    },
    {
      id: 'unknownCategory:' as AccountGroupId,
      expected: 'Unnamed Group',
      description: 'Unknown category with empty specificIdentifier',
    },
  ];

  it.each(testCases)(
    'should generate name for $description',
    ({ id, expected }) => {
      expect(generateAccountGroupName(id)).toBe(expected);
    },
  );
});

describe('toAccountGroupsList', () => {
  it('should return an empty array for empty state', async () => {
    const emptyState: AccountGroupControllerState = {
      accountGroups: { groups: {} },
      accountGroupsMetadata: {},
    };
    const result = await toAccountGroupsList(emptyState);
    expect(result).toStrictEqual([]);
  });

  it('should map groups with full metadata', async () => {
    const groupId1 = `${AccountGroupCategory.Entropy}:gid1` as AccountGroupId;
    const groupId2 = `${AccountGroupCategory.Snap}:gid2` as AccountGroupId;
    const state: AccountGroupControllerState = {
      accountGroups: {
        groups: {
          [groupId1]: { [DEFAULT_SUB_GROUP]: ['acc1', 'acc2'] },
          [groupId2]: { [DEFAULT_SUB_GROUP]: ['acc3'] },
        },
      },
      accountGroupsMetadata: {
        [groupId1]: { name: 'My Wallet' },
        [groupId2]: { name: 'My Awesome Snap' },
      },
    };
    const result = await toAccountGroupsList(state);
    expect(result).toStrictEqual([
      { id: groupId1, name: 'My Wallet', accounts: ['acc1', 'acc2'] },
      { id: groupId2, name: 'My Awesome Snap', accounts: ['acc3'] },
    ]);
  });

  it('should use generated names for groups missing metadata', async () => {
    const groupId1 = `${AccountGroupCategory.Entropy}:abc` as AccountGroupId;
    const groupId2 =
      `${AccountGroupCategory.Keyring}:${KeyringTypes.ledger}` as AccountGroupId;
    const state: AccountGroupControllerState = {
      accountGroups: {
        groups: {
          [groupId1]: { [DEFAULT_SUB_GROUP]: ['acc1'] },
          [groupId2]: { [DEFAULT_SUB_GROUP]: ['acc2'] },
        },
      },
      accountGroupsMetadata: {},
    };
    const result = await toAccountGroupsList(state);
    expect(result).toStrictEqual([
      { id: groupId1, name: 'Wallet', accounts: ['acc1'] },
      { id: groupId2, name: 'Ledger', accounts: ['acc2'] },
    ]);
  });

  it('should filter out groups that have no accounts under DEFAULT_SUB_GROUP', async () => {
    const groupId1 = `${AccountGroupCategory.Entropy}:g1` as AccountGroupId;
    const groupId2 = `${AccountGroupCategory.Snap}:g2` as AccountGroupId;
    const state: AccountGroupControllerState = {
      accountGroups: {
        groups: {
          // Scenario 1: DEFAULT_SUB_GROUP key is missing from this group's data, so it should be filtered out
          [groupId1]: { 'another-sub-group': ['accOther'] },
          // Scenario 2: DEFAULT_SUB_GROUP key exists, but its account list is empty, so it should be filtered out
          [groupId2]: { [DEFAULT_SUB_GROUP]: [] },
        },
      },
      accountGroupsMetadata: {
        [groupId1]: { name: 'Wallet 1' },
        [groupId2]: { name: 'Snap 1' },
      },
    };
    const result = await toAccountGroupsList(state);
    expect(result).toStrictEqual([]); // Both groups should be filtered out
  });

  it('should correctly return a mix of populated and filter out empty groups', async () => {
    const groupIdWithAccounts =
      `${AccountGroupCategory.Entropy}:accGroup` as AccountGroupId;
    const groupIdWithoutAccounts =
      `${AccountGroupCategory.Snap}:emptyGroup` as AccountGroupId;
    const groupIdWithOtherSubgroup =
      `${AccountGroupCategory.Keyring}:otherSub` as AccountGroupId;

    const state: AccountGroupControllerState = {
      accountGroups: {
        groups: {
          [groupIdWithAccounts]: { [DEFAULT_SUB_GROUP]: ['acc1', 'acc2'] },
          [groupIdWithoutAccounts]: { [DEFAULT_SUB_GROUP]: [] },
          [groupIdWithOtherSubgroup]: { 'some-other-subgroup': ['acc3'] },
        },
      },
      accountGroupsMetadata: {
        [groupIdWithAccounts]: { name: 'Populated Wallet' },
        [groupIdWithoutAccounts]: { name: 'Empty Snap' }, // Will be filtered
        [groupIdWithOtherSubgroup]: { name: 'Keyring Other' }, // Will be filtered
      },
    };

    const result = await toAccountGroupsList(state);
    expect(result).toStrictEqual([
      {
        id: groupIdWithAccounts,
        name: 'Populated Wallet',
        accounts: ['acc1', 'acc2'],
      },
    ]);
  });
});
