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
import type { WalletOptions } from '@metamask/wallet';
import { rm } from 'node:fs/promises';

import { KeyValueStore } from '../persistence/KeyValueStore.js';
import { loadState, subscribeToChanges } from '../persistence/persistence.js';
import type { Password, Srp } from './secrets.js';
import type { Logger } from './types.js';

const IN_MEMORY_DATABASE_PATH = ':memory:';

export type CreateWalletConfig = {
  databasePath: string;
  password?: Password;
  srp: Srp;
  infuraProjectId: string;
  log?: Logger;
};

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
 * - `networkController` — the Infura project ID used to reach Infura RPC
 *   endpoints.
 * - `remoteFeatureFlagController` — a `ClientConfigApiService` fetching real
 *   flags over the network.
 * - `approvalController` — a no-op `showApprovalRequest` (the daemon is
 *   headless).
 * - `transactionController` — swaps processing disabled and no client hooks;
 *   see the slot's inline comment for why the daemon relies on the
 *   controller's defaults for everything else.
 *
 * The optional `keyringController` slot is intentionally omitted so the
 * controller's built-in defaults (e.g. the PBKDF2 encryptor) apply.
 *
 * @param infuraProjectId - The Infura project ID for the `NetworkController`.
 * @returns The `instanceOptions` for the `Wallet` constructor.
 */
