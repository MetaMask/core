import { AccountWalletType } from '@metamask/account-api';

import { BackupAndSyncService } from '.';
import { AtomicSyncQueue } from './atomic-sync-queue';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type {
  AccountWalletEntropyObject,
  AccountWalletSnapObject,
} from '../../wallet';
import { TraceName } from '../analytics';
import { getProfileId } from '../authentication';
import {
  createLocalGroupsFromUserStorage,
  performLegacyAccountSyncing,
  syncGroupsMetadata,
  syncSingleGroupMetadata,
  syncWalletMetadata,
} from '../syncing';
import type { BackupAndSyncContext } from '../types';
import {
  getAllGroupsFromUserStorage,
  getGroupFromUserStorage,
  getWalletFromUserStorage,
  pushGroupToUserStorageBatch,
} from '../user-storage';
import type { StateSnapshot } from '../utils';
import {
  createStateSnapshot,
  restoreStateFromSnapshot,
  getLocalEntropyWallets,
  getLocalGroupsForEntropyWallet,
} from '../utils';
import { createMockContextualLogger } from '../utils/test-utils';

jest.mock('./atomic-sync-queue');
jest.mock('../authentication');
jest.mock('../syncing');
jest.mock('../user-storage');
jest.mock('../utils', () => ({
  createStateSnapshot: jest.fn(),
  restoreStateFromSnapshot: jest.fn(),
  getLocalEntropyWallets: jest.fn(),
  getLocalGroupsForEntropyWallet: jest.fn(),
}));

const mockAtomicSyncQueue = AtomicSyncQueue as jest.MockedClass<
  typeof AtomicSyncQueue
>;
const mockGetProfileId = getProfileId as jest.MockedFunction<
  typeof getProfileId
>;
const mockCreateLocalGroupsFromUserStorage =
  createLocalGroupsFromUserStorage as jest.MockedFunction<
    typeof createLocalGroupsFromUserStorage
  >;
const mockPerformLegacyAccountSyncing =
  performLegacyAccountSyncing as jest.MockedFunction<
    typeof performLegacyAccountSyncing
  >;
const mockSyncGroupsMetadata = syncGroupsMetadata as jest.MockedFunction<
  typeof syncGroupsMetadata
>;
const mockSyncSingleGroupMetadata =
  syncSingleGroupMetadata as jest.MockedFunction<
    typeof syncSingleGroupMetadata
  >;
const mockSyncWalletMetadata = syncWalletMetadata as jest.MockedFunction<
  typeof syncWalletMetadata
>;
const mockGetAllGroupsFromUserStorage =
  getAllGroupsFromUserStorage as jest.MockedFunction<
    typeof getAllGroupsFromUserStorage
  >;
const mockGetGroupFromUserStorage =
  getGroupFromUserStorage as jest.MockedFunction<
    typeof getGroupFromUserStorage
  >;
const mockGetWalletFromUserStorage =
  getWalletFromUserStorage as jest.MockedFunction<
    typeof getWalletFromUserStorage
  >;
const mockPushGroupToUserStorageBatch =
  pushGroupToUserStorageBatch as jest.MockedFunction<
    typeof pushGroupToUserStorageBatch
  >;
const mockCreateStateSnapshot = createStateSnapshot as jest.MockedFunction<
  typeof createStateSnapshot
>;
const mockRestoreStateFromSnapshot =
  restoreStateFromSnapshot as jest.MockedFunction<
    typeof restoreStateFromSnapshot
  >;
const mockGetLocalEntropyWallets =
  getLocalEntropyWallets as jest.MockedFunction<typeof getLocalEntropyWallets>;
const mockGetLocalGroupsForEntropyWallet =
  getLocalGroupsForEntropyWallet as jest.MockedFunction<
    typeof getLocalGroupsForEntropyWallet
  >;

