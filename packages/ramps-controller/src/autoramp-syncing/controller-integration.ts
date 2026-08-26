import type { AutorampAccount } from '../autorampAccount.js';
import {
  USER_STORAGE_RAMPS_AUTORAMPS_FEATURE,
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
  TraceName,
} from './constants.js';
import {
  areAutorampsEqual,
  createAutorampStorageKey,
  isSyncableAutoramp,
  mapAutorampToUserStorageEntry,
  mapUserStorageEntryToAutoramp,
  stripAutorampSyncMetadata,
} from './format-utils.js';
import { canPerformAutorampSyncing } from './sync-utils.js';
import type {
  AutorampSyncingOptions,
  SyncAutorampAccount,
  SyncAutorampsWithUserStorageConfig,
  UserStorageAutorampEntry,
} from './types.js';

function getAutorampTimestamp(account: SyncAutorampAccount): number {
  return account.updatedAt ?? 0;
}

/**
 * Builds the local/remote merge plan for autoramp sync.
 *
 * @param localAccounts - Syncable local accounts.
 * @param validRemoteAccounts - Syncable remote accounts.
 * @returns Local mutations and remote uploads to apply.
 */
export function computeAutorampMergePlan(
  localAccounts: SyncAutorampAccount[],
  validRemoteAccounts: SyncAutorampAccount[],
): {
  remoteAccountsMap: Map<string, SyncAutorampAccount>;
  accountsToAddOrUpdateLocally: SyncAutorampAccount[];
  accountsToDeleteLocally: SyncAutorampAccount[];
  accountsToUpdateRemotely: SyncAutorampAccount[];
} {
  const localAccountsMap = new Map<string, SyncAutorampAccount>();
  const remoteAccountsMap = new Map<string, SyncAutorampAccount>();

  localAccounts.forEach((account) => {
    localAccountsMap.set(createAutorampStorageKey(account), account);
  });
  validRemoteAccounts.forEach((account) => {
    remoteAccountsMap.set(createAutorampStorageKey(account), account);
  });

  const accountsToAddOrUpdateLocally: SyncAutorampAccount[] = [];
  const accountsToDeleteLocally: SyncAutorampAccount[] = [];
  const accountsToUpdateRemotely: SyncAutorampAccount[] = [];

  for (const remoteAccount of validRemoteAccounts) {
    const key = createAutorampStorageKey(remoteAccount);
    const localAccount = localAccountsMap.get(key);

    if (remoteAccount.deletedAt) {
      if (localAccount) {
        const localTimestamp = getAutorampTimestamp(localAccount);
        if (localTimestamp > remoteAccount.deletedAt) {
          accountsToUpdateRemotely.push(localAccount);
        } else {
          accountsToDeleteLocally.push(remoteAccount);
        }
      }
    } else if (!localAccount) {
      accountsToAddOrUpdateLocally.push(remoteAccount);
    } else if (!areAutorampsEqual(localAccount, remoteAccount)) {
      const localTimestamp = getAutorampTimestamp(localAccount);
      const remoteTimestamp = getAutorampTimestamp(remoteAccount);
      if (localTimestamp >= remoteTimestamp) {
        accountsToUpdateRemotely.push(localAccount);
      } else {
        accountsToAddOrUpdateLocally.push(remoteAccount);
      }
    }
  }

  for (const localAccount of localAccounts) {
    const key = createAutorampStorageKey(localAccount);
    if (!remoteAccountsMap.has(key)) {
      accountsToUpdateRemotely.push(localAccount);
    }
  }

  return {
    remoteAccountsMap,
    accountsToAddOrUpdateLocally,
    accountsToDeleteLocally,
    accountsToUpdateRemotely,
  };
}

