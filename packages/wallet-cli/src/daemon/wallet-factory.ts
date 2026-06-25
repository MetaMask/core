import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import { InMemoryStorageAdapter } from '@metamask/storage-service';
import type { Json } from '@metamask/utils';
import {
  AlwaysOnlineAdapter,
  importSecretRecoveryPhrase,
  Wallet,
} from '@metamask/wallet';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
  WalletOptions,
} from '@metamask/wallet';
import { rm } from 'node:fs/promises';

import { KeyValueStore } from '../persistence/KeyValueStore';
import { loadState, subscribeToChanges } from '../persistence/persistence';

const IN_MEMORY_DATABASE_PATH = ':memory:';

export type CreateWalletResult = {
  wallet: Wallet;
  /**
   * Tear down everything `createWallet` set up, in the order that keeps
   * in-flight persistence writes valid: stop the state-change subscription,
   * destroy the wallet, then close the store (closing first would cause a
   * teardown-time persistence write to fail). Resilient — a failure in any
   * step is logged and the remaining steps still run — and idempotent (repeat
   * calls coalesce onto the same teardown).
   */
  dispose: () => Promise<void>;
};

/**
 * Build the per-instance options the daemon's `Wallet` is constructed with.
 *
 * Returns a fresh set on every call so the metadata probe and the real wallet
 * never share adapter/service instances (the probe is destroyed, which may
 * tear those instances down).
 *
 * Only the slots wired on `@metamask/wallet` today are populated:
 * - `storageService` — backed by an in-memory adapter. This is the wallet's
 *   large-blob store (snap source, caches), distinct from the SQLite
 *   `KeyValueStore` that persists controller state; no wired controller
 *   offloads durable data to it yet, so in-memory suffices.
 * - `connectivityController` — the `AlwaysOnlineAdapter` exported for
 *   node-like hosts that have no platform connectivity signal.
 * - `remoteFeatureFlagController` — a `ClientConfigApiService` fetching real
 *   flags over the network.
 * - `approvalController` — a no-op `showApprovalRequest` (the daemon is
 *   headless).
 *
 * @returns The `instanceOptions` for the `Wallet` constructor.
 */
function buildInstanceOptions(): WalletOptions['instanceOptions'] {
  return {
    approvalController: {
      // TODO: surface approval requests over the daemon transport.
      showApprovalRequest: (): undefined => undefined,
    },
    connectivityController: {
      connectivityAdapter: new AlwaysOnlineAdapter(),
    },
    remoteFeatureFlagController: {
      clientConfigApiService: new ClientConfigApiService({
        fetch: globalThis.fetch,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      }),
      getMetaMetricsId: (): string => 'cli',
      clientVersion: '0.0.0',
    },
    storageService: {
      storage: new InMemoryStorageAdapter(),
    },
    // TODO(#9001): add the `networkController` slot (fed by INFURA_PROJECT_ID)
    // once it is wired on `@metamask/wallet`.
    // TODO(#8975): add the `transactionController` slot once it is wired.
  };
}

/**
 * Create a configured `Wallet` for daemon use, backed by a SQLite key-value
 * store for controller-state persistence.
 *
 * Loads any previously-persisted controller state from the store, seeds the
 * wallet with it, then subscribes the store to subsequent state changes so all
 * persist-flagged properties are written through.
 *
 * If the store does not yet contain a keyring vault (first run), the supplied
 * secret recovery phrase is imported. On subsequent runs the persisted vault is
 * reused — `password`/`srp` go unused and the wallet starts locked; the caller
 * unlocks it via `KeyringController:submitPassword` before any keyring-bound
 * operation.
 *
 * On any failure after the store is opened, the store is closed (and the wallet
 * destroyed, if constructed). On a first-run failure, the on-disk database is
 * also removed so a retry does not latch onto an orphaned partial vault.
 *
 * @param config - Wallet configuration.
 * @param config.databasePath - Path to the SQLite database file (or
 * `':memory:'` for ephemeral use).
 * @param config.password - The wallet password.
 * @param config.srp - The secret recovery phrase (BIP-39 mnemonic).
 * @param config.log - Optional logger for persistence-write and teardown
 * failures. Without it, failures fall back to `console.error` (which a detached
 * daemon's `stdio: 'ignore'` discards).
 * @returns The `Wallet` and a `dispose` handle that tears it down.
 */
