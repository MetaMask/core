import { AccountGroupType } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';

import { createMultichainAccountGroup } from './group';
import { performLegacyAccountSyncing } from './legacy';
import type { AccountGroupMultichainAccountObject } from '../../group';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import type { BackupAndSyncContext } from '../types';
import { getAllLegacyUserStorageAccounts } from '../user-storage';
import { getLocalGroupsForEntropyWallet } from '../utils';
import { createMockContextualLogger } from '../utils/test-utils';

jest.mock('@metamask/accounts-controller');
jest.mock('../user-storage');
jest.mock('../utils', () => ({
  getLocalGroupsForEntropyWallet: jest.fn(),
}));
jest.mock('./group');

const mockGetUUIDFromAddressOfNormalAccount =
  getUUIDFromAddressOfNormalAccount as jest.MockedFunction<
    typeof getUUIDFromAddressOfNormalAccount
  >;
const mockGetAllLegacyUserStorageAccounts =
  getAllLegacyUserStorageAccounts as jest.MockedFunction<
    typeof getAllLegacyUserStorageAccounts
  >;
const mockGetLocalGroupsForEntropyWallet =
  getLocalGroupsForEntropyWallet as jest.MockedFunction<
    typeof getLocalGroupsForEntropyWallet
  >;
const mockCreateMultichainAccountGroup =
  createMultichainAccountGroup as jest.MockedFunction<
    typeof createMultichainAccountGroup
  >;

