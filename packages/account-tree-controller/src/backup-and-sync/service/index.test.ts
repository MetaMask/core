import { AccountWalletType } from '@metamask/account-api';

import { BackupAndSyncService } from '.';
import type { AccountGroupObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import { getProfileId } from '../authentication';
import type { BackupAndSyncContext } from '../types';
// We only need to import the functions we actually spy on
import { getLocalEntropyWallets } from '../utils';

// Mock the sync functions and all external dependencies
jest.mock('../syncing');
jest.mock('../authentication');
jest.mock('../utils');
jest.mock('../user-storage');

// Get typed mocks for the functions we want to spy on
const mockGetProfileId = getProfileId as jest.MockedFunction<
  typeof getProfileId
>;
const mockGetLocalEntropyWallets =
  getLocalEntropyWallets as jest.MockedFunction<typeof getLocalEntropyWallets>;

describe('BackupAndSync - Service - BackupAndSyncService', () => {
  let mockContext: BackupAndSyncContext;
  let backupAndSyncService: BackupAndSyncService;

  const setupMockUserStorageControllerState = (
    isBackupAndSyncEnabled = true,
    isAccountSyncingEnabled = true,
  ) => {
    (mockContext.messenger.call as jest.Mock).mockImplementation((action) => {
      if (action === 'UserStorageController:getState') {
        return {
          isBackupAndSyncEnabled,
          isAccountSyncingEnabled,
        };
      }
      return undefined;
    });
  };

  beforeEach(() => {
    mockContext = {
      controller: {
        state: {
          isAccountTreeSyncingInProgress: false,
          hasAccountTreeSyncingSyncedAtLeastOnce: true,
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
    } as unknown as BackupAndSyncContext;

    // Default setup - backup and sync enabled
    setupMockUserStorageControllerState();

    // Setup default mock returns
    mockGetLocalEntropyWallets.mockReturnValue([]);
    mockGetProfileId.mockResolvedValue('test-profile-id');

    backupAndSyncService = new BackupAndSyncService(mockContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isInProgress getter', () => {
    it('returns sync progress status', () => {
      expect(backupAndSyncService.isInProgress).toBe(false);

      mockContext.controller.state.isAccountTreeSyncingInProgress = true;
      expect(backupAndSyncService.isInProgress).toBe(true);
    });
  });

  describe('enqueueSingleWalletSync', () => {
    it('returns early when backup and sync is disabled', () => {
      setupMockUserStorageControllerState(false, true);

      // Method should return early without any side effects
      backupAndSyncService.enqueueSingleWalletSync('entropy:wallet-1');

      // Should not have called any messenger functions beyond the state check
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.messenger.call).not.toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
      );
    });

    it('returns early when account syncing is disabled', () => {
      setupMockUserStorageControllerState(true, false);

      backupAndSyncService.enqueueSingleWalletSync('entropy:wallet-1');

      // Should not have called any messenger functions beyond the state check
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.messenger.call).not.toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
      );
    });

    it('returns early when a full sync has not completed at least once', () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        false;
      backupAndSyncService.enqueueSingleWalletSync('entropy:wallet-1');
      // Should not have called any messenger functions beyond the state check
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.messenger.call).not.toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
      );
    });

    it('enqueues single wallet sync when enabled and synced at least once', async () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;

      // Add a mock wallet to the context so the sync can find it
      mockContext.controller.state.accountTree.wallets = {
        'entropy:wallet-1': {
          id: 'entropy:wallet-1',
          type: AccountWalletType.Entropy,
          metadata: {
            entropy: { id: 'test-entropy-id' },
            name: 'Test Wallet',
          },
          groups: {},
        } as unknown as AccountWalletEntropyObject,
      };

      // This should enqueue a single wallet sync (not a full sync)
      backupAndSyncService.enqueueSingleWalletSync('entropy:wallet-1');

      // Wait a bit for the atomic queue to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have checked the UserStorage state
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );

      // Should NOT have called getLocalEntropyWallets (which is only called by full sync)
      expect(mockGetLocalEntropyWallets).not.toHaveBeenCalled();

      // Should have called the profile ID function for the single wallet sync
      expect(mockGetProfileId).toHaveBeenCalledWith(
        expect.anything(),
        'test-entropy-id',
      );
    });
  });

  describe('enqueueSingleGroupSync', () => {
    it('returns early when backup and sync is disabled', () => {
      setupMockUserStorageControllerState(false, true);

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/1');

      // Should only have checked the sync state
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.messenger.call).not.toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
      );
    });

    it('returns early when account syncing is disabled', () => {
      setupMockUserStorageControllerState(true, false);

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/1');

      // Should only have checked the sync state
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.messenger.call).not.toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
      );
    });

    it('returns early when a full sync is already in progress', () => {
      mockContext.controller.state.isAccountTreeSyncingInProgress = true;

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/1');

      // Should not have called any messenger functions beyond the state check
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.messenger.call).not.toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
      );
    });

    it('returns early when a full sync has not completed at least once', () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        false;

      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/1');

      // Should not have called any messenger functions beyond the state check
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.messenger.call).not.toHaveBeenCalledWith(
        'UserStorageController:performGetStorage',
      );
    });

    it('enqueues group sync when enabled and synced at least once', async () => {
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce =
        true;

      // Set up the group mapping and wallet context
      mockContext.groupIdToWalletId.set(
        'entropy:wallet-1/1',
        'entropy:wallet-1',
      );
      mockContext.controller.state.accountTree.wallets = {
        'entropy:wallet-1': {
          id: 'entropy:wallet-1',
          type: AccountWalletType.Entropy,
          metadata: {
            entropy: { id: 'test-entropy-id' },
            name: 'Test Wallet',
          },
          groups: {
            'entropy:wallet-1/1': {
              id: 'entropy:wallet-1/1',
              name: 'Test Group',
              metadata: {
                entropy: { groupIndex: 1 },
              },
            } as unknown as AccountGroupObject,
          },
        } as unknown as AccountWalletEntropyObject,
      };

      // This should enqueue a single group sync (not a full sync)
      backupAndSyncService.enqueueSingleGroupSync('entropy:wallet-1/1');

      // Wait for the atomic queue to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have checked the UserStorage state
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );

      // Should NOT have called getLocalEntropyWallets (which is only called by full sync)
      expect(mockGetLocalEntropyWallets).not.toHaveBeenCalled();

      // Should have called getProfileId as part of group sync
      expect(mockGetProfileId).toHaveBeenCalled();
    });
  });

  describe('performFullSync', () => {
    it('returns early when sync is already in progress', async () => {
      mockContext.controller.state.isAccountTreeSyncingInProgress = true;

      const result = await backupAndSyncService.performFullSync();

      // Should return undefined when skipping
      expect(result).toBeUndefined();

      // Should only have checked the backup/sync state, not updated controller state
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.controllerStateUpdateFn).not.toHaveBeenCalled();
    });

    it('returns early when backup and sync is disabled', async () => {
      setupMockUserStorageControllerState(false, true);

      const result = await backupAndSyncService.performFullSync();

      // Should return undefined when disabled
      expect(result).toBeUndefined();

      // Should only have checked the sync state
      expect(mockContext.messenger.call).toHaveBeenCalledTimes(1);
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
      expect(mockContext.controllerStateUpdateFn).not.toHaveBeenCalled();
    });

    it('executes full sync when enabled', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      await backupAndSyncService.performFullSync();

      // Should have checked the backup/sync state
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );

      // Should have updated controller state to mark sync in progress and then completed
      expect(mockContext.controllerStateUpdateFn).toHaveBeenCalled();

      // Should have called traceFn to wrap the sync operation
      expect(mockContext.traceFn).toHaveBeenCalled();

      // The key difference: full sync should call getLocalEntropyWallets
      expect(mockGetLocalEntropyWallets).toHaveBeenCalled();
    });

    it('awaits the ongoing promise if a second call is made during sync', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Make traceFn actually async to simulate real sync work
      let resolveTrace: (() => void) | undefined;
      const tracePromise = new Promise<void>((resolve) => {
        resolveTrace = resolve;
      });
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          fn();
          return tracePromise;
        },
      );

      // Start first sync
      const firstSyncPromise = backupAndSyncService.performFullSync();

      // Start second sync immediately (while first is still running)
      const secondSyncPromise = backupAndSyncService.performFullSync();

      // Both promises should be the same reference
      expect(firstSyncPromise).toBe(secondSyncPromise);

      // Resolve the trace to complete the sync
      resolveTrace?.();

      // Both should resolve to the same value
      const [firstResult, secondResult] = await Promise.all([
        firstSyncPromise,
        secondSyncPromise,
      ]);
      expect(firstResult).toStrictEqual(secondResult);

      // getLocalEntropyWallets should only be called once (not twice)
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);
    });

    it('does not start two full syncs if called in rapid succession', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track how many times the actual sync logic runs
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      // Fire multiple syncs rapidly
      const promises = [
        backupAndSyncService.performFullSync(),
        backupAndSyncService.performFullSync(),
        backupAndSyncService.performFullSync(),
      ];

      // All promises should be the same reference (promise caching)
      expect(promises[0]).toBe(promises[1]);
      expect(promises[1]).toBe(promises[2]);

      // Wait for all to complete
      await Promise.all(promises);

      // Should only have executed the sync logic once
      expect(syncExecutionCount).toBe(1);

      // getLocalEntropyWallets should only be called once
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);

      // All promises should resolve successfully to the same value
      const results = await Promise.all(promises);
      expect(results[0]).toStrictEqual(results[1]);
      expect(results[1]).toStrictEqual(results[2]);
    });

    it('creates a new promise for subsequent calls after the first sync completes', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track how many times the actual sync logic runs
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      // Start first sync and wait for it to complete
      const firstSyncPromise = backupAndSyncService.performFullSync();
      await firstSyncPromise;

      // Start second sync after first one is complete
      const secondSyncPromise = backupAndSyncService.performFullSync();

      // Promises should be different (first one was cleaned up)
      expect(firstSyncPromise).not.toBe(secondSyncPromise);

      // Wait for second sync to complete
      await secondSyncPromise;

      // Should have executed the sync logic twice (once for each call)
      expect(syncExecutionCount).toBe(2);

      // getLocalEntropyWallets should be called twice (once for each sync)
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(2);

      // Both promises should resolve successfully
      expect(await firstSyncPromise).toBeUndefined();
      expect(await secondSyncPromise).toBeUndefined();
    });

    it('sets first ever ongoing promise correctly', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track sync execution
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      // Perform first sync
      const firstSyncPromise = backupAndSyncService.performFullSync();

      // Call performFullSyncAtLeastOnce while first sync is ongoing
      const atLeastOncePromise =
        backupAndSyncService.performFullSyncAtLeastOnce();

      // Both promises should be the same reference (first sync sets the first ever promise)
      expect(firstSyncPromise).toBe(atLeastOncePromise);

      await Promise.all([firstSyncPromise, atLeastOncePromise]);

      // Should only have executed once
      expect(syncExecutionCount).toBe(1);
    });
  });

  describe('performFullSyncAtLeastOnce', () => {
    beforeEach(() => {
      setupMockUserStorageControllerState(true, true);
      // Clear all mocks before each test
      jest.clearAllMocks();
      mockGetLocalEntropyWallets.mockClear();
    });

    it('returns undefined when backup and sync is disabled', async () => {
      setupMockUserStorageControllerState(true, false);

      const result = await backupAndSyncService.performFullSyncAtLeastOnce();

      expect(result).toBeUndefined();
      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:getState',
      );
    });

    it('creates and returns first sync promise when called for the first time', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track sync execution
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      const syncPromise = backupAndSyncService.performFullSyncAtLeastOnce();

      expect(syncPromise).toBeInstanceOf(Promise);

      await syncPromise;

      expect(syncExecutionCount).toBe(1);
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);
    });

    it('returns same promise for concurrent calls during first sync', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track sync execution
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      // Fire multiple calls rapidly
      const promises = [
        backupAndSyncService.performFullSyncAtLeastOnce(),
        backupAndSyncService.performFullSyncAtLeastOnce(),
        backupAndSyncService.performFullSyncAtLeastOnce(),
      ];

      // All promises should be the same reference (promise caching)
      expect(promises[0]).toBe(promises[1]);
      expect(promises[1]).toBe(promises[2]);

      // Wait for all to complete
      await Promise.all(promises);

      // Should only have executed the sync logic once
      expect(syncExecutionCount).toBe(1);
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);

      // All promises should resolve successfully to the same value
      const results = await Promise.all(promises);
      expect(results[0]).toStrictEqual(results[1]);
      expect(results[1]).toStrictEqual(results[2]);
    });

    it('returns same completed promise for calls after first sync completes', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track sync execution
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      // Start first sync and wait for it to complete
      const firstSyncPromise =
        backupAndSyncService.performFullSyncAtLeastOnce();
      await firstSyncPromise;

      // Start second call after first one is complete
      const secondSyncPromise =
        backupAndSyncService.performFullSyncAtLeastOnce();

      // Should return the same promise (cached first sync promise)
      expect(firstSyncPromise).toBe(secondSyncPromise);

      // Wait for second promise (should resolve immediately since it's already complete)
      await secondSyncPromise;

      // Should only have executed the sync logic once (no new sync created)
      expect(syncExecutionCount).toBe(1);
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);

      // Both promises should resolve successfully
      expect(await firstSyncPromise).toBeUndefined();
      expect(await secondSyncPromise).toBeUndefined();
    });

    it('does not create new syncs after first sync completes', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track sync execution
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      // Multiple sequential calls
      await backupAndSyncService.performFullSyncAtLeastOnce();
      await backupAndSyncService.performFullSyncAtLeastOnce();
      await backupAndSyncService.performFullSyncAtLeastOnce();

      // Should only have executed once, regardless of how many times it's called
      expect(syncExecutionCount).toBe(1);
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);
    });

    it('interacts correctly with performFullSync', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Track sync execution
      let syncExecutionCount = 0;
      (mockContext.traceFn as jest.Mock).mockImplementation(
        (_: unknown, fn: () => unknown) => {
          syncExecutionCount += 1;
          return fn();
        },
      );

      // Call performFullSyncAtLeastOnce first
      const atLeastOncePromise =
        backupAndSyncService.performFullSyncAtLeastOnce();

      // Then call performFullSync while first is ongoing
      const fullSyncPromise = backupAndSyncService.performFullSync();

      // They should return the same promise (both use the first sync promise)
      expect(atLeastOncePromise).toBe(fullSyncPromise);

      await Promise.all([atLeastOncePromise, fullSyncPromise]);

      // Should only have executed once
      expect(syncExecutionCount).toBe(1);

      // Now call performFullSync again after completion
      const secondFullSyncPromise = backupAndSyncService.performFullSync();

      // This should be different from the first (new sync created)
      expect(secondFullSyncPromise).not.toBe(fullSyncPromise);

      await secondFullSyncPromise;

      // Should have executed twice now (one for each performFullSync call)
      expect(syncExecutionCount).toBe(2);

      // But performFullSyncAtLeastOnce should still return the original promise
      const laterAtLeastOncePromise =
        backupAndSyncService.performFullSyncAtLeastOnce();
      expect(laterAtLeastOncePromise).toBe(atLeastOncePromise);

      // And should not trigger another sync
      await laterAtLeastOncePromise;
      expect(syncExecutionCount).toBe(2); // Still only 2
    }, 15000); // Increase timeout to 15 seconds
  });
});