export async function createWallet({
  databasePath,
  password,
  srp,
  log,
}: {
  databasePath: string;
  password: string;
  srp: string;
  log?: (message: string) => void;
}): Promise<CreateWalletResult> {
  const logFn = log ?? ((message: string): void => console.error(message));
  const store = new KeyValueStore(databasePath);
  let wallet: Wallet | undefined;
  let unsubscribe: (() => void) | undefined;
  let wasFirstRun = false;

  try {
    const state = await loadPersistedState(store, logFn);
    wasFirstRun = !hasPersistedKeyring(state);

    wallet = new Wallet({ state, instanceOptions: buildInstanceOptions() });
    // `wallet.messenger` is typed `Readonly`, but persistence must register
    // (and later remove) subscriptions on it.
    unsubscribe = subscribeToChanges(
      wallet.messenger as RootMessenger<DefaultActions, DefaultEvents>,
      wallet.controllerMetadata,
      store,
      logFn,
    );

    if (wasFirstRun) {
      await importSecretRecoveryPhrase(wallet, password, srp);
    }

    let disposePromise: Promise<void> | undefined;
    return {
      wallet,
      dispose: async () =>
        (disposePromise ??= teardown(unsubscribe, wallet, store, logFn)),
    };
  } catch (error) {
    await teardown(unsubscribe, wallet, store, logFn);

    if (wasFirstRun && databasePath !== IN_MEMORY_DATABASE_PATH) {
      // Best-effort cleanup of the on-disk SQLite files (main, WAL, SHM) so a
      // partially-persisted KeyringController vault cannot mislead the next run
      // into skipping SRP import. Covers in-process failures only — a crash
      // (SIGKILL/power loss) mid-import leaves the vault on disk.
      await Promise.all(
        [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map(
          (path) =>
            rm(path, { force: true }).catch((rmError: unknown) => {
              logFn(
                `Failed to remove ${path} during first-run cleanup: ${String(rmError)}`,
              );
            }),
        ),
      );
    }

    throw error;
  }
}

/**
 * Load persisted controller state, filtered to currently persist-flagged
 * properties.
 *
 * `loadState` filters against the live controller metadata, but that metadata
 * is only knowable from a constructed `Wallet` — and its output is what seeds
 * the real wallet. So this constructs a short-lived probe purely to read the
 * metadata, then tears it down.
 *
 * TODO: drop the probe once `@metamask/wallet` exposes controller metadata
 * without constructing a `Wallet`.
 *
 * @param store - The key-value store to read from.
 * @param logFn - Logger for a probe-teardown failure.
 * @returns The filtered persisted state, suitable for the `Wallet` `state`
 * option.
 */
async function loadPersistedState(
  store: KeyValueStore,
  logFn: (message: string) => void,
): Promise<Record<string, Record<string, Json>>> {
  const probe = new Wallet({ instanceOptions: buildInstanceOptions() });
  try {
    return loadState(store, probe.controllerMetadata);
  } finally {
    await probe.destroy().catch((error: unknown) => {
      logFn(`Metadata probe destroy failed: ${String(error)}`);
    });
  }
}

/**
 * Tear down a wallet and its store in persistence-safe order: stop the
 * subscription, destroy the wallet, then close the store. Each step is
 * best-effort; a failure is logged and the remaining steps still run.
 *
 * @param unsubscribe - The persistence-subscription unsubscribe function, if
 * one was registered.
 * @param wallet - The wallet to destroy, if one was constructed.
 * @param store - The store to close.
 * @param logFn - Logger for step failures.
 */
async function teardown(
  unsubscribe: (() => void) | undefined,
  wallet: Wallet | undefined,
  store: KeyValueStore,
  logFn: (message: string) => void,
): Promise<void> {
  if (unsubscribe) {
    try {
      unsubscribe();
    } catch (error) {
      logFn(`Persistence unsubscribe failed during teardown: ${String(error)}`);
    }
  }
  if (wallet) {
    try {
      await wallet.destroy();
    } catch (error) {
      logFn(`wallet.destroy() failed during teardown: ${String(error)}`);
    }
  }
  try {
    store.close();
  } catch (error) {
    logFn(`store.close() failed during teardown: ${String(error)}`);
  }
}

/**
 * Determine whether the loaded state already contains a keyring vault.
 *
 * The KeyringController persists its `vault` once an SRP has been imported, so
 * its presence indicates that first-run setup completed before.
 *
 * @param state - The state loaded from the key-value store.
 * @returns True if a KeyringController vault string is present.
 */
function hasPersistedKeyring(
  state: Record<string, Record<string, unknown>>,
): boolean {
  return typeof state.KeyringController?.vault === 'string';
}