function buildInstanceOptions(
  infuraProjectId: string,
): WalletOptions['instanceOptions'] {
  return {
    approvalController: {
      // TODO: surface approval requests over the daemon transport.
      showApprovalRequest: (): undefined => undefined,
    },
    connectivityController: {
      connectivityAdapter: new AlwaysOnlineAdapter(),
    },
    gasFeeController: {
      // Identifies the CLI to the gas estimation API via the `X-Client-Id`
      // header.
      clientId: 'cli',
    },
    networkController: {
      infuraProjectId,
    },
    remoteFeatureFlagController: {
      clientConfigApiService: new ClientConfigApiService({
        fetch: globalThis.fetch,
        config: {
          // TODO: switch to a CLI-specific `ClientType` once one exists; until
          // then `Extension` buckets feature flags as an extension client.
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
    transactionController: {
      // The CLI exposes no swaps surface, so skip the swaps-specific
      // post-processing a full wallet client runs (mobile makes the same
      // choice; the extension keeps swaps enabled).
      disableSwaps: true,
      // No CLI-specific transaction hooks: the controller's built-in publish
      // path broadcasts through the wired `NetworkController` provider, and the
      // remaining hooks (metrics, notifications, gas-fee tokens) are client-UI
      // concerns the headless daemon has no equivalent for. Every other option
      // (`getPermittedAccounts`, `isSimulationEnabled`, `trace`, …) is left at
      // the controller's default.
      hooks: {},
    },
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
 * secret recovery phrase is imported using the supplied password. On
 * subsequent runs, the persisted vault is reused: when a password is
 * supplied, the wallet is unlocked via `KeyringController:submitPassword` so
 * keyring-bound messenger actions work immediately; when no password is
 * supplied, the wallet starts locked and the caller is expected to invoke
 * `mm wallet unlock` before any keyring-bound operation. First-run startup
 * without a password is rejected (the SRP cannot be imported without one).
 * On a subsequent run, a wrong password rejects startup with a `Failed to
 * unlock the persisted vault` error that wraps the `submitPassword` rejection.
 *
 * On any failure after the store is opened, the store is closed (and the wallet
 * destroyed, if constructed). On a first-run failure, the on-disk database is
 * also removed so a retry does not latch onto an orphaned partial vault — this
 * covers in-process failures only; a hard crash (SIGKILL/power loss) mid-import
 * can still leave a vault on disk.
 *
 * @param config - Wallet configuration.
 * @param config.databasePath - Path to the SQLite database file (or
 * `':memory:'` for ephemeral use).
 * @param config.password - The wallet password. Optional on subsequent runs;
 * when omitted, the daemon starts with a locked keyring. Required on first
 * run (to import the SRP).
 * @param config.srp - The secret recovery phrase (BIP-39 mnemonic). Used
 * only on first run.
 * @param config.infuraProjectId - The Infura project ID for the
 * `NetworkController`.
 * @param config.log - Optional logger for persistence-write and teardown
 * failures. Without it, failures fall back to `console.error` (which a detached
 * daemon's `stdio: 'ignore'` discards).
 * @returns The `Wallet` and a `dispose` handle that tears it down.
 */
export async function createWallet({
  databasePath,
  password,
  srp,
  infuraProjectId,
  log,
}: CreateWalletConfig): Promise<CreateWalletResult> {
  const logFn = log ?? ((message: string): void => console.error(message));
  const store = new KeyValueStore(databasePath);
  let wallet: Wallet | undefined;
  let unsubscribe: (() => void) | undefined;
  let wasFirstRun = false;

  try {
    const state = await loadPersistedState(store, infuraProjectId, logFn);
    wasFirstRun = !hasPersistedKeyring(state);

    // Validate the first-run precondition BEFORE constructing the wallet,
    // so a doomed startup doesn't build a Wallet (and wire persistence
    // handlers) just to tear it down.
    if (wasFirstRun && password === undefined) {
      throw new Error(
        'A password is required on first run to import the secret recovery phrase. ' +
          'Pass `--password` (or `MM_WALLET_PASSWORD`) on `mm daemon start`.',
      );
    }

    wallet = new Wallet({
      state,
      instanceOptions: buildInstanceOptions(infuraProjectId),
    });
    unsubscribe = subscribeToChanges(
      wallet.messenger,
      wallet.controllerMetadata,
      store,
      logFn,
    );

    // Complete post-construction controller setup before serving requests —
    // e.g. `NetworkController.init` applies the selected network so a provider
    // is available. `init` settles every step independently; a rejected step
    // leaves the wallet only partially usable, so abort startup (the catch
    // below tears down and, on first run, removes the partial database) rather
    // than serving a degraded daemon.
    const initResults = await wallet.init();
    const initFailures = initResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    for (const failure of initFailures) {
      logFn(`Wallet init step failed: ${String(failure.reason)}`);
    }
    if (initFailures.length > 0) {
      const firstReason = String(initFailures[0].reason);
      throw new Error(
        `Wallet initialization failed (${initFailures.length} step(s)); refusing to serve a partially initialized wallet. First failure: ${firstReason}`,
      );
    }

    if (wasFirstRun) {
      // The precondition check above throws when `wasFirstRun && password ===
      // undefined`, so `password` is defined here. TS does not correlate the
      // two separate variables, so it cannot narrow `password` from
      // `wasFirstRun` alone — hence the assertion.
      await importSecretRecoveryPhrase(
        wallet,
        (password as Password).unwrap(),
        srp.unwrap(),
      );
    } else if (password !== undefined) {
      try {
        await wallet.messenger.call(
          'KeyringController:submitPassword',
          password.unwrap(),
        );
      } catch (error) {
        throw new Error(
          `Failed to unlock the persisted vault: ${String(error)}`,
        );
      }
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
 * @param infuraProjectId - The Infura project ID for the probe's
 * `NetworkController`.
 * @param logFn - Logger for a probe-teardown failure.
 * @returns The filtered persisted state, suitable for the `Wallet` `state`
 * option.
 */
async function loadPersistedState(
  store: KeyValueStore,
  infuraProjectId: string,
  logFn: Logger,
): Promise<Record<string, Record<string, Json>>> {
  const probe = new Wallet({
    instanceOptions: buildInstanceOptions(infuraProjectId),
  });
  try {
    return loadState(store, probe.controllerMetadata);
  } finally {
    await probe.destroy().catch((error: unknown) => {
      logFn(`Metadata probe destroy failed: ${String(error)}`);
    });
  }
}

/**
 * Persistence-safe teardown of a wallet and its store; see {@link
 * CreateWalletResult.dispose} for the ordering rationale. Each step is
 * best-effort, so a failure is logged and the remaining steps still run.
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
  logFn: Logger,
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
