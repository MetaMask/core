import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import { importSecretRecoveryPhrase, Wallet } from '@metamask/wallet';
import { rm } from 'node:fs/promises';

import { KeyValueStore } from '../persistence/KeyValueStore';
import { loadState, subscribeToChanges } from '../persistence/persistence';

const IN_MEMORY_DATABASE_PATH = ':memory:';

export type CreateWalletResult = {
  wallet: Wallet;
  store: KeyValueStore;
};

/**
 * Create a configured Wallet instance for daemon use, backed by a SQLite
 * key-value store for persistence.
 *
 * Loads any previously-persisted controller state from the store and uses it
 * to seed the wallet, then subscribes the store to subsequent state changes
 * so all persist-flagged properties are written through.
 *
 * If the store does not yet contain a keyring vault (first-run), the supplied
 * secret recovery phrase is imported. On subsequent runs, the persisted vault
 * is reused and the SRP is unused; the wallet still starts locked and the
 * caller is responsible for unlocking it (`KeyringController:submitPassword`)
 * before any keyring-bound operation.
 *
 * On any failure after the wallet is constructed, the wallet is destroyed
 * before the store is closed so persistence handlers unsubscribe cleanly. On a
 * first-run failure, the database file is also removed so a retry does not
 * latch onto an orphaned partial vault.
 *
 * @param config - Wallet configuration.
 * @param config.databasePath - The path to the SQLite database file (or
 * `':memory:'` for ephemeral use).
 * @param config.infuraProjectId - The Infura project ID for network access.
 * @param config.password - The wallet password.
 * @param config.srp - The secret recovery phrase (BIP-39 mnemonic).
 * @returns The Wallet instance and the underlying KeyValueStore. The caller
 * owns the store and must close it after destroying the wallet (closing
 * first would cause in-flight persistence writes during teardown to fail).
 */
export async function createWallet({
  databasePath,
  infuraProjectId,
  password,
  srp,
}: {
  databasePath: string;
  infuraProjectId: string;
  password: string;
  srp: string;
}): Promise<CreateWalletResult> {
  const store = new KeyValueStore(databasePath);
  let wallet: Wallet | undefined;
  let wasFirstRun = false;

  try {
    const state = loadState(store);
    wasFirstRun = !hasPersistedKeyring(state);

    wallet = new Wallet({
      state,
      infuraProjectId,
      clientVersion: '0.0.0',
      // TODO: Implement showApprovalRequest
      showApprovalRequest: (): undefined => undefined,
      clientConfigApiService: new ClientConfigApiService({
        fetch: globalThis.fetch,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      }),
      getMetaMetricsId: (): string => 'cli',
    });

    subscribeToChanges(wallet.messenger, wallet.controllerMetadata, store);

    if (wasFirstRun) {
      await importSecretRecoveryPhrase(wallet, password, srp);
    }

    return { wallet, store };
  } catch (error) {
    if (wallet) {
      await wallet.destroy().catch(() => undefined);
    }
    store.close();

    if (wasFirstRun && databasePath !== IN_MEMORY_DATABASE_PATH) {
      // Best-effort cleanup of the on-disk SQLite files (main, WAL, SHM) so
      // a partially-persisted KeyringController vault cannot mislead the next
      // run into skipping SRP import.
      await Promise.all(
        [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map(
          (path) => rm(path, { force: true }).catch(() => undefined),
        ),
      );
    }

    throw error;
  }
}

/**
 * Determine whether the loaded state already contains a keyring vault.
 *
 * The KeyringController persists its `vault` once an SRP has been imported,
 * so its presence indicates that first-run setup completed before.
 *
 * @param state - The state loaded from the key-value store.
 * @returns True if a KeyringController vault string is present.
 */
function hasPersistedKeyring(
  state: Record<string, Record<string, unknown>>,
): boolean {
  return typeof state.KeyringController?.vault === 'string';
}