describe('BackupAndSync - Syncing - Legacy', () => {
  let mockContext: BackupAndSyncContext;

  beforeEach(() => {
    mockContext = {
      controller: {
        setAccountGroupName: jest.fn(),
      },
      emitAnalyticsEventFn: jest.fn(),
      contextualLogger: createMockContextualLogger({
        isEnabled: true,
      }),
    } as unknown as BackupAndSyncContext;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('performLegacyAccountSyncing', () => {
    const testEntropySourceId = 'test-entropy-id';
    const testProfileId = 'test-profile-id';

    it('should emit analytics and return early when no legacy accounts exist', async () => {
      mockGetAllLegacyUserStorageAccounts.mockResolvedValue([]);

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      expect(mockGetAllLegacyUserStorageAccounts).toHaveBeenCalledWith(
        mockContext,
        testEntropySourceId,
      );
      expect(mockContext.contextualLogger.info).toHaveBeenCalledWith(
        'No legacy accounts, skipping legacy account syncing',
      );
      expect(mockContext.emitAnalyticsEventFn).toHaveBeenCalledWith({
        action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
        profileId: testProfileId,
      });
      expect(mockGetLocalGroupsForEntropyWallet).not.toHaveBeenCalled();
    });

    it('should create groups', async () => {
      const mockLegacyAccounts = [
        { n: 'Account 1', a: '0x123' },
        { n: 'Account 2', a: '0x456' },
        { n: 'Account 3', a: '0x789' },
      ];
      const mockLocalGroups = [
        {
          id: 'entropy:test-entropy/0' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: ['account-1'],
          metadata: { entropy: { groupIndex: 0 } },
        },
      ] as unknown as AccountGroupMultichainAccountObject[]; // Only 1 existing group

      mockGetAllLegacyUserStorageAccounts.mockResolvedValue(mockLegacyAccounts);
      mockGetLocalGroupsForEntropyWallet.mockReturnValueOnce(mockLocalGroups);
      mockGetLocalGroupsForEntropyWallet.mockReturnValueOnce([
        ...mockLocalGroups,
        {
          id: 'entropy:test-entropy/1' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: ['account-2'],
          metadata: { entropy: { groupIndex: 1 } },
        },
        {
          id: 'entropy:test-entropy/2' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: ['account-3'],
          metadata: { entropy: { groupIndex: 2 } },
        },
      ] as unknown as AccountGroupMultichainAccountObject[]);
      mockCreateMultichainAccountGroup.mockResolvedValue();

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      // Should create 3 groups
      expect(mockCreateMultichainAccountGroup).toHaveBeenCalledTimes(3);
      expect(mockCreateMultichainAccountGroup).toHaveBeenCalledWith(
        mockContext,
        testEntropySourceId,
        0,
        testProfileId,
        BackupAndSyncAnalyticsEvents.LEGACY_GROUP_ADDED_FROM_ACCOUNT,
      );
      expect(mockCreateMultichainAccountGroup).toHaveBeenCalledWith(
        mockContext,
        testEntropySourceId,
        1,
        testProfileId,
        BackupAndSyncAnalyticsEvents.LEGACY_GROUP_ADDED_FROM_ACCOUNT,
      );
    });

    it('should rename account groups based on legacy account data', async () => {
      const mockAccountId1 = 'uuid-for-0x123';
      const mockAccountId2 = 'uuid-for-0x456';
      const mockLegacyAccounts = [
        { n: 'Legacy Account 1', a: '0x123' },
        { n: 'Legacy Account 2', a: '0x456' },
      ];
      const mockLocalGroups = [
        {
          id: 'entropy:test-entropy/0' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: [mockAccountId1],
          metadata: { entropy: { groupIndex: 0 } },
        },
        {
          id: 'entropy:test-entropy/1' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: [mockAccountId2],
          metadata: { entropy: { groupIndex: 1 } },
        },
      ] as unknown as AccountGroupMultichainAccountObject[];

      mockGetAllLegacyUserStorageAccounts.mockResolvedValue(mockLegacyAccounts);
      mockGetLocalGroupsForEntropyWallet.mockReturnValueOnce(mockLocalGroups);
      mockGetUUIDFromAddressOfNormalAccount
        .mockReturnValueOnce(mockAccountId1)
        .mockReturnValueOnce(mockAccountId2);

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      expect(mockGetUUIDFromAddressOfNormalAccount).toHaveBeenCalledWith(
        '0x123',
      );
      expect(mockGetUUIDFromAddressOfNormalAccount).toHaveBeenCalledWith(
        '0x456',
      );
      expect(mockContext.controller.setAccountGroupName).toHaveBeenCalledWith(
        'entropy:test-entropy/0',
        'Legacy Account 1',
      );
      expect(mockContext.controller.setAccountGroupName).toHaveBeenCalledWith(
        'entropy:test-entropy/1',
        'Legacy Account 2',
      );
    });

    it('should skip legacy accounts with missing name or address', async () => {
      const mockLegacyAccounts = [
        { n: 'Valid Account', a: '0x123' },
        { n: '', a: '0x456' }, // Missing name
        { n: 'No Address', a: undefined }, // Missing address
        { a: '0x789' }, // Missing name property
        { n: 'Missing Address' }, // Missing address property
      ];

      mockGetAllLegacyUserStorageAccounts.mockResolvedValue(mockLegacyAccounts);
      mockGetLocalGroupsForEntropyWallet.mockReturnValue([]);

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      expect(mockContext.contextualLogger.warn).toHaveBeenCalledTimes(4); // 4 invalid accounts
      expect(mockContext.contextualLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Legacy account data is missing name or address',
        ),
      );
      expect(mockGetUUIDFromAddressOfNormalAccount).toHaveBeenCalledTimes(1); // Only valid account
    });

    it('should not rename group when no matching local group is found', async () => {
      const mockAccountId = 'uuid-for-0x123';
      const mockLegacyAccounts = [{ n: 'Orphan Account', a: '0x123' }];
      const mockLocalGroups = [
        {
          id: 'entropy:test-entropy/0' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: ['different-account-id'], // Different account
          metadata: { entropy: { groupIndex: 0 } },
        },
      ] as unknown as AccountGroupMultichainAccountObject[];

      mockGetAllLegacyUserStorageAccounts.mockResolvedValue(mockLegacyAccounts);
      mockGetLocalGroupsForEntropyWallet.mockReturnValue([]);
      mockGetLocalGroupsForEntropyWallet.mockReturnValueOnce(mockLocalGroups);
      mockGetUUIDFromAddressOfNormalAccount.mockReturnValue(mockAccountId);

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      expect(mockContext.controller.setAccountGroupName).not.toHaveBeenCalled();
    });

    it('should emit analytics event on completion', async () => {
      const mockLegacyAccounts = [{ n: 'Test Account', a: '0x123' }];

      mockGetAllLegacyUserStorageAccounts.mockResolvedValue(mockLegacyAccounts);
      mockGetLocalGroupsForEntropyWallet.mockReturnValue([]);

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      expect(mockContext.emitAnalyticsEventFn).toHaveBeenCalledWith({
        action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
        profileId: testProfileId,
      });
    });

    it('should handle complex scenario with group creation and renaming', async () => {
      const mockAccountId1 = 'uuid-for-0x111';
      const mockAccountId2 = 'uuid-for-0x222';
      const mockAccountId3 = 'uuid-for-0x333';

      const mockLegacyAccounts = [
        { n: 'Main Account', a: '0x111' },
        { n: 'Trading Account', a: '0x222' },
        { n: 'Savings Account', a: '0x333' },
      ];

      // After group creation, we have all 3 groups
      const mockRefreshedLocalGroups = [
        {
          id: 'entropy:test-entropy/0' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: [mockAccountId1],
          metadata: { entropy: { groupIndex: 0 } },
        },
        {
          id: 'entropy:test-entropy/1' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: [mockAccountId2],
          metadata: { entropy: { groupIndex: 1 } },
        },
        {
          id: 'entropy:test-entropy/2' as const,
          type: AccountGroupType.MultichainAccount,
          accounts: [mockAccountId3],
          metadata: { entropy: { groupIndex: 2 } },
        },
      ] as unknown as AccountGroupMultichainAccountObject[];

      mockGetAllLegacyUserStorageAccounts.mockResolvedValue(mockLegacyAccounts);
      mockGetLocalGroupsForEntropyWallet.mockReturnValueOnce(
        mockRefreshedLocalGroups,
      ); // For renaming logic
      mockCreateMultichainAccountGroup.mockResolvedValue();
      mockGetUUIDFromAddressOfNormalAccount
        .mockReturnValueOnce(mockAccountId1)
        .mockReturnValueOnce(mockAccountId2)
        .mockReturnValueOnce(mockAccountId3);

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      // Should create 3 groups
      expect(mockCreateMultichainAccountGroup).toHaveBeenCalledTimes(3);

      // Should rename all 3 groups
      expect(mockContext.controller.setAccountGroupName).toHaveBeenCalledWith(
        'entropy:test-entropy/0',
        'Main Account',
      );
      expect(mockContext.controller.setAccountGroupName).toHaveBeenCalledWith(
        'entropy:test-entropy/1',
        'Trading Account',
      );
      expect(mockContext.controller.setAccountGroupName).toHaveBeenCalledWith(
        'entropy:test-entropy/2',
        'Savings Account',
      );

      expect(mockContext.emitAnalyticsEventFn).toHaveBeenCalledWith({
        action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
        profileId: testProfileId,
      });
    });

    it('should handle edge case where refreshed local groups return different data', async () => {
      const mockAccountId = 'uuid-for-0x123';
      const mockLegacyAccounts = [{ n: 'Test Account', a: '0x123' }];

      // Initial call returns empty, but refreshed call also returns empty
      mockGetAllLegacyUserStorageAccounts.mockResolvedValue(mockLegacyAccounts);
      mockGetLocalGroupsForEntropyWallet.mockReturnValue([]);
      mockGetUUIDFromAddressOfNormalAccount.mockReturnValue(mockAccountId);

      await performLegacyAccountSyncing(
        mockContext,
        testEntropySourceId,
        testProfileId,
      );

      // Should still process but find no matching groups
      expect(mockGetUUIDFromAddressOfNormalAccount).toHaveBeenCalledWith(
        '0x123',
      );
      expect(mockContext.controller.setAccountGroupName).not.toHaveBeenCalled();
    });
  });
});
