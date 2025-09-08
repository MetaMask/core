import {
  createLocalGroupsFromUserStorage,
  syncSingleGroupMetadata,
  syncGroupsMetadata,
} from './group';
import * as metadataExports from './metadata';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import type {
  BackupAndSyncContext,
  UserStorageSyncedWalletGroup,
} from '../types';
import {
  pushGroupToUserStorage,
  pushGroupToUserStorageBatch,
} from '../user-storage/network-operations';
import { getLocalGroupsForEntropyWallet } from '../utils';
import { createMockContextualLogger } from '../utils/test-utils';

jest.mock('./metadata');
jest.mock('../user-storage/network-operations');
jest.mock('../utils', () => ({
  getLocalGroupsForEntropyWallet: jest.fn(),
}));

const mockCompareAndSyncMetadata =
  metadataExports.compareAndSyncMetadata as jest.MockedFunction<
    typeof metadataExports.compareAndSyncMetadata
  >;
const mockPushGroupToUserStorage =
  pushGroupToUserStorage as jest.MockedFunction<typeof pushGroupToUserStorage>;
const mockPushGroupToUserStorageBatch =
  pushGroupToUserStorageBatch as jest.MockedFunction<
    typeof pushGroupToUserStorageBatch
  >;
const mockGetLocalGroupsForEntropyWallet =
  getLocalGroupsForEntropyWallet as jest.MockedFunction<
    typeof getLocalGroupsForEntropyWallet
  >;