async function getRemoteAutoramps(
  options: AutorampSyncingOptions,
  config: SyncAutorampsWithUserStorageConfig,
): Promise<SyncAutorampAccount[]> {
  const { getMessenger } = options;
  const { onAutorampSyncErroneousSituation } = config;

  const remoteJsonArray =
    (await getMessenger().call(
      'UserStorageController:performGetStorageAllFeatureEntries',
      USER_STORAGE_RAMPS_AUTORAMPS_FEATURE,
    )) ?? [];

  if (remoteJsonArray.length === 0) {
    return [];
  }

  const remoteAccounts: SyncAutorampAccount[] = [];
  for (const entryJson of remoteJsonArray) {
    try {
      const entry = JSON.parse(entryJson) as UserStorageAutorampEntry;
      if (entry[USER_STORAGE_VERSION_KEY] !== USER_STORAGE_VERSION) {
        onAutorampSyncErroneousSituation?.(
          'Unsupported autoramp storage version',
          {
            version: entry[USER_STORAGE_VERSION_KEY],
            expectedVersion: USER_STORAGE_VERSION,
          },
        );
        continue;
      }
      if (!entry.o || typeof entry.o !== 'object') {
        onAutorampSyncErroneousSituation?.(
          'Remote autoramp entry missing payload',
          {},
        );
        continue;
      }
      const mapped = mapUserStorageEntryToAutoramp(entry);
      if (!createAutorampStorageKey(mapped)) {
        continue;
      }
      remoteAccounts.push(mapped);
    } catch (error) {
      onAutorampSyncErroneousSituation?.(
        'Failed to parse remote autoramp entry',
        { error, entryLength: entryJson.length },
      );
    }
  }

  return remoteAccounts;
}

async function saveAutorampsToUserStorage(
  accounts: SyncAutorampAccount[],
  options: AutorampSyncingOptions,
  config: SyncAutorampsWithUserStorageConfig,
): Promise<void> {
  const { getMessenger, trace } = options;
  const { onAutorampSyncErroneousSituation } = config;

  const save = async (): Promise<void> => {
    const storageEntries: [string, string][] = [];
    for (const account of accounts) {
      const key = createAutorampStorageKey(account);
      // Defensive: every caller filters on `isSyncableAutoramp` or a non-empty
      // key before reaching here, so an id-less account is unreachable today.
      /* istanbul ignore next */
      if (!key) {
        onAutorampSyncErroneousSituation?.(
          'Skipping autoramp remote write with empty storage key',
          { hasId: Boolean(account.id) },
        );
        continue;
      }
      storageEntries.push([
        key,
        JSON.stringify(mapAutorampToUserStorageEntry(account)),
      ]);
    }
    // Defensive: only reachable if every account was skipped above, which the
    // callers' filtering already rules out.
    /* istanbul ignore next */
    if (storageEntries.length === 0) {
      return;
    }
    await getMessenger().call(
      'UserStorageController:performBatchSetStorage',
      USER_STORAGE_RAMPS_AUTORAMPS_FEATURE,
      storageEntries,
    );
  };

  if (trace) {
    await trace(
      {
        name: TraceName.AutorampSyncSaveBatch,
        data: { autorampCount: accounts.length },
      },
      save,
    );
    return;
  }
  await save();
}

/**
 * Syncs autoramp accounts between local controller state and User Storage.
 *
 * @param config - Optional error callbacks.
 * @param options - Sync options (controller + messenger).
 */
