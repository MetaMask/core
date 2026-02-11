import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import type { UserStorageController } from '@metamask/profile-sync-controller';

import { AtomicSyncQueue } from './atomic-sync-queue';
import { backupAndSyncLogger } from '../../logger';
import type { AccountTreeControllerState } from '../../types';
import type { AccountWalletEntropyObject } from '../../wallet';
import { TraceName } from '../analytics';
import type { ProfileId } from '../authentication';
import { getProfileId } from '../authentication';
import {
  createLocalGroupsFromUserStorage,
  performLegacyAccountSyncing,
  syncGroupsMetadata,
  syncGroupMetadata,
  syncWalletMetadata,
} from '../syncing';
import type {
  BackupAndSyncContext,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';
import {
  getAllGroupsFromUserStorage,
  getGroupFromUserStorage,
  getWalletFromUserStorage,
  pushGroupToUserStorageBatch,
} from '../user-storage';
import {
  createStateSnapshot,
  restoreStateFromSnapshot,
  getLocalEntropyWallets,
  getLocalGroupsForEntropyWallet,
} from '../utils';
import type { StateSnapshot } from '../utils';

/**
 * Service responsible for managing all backup and sync operations.
 *
 * This service handles:
 * - Full sync operations
 * - Single item sync operations
 * - Sync queue management
 * - Sync state management
 */
export class BackupAndSyncService {
  readonly #context: BackupAndSyncContext;

  /**
   * Queue manager for atomic sync operations.
   */
  readonly #atomicSyncQueue: AtomicSyncQueue;

  /**
   * Cached promise for ongoing full sync operations.
   * Ensures multiple callers await the same sync operation.
   */
  #ongoingFullSyncPromise: Promise<void> | null = null;

  /**
   * Cached promise for the first ongoing full sync operation.
   * Ensures multiple callers await the same sync operation.
   */
  #firstOngoingFullSyncPromise: Promise<void> | null = null;

  constructor(context: BackupAndSyncContext) {
    this.#context = context;
    this.#atomicSyncQueue = new AtomicSyncQueue();
  }

  /**
   * Checks if syncing is currently in progress.
   *
   * @returns True if syncing is in progress.
   */
  get isInProgress(): boolean {
    return this.#context.controller.state.isAccountTreeSyncingInProgress;
  }

  /**
   * Checks if the account tree has been synced at least once.
   *
   * @returns True if the account tree has been synced at least once.
   */
  get hasSyncedAtLeastOnce(): boolean {
    return this.#context.controller.state
      .hasAccountTreeSyncingSyncedAtLeastOnce;
  }

  /**
   * Checks if backup and sync is enabled by checking UserStorageController state.
   *
   * @returns True if backup and sync + account syncing is enabled.
   */
  get isBackupAndSyncEnabled(): boolean {
    const userStorageControllerState = this.#context.messenger.call(
      'UserStorageController:getState',
    );
    const { isAccountSyncingEnabled, isBackupAndSyncEnabled } =
      userStorageControllerState;

    return isBackupAndSyncEnabled && isAccountSyncingEnabled;
  }

  /**
   * Clears the atomic queue and resets ongoing operations.
   */
  clearState(): void {
    this.#atomicSyncQueue.clear();
    this.#ongoingFullSyncPromise = null;
    this.#firstOngoingFullSyncPromise = null;
  }

  /**
   * Handles changes to the user storage state.
   * Used to clear the backup and sync service state.
   *
   * @param state - The new user storage state.
   */
  handleUserStorageStateChange(
    state: UserStorageController.UserStorageControllerState,
  ): void {
    if (!state.isAccountSyncingEnabled || !state.isBackupAndSyncEnabled) {
      // If either syncing is disabled, clear the account tree state
      this.clearState();
    }
  }

  /**
   * Gets the entropy wallet associated with the given wallet ID.
   *
   * @param walletId - The wallet ID to look up.
   * @returns The associated entropy wallet, or undefined if not found.
   */
  #getEntropyWallet(
    walletId: AccountWalletId,
  ): AccountWalletEntropyObject | undefined {
    const wallet = this.#context.controller.state.accountTree.wallets[walletId];
    return wallet?.type === AccountWalletType.Entropy ? wallet : undefined;
  }

  /**
   * Sets up cleanup for ongoing sync promise tracking without affecting error propagation.
   *
   * @param promise - The promise to track and clean up
   * @returns The same promise (for chaining)
   */
  #setupOngoingPromiseCleanup(promise: Promise<void>): Promise<void> {
    this.#ongoingFullSyncPromise = promise;
    // Set up cleanup without affecting the returned promise
    promise
      .finally(() => {
        this.#ongoingFullSyncPromise = null;
      })
      .catch(() => {
        // Only ignore errors from the cleanup operation itself
        // The original promise errors are still propagated to callers
      });
    return promise;
  }

  /**
   * Enqueues a single wallet sync operation (fire-and-forget).
   * If the first full sync has not yet occurred, it does nothing.
   *
   * @param walletId - The wallet ID to sync.
   */
  enqueueSingleWalletSync(walletId: AccountWalletId): void {
    if (!this.isBackupAndSyncEnabled || !this.hasSyncedAtLeastOnce) {
      return;
    }

    // eslint-disable-next-line no-void
    void this.#atomicSyncQueue.enqueue(() =>
      this.#performSingleWalletSyncInner(walletId),
    );
  }

  /**
   * Enqueues a single group sync operation (fire-and-forget).
   * If the first full sync has not yet occurred, it does nothing.
   *
   * @param groupId - The group ID to sync.
   */
  enqueueSingleGroupSync(groupId: AccountGroupId): void {
    if (
      !this.isBackupAndSyncEnabled ||
      !this.hasSyncedAtLeastOnce ||
      // This prevents rate limiting scenarios where full syncs trigger group creations
      // that in turn enqueue the same single group syncs that the full sync just did.
      // This can very rarely lead to inconsistencies, but will be fixed on the next full sync.
      // TODO: let's improve this in the future by tracking the updates done in the full sync and
      // comparing against that.
      this.isInProgress
    ) {
      return;
    }

    // eslint-disable-next-line no-void
    void this.#atomicSyncQueue.enqueue(() =>
      this.#performSingleGroupSyncInner(groupId),
    );
  }

  /**
   * Performs a full synchronization of the local account tree with user storage, ensuring consistency
   * between local state and cloud-stored account data.
   * If a full sync is already in progress, it will return the ongoing promise.
   * This clears the atomic sync queue before starting the full sync.
   *
   * NOTE: in some very edge cases, this can be ran concurrently if triggered quickly after
   * toggling back and forth the backup and sync feature from the UI.
   *
   * @returns A promise that resolves when the sync is complete.
   */
  performFullSync(): Promise<void> {
    if (!this.isBackupAndSyncEnabled) {
      return Promise.resolve(undefined);
    }

    // If there's an ongoing sync (including first sync), return it
    if (this.#ongoingFullSyncPromise) {
      return this.#ongoingFullSyncPromise;
    }

    // Create a new ongoing sync (sequential calls after previous completed)
    const newSyncPromise = this.#atomicSyncQueue.clearAndEnqueue(() =>
      this.#performFullSyncInner(),
    );

    // First sync setup - create and cache the first sync promise
    if (!this.#firstOngoingFullSyncPromise) {
      this.#firstOngoingFullSyncPromise = newSyncPromise;
    }

    return this.#setupOngoingPromiseCleanup(newSyncPromise);
  }

  /**
   * Performs a full synchronization of the local account tree with user storage, ensuring consistency
   * between local state and cloud-stored account data.
   *
   * If the first ever full sync is already in progress, it will return the ongoing promise.
   * If the first ever full sync has already completed, it will resolve and NOT start a new sync.
   *
   * This clears the atomic sync queue before starting the full sync.
   *
   * @returns A promise that resolves when the sync is complete.
   */
  performFullSyncAtLeastOnce(): Promise<void> {
    if (!this.isBackupAndSyncEnabled) {
      return Promise.resolve(undefined);
    }

    if (!this.#firstOngoingFullSyncPromise) {
      this.#firstOngoingFullSyncPromise = this.#atomicSyncQueue.clearAndEnqueue(
        () => this.#performFullSyncInner(),
      );
      // eslint-disable-next-line no-void
      void this.#setupOngoingPromiseCleanup(this.#firstOngoingFullSyncPromise);
    }

    return this.#firstOngoingFullSyncPromise;
  }

  /**
   * Performs a full synchronization of the local account tree with user storage, ensuring consistency
   * between local state and cloud-stored account data.
   *
   * This method performs a comprehensive sync operation that:
   * 1. Identifies all local entropy wallets that can be synchronized
   * 2. Performs legacy account syncing if needed (for backwards compatibility)
   * - Disables subsequent legacy syncing by setting a flag in user storage
   * - Exits early if multichain account syncing is disabled after legacy sync
   * 3. Executes multichain account syncing for each wallet:
   * - Syncs wallet metadata bidirectionally
   * - Creates missing local groups from user storage data (or pushes local groups if none exist remotely)
   * - Refreshes local state to reflect newly created groups
   * - Syncs group metadata bidirectionally
   *
   * The sync is atomic per wallet with rollback on errors, but continues processing other wallets
   * if individual wallet sync fails. A global lock prevents concurrent sync operations.
   *
   * During this process, all other atomic multichain related user storage updates are blocked.
   *
   * @throws Will throw if the sync operation encounters unrecoverable errors
   */
  async #performFullSyncInner(): Promise<void> {
    // Prevent multiple syncs from running at the same time.
    // Also prevents atomic updates from being applied while syncing is in progress.
    if (this.isInProgress) {
      return;
    }

    // Set isAccountTreeSyncingInProgress immediately to prevent race conditions
    this.#context.controllerStateUpdateFn(
      (state: AccountTreeControllerState) => {
        state.isAccountTreeSyncingInProgress = true;
      },
    );

    // Encapsulate the sync logic in a function to allow tracing
    const bigSyncFn = async () => {
      try {
        // 1. Identifies all local entropy wallets that can be synchronized
        const localSyncableWallets = getLocalEntropyWallets(this.#context);

        if (!localSyncableWallets.length) {
          // No wallets to sync, just return. This shouldn't happen.
          return;
        }

        // 2. Iterate over each local wallet
        for (const wallet of localSyncableWallets) {
          const entropySourceId = wallet.metadata.entropy.id;

          let walletProfileId: ProfileId;
          let walletFromUserStorage: UserStorageSyncedWallet | null;
          let groupsFromUserStorage: UserStorageSyncedWalletGroup[];

          try {
            walletProfileId = await getProfileId(
              this.#context,
              entropySourceId,
            );

            [walletFromUserStorage, groupsFromUserStorage] = await Promise.all([
              getWalletFromUserStorage(this.#context, entropySourceId),
              getAllGroupsFromUserStorage(this.#context, entropySourceId),
            ]);

            // 2.1 Decide if we need to perform legacy account syncing
            if (
              !walletFromUserStorage ||
              !walletFromUserStorage.isLegacyAccountSyncingDisabled
            ) {
              // 2.2 Perform legacy account syncing
              // This will migrate legacy account data to the new structure.
              // This operation will only be performed once.
              await performLegacyAccountSyncing(
                this.#context,
                entropySourceId,
                walletProfileId,
              );
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorString = `Legacy syncing failed for wallet ${wallet.id}: ${errorMessage}`;

            backupAndSyncLogger(errorString);
            throw new Error(errorString);
          }

          // 3. Execute multichain account syncing
          let stateSnapshot: StateSnapshot | undefined;

          try {
            // 3.1 Wallet syncing
            // Create a state snapshot before processing each wallet for potential rollback
            stateSnapshot = createStateSnapshot(this.#context);

            // Sync wallet metadata bidirectionally
            await syncWalletMetadata(
              this.#context,
              wallet,
              walletFromUserStorage,
              walletProfileId,
            );

            // 3.2 Groups syncing
            // If groups data does not exist in user storage yet, create it
            if (!groupsFromUserStorage.length) {
              // If no groups exist in user storage, we can push all groups from the wallet to the user storage and exit
              await pushGroupToUserStorageBatch(
                this.#context,
                getLocalGroupsForEntropyWallet(this.#context, wallet.id),
                entropySourceId,
              );

              continue; // No need to proceed with metadata comparison if groups are new
            }

            // Create local groups for each group from user storage if they do not exist
            // This will ensure that we have all groups available locally before syncing metadata
            await createLocalGroupsFromUserStorage(
              this.#context,
              groupsFromUserStorage,
              entropySourceId,
              walletProfileId,
            );

            // Sync group metadata bidirectionally
            await syncGroupsMetadata(
              this.#context,
              wallet,
              groupsFromUserStorage,
              entropySourceId,
              walletProfileId,
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorString = `Error during multichain account syncing for wallet ${wallet.id}: ${errorMessage}`;

            backupAndSyncLogger(errorString);

            // Attempt to rollback state changes for this wallet
            try {
              if (!stateSnapshot) {
                throw new Error(
                  `State snapshot is missing for wallet ${wallet.id}`,
                );
              }
              restoreStateFromSnapshot(this.#context, stateSnapshot);
              backupAndSyncLogger(
                `Rolled back state changes for wallet ${wallet.id}`,
              );
            } catch (rollbackError) {
              backupAndSyncLogger(
                `Failed to rollback state for wallet ${wallet.id}:`,
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError),
              );
            }

            // Continue with next wallet instead of failing the entire sync
            continue;
          }
        }
      } catch (error) {
        backupAndSyncLogger('Error during multichain account syncing:', error);
        throw error;
      }

      this.#context.controllerStateUpdateFn((state) => {
        state.hasAccountTreeSyncingSyncedAtLeastOnce = true;
      });
    };

    // Execute the big sync function with tracing and ensure state cleanup
    try {
      await this.#context.traceFn(
        {
          name: TraceName.AccountSyncFull,
        },
        bigSyncFn,
      );
    } finally {
      // Always reset state, regardless of success or failure
      this.#context.controllerStateUpdateFn(
        (state: AccountTreeControllerState) => {
          state.isAccountTreeSyncingInProgress = false;
        },
      );
    }
  }

  /**
   * Performs a single wallet's bidirectional metadata sync with user storage.
   *
   * @param walletId - The wallet ID to sync.
   */
  async #performSingleWalletSyncInner(
    walletId: AccountWalletId,
  ): Promise<void> {
    try {
      const wallet = this.#getEntropyWallet(walletId);
      if (!wallet) {
        return; // Only sync entropy wallets
      }

      const entropySourceId = wallet.metadata.entropy.id;
      const walletProfileId = await getProfileId(
        this.#context,
        entropySourceId,
      );
      const walletFromUserStorage = await getWalletFromUserStorage(
        this.#context,
        entropySourceId,
      );

      await syncWalletMetadata(
        this.#context,
        wallet,
        walletFromUserStorage,
        walletProfileId,
      );
    } catch (error) {
      backupAndSyncLogger(
        `Error in single wallet sync for ${walletId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Performs a single group's bidirectional metadata sync with user storage.
   *
   * @param groupId - The group ID to sync.
   */
  async #performSingleGroupSyncInner(groupId: AccountGroupId): Promise<void> {
    try {
      const walletId = this.#context.groupIdToWalletId.get(groupId);
      if (!walletId) {
        return;
      }

      const wallet = this.#getEntropyWallet(walletId);
      if (!wallet) {
        return; // Only sync entropy wallets
      }

      const group = wallet.groups[groupId];
      if (!group) {
        return;
      }

      const entropySourceId = wallet.metadata.entropy.id;
      const walletProfileId = await getProfileId(
        this.#context,
        entropySourceId,
      );

      // Get the specific group from user storage
      const groupFromUserStorage = await getGroupFromUserStorage(
        this.#context,
        entropySourceId,
        group.metadata.entropy.groupIndex,
      );

      await syncGroupMetadata(
        this.#context,
        group,
        groupFromUserStorage,
        entropySourceId,
        walletProfileId,
      );
    } catch (error) {
      backupAndSyncLogger(`Error in single group sync for ${groupId}:`, error);
      throw error;
    }
  }
}