describe('BackupAndSync - Syncing - Group', () => {
  let mockContext: BackupAndSyncContext;
  let mockLocalGroup: AccountGroupMultichainAccountObject;
  let mockWallet: AccountWalletEntropyObject;

  beforeEach(() => {
    mockContext = {
      controller: {
        state: {
          accountTree: {
            wallets: {
              'entropy:test-entropy': {
                groups: {},
              },
            },
          },
          accountGroupsMetadata: {},
        },
        setAccountGroupName: jest.fn(),
        setAccountGroupPinned: jest.fn(),
        setAccountGroupHidden: jest.fn(),
      },
      messenger: {
        call: jest.fn(),
      },
      emitAnalyticsEventFn: jest.fn(),
      contextualLogger: createMockContextualLogger({
        isEnabled: true,
      }),
    } as unknown as BackupAndSyncContext;

    mockLocalGroup = {
      id: 'entropy:test-entropy/group-1',
      name: 'Test Group',
      metadata: { entropy: { groupIndex: 0 } },
    } as unknown as AccountGroupMultichainAccountObject;

    mockWallet = {
      id: 'entropy:test-entropy',
      name: 'Test Wallet',
    } as unknown as AccountWalletEntropyObject;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createLocalGroupsFromUserStorage', () => {
    it('should sort groups by groupIndex and create them', async () => {
      const unsortedGroups: UserStorageSyncedWalletGroup[] = [
        { groupIndex: 2 },
        { groupIndex: 0 },
        { groupIndex: 1 },
      ];

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(undefined);

      await createLocalGroupsFromUserStorage(
        mockContext,
        unsortedGroups,
        'test-entropy',
        'test-profile',
      );

      expect(mockContext.messenger.call).toHaveBeenCalledTimes(3);
      expect(mockContext.messenger.call).toHaveBeenNthCalledWith(
        1,
        'MultichainAccountService:createMultichainAccountGroup',
        { entropySource: 'test-entropy', groupIndex: 0 },
      );
      expect(mockContext.messenger.call).toHaveBeenNthCalledWith(
        2,
        'MultichainAccountService:createMultichainAccountGroup',
        { entropySource: 'test-entropy', groupIndex: 1 },
      );
      expect(mockContext.messenger.call).toHaveBeenNthCalledWith(
        3,
        'MultichainAccountService:createMultichainAccountGroup',
        { entropySource: 'test-entropy', groupIndex: 2 },
      );
    });

    it('should skip groups with invalid groupIndex', async () => {
      const groupsWithInvalid: UserStorageSyncedWalletGroup[] = [
        { groupIndex: -1 },
        { groupIndex: 0 },
        /* eslint-disable-next-line */
        { groupIndex: null as any },
      ];

      await createLocalGroupsFromUserStorage(
        mockContext,
        groupsWithInvalid,
        'test-entropy',
        'test-profile',
      );

      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'MultichainAccountService:createMultichainAccountGroup',
        { entropySource: 'test-entropy', groupIndex: 0 },
      );
    });

    it('should skip existing groups', async () => {
      mockContext.controller.state.accountTree.wallets[
        'entropy:test-entropy'
      ].groups = {
        'entropy:test-entropy/group-1': {
          metadata: { entropy: { groupIndex: 0 } },
        } as unknown as AccountGroupMultichainAccountObject,
      };

      const groups: UserStorageSyncedWalletGroup[] = [{ groupIndex: 0 }];

      await createLocalGroupsFromUserStorage(
        mockContext,
        groups,
        'test-entropy',
        'test-profile',
      );

      expect(mockContext.messenger.call).not.toHaveBeenCalled();
    });

    it('should continue on creation errors', async () => {
      const groups: UserStorageSyncedWalletGroup[] = [
        { groupIndex: 0 },
        { groupIndex: 1 },
      ];

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockRejectedValueOnce(new Error('Creation failed'))
        .mockResolvedValueOnce(undefined);

      await createLocalGroupsFromUserStorage(
        mockContext,
        groups,
        'test-entropy',
        'test-profile',
      );

      expect(mockContext.messenger.call).toHaveBeenCalledTimes(2);
      expect(mockContext.emitAnalyticsEventFn).toHaveBeenCalledTimes(1);
    });

    it('should handle non-Error exceptions in debug logging', async () => {
      const groups: UserStorageSyncedWalletGroup[] = [{ groupIndex: 0 }];

      // Reject with a non-Error object to test the String(error) branch
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockRejectedValueOnce('String error');

      await createLocalGroupsFromUserStorage(
        mockContext,
        groups,
        'test-entropy',
        'test-profile',
      );

      expect(mockContext.contextualLogger.error).toHaveBeenCalledWith(
        'Failed to create group 0 for entropy test-entropy:',
        'String error',
      );
    });

    it('should emit analytics events for successful creations', async () => {
      const groups: UserStorageSyncedWalletGroup[] = [{ groupIndex: 0 }];

      await createLocalGroupsFromUserStorage(
        mockContext,
        groups,
        'test-entropy',
        'test-profile',
      );

      expect(mockContext.emitAnalyticsEventFn).toHaveBeenCalledWith({
        action: BackupAndSyncAnalyticsEvents.GROUP_ADDED,
        profileId: 'test-profile',
      });
    });

    it('should log when group is out of sequence', async () => {
      const unsortedGroups: UserStorageSyncedWalletGroup[] = [
        { groupIndex: 0 },
        { groupIndex: 2 },
      ];

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockResolvedValue(undefined);

      await createLocalGroupsFromUserStorage(
        {
          ...mockContext,
        },
        unsortedGroups,
        'test-entropy',
        'test-profile',
      );

      expect(mockContext.contextualLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Group index 2 is out of sequence'),
      );
    });
  });

  describe('syncSingleGroupMetadata', () => {
    it('should push group when sync check returns true', async () => {
      mockContext.controller.state.accountGroupsMetadata[mockLocalGroup.id] = {
        name: { value: 'Local Name', lastUpdatedAt: 1000 },
      };
      mockCompareAndSyncMetadata.mockResolvedValue(true);

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        {
          name: { value: 'Remote Name', lastUpdatedAt: 2000 },
        } as unknown as UserStorageSyncedWalletGroup,
        'test-entropy',
        'test-profile',
      );

      expect(mockPushGroupToUserStorage).toHaveBeenCalledWith(
        mockContext,
        mockLocalGroup,
        'test-entropy',
      );
    });

    it('should not push group when sync check returns false', async () => {
      mockCompareAndSyncMetadata.mockResolvedValue(false);

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        {
          name: { value: 'Remote Name', lastUpdatedAt: 2000 },
        } as unknown as UserStorageSyncedWalletGroup,
        'test-entropy',
        'test-profile',
      );

      expect(mockPushGroupToUserStorage).not.toHaveBeenCalled();
    });

    it('should handle name metadata validation and apply local update', async () => {
      mockContext.controller.state.accountGroupsMetadata[mockLocalGroup.id] = {
        name: { value: 'Local Name', lastUpdatedAt: 1000 },
      };

      let validateNameFunction:
        | Parameters<
            typeof metadataExports.compareAndSyncMetadata
          >[0]['validateUserStorageValue']
        | undefined;
      let applyNameUpdate:
        | Parameters<
            typeof metadataExports.compareAndSyncMetadata
          >[0]['applyLocalUpdate']
        | undefined;

      mockCompareAndSyncMetadata.mockImplementation(
        async (
          options: Parameters<typeof metadataExports.compareAndSyncMetadata>[0],
        ) => {
          /* eslint-disable jest/no-conditional-in-test */
          if (
            options.userStorageMetadata &&
            'value' in options.userStorageMetadata &&
            typeof options.userStorageMetadata.value === 'string'
          ) {
            validateNameFunction = options.validateUserStorageValue;
            applyNameUpdate = options.applyLocalUpdate;
          }
          return false;
          /* eslint-enable jest/no-conditional-in-test */
        },
      );

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        {
          name: { value: 'Remote Name', lastUpdatedAt: 2000 },
        } as unknown as UserStorageSyncedWalletGroup,
        'test-entropy',
        'test-profile',
      );

      expect(validateNameFunction).toBeDefined();
      expect(applyNameUpdate).toBeDefined();
      /* eslint-disable jest/no-conditional-in-test */
      /* eslint-disable jest/no-conditional-expect */
      if (validateNameFunction) {
        expect(validateNameFunction('New Name')).toBe(true);
        expect(validateNameFunction('Local Name')).toBe(true);
        expect(validateNameFunction(null)).toBe(false);
      }

      if (applyNameUpdate) {
        await applyNameUpdate('New Name');
        expect(mockContext.controller.setAccountGroupName).toHaveBeenCalledWith(
          mockLocalGroup.id,
          'New Name',
        );
      }
      /* eslint-enable jest/no-conditional-in-test */
      /* eslint-enable jest/no-conditional-expect */
    });

    it('should handle pinned metadata validation and apply local update', async () => {
      mockContext.controller.state.accountGroupsMetadata[mockLocalGroup.id] = {
        pinned: { value: false, lastUpdatedAt: 1000 },
      };

      let validatePinnedFunction:
        | Parameters<
            typeof metadataExports.compareAndSyncMetadata
          >[0]['validateUserStorageValue']
        | undefined;
      let applyPinnedUpdate:
        | Parameters<
            typeof metadataExports.compareAndSyncMetadata
          >[0]['applyLocalUpdate']
        | undefined;

      mockCompareAndSyncMetadata.mockImplementation(
        async (
          options: Parameters<typeof metadataExports.compareAndSyncMetadata>[0],
        ) => {
          /* eslint-disable jest/no-conditional-in-test */
          if (
            options.userStorageMetadata &&
            'value' in options.userStorageMetadata &&
            typeof options.userStorageMetadata.value === 'boolean'
          ) {
            validatePinnedFunction = options.validateUserStorageValue;
            applyPinnedUpdate = options.applyLocalUpdate;
          }
          return false;
          /* eslint-enable jest/no-conditional-in-test */
        },
      );

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        {
          pinned: { value: true, lastUpdatedAt: 2000 },
        } as unknown as UserStorageSyncedWalletGroup,
        'test-entropy',
        'test-profile',
      );

      expect(validatePinnedFunction).toBeDefined();
      expect(applyPinnedUpdate).toBeDefined();
      /* eslint-disable jest/no-conditional-in-test */
      /* eslint-disable jest/no-conditional-expect */
      if (validatePinnedFunction) {
        expect(validatePinnedFunction(true)).toBe(true);
        expect(validatePinnedFunction(false)).toBe(true);
        expect(validatePinnedFunction('invalid')).toBe(false);
        expect(validatePinnedFunction(null)).toBe(false);
      }

      if (applyPinnedUpdate) {
        await applyPinnedUpdate(true);
        expect(
          mockContext.controller.setAccountGroupPinned,
        ).toHaveBeenCalledWith(mockLocalGroup.id, true);
      }
      /* eslint-enable jest/no-conditional-in-test */
      /* eslint-enable jest/no-conditional-expect */
    });

    it('should handle hidden metadata validation and apply local update', async () => {
      mockContext.controller.state.accountGroupsMetadata[mockLocalGroup.id] = {
        hidden: { value: false, lastUpdatedAt: 1000 },
      };

      let validateHiddenFunction:
        | Parameters<
            typeof metadataExports.compareAndSyncMetadata
          >[0]['validateUserStorageValue']
        | undefined;
      let applyHiddenUpdate:
        | Parameters<
            typeof metadataExports.compareAndSyncMetadata
          >[0]['applyLocalUpdate']
        | undefined;

      mockCompareAndSyncMetadata.mockImplementation(
        async (
          options: Parameters<typeof metadataExports.compareAndSyncMetadata>[0],
        ) => {
          /* eslint-disable jest/no-conditional-in-test */
          if (
            options.userStorageMetadata &&
            'value' in options.userStorageMetadata &&
            typeof options.userStorageMetadata.value === 'boolean'
          ) {
            validateHiddenFunction = options.validateUserStorageValue;
            applyHiddenUpdate = options.applyLocalUpdate;
          }
          return false;
          /* eslint-enable jest/no-conditional-in-test */
        },
      );

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        {
          hidden: { value: true, lastUpdatedAt: 2000 },
        } as unknown as UserStorageSyncedWalletGroup,
        'test-entropy',
        'test-profile',
      );

      expect(validateHiddenFunction).toBeDefined();
      expect(applyHiddenUpdate).toBeDefined();
      /* eslint-disable jest/no-conditional-in-test */
      /* eslint-disable jest/no-conditional-expect */
      if (validateHiddenFunction) {
        expect(validateHiddenFunction(true)).toBe(true);
        expect(validateHiddenFunction(false)).toBe(true);
        expect(validateHiddenFunction('invalid')).toBe(false);
        expect(validateHiddenFunction(123)).toBe(false);
      }

      if (applyHiddenUpdate) {
        await applyHiddenUpdate(false);
        expect(
          mockContext.controller.setAccountGroupHidden,
        ).toHaveBeenCalledWith(mockLocalGroup.id, false);
      }
      /* eslint-enable jest/no-conditional-in-test */
      /* eslint-enable jest/no-conditional-expect */
    });
  });

  describe('syncGroupsMetadata', () => {
    it('should sync all local groups and batch push when needed', async () => {
      const localGroups = [
        {
          id: 'entropy:test-entropy/group-1',
          metadata: { entropy: { groupIndex: 0 } },
        },
        {
          id: 'entropy:test-entropy/group-2',
          metadata: { entropy: { groupIndex: 1 } },
        },
      ] as unknown as AccountGroupMultichainAccountObject[];
      const userStorageGroups = [
        { groupIndex: 0, name: { value: 'Remote 1' } },
        { groupIndex: 1, name: { value: 'Remote 2' } },
      ] as unknown as UserStorageSyncedWalletGroup[];

      mockGetLocalGroupsForEntropyWallet.mockReturnValue(localGroups);
      mockCompareAndSyncMetadata.mockResolvedValue(true);

      await syncGroupsMetadata(
        mockContext,
        mockWallet,
        userStorageGroups,
        'test-entropy',
        'test-profile',
      );

      expect(mockGetLocalGroupsForEntropyWallet).toHaveBeenCalledWith(
        mockContext,
        mockWallet.id,
      );
      expect(mockPushGroupToUserStorageBatch).toHaveBeenCalledWith(
        mockContext,
        localGroups,
        'test-entropy',
      );
    });

    it('should push group if it is not present in user storage', async () => {
      const localGroups = [
        {
          id: 'entropy:test-entropy/group-1',
          metadata: { entropy: { groupIndex: 0 } },
        } as unknown as AccountGroupMultichainAccountObject,
      ];

      mockGetLocalGroupsForEntropyWallet.mockReturnValue(localGroups);

      await syncGroupsMetadata(
        mockContext,
        mockWallet,
        [],
        'test-entropy',
        'test-profile',
      );

      expect(mockPushGroupToUserStorageBatch).toHaveBeenCalled();
    });

    it('should handle metadata sync for name, pinned, and hidden fields', async () => {
      const localGroup = {
        id: 'entropy:test-entropy/group-1',
        metadata: { entropy: { groupIndex: 0 } },
      } as unknown as AccountGroupMultichainAccountObject;

      mockContext.controller.state.accountGroupsMetadata[localGroup.id] = {
        name: { value: 'Local Name', lastUpdatedAt: 1000 },
        pinned: { value: true, lastUpdatedAt: 1000 },
        hidden: { value: false, lastUpdatedAt: 1000 },
      };

      mockGetLocalGroupsForEntropyWallet.mockReturnValue([localGroup]);
      mockCompareAndSyncMetadata.mockResolvedValue(false);

      await syncGroupsMetadata(
        mockContext,
        mockWallet,
        [
          {
            groupIndex: 0,
            name: { value: 'Remote Name', lastUpdatedAt: 2000 },
            pinned: { value: false, lastUpdatedAt: 2000 },
            hidden: { value: true, lastUpdatedAt: 2000 },
          },
        ],
        'test-entropy',
        'test-profile',
      );

      expect(mockCompareAndSyncMetadata).toHaveBeenCalledTimes(3);
      expect(mockCompareAndSyncMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          analytics: {
            event: BackupAndSyncAnalyticsEvents.GROUP_RENAMED,
            profileId: 'test-profile',
          },
        }),
      );
      expect(mockCompareAndSyncMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          analytics: {
            event: BackupAndSyncAnalyticsEvents.GROUP_PINNED_STATUS_CHANGED,
            profileId: 'test-profile',
          },
        }),
      );
      expect(mockCompareAndSyncMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          analytics: {
            event: BackupAndSyncAnalyticsEvents.GROUP_HIDDEN_STATUS_CHANGED,
            profileId: 'test-profile',
          },
        }),
      );
    });
  });

  describe('syncSingleGroupMetadata - debug logging coverage', () => {
    it('logs when group does not exist in user storage', async () => {
      const testContext = {
        ...mockContext,
      } as BackupAndSyncContext;

      testContext.controller.state.accountGroupsMetadata = {
        [mockLocalGroup.id]: {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        },
      };

      mockGetLocalGroupsForEntropyWallet.mockReturnValue([mockLocalGroup]);
      mockPushGroupToUserStorage.mockResolvedValue();

      await syncSingleGroupMetadata(
        testContext,
        mockLocalGroup,
        null, // groupFromUserStorage is null
        'test-entropy',
        'test-profile',
      );

      // Verify that the warning was logged
      expect(mockContext.contextualLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'did not exist in user storage, pushing to user storage',
        ),
      );

      // Should push the group since it has local metadata
      expect(mockPushGroupToUserStorage).toHaveBeenCalled();
    });

    it('calls applyLocalUpdate when metadata sync requires local update', async () => {
      const testGroupName = 'Updated Name';
      const testContext = { ...mockContext };
      jest
        .spyOn(testContext.controller, 'setAccountGroupName')
        .mockImplementation();

      testContext.controller.state.accountGroupsMetadata = {
        [mockLocalGroup.id]: {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        },
      };

      const groupFromUserStorage = {
        groupIndex: 0,
        name: { value: testGroupName, lastUpdatedAt: 2000 },
      };

      mockCompareAndSyncMetadata.mockImplementation(
        async (
          config: Parameters<typeof metadataExports.compareAndSyncMetadata>[0],
        ) => {
          // Simulate calling applyLocalUpdate
          await config.applyLocalUpdate(testGroupName);
          return false; // No push needed
        },
      );

      await syncSingleGroupMetadata(
        testContext,
        mockLocalGroup,
        groupFromUserStorage,
        'test-entropy',
        'test-profile',
      );

      // Verify that setAccountGroupName was called
      expect(testContext.controller.setAccountGroupName).toHaveBeenCalledWith(
        mockLocalGroup.id,
        testGroupName,
      );
    });
  });
});
