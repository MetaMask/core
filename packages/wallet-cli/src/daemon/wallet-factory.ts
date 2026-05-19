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
  /**
   * Tear down the wallet and its backing store in the required order
   * (`wallet.destroy()` then `store.close()`). Idempotent — concurrent and
   * repeat calls coalesce onto the same teardown promise. Per-step errors are
   * forwarded to the `log` callback (or `console.error` if none was supplied),
   * so a destroy failure does not prevent the store from being closed.
   */
  dispose: () => Promise<void>;
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
 * is reused and both `password` and `srp` are unused by this function; the
 * wallet still starts locked and the caller is responsible for unlocking it
 * via `KeyringController:submitPassword` before any keyring-bound operation.
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
 * @param config.log - Optional logger for persistence-write failures and
 * teardown errors surfaced through `dispose`.
 * @returns The Wallet instance and a `dispose` callback that owns teardown.
 * Call `dispose()` to release resources; it destroys the wallet before
 * closing the store so in-flight persistence writes can finish.
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
  password: string;
  srp: string;
  /**
   * Optional logger for persistence-write failures. Without it, failures
   * fall back to `console.error` (which a detached daemon's
   * `stdio: 'ignore'` discards).
   */
  log?: (message: string) => void;
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

    subscribeToChanges(wallet.messenger, wallet.controllerMetadata, store, log);

    if (wasFirstRun) {
      await importSecretRecoveryPhrase(wallet, password, srp);
    }

    return { wallet, dispose: createDisposer(wallet, store, log) };
  } catch (error) {
    if (wallet) {
      try {
        await wallet.destroy();
      } catch (destroyError) {
        report(
          'wallet.destroy() failed during first-run cleanup',
          destroyError,
          log,
        );
      }
    }
    try {
      store.close();
    } catch (closeError) {
      report(
        'store.close() failed during first-run cleanup',
        closeError,
        log,
      );
    }

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

/**
 * Build the single-owner teardown callback returned alongside the Wallet.
 *
 * Encodes the ordering invariant (`wallet.destroy()` before `store.close()`)
 * so call sites can't reintroduce the wrong order. Idempotent via a cached
 * promise — repeat or concurrent invocations resolve once teardown finishes.
 * Per-step failures are reported but never thrown, so a destroy failure does
 * not block the store close.
 *
 * @param wallet - The wallet to destroy first.
 * @param store - The key-value store to close after destroy resolves.
 * @param log - Optional logger; falls back to `console.error` when omitted.
 * @returns An idempotent teardown callback.
 */
function createDisposer(
  wallet: Wallet,
  store: KeyValueStore,
  log: ((message: string) => void) | undefined,
): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return async () => {
    pending ??= (async (): Promise<void> => {
      try {
        await wallet.destroy();
      } catch (destroyError) {
        report('wallet.destroy() failed', destroyError, log);
      }
      try {
        store.close();
      } catch (closeError) {
        report('store.close() failed', closeError, log);
      }
    })();
    return pending;
  };
}

/**
 * Forward a teardown error to the optional logger, falling back to
 * `console.error` so a detached daemon's `stdio: 'ignore'` doesn't silently
 * discard the diagnostic in development. A throwing `log` callback also
 * falls back to `console.error`, so the disposer's "never throws" contract
 * holds even if a consumer wires in a misbehaving logger.
 *
 * @param prefix - Short label identifying which step failed.
 * @param error - The underlying failure.
 * @param log - Optional logger callback.
 */
function report(
  prefix: string,
  error: unknown,
  log: ((message: string) => void) | undefined,
): void {
  const message = `${prefix}: ${String(error)}`;
  if (log) {
    try {
      log(message);
      return;
    } catch {
      // Fall through to console.error so a buggy logger can't break teardown.
    }
  }
  console.error(message);
}