export async function syncAutorampsWithUserStorage(
  config: SyncAutorampsWithUserStorageConfig,
  options: AutorampSyncingOptions,
): Promise<void> {
  const { getRampsControllerInstance, trace } = options;
  const { onAutorampSyncErroneousSituation } = config;

  if (!canPerformAutorampSyncing(options)) {
    return;
  }

  const controller = getRampsControllerInstance();
  controller.setIsAutorampSyncingInProgress(true);

  try {
    const validRemoteAccounts = (
      await getRemoteAutoramps(options, config)
    ).filter(
      (account: SyncAutorampAccount) =>
        Boolean(account.deletedAt) || isSyncableAutoramp(account),
    );

    const performSync = async (): Promise<void> => {
      const getLocalAccounts = (): AutorampAccount[] =>
        controller.state.autoramps.filter(isSyncableAutoramp);

      const pendingDeleteKeysBeforeApply = new Set(
        controller
          .getPendingRemoteAutorampDeletes()
          .map((account) => createAutorampStorageKey(account))
          .filter((key) => key.length > 0),
      );

      const {
        remoteAccountsMap,
        accountsToAddOrUpdateLocally,
        accountsToDeleteLocally,
        accountsToUpdateRemotely,
      } = computeAutorampMergePlan(getLocalAccounts(), validRemoteAccounts);

      controller.setIsApplyingAutorampSyncChanges(true);
      try {
        for (const account of accountsToDeleteLocally) {
          controller.removeAutoramp(createAutorampStorageKey(account));
        }
        for (const account of accountsToAddOrUpdateLocally) {
          if (
            !account.deletedAt &&
            !pendingDeleteKeysBeforeApply.has(createAutorampStorageKey(account))
          ) {
            controller.addAutoramp(stripAutorampSyncMetadata(account));
          }
        }
      } finally {
        controller.setIsApplyingAutorampSyncChanges(false);
      }

      const localKeys = new Set(
        getLocalAccounts().map((account) => createAutorampStorageKey(account)),
      );
      const pendingDeletes = controller
        .getPendingRemoteAutorampDeletes()
        .filter((account) => {
          const key = createAutorampStorageKey(account);
          return key.length > 0 && !localKeys.has(key);
        });
      const pendingDeleteKeys = new Set(
        pendingDeletes.map((account) => createAutorampStorageKey(account)),
      );

      const now = Date.now();
      const uploads: SyncAutorampAccount[] = [
        ...accountsToUpdateRemotely
          .filter(
            (account) =>
              !pendingDeleteKeys.has(createAutorampStorageKey(account)),
          )
          .map((account) => ({
            ...account,
            updatedAt: account.updatedAt || now,
          })),
        // Local-only accounts already included via merge plan; also upload
        // accounts present locally that differ after apply.
        ...getLocalAccounts()
          .filter((account) => {
            const key = createAutorampStorageKey(account);
            // Defensive: `pendingDeletes` already excludes anything still
            // present locally, so this cannot match a local account.
            /* istanbul ignore next */
            if (pendingDeleteKeys.has(key)) {
              return false;
            }
            const remote = remoteAccountsMap.get(key);
            return !remote || !areAutorampsEqual(account, remote);
          })
          .filter(
            (account) =>
              !accountsToUpdateRemotely.some(
                (planned) =>
                  createAutorampStorageKey(planned) ===
                  createAutorampStorageKey(account),
              ),
          )
          .map((account) => ({
            ...account,
            updatedAt: account.updatedAt || now,
          })),
        ...pendingDeletes.map((account) => ({
          ...account,
          deletedAt: now,
          updatedAt: now,
        })),
      ];

      // Dedupe by key, prefer later entries
      const uploadMap = new Map<string, SyncAutorampAccount>();
      for (const account of uploads) {
        uploadMap.set(createAutorampStorageKey(account), account);
      }

      if (uploadMap.size > 0) {
        await saveAutorampsToUserStorage(
          [...uploadMap.values()],
          options,
          config,
        );
        controller.acknowledgePendingRemoteAutorampDeletes(pendingDeletes);
      }
    };

    if (trace) {
      await trace(
        {
          name: TraceName.AutorampSyncFull,
          data: {
            localAutorampCount:
              controller.state.autoramps.filter(isSyncableAutoramp).length,
            remoteAutorampCount: validRemoteAccounts.length,
          },
        },
        performSync,
      );
      return;
    }

    await performSync();
  } catch (error) {
    onAutorampSyncErroneousSituation?.('Error synchronizing autoramps', {
      error,
    });
    throw error;
  } finally {
    controller.setIsAutorampSyncingInProgress(false);
  }
}

/**
 * Updates a single autoramp in remote storage without a full sync.
 *
 * @param account - Local autoramp that changed.
 * @param options - Sync options.
 * @param config - Optional error callbacks.
 */
export async function updateAutorampInRemoteStorage(
  account: SyncAutorampAccount,
  options: AutorampSyncingOptions,
  config: SyncAutorampsWithUserStorageConfig = {},
): Promise<void> {
  const { trace } = options;

  const update = async (): Promise<void> => {
    if (!canPerformAutorampSyncing(options) || !isSyncableAutoramp(account)) {
      return;
    }
    await saveAutorampsToUserStorage(
      [{ ...account, updatedAt: Date.now() }],
      options,
      config,
    );
  };

  if (trace) {
    await trace({ name: TraceName.AutorampSyncUpdateRemote }, update);
    return;
  }
  await update();
}

/**
 * Soft-deletes an autoramp in remote storage.
 *
 * @param account - Autoramp to tombstone remotely.
 * @param options - Sync options.
 * @param config - Optional error callbacks.
 */
export async function deleteAutorampInRemoteStorage(
  account: SyncAutorampAccount,
  options: AutorampSyncingOptions,
  config: SyncAutorampsWithUserStorageConfig = {},
): Promise<void> {
  const { trace } = options;

  const remove = async (): Promise<void> => {
    if (!canPerformAutorampSyncing(options) || !account.id) {
      return;
    }
    const now = Date.now();
    await saveAutorampsToUserStorage(
      [
        {
          ...account,
          deletedAt: now,
          updatedAt: now,
        },
      ],
      options,
      config,
    );
  };

  if (trace) {
    await trace({ name: TraceName.AutorampSyncDeleteRemote }, remove);
    return;
  }
  await remove();
}
