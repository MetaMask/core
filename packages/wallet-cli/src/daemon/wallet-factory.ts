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
 * secret recovery phrase is imported using the supplied password. On
 * subsequent runs, the persisted vault is reused: when a password is
 * supplied, the wallet is unlocked via `KeyringController:submitPassword` so
 * keyring-bound messenger actions work immediately; when no password is
 * supplied, the wallet starts locked and the caller is expected to invoke
 * `mm wallet unlock` before any keyring-bound operation. First-run startup
 * without a password is rejected (the SRP cannot be imported without one).
 * On a subsequent run, a wrong password surfaces as the rejection thrown by
 * `submitPassword`.
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
 * @param config.password - The wallet password. Optional on subsequent runs;
 * when omitted, the daemon starts with a locked keyring. Required on first
 * run (to import the SRP).
 * @param config.srp - The secret recovery phrase (BIP-39 mnemonic). Used
 * only on first run.
 * @param config.log - Optional logger for persistence-write failures.
 * @returns The Wallet instance and the underlying KeyValueStore. The caller
 * owns the store and must close it after destroying the wallet (closing
 * first would cause in-flight persistence writes during teardown to fail).
 */
export async function createWallet({
  databasePath,
  infuraProjectId,
  password,
  srp,
  log,
}: {
  databasePath: string;
  infuraProjectId: string;
  password?: string;
  srp: string;
  /**
   * Optional logger for persistence-write failures. Without it, failures
   * fall back to `console.error` (which a detached daemon's
   * `stdio: 'ignore'` discards).
   */
  log?: (message: string) => void;
}): Promise<CreateWalletResult> {
  // An empty `--password` flag or `MM_WALLET_PASSWORD` env var means "no
  // password supplied", not "the empty string is my password". Collapsing
  // the ambiguity here avoids the daemon trying to submit `''` to the
  // keyring (which would surface as a wrong-password error rather than the
  // intended "start locked" behavior).
  const effectivePassword = password === '' ? undefined : password;

  const store = new KeyValueStore(databasePath);
  let wallet: Wallet | undefined;
  let wasFirstRun = false;

  try {
    const state = loadState(store);
    wasFirstRun = !hasPersistedKeyring(state);

    // Validate the first-run precondition BEFORE constructing the wallet,
    // so a doomed startup doesn't build a Wallet (and wire persistence
    // handlers) just to tear it down.
    if (wasFirstRun && effectivePassword === undefined) {
      throw new Error(
        'A password is required on first run to import the secret recovery phrase. ' +
          'Pass `--password` (or `MM_WALLET_PASSWORD`) on `mm daemon start`.',
      );
    }

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

    subscribeToChanges(wallet.messenger, wallet.controllerMetadata, store, log);

    if (wasFirstRun) {
      // The precondition check above narrows `effectivePassword` to a
      // defined string on this branch; TS can't follow that, hence the
      // non-null assertion.
      await importSecretRecoveryPhrase(
        wallet,
        effectivePassword as string,
        srp,
      );
    } else if (effectivePassword !== undefined) {
      await wallet.messenger.call(
        'KeyringController:submitPassword',
        effectivePassword,
      );
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
