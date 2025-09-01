import {
  createLocalGroupsFromUserStorage,
  syncSingleGroupMetadata,
  syncGroupsMetadata,
} from './group';
import * as metadataExports from './metadata';
import {
  pushGroupToUserStorage,
  pushGroupToUserStorageBatch,
} from '../user-storage/network-operations';
import { getLocalGroupsForEntropyWallet } from '../utils';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import type {
  BackupAndSyncContext,
  UserStorageSyncedWalletGroup,
} from '../types';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import { contextualLogger } from '../utils';

jest.mock('./metadata');
jest.mock('../user-storage/network-operations');
jest.mock('../utils', () => ({
  contextualLogger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
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
      enableDebugLogging: false,
    } as any;

    mockLocalGroup = {
      id: 'entropy:test-entropy/group-1',
      name: 'Test Group',
      metadata: { entropy: { groupIndex: 0 } },
    } as any;

    mockWallet = {
      id: 'entropy:test-entropy',
      name: 'Test Wallet',
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createLocalGroupsFromUserStorage', () => {
    it('should sort groups by groupIndex and create them', async () => {
      const unsortedGroups: UserStorageSyncedWalletGroup[] = [
        { groupIndex: 2 } as any,
        { groupIndex: 0 } as any,
        { groupIndex: 1 } as any,
      ];

      mockContext.messenger.call = jest.fn().mockResolvedValue(undefined);

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
        { groupIndex: -1 } as any,
        { groupIndex: 0 } as any,
        { groupIndex: null as any } as any,
      ];

      mockContext.enableDebugLogging = true;

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
        } as any,
      };

      const groups: UserStorageSyncedWalletGroup[] = [{ groupIndex: 0 } as any];

      mockContext.enableDebugLogging = true;

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
        { groupIndex: 0 } as any,
        { groupIndex: 1 } as any,
      ];

      mockContext.messenger.call = jest
        .fn()
        .mockRejectedValueOnce(new Error('Creation failed'))
        .mockResolvedValueOnce(undefined);
      mockContext.enableDebugLogging = true;

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
      const groups: UserStorageSyncedWalletGroup[] = [{ groupIndex: 0 } as any];

      // Reject with a non-Error object to test the String(error) branch
      mockContext.messenger.call = jest
        .fn()
        .mockRejectedValueOnce('String error');
      mockContext.enableDebugLogging = true;

      await createLocalGroupsFromUserStorage(
        mockContext,
        groups,
        'test-entropy',
        'test-profile',
      );

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to create group 0 for entropy test-entropy:',
        'String error',
      );
    });

    it('should emit analytics events for successful creations', async () => {
      const groups: UserStorageSyncedWalletGroup[] = [{ groupIndex: 0 } as any];

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
        { groupIndex: 0 } as any,
        { groupIndex: 2 } as any,
      ];

      mockContext.messenger.call = jest.fn().mockResolvedValue(undefined);

      await createLocalGroupsFromUserStorage(
        {
          ...mockContext,
          enableDebugLogging: true,
        },
        unsortedGroups,
        'test-entropy',
        'test-profile',
      );

      expect(contextualLogger.warn).toHaveBeenCalledWith(
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
        { name: { value: 'Remote Name', lastUpdatedAt: 2000 } } as any,
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
        { name: { value: 'Remote Name', lastUpdatedAt: 2000 } } as any,
        'test-entropy',
        'test-profile',
      );

      expect(mockPushGroupToUserStorage).not.toHaveBeenCalled();
    });

    it('should handle name metadata validation and apply local update', async () => {
      mockContext.controller.state.accountGroupsMetadata[mockLocalGroup.id] = {
        name: { value: 'Local Name', lastUpdatedAt: 1000 },
      };

      let validateNameFunction: Function;
      let applyNameUpdate: Function;

      mockCompareAndSyncMetadata.mockImplementation(async (options: any) => {
        if (
          options.userStorageMetadata &&
          'value' in options.userStorageMetadata &&
          typeof options.userStorageMetadata.value === 'string'
        ) {
          validateNameFunction = options.validateUserStorageValue;
          applyNameUpdate = options.applyLocalUpdate;
        }
        return false;
      });

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        { name: { value: 'Remote Name', lastUpdatedAt: 2000 } } as any,
        'test-entropy',
        'test-profile',
      );

      expect(validateNameFunction!('New Name')).toBe(true);
      expect(validateNameFunction!('Local Name')).toBe(true);
      expect(validateNameFunction!(null)).toBe(false);

      await applyNameUpdate!('New Name');
      expect(mockContext.controller.setAccountGroupName).toHaveBeenCalledWith(
        mockLocalGroup.id,
        'New Name',
      );
    });

    it('should handle pinned metadata validation and apply local update', async () => {
      mockContext.controller.state.accountGroupsMetadata[mockLocalGroup.id] = {
        pinned: { value: false, lastUpdatedAt: 1000 },
      };

      let validatePinnedFunction: Function;
      let applyPinnedUpdate: Function;

      mockCompareAndSyncMetadata.mockImplementation(async (options: any) => {
        if (
          options.userStorageMetadata &&
          'value' in options.userStorageMetadata &&
          typeof options.userStorageMetadata.value === 'boolean'
        ) {
          validatePinnedFunction = options.validateUserStorageValue;
          applyPinnedUpdate = options.applyLocalUpdate;
        }
        return false;
      });

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        { pinned: { value: true, lastUpdatedAt: 2000 } } as any,
        'test-entropy',
        'test-profile',
      );

      expect(validatePinnedFunction!(true)).toBe(true);
      expect(validatePinnedFunction!(false)).toBe(true);
      expect(validatePinnedFunction!('invalid')).toBe(false);
      expect(validatePinnedFunction!(null)).toBe(false);

      await applyPinnedUpdate!(true);
      expect(mockContext.controller.setAccountGroupPinned).toHaveBeenCalledWith(
        mockLocalGroup.id,
        true,
      );
    });

    it('should handle hidden metadata validation and apply local update', async () => {
      mockContext.controller.state.accountGroupsMetadata[mockLocalGroup.id] = {
        hidden: { value: false, lastUpdatedAt: 1000 },
      };

      let validateHiddenFunction: Function;
      let applyHiddenUpdate: Function;

      mockCompareAndSyncMetadata.mockImplementation(async (options: any) => {
        if (
          options.userStorageMetadata &&
          'value' in options.userStorageMetadata &&
          typeof options.userStorageMetadata.value === 'boolean'
        ) {
          validateHiddenFunction = options.validateUserStorageValue;
          applyHiddenUpdate = options.applyLocalUpdate;
        }
        return false;
      });

      await syncSingleGroupMetadata(
        mockContext,
        mockLocalGroup,
        { hidden: { value: true, lastUpdatedAt: 2000 } } as any,
        'test-entropy',
        'test-profile',
      );

      expect(validateHiddenFunction!(true)).toBe(true);
      expect(validateHiddenFunction!(false)).toBe(true);
      expect(validateHiddenFunction!('invalid')).toBe(false);
      expect(validateHiddenFunction!(123)).toBe(false);

      await applyHiddenUpdate!(false);
      expect(mockContext.controller.setAccountGroupHidden).toHaveBeenCalledWith(
        mockLocalGroup.id,
        false,
      );
    });
  });

  describe('syncGroupsMetadata', () => {
    it('should sync all local groups and batch push when needed', async () => {
      const localGroups = [
        {
          id: 'entropy:test-entropy/group-1',
          metadata: { entropy: { groupIndex: 0 } },
        } as any,
        {
          id: 'entropy:test-entropy/group-2',
          metadata: { entropy: { groupIndex: 1 } },
        } as any,
      ];
      const userStorageGroups = [
        { groupIndex: 0, name: { value: 'Remote 1' } } as any,
        { groupIndex: 1, name: { value: 'Remote 2' } } as any,
      ];

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

    it('should not push when no groups need updates', async () => {
      const localGroups = [
        {
          id: 'entropy:test-entropy/group-1',
          metadata: { entropy: { groupIndex: 0 } },
        } as any,
      ];

      mockGetLocalGroupsForEntropyWallet.mockReturnValue(localGroups);
      mockCompareAndSyncMetadata.mockResolvedValue(false);

      await syncGroupsMetadata(
        mockContext,
        mockWallet,
        [],
        'test-entropy',
        'test-profile',
      );

      expect(mockPushGroupToUserStorageBatch).not.toHaveBeenCalled();
    });

    it('should handle metadata sync for name, pinned, and hidden fields', async () => {
      const localGroup = {
        id: 'entropy:test-entropy/group-1',
        metadata: { entropy: { groupIndex: 0 } },
      } as any;

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
        ] as any,
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
    it('logs when group does not exist in user storage but has local metadata', async () => {
      const testContext = {
        ...mockContext,
        enableDebugLogging: true,
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
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'does not exist in user storage, but has local metadata',
        ),
      );

      // Should push the group since it has local metadata
      expect(mockPushGroupToUserStorage).toHaveBeenCalled();
    });

    it('logs when group does not exist in user storage and has no local metadata', async () => {
      const testContext = {
        ...mockContext,
        enableDebugLogging: true,
      } as BackupAndSyncContext;

      testContext.controller.state.accountGroupsMetadata = {};

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
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'does not exist in user storage and has no local metadata',
        ),
      );

      // Should not push the group since it has no metadata
      expect(mockPushGroupToUserStorage).not.toHaveBeenCalled();
    });

    it('calls applyLocalUpdate when metadata sync requires local update', async () => {
      const testGroupName = 'Updated Name';
      const testContext = { ...mockContext };
      testContext.controller.setAccountGroupName = jest.fn();

      testContext.controller.state.accountGroupsMetadata = {
        [mockLocalGroup.id]: {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        },
      };

      const groupFromUserStorage = {
        groupIndex: 0,
        name: { value: testGroupName, lastUpdatedAt: 2000 },
      };

      mockCompareAndSyncMetadata.mockImplementation(async (config: any) => {
        // Simulate calling applyLocalUpdate
        config.applyLocalUpdate(testGroupName);
        return false; // No push needed
      });

      await syncSingleGroupMetadata(
        testContext,
        mockLocalGroup,
        groupFromUserStorage as any,
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
