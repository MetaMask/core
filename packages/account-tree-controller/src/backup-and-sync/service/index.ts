import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';

import { AtomicSyncQueue } from './atomic-sync-queue';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountTreeControllerState } from '../../types';
import { TraceName } from '../analytics';
import { getProfileId } from '../authentication';
import type { StateSnapshot } from '../controller-utils';
import {
  createStateSnapshot,
  restoreStateFromSnapshot,
  getLocalEntropyWallets,
  getLocalGroupsForEntropyWallet,
} from '../controller-utils';
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

/**
 * Service responsible for managing all backup and sync operations.
 *
 * This service handles:
 * - Full sync operations (performFullSync)
 * - Single item sync operations (wallet and group syncing)
 * - Sync queue management
 * - Sync state management
 */
export class BackupAndSyncService {
  readonly #context: BackupAndSyncContext;

  /**
   * Queue manager for atomic sync operations.
   */
  readonly #atomicSyncQueue: AtomicSyncQueue;

  constructor(context: BackupAndSyncContext) {
    this.#context = context;

    // Initialize with debug logging from context
    this.#atomicSyncQueue = new AtomicSyncQueue(
      () => context.enableDebugLogging,
    );
  }

  /**
   * Checks if syncing is currently in progress.
   *
   * @returns True if syncing is in progress.
   */
  get isInProgress(): boolean {
    return this.#context.controller.state.isAccountTreeSyncingInProgress;
  }

  getIsMultichainAccountsRemoteFeatureFlagEnabled(): boolean {
    return this.#context.messenger.call(
      'UserStorageController:getIsMultichainAccountSyncingEnabled',
    );
  }

  /**
   * Enqueues a single wallet sync operation.
   *
   * @param walletId - The wallet ID to sync.
   */
  enqueueSingleWalletSync(walletId: AccountWalletId): void {
    if (
      !this.#context.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce
    ) {
      return;
    }

    this.#atomicSyncQueue.enqueue(
      () => this.#performSingleWalletSync(walletId),
      this.isInProgress,
    );
  }

  /**
   * Enqueues a single group sync operation.
   *
   * @param groupId - The group ID to sync.
   */
  enqueueSingleGroupSync(groupId: AccountGroupId): void {
    if (
      !this.#context.controller.state.hasAccountTreeSyncingSyncedAtLeastOnce
    ) {
      return;
    }

    this.#atomicSyncQueue.enqueue(
      () => this.#performSingleGroupSync(groupId),
      this.isInProgress,
    );
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
  async performFullSync(): Promise<void> {
    if (this.#context.disableMultichainAccountSyncing) {
      if (this.#context.enableDebugLogging) {
        console.warn(
          'Multichain account syncing is disabled. Skipping full sync operation.',
        );
      }
      return;
    }

    // Prevent multiple syncs from running at the same time.
    // Also prevents atomic updates from being applied while syncing is in progress.
    if (this.isInProgress) {
      return;
    }

    // Encapsulate the sync logic in a function to allow tracing
    const bigSyncFn = async () => {
      // Do only once, since legacy account syncing iterates over all wallets
      let hasLegacyAccountSyncingBeenPerformed = false;

      try {
        this.#context.controllerStateUpdateFn(
          (state: AccountTreeControllerState) => {
            state.isAccountTreeSyncingInProgress = true;
          },
        );

        // Clear stale atomic syncs - big sync supersedes them
        this.#atomicSyncQueue.clear();

        // 1. Identifies all local entropy wallets that can be synchronized
        const localSyncableWallets = getLocalEntropyWallets(this.#context);

        if (!localSyncableWallets.length) {
          // No wallets to sync, just return. This shouldn't happen.
          return;
        }

        // 2. Iterate over each local wallet
        for (const wallet of localSyncableWallets) {
          let stateSnapshot: StateSnapshot | undefined;
          const entropySourceId = wallet.metadata.entropy.id;

          try {
            const walletProfileId = await getProfileId(
              this.#context,
              entropySourceId,
            );

            const [walletFromUserStorage, groupsFromUserStorage] =
              await Promise.all([
                getWalletFromUserStorage(this.#context, entropySourceId),
                getAllGroupsFromUserStorage(this.#context, entropySourceId),
              ]);

            // 2.1 Decide if we need to perform legacy account syncing
            if (
              !walletFromUserStorage ||
              (!walletFromUserStorage.isLegacyAccountSyncingDisabled &&
                !hasLegacyAccountSyncingBeenPerformed)
            ) {
              // 2.2 Perform legacy account syncing
              // This will also update the `isLegacyAccountSyncingDisabled` remote flag for all wallets.

              // This might add new InternalAccounts and / or update existing ones' names.
              // This in turn will be picked up by our `#handleAccountAdded` and `#handleAccountRenamed` methods
              // to update the account tree.
              await performLegacyAccountSyncing(this.#context);
              hasLegacyAccountSyncingBeenPerformed = true;

              if (!this.getIsMultichainAccountsRemoteFeatureFlagEnabled()) {
                // If multichain account syncing is disabled, we can stop here
                // and not perform any further syncing.
                if (this.#context.enableDebugLogging) {
                  console.log(
                    'Multichain account syncing is disabled, skipping further syncing.',
                  );
                }
                return;
              }
            }

            // If we reach this point, we are either:
            // 1. Not performing legacy account syncing at all (new wallets)
            // 2. Legacy account syncing has been performed and we are now ready to proceed with
            //    multichain account syncing.
            // 2.3 Disable legacy account syncing for all wallets
            // This will ensure that we do not perform legacy account syncing again in the future for these wallets.

            // TEMP !!!! DO NOT DISABLE LEGACY ACCOUNT SYNCING FOR ALL WALLETS YET !!!!!
            // await disableLegacyAccountSyncingForAllWallets(context);

            // 3. Execute multichain account syncing
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

            // Refresh local state to ensure we have the latest groups that were just created
            // This is important because createLocalGroupsFromUserStorage might have created new groups
            // that need to be reflected in our local state before we proceed with metadata syncing
            // TODO: we might not need to do this, commenting out for now
            // this.#context.controller.init();

            // Sync group metadata bidirectionally
            await syncGroupsMetadata(
              this.#context,
              wallet,
              groupsFromUserStorage,
              entropySourceId,
              walletProfileId,
            );
          } catch (error) {
            if (this.#context.enableDebugLogging) {
              console.error(
                `Error syncing wallet ${wallet.id}:`,
                error instanceof Error ? error.message : String(error),
              );
            }

            // Attempt to rollback state changes for this wallet
            try {
              if (!stateSnapshot) {
                throw new Error(
                  `State snapshot is missing for wallet ${wallet.id}`,
                );
              }
              restoreStateFromSnapshot(this.#context, stateSnapshot);
              if (this.#context.enableDebugLogging) {
                console.log(
                  `Rolled back state changes for wallet ${wallet.id}`,
                );
              }
            } catch (rollbackError) {
              if (this.#context.enableDebugLogging) {
                console.error(
                  `Failed to rollback state for wallet ${wallet.id}:`,
                  rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError),
                );
              }
            }

            // Continue with next wallet instead of failing the entire sync
            continue;
          }
        }
      } catch (error) {
        if (this.#context.enableDebugLogging) {
          console.error('Error during multichain account syncing:', error);
        }
        throw error;
      } finally {
        this.#context.controllerStateUpdateFn(
          (state: AccountTreeControllerState) => {
            state.isAccountTreeSyncingInProgress = false;
            state.hasAccountTreeSyncingSyncedAtLeastOnce = true;
          },
        );
      }
    };

    // Execute the big sync function with tracing
    await this.#context.traceFn(
      {
        name: TraceName.AccountSyncFull,
      },
      bigSyncFn,
    );
  }

  /**
   * Performs a single wallet's bidirectional metadata sync with user storage.
   *
   * @param walletId - The wallet ID to sync.
   */
  async #performSingleWalletSync(walletId: AccountWalletId): Promise<void> {
    if (
      this.#context.disableMultichainAccountSyncing ||
      !this.getIsMultichainAccountsRemoteFeatureFlagEnabled()
    ) {
      if (this.#context.enableDebugLogging) {
        console.warn(
          'Multichain account syncing is disabled. Skipping single wallet sync operation.',
        );
      }
      return;
    }

    try {
      const wallet =
        this.#context.controller.state.accountTree.wallets[walletId];
      if (!wallet || wallet.type !== AccountWalletType.Entropy) {
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
      if (this.#context.enableDebugLogging) {
        console.error(`Error in single wallet sync for ${walletId}:`, error);
      }
      throw error;
    }
  }

  /**
   * Performs a single group's bidirectional metadata sync with user storage.
   *
   * @param groupId - The group ID to sync.
   */
  async #performSingleGroupSync(groupId: AccountGroupId): Promise<void> {
    if (
      this.#context.disableMultichainAccountSyncing ||
      !this.getIsMultichainAccountsRemoteFeatureFlagEnabled()
    ) {
      if (this.#context.enableDebugLogging) {
        console.warn(
          'Multichain account syncing is disabled. Skipping single group sync operation.',
        );
      }
      return;
    }

    try {
      const walletId = this.#context.groupIdToWalletId.get(groupId);
      if (!walletId) {
        return;
      }

      const wallet =
        this.#context.controller.state.accountTree.wallets[walletId];
      if (!wallet || wallet.type !== AccountWalletType.Entropy) {
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

      await syncSingleGroupMetadata(
        this.#context,
        group as AccountGroupMultichainAccountObject,
        groupFromUserStorage,
        entropySourceId,
        walletProfileId,
      );
    } catch (error) {
      if (this.#context.enableDebugLogging) {
        console.error(`Error in single group sync for ${groupId}:`, error);
      }
      throw error;
    }
  }
}