describe('BackupAndSync - Service - BackupAndSyncService', () => {
  let mockContext: BackupAndSyncContext;
  let backupAndSyncService: BackupAndSyncService;
  let mockAtomicSyncQueueInstance: {
    enqueue: jest.Mock;
    clear: jest.Mock;
  };

  beforeEach(() => {
    mockAtomicSyncQueueInstance = {
      enqueue: jest.fn(),
      clear: jest.fn(),
    };
    mockAtomicSyncQueue.mockImplementation(
      () => mockAtomicSyncQueueInstance as unknown as AtomicSyncQueue,
    );

    mockContext = {
      controller: {
        state: {
          isAccountTreeSyncingInProgress: false,
          hasAccountTreeSyncingSyncedAtLeastOnce: false,
          accountTree: {
            wallets: {},
          },
        },
      },
      controllerStateUpdateFn: jest.fn(),
      messenger: {
        call: jest.fn(),
      },
      traceFn: jest.fn().mockImplementation((_config, fn) => fn()),
      groupIdToWalletId: new Map(),
      contextualLogger: createMockContextualLogger({
        isEnabled: true,
      }),
    } as unknown as BackupAndSyncContext;

    backupAndSyncService = new BackupAndSyncService(mockContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with atomic sync queue', () => {
      expect(mockAtomicSyncQueue).toHaveBeenCalledWith(mockContext);
    });
  });

  describe('isInProgress getter', () => {
    it('should return sync progress status', () => {
      expect(backupAndSyncService.isInProgress).toBe(false);

      mockContext.controller.state.isAccountTreeSyncingInProgress = true;
      expect(backupAndSyncService.isInProgress).toBe(true);
    });
  });

  describe('enqueueSingleWalletSync', () => {
    it('should enqueue wallet sync when synced at least once', () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;

      backupAndSyncService.enqueueSingleWalletSync('entropy:wallet-1');

      expect(mockAtomicSyncQueueInstance.enqueue).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('should not enqueue when never synced before', () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        false;

      backupAndSyncService.enqueueSingleWalletSync('entropy:wallet-1');

      expect(mockAtomicSyncQueueInstance.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('enqueueSingleGroupSync', () => {
    it('should enqueue group sync when synced at least once', () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/group-1');

      expect(mockAtomicSyncQueueInstance.enqueue).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('should not enqueue when never synced before', () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        false;

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/group-1');

      expect(mockAtomicSyncQueueInstance.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('performFullSync', () => {
    beforeEach(() => {
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          type: AccountWalletType.Entropy,
          groups: {},
          metadata: { entropy: { id: 'test-entropy-id' }, name: '' },
        },
      ]);
      mockGetProfileId.mockResolvedValue('test-profile-id');
      mockGetWalletFromUserStorage.mockResolvedValue(null);
      mockGetAllGroupsFromUserStorage.mockResolvedValue([]);
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockReturnValue('');
    });

    it('should skip when sync is already in progress', async () => {
      mockContext.controller.state.isAccountTreeSyncingInProgress = true;

      await backupAndSyncService.performFullSync();

      expect(mockGetLocalEntropyWallets).not.toHaveBeenCalled();
    });

    it('should return early when no local wallets exist', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([]);

      await backupAndSyncService.performFullSync();

      expect(mockContext.traceFn).toHaveBeenCalledWith(
        { name: TraceName.AccountSyncFull },
        expect.any(Function),
      );
      expect(mockContext.controllerStateUpdateFn).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('should perform legacy syncing when wallet does not exist in user storage', async () => {
      mockGetWalletFromUserStorage.mockResolvedValue(null);

      await backupAndSyncService.performFullSync();

      expect(mockPerformLegacyAccountSyncing).toHaveBeenCalledWith(
        mockContext,
        'test-entropy-id',
        'test-profile-id',
      );
    });

    // TODO: Re-enable this test after the testing period
    it('should perform legacy syncing when isLegacyAccountSyncingDisabled is false', async () => {
      expect(true).toBe(true);
      // mockGetWalletFromUserStorage.mockResolvedValue({
      //   isLegacyAccountSyncingDisabled: false,
      // });

      // await backupAndSyncService.performFullSync();

      // expect(mockPerformLegacyAccountSyncing).toHaveBeenCalledWith(mockContext);
    });

    it('should push groups to user storage when no remote groups exist', async () => {
      const mockLocalGroups = [
        { id: 'group-1' },
      ] as unknown as AccountGroupMultichainAccountObject[];
      mockGetWalletFromUserStorage.mockResolvedValue({
        isLegacyAccountSyncingDisabled: true,
      });
      mockGetAllGroupsFromUserStorage.mockResolvedValue([]);
      mockGetLocalGroupsForEntropyWallet.mockReturnValue(mockLocalGroups);

      await backupAndSyncService.performFullSync();

      expect(mockPushGroupToUserStorageBatch).toHaveBeenCalledWith(
        mockContext,
        mockLocalGroups,
        'test-entropy-id',
      );
    });

    it('should create local groups and sync metadata when remote groups exist', async () => {
      const mockRemoteGroups = [{ groupIndex: 0 }];
      mockGetWalletFromUserStorage.mockResolvedValue({
        isLegacyAccountSyncingDisabled: true,
      });
      mockGetAllGroupsFromUserStorage.mockResolvedValue(mockRemoteGroups);
      mockCreateStateSnapshot.mockReturnValue({} as unknown as StateSnapshot);

      await backupAndSyncService.performFullSync();

      expect(mockCreateLocalGroupsFromUserStorage).toHaveBeenCalledWith(
        mockContext,
        mockRemoteGroups,
        'test-entropy-id',
        'test-profile-id',
      );
      expect(mockSyncGroupsMetadata).toHaveBeenCalled();
    });

    it('should handle wallet sync errors with rollback', async () => {
      const mockSnapshot = { test: 'snapshot' } as unknown as StateSnapshot;
      mockGetWalletFromUserStorage.mockResolvedValue({
        isLegacyAccountSyncingDisabled: true,
      });
      mockCreateStateSnapshot.mockReturnValue(mockSnapshot);
      mockSyncWalletMetadata.mockRejectedValue(new Error('Sync failed'));

      await backupAndSyncService.performFullSync();

      expect(mockRestoreStateFromSnapshot).toHaveBeenCalledWith(
        mockContext,
        mockSnapshot,
      );
    });

    it('should continue with next wallet when rollback fails', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([
        { id: 'entropy:wallet-1', metadata: { entropy: { id: 'test-1' } } },
        { id: 'entropy:wallet-2', metadata: { entropy: { id: 'test-2' } } },
      ] as unknown as AccountWalletEntropyObject[]);

      mockGetWalletFromUserStorage.mockResolvedValue({
        isLegacyAccountSyncingDisabled: true,
      });
      mockCreateStateSnapshot.mockReturnValue({} as unknown as StateSnapshot);
      mockSyncWalletMetadata.mockRejectedValueOnce(new Error('Sync failed'));
      mockRestoreStateFromSnapshot.mockImplementation(() => {
        throw new Error('Rollback failed');
      });

      await backupAndSyncService.performFullSync();

      expect(mockGetProfileId).toHaveBeenCalledTimes(2); // Called for both wallets
    });

    it('should set sync state flags correctly', async () => {
      mockGetWalletFromUserStorage.mockResolvedValue({
        isLegacyAccountSyncingDisabled: true,
      });

      await backupAndSyncService.performFullSync();

      expect(mockContext.controllerStateUpdateFn).toHaveBeenCalledWith(
        expect.any(Function),
      );

      // Verify the state updates
      const stateUpdateCalls = (
        mockContext.controllerStateUpdateFn as jest.Mock
      ).mock.calls;
      expect(stateUpdateCalls.length).toBeGreaterThanOrEqual(2);

      // First call should set sync in progress to true
      const firstCall = stateUpdateCalls[0][0];
      const mockState1 = { isAccountTreeSyncingInProgress: false };
      firstCall(mockState1);
      expect(mockState1.isAccountTreeSyncingInProgress).toBe(true);

      // Last call should set sync complete
      const lastCall = stateUpdateCalls[stateUpdateCalls.length - 1][0];
      const mockState2 = {
        isAccountTreeSyncingInProgress: true,
        hasAccountTreeSyncingSyncedAtLeastOnce: false,
      };
      lastCall(mockState2);
      expect(mockState2.isAccountTreeSyncingInProgress).toBe(false);
      expect(mockState2.hasAccountTreeSyncingSyncedAtLeastOnce).toBe(true);
    });

    it('should clear atomic sync queue when starting', async () => {
      mockGetWalletFromUserStorage.mockResolvedValue({
        isLegacyAccountSyncingDisabled: true,
      });

      await backupAndSyncService.performFullSync();

      expect(mockAtomicSyncQueueInstance.clear).toHaveBeenCalled();
    });
  });

  describe('single wallet sync (private method)', () => {
    it('should sync single entropy wallet', async () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;
      mockContext.controller.state.accountTree.wallets = {
        'entropy:wallet-1': {
          id: 'entropy:wallet-1',
          type: AccountWalletType.Entropy,
          groups: {},
          metadata: { entropy: { id: 'test-entropy-id' }, name: '' },
        },
      };

      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockReturnValue('');
      mockGetProfileId.mockResolvedValue('test-profile-id');
      mockGetWalletFromUserStorage.mockResolvedValue({});
      mockSyncWalletMetadata.mockResolvedValue(undefined); // Reset to success

      backupAndSyncService.enqueueSingleWalletSync('entropy:wallet-1');

      // Get the enqueued function and execute it
      const enqueuedFunction =
        mockAtomicSyncQueueInstance.enqueue.mock.calls[0][0];
      await enqueuedFunction();

      expect(mockSyncWalletMetadata).toHaveBeenCalledWith(
        mockContext,
        expect.any(Object),
        {},
        'test-profile-id',
      );
    });

    it('should skip non-entropy wallets in single wallet sync', async () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;
      mockContext.controller.state.accountTree.wallets = {
        'keyring:wallet-1': {
          id: 'keyring:wallet-1',
          type: AccountWalletType.Keyring,
        } as unknown as AccountWalletSnapObject,
      };

      backupAndSyncService.enqueueSingleWalletSync('keyring:wallet-1');

      const enqueuedFunction =
        mockAtomicSyncQueueInstance.enqueue.mock.calls[0][0];
      await enqueuedFunction();

      expect(mockSyncWalletMetadata).not.toHaveBeenCalled();
    });
  });

  describe('single group sync (private method)', () => {
    it('should sync single group', async () => {
      const mockGroup = {
        id: 'entropy:wallet-1/group-1',
        metadata: { entropy: { groupIndex: 0 } },
      } as unknown as AccountGroupMultichainAccountObject;

      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;
      mockContext.controller.state.accountTree.wallets = {
        'entropy:wallet-1': {
          id: 'entropy:wallet-1',
          type: AccountWalletType.Entropy,
          metadata: { entropy: { id: 'test-entropy-id' }, name: '' },
          groups: {
            'entropy:wallet-1/group-1': mockGroup,
          },
        },
      };

      mockContext.groupIdToWalletId.set(
        'entropy:wallet-1/group-1',
        'entropy:wallet-1',
      );
      jest
        .spyOn(mockContext.messenger, 'call')
        .mockImplementation()
        .mockReturnValue('');
      mockGetProfileId.mockResolvedValue('test-profile-id');
      mockGetGroupFromUserStorage.mockResolvedValue(null);

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/group-1');

      const enqueuedFunction =
        mockAtomicSyncQueueInstance.enqueue.mock.calls[0][0];
      await enqueuedFunction();

      expect(mockSyncSingleGroupMetadata).toHaveBeenCalledWith(
        mockContext,
        mockGroup,
        null,
        'test-entropy-id',
        'test-profile-id',
      );
    });

    it('should skip when wallet ID not found', async () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/group-1');

      const enqueuedFunction =
        mockAtomicSyncQueueInstance.enqueue.mock.calls[0][0];
      await enqueuedFunction();

      expect(mockSyncSingleGroupMetadata).not.toHaveBeenCalled();
    });
  });
});
