import { AccountWalletType } from '@metamask/account-api';

import { BackupAndSyncService } from '.';
import type { AccountGroupObject } from '../../group';
import type { AccountTreeControllerState } from '../../types';
import type { AccountWalletEntropyObject } from '../../wallet';
import { TraceName } from '../analytics';
import { getProfileId } from '../authentication';
import { performLegacyAccountSyncing, syncWalletMetadata } from '../syncing';
import type { BackupAndSyncContext } from '../types';
import { getAllGroupsFromUserStorage } from '../user-storage';
// We only need to import the functions we actually spy on
import { createStateSnapshot, getLocalEntropyWallets } from '../utils';

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
const mockSyncWalletMetadata = syncWalletMetadata as jest.MockedFunction<
  typeof syncWalletMetadata
>;
const mockPerformLegacyAccountSyncing =
  performLegacyAccountSyncing as jest.MockedFunction<
    typeof performLegacyAccountSyncing
  >;
const mockGetAllGroupsFromUserStorage =
  getAllGroupsFromUserStorage as jest.MockedFunction<
    typeof getAllGroupsFromUserStorage
  >;
const mockCreateStateSnapshot = createStateSnapshot as jest.MockedFunction<
  typeof createStateSnapshot
>;

// `jest.mock('../utils')` auto-mocks every export, including the tracker
// factory. Grab the real one so tests use the actual tracker behaviour rather
// than a hand-rolled duplicate.
const { createSyncMutationTracker } =
  jest.requireActual<typeof import('../utils')>('../utils');

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
      mutationTracker: createSyncMutationTracker(),
    } as unknown as BackupAndSyncContext;

    // Default setup - backup and sync enabled
    setupMockUserStorageControllerState();

    // Setup default mock returns
    mockGetLocalEntropyWallets.mockReturnValue([]);
    mockGetProfileId.mockResolvedValue('test-profile-id');
    // Return a truthy snapshot so the per-wallet rollback path runs (the real
    // implementation always returns a snapshot object).
    mockCreateStateSnapshot.mockReturnValue(
      {} as ReturnType<typeof createStateSnapshot>,
    );

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
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce = false;
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
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce = true;

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
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce = false;

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
      mockContext.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce = true;

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

      // The key difference: full sync should call getLocalEntropyWallets
      expect(mockGetLocalEntropyWallets).toHaveBeenCalled();
    });

    it('emits a backdated AccountSyncFull span when the sync mutates local state', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);
      // Empty remote groups makes the wallet run complete cleanly (push + skip)
      // without hitting the rollback path.
      mockGetAllGroupsFromUserStorage.mockResolvedValue([]);

      // Simulate a local write happening during the sync by having a mocked
      // helper report a mutation through the context.
      mockSyncWalletMetadata.mockImplementation(async (context) => {
        context.mutationTracker?.setLocalWrite(true);
      });

      await backupAndSyncService.performFullSync();

      expect(mockContext.traceFn).toHaveBeenCalledTimes(1);
      expect(mockContext.traceFn).toHaveBeenCalledWith(
        {
          name: TraceName.AccountSyncFull,
          startTime: expect.any(Number),
        },
        expect.any(Function),
      );
      // The traced callback is empty (the span is backdated, work already ran).
      const [, tracedCallback] = (mockContext.traceFn as jest.Mock).mock
        .calls[0];
      expect(tracedCallback()).toBeUndefined();
    });

    it('clears the in-progress flag even when the trace emit fails', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);
      mockGetAllGroupsFromUserStorage.mockResolvedValue([]);
      mockSyncWalletMetadata.mockImplementation(async (context) => {
        context.mutationTracker?.setLocalWrite(true);
      });
      // Tracing is best-effort: a rejected trace must not fail the sync nor
      // leave the controller stuck mid-sync.
      (mockContext.traceFn as jest.Mock).mockRejectedValue(
        new Error('trace boom'),
      );

      expect(await backupAndSyncService.performFullSync()).toBeUndefined();

      // Replay every state update; the in-progress flag must end up cleared.
      const state = {
        isAccountTreeSyncingInProgress: true,
      } as AccountTreeControllerState;
      for (const [updater] of (mockContext.controllerStateUpdateFn as jest.Mock)
        .mock.calls) {
        updater(state);
      }
      expect(state.isAccountTreeSyncingInProgress).toBe(false);
    });

    it('emits an AccountSyncFull span for a durable remote write even if the wallet is rolled back', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // A remote push happens, then the wallet fails and is rolled back. Remote
      // writes are durable, so the run must still emit.
      mockSyncWalletMetadata.mockImplementation(async (context) => {
        context.mutationTracker?.setRemoteWrite(true);
        throw new Error('boom');
      });

      await backupAndSyncService.performFullSync();

      expect(mockContext.traceFn).toHaveBeenCalledTimes(1);
      expect(mockContext.traceFn).toHaveBeenCalledWith(
        {
          name: TraceName.AccountSyncFull,
          startTime: expect.any(Number),
        },
        expect.any(Function),
      );
    });

    it("does not emit an AccountSyncFull span when a wallet's local changes are rolled back", async () => {
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // A local write happens, then the wallet fails and is rolled back. The
      // local change is reverted, so the run must not emit.
      mockSyncWalletMetadata.mockImplementation(async (context) => {
        context.mutationTracker?.setLocalWrite(true);
        throw new Error('boom');
      });

      await backupAndSyncService.performFullSync();

      expect(mockContext.traceFn).not.toHaveBeenCalled();
    });

    it('emits an AccountSyncFull span when the run throws after doing durable work', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
        {
          id: 'entropy:wallet-2',
          metadata: { entropy: { id: 'test-entropy-id-2' } },
        } as unknown as AccountWalletEntropyObject,
      ]);
      mockGetAllGroupsFromUserStorage.mockResolvedValue([]);

      // Wallet 1 performs a durable remote write and completes; wallet 2's
      // legacy sync then fails and aborts the whole run.
      mockSyncWalletMetadata.mockImplementation(async (context) => {
        context.mutationTracker?.setRemoteWrite(true);
      });
      mockPerformLegacyAccountSyncing
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('legacy boom'));

      await expect(backupAndSyncService.performFullSync()).rejects.toThrow(
        'Legacy syncing failed',
      );

      // The span is still recorded despite the failure.
      expect(mockContext.traceFn).toHaveBeenCalledTimes(1);
      expect(mockContext.traceFn).toHaveBeenCalledWith(
        {
          name: TraceName.AccountSyncFull,
          startTime: expect.any(Number),
        },
        expect.any(Function),
      );
    });

    it('does not emit an AccountSyncFull span when the sync is a no-op', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // No mocked helper reports a mutation, so the sync is a no-op.
      await backupAndSyncService.performFullSync();

      expect(mockContext.traceFn).not.toHaveBeenCalled();
    });

    it('awaits the ongoing promise if a second call is made during sync', async () => {
      // Mock some local wallets for the full sync to process
      mockGetLocalEntropyWallets.mockReturnValue([
        {
          id: 'entropy:wallet-1',
          metadata: { entropy: { id: 'test-entropy-id' } },
        } as unknown as AccountWalletEntropyObject,
      ]);

      // Make the sync work stay pending so the second call lands mid-sync.
      let resolveSync: (() => void) | undefined;
      const syncPromise = new Promise<void>((resolve) => {
        resolveSync = resolve;
      });
      mockSyncWalletMetadata.mockImplementation(async () => {
        await syncPromise;
      });

      // Start first sync
      const firstSyncPromise = backupAndSyncService.performFullSync();

      // Start second sync immediately (while first is still running)
      const secondSyncPromise = backupAndSyncService.performFullSync();

      // Both promises should be the same reference
      expect(firstSyncPromise).toStrictEqual(secondSyncPromise);

      // Resolve the sync work to complete the run
      resolveSync?.();

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

      // Fire multiple syncs rapidly
      const promises = [
        backupAndSyncService.performFullSync(),
        backupAndSyncService.performFullSync(),
        backupAndSyncService.performFullSync(),
      ];

      // All promises should be the same reference (promise caching)
      expect(promises[0]).toStrictEqual(promises[1]);
      expect(promises[1]).toStrictEqual(promises[2]);

      // Wait for all to complete
      await Promise.all(promises);

      // Should only have executed the sync logic once
      // (getLocalEntropyWallets runs once per sync run)
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
      // (getLocalEntropyWallets runs once per sync run)
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

      // Perform first sync
      const firstSyncPromise = backupAndSyncService.performFullSync();

      // Call performFullSyncAtLeastOnce while first sync is ongoing
      const atLeastOncePromise =
        backupAndSyncService.performFullSyncAtLeastOnce();

      // Both should resolve to the same promise (first sync sets the first ever promise)
      expect(firstSyncPromise).toStrictEqual(atLeastOncePromise);

      await Promise.all([firstSyncPromise, atLeastOncePromise]);

      // Should only have executed once
      // (getLocalEntropyWallets runs once per sync run)
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);
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

      const syncPromise = backupAndSyncService.performFullSyncAtLeastOnce();

      expect(syncPromise).toBeInstanceOf(Promise);

      await syncPromise;

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

      // Fire multiple calls rapidly
      const promises = [
        backupAndSyncService.performFullSyncAtLeastOnce(),
        backupAndSyncService.performFullSyncAtLeastOnce(),
        backupAndSyncService.performFullSyncAtLeastOnce(),
      ];

      // All promises should be the same reference (promise caching)
      expect(promises[0]).toStrictEqual(promises[1]);
      expect(promises[1]).toStrictEqual(promises[2]);

      // Wait for all to complete
      await Promise.all(promises);

      // Should only have executed the sync logic once
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

      // Start first sync and wait for it to complete
      const firstSyncPromise =
        backupAndSyncService.performFullSyncAtLeastOnce();
      await firstSyncPromise;

      // Start second call after first one is complete
      const secondSyncPromise =
        backupAndSyncService.performFullSyncAtLeastOnce();

      // Should return the same promise (cached first sync promise)
      expect(firstSyncPromise).toStrictEqual(secondSyncPromise);

      // Wait for second promise (should resolve immediately since it's already complete)
      await secondSyncPromise;

      // Should only have executed the sync logic once (no new sync created)
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

      // Multiple sequential calls
      await backupAndSyncService.performFullSyncAtLeastOnce();
      await backupAndSyncService.performFullSyncAtLeastOnce();
      await backupAndSyncService.performFullSyncAtLeastOnce();

      // Should only have executed once, regardless of how many times it's called
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

      // Call performFullSyncAtLeastOnce first
      const atLeastOncePromise =
        backupAndSyncService.performFullSyncAtLeastOnce();

      // Then call performFullSync while first is ongoing
      const fullSyncPromise = backupAndSyncService.performFullSync();

      // They should return the same promise (both use the first sync promise)
      expect(atLeastOncePromise).toStrictEqual(fullSyncPromise);

      await Promise.all([atLeastOncePromise, fullSyncPromise]);

      // Should only have executed once
      // (getLocalEntropyWallets runs once per sync run)
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(1);

      // Now call performFullSync again after completion
      const secondFullSyncPromise = backupAndSyncService.performFullSync();

      // This should be different from the first (new sync created)
      expect(secondFullSyncPromise).not.toBe(fullSyncPromise);

      await secondFullSyncPromise;

      // Should have executed twice now (one for each performFullSync call)
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(2);

      // But performFullSyncAtLeastOnce should still return the original promise
      const laterAtLeastOncePromise =
        backupAndSyncService.performFullSyncAtLeastOnce();
      expect(laterAtLeastOncePromise).toStrictEqual(atLeastOncePromise);

      // And should not trigger another sync
      await laterAtLeastOncePromise;
      expect(mockGetLocalEntropyWallets).toHaveBeenCalledTimes(2); // Still only 2
    }, 15000); // Increase timeout to 15 seconds
  });
});
