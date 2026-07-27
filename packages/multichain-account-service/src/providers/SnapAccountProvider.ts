import { assertIsBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';
import type { SnapKeyring as SnapKeyringV2 } from '@metamask/eth-snap-keyring/v2';
import {
  EMPTY_CAPABILITIES,
  isSnapKeyring,
} from '@metamask/eth-snap-keyring/v2';
import {
  AccountCreationType,
  assertCreateAccountOptionIsSupported,
} from '@metamask/keyring-api';
import type {
  CreateAccountBip44DeriveIndexOptions,
  CreateAccountBip44DeriveIndexRangeOptions,
  CreateAccountBip44DiscoverOptions,
  CreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
} from '@metamask/keyring-api';
import type { KeyringCapabilities } from '@metamask/keyring-api/v2';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Json, JsonRpcRequest, SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { CaipChainId } from '@metamask/utils';
import { Semaphore } from 'async-mutex';

import {
  toCreateAccountsV2DataTraces,
  traceFallback,
  TraceName,
} from '../analytics/index.js';
import { reportError } from '../errors.js';
import { projectLogger as log, WARNING_PREFIX } from '../logger.js';
import type { MultichainAccountServiceMessenger } from '../types.js';
import { BaseBip44AccountProvider } from './BaseBip44AccountProvider.js';
import { createSnapKeyringClient } from './SnapKeyringClient.js';
import type { Sender, SnapKeyringClient } from './SnapKeyringClient.js';
import { withRetry, withTimeout } from './utils.js';

/**
 * A proxy to the Snap's keyring operations that routes every call through the
 * `KeyringController` mutex (via {@link SnapAccountProvider.#withSnapKeyring}).
 * Callers receive this object from {@link SnapAccountProvider.withSnap} and
 * never interact with the raw keyring or the mutex directly.
 */
export type SnapKeyringProxy = {
  createAccounts: SnapKeyringV2['createAccounts'];
  deleteAccount: SnapKeyringV2['deleteAccount'];
};

export type SnapAccountProviderConfig = {
  maxConcurrency?: number;
  discovery: {
    enabled?: boolean;
    maxAttempts: number;
    timeoutMs: number;
    backOffMs: number;
  };
  createAccounts: {
    /**
     * Timeout for account creation operations.
     *
     * NOTE: Batching (and thus whether a single call may create multiple
     * accounts) is driven by the Snap's declared capabilities, not this config.
     * The value might have to be adapted when the Snap supports batching.
     */
    timeoutMs: number;
  };
  resyncAccounts?: {
    /**
     * Whether to automatically remove extra Snap accounts when the Snap has
     * more accounts than MetaMask. If `false`, a warning is logged instead.
     * Defaults to `true`.
     */
    autoRemoveExtraSnapAccounts?: boolean;
  };
};

export abstract class SnapAccountProvider extends BaseBip44AccountProvider {
  readonly snapId: SnapId;

  protected readonly config: SnapAccountProviderConfig;

  /**
   * The Snap's keyring capabilities, sourced from `SnapAccountService` (which
   * reads them from the Snap's manifest). Populated the first time the client
   * is resolved; defaults to an empty capability set until then.
   */
  capabilities: KeyringCapabilities = EMPTY_CAPABILITIES;

  /**
   * Version-agnostic keyring client, resolved lazily once the Snap is ready and
   * its capabilities are known — see {@link SnapAccountProvider.withSnap}.
   */
  #client?: SnapKeyringClient;

  readonly #sender: Sender;

  readonly #queue?: Semaphore;

  readonly #trace: TraceCallback;

  /**
   * Scopes passed to the v1 `discoverAccounts` client method. Only used on the
   * v1 discovery path.
   *
   * TODO: Remove once all Snaps are fully v2 — discovery is then driven by the
   * Snap's own supported scopes via `createAccounts({ bip44:discover })`.
   */
  protected abstract readonly v1DiscoveryScopes: CaipChainId[];

  constructor(
    snapId: SnapId,
    messenger: MultichainAccountServiceMessenger,
    config: SnapAccountProviderConfig,
    /* istanbul ignore next */
    trace: TraceCallback = traceFallback,
  ) {
    super(messenger);

    this.snapId = snapId;
    this.#sender = this.#createSender(snapId);

    const maxConcurrency = config.maxConcurrency ?? Infinity;
    this.config = {
      ...config,
      discovery: {
        ...config.discovery,
        enabled: config.discovery.enabled ?? true,
      },
      maxConcurrency,
    };

    // Create semaphore only if concurrency is limited
    if (isFinite(maxConcurrency)) {
      this.#queue = new Semaphore(maxConcurrency);
    }

    this.#trace = trace;
  }

  /**
   * Ensures that the Snap is ready to be used.
   *
   * Once this resolves, a Snap keyring for {@link snapId} is guaranteed to
   * exist in the `KeyringController`, so subsequent {@link #withSnapKeyring}
   * calls will not fail with "No keyring matches the selector".
   *
   * @returns A promise that resolves when the Snap is ready.
   * @throws An error if the Snap could not become ready.
   */
  async ensureReady(): Promise<void> {
    return this.messenger.call('SnapAccountService:ensureReady', this.snapId);
  }

  /**
   * Wraps an async operation with concurrency limiting based on maxConcurrency config.
   * If maxConcurrency is Infinity (the default), the operation runs immediately without throttling.
   * Otherwise, it's queued through the semaphore to respect the concurrency limit.
   *
   * @param operation - The async operation to execute.
   * @returns The result of the operation.
   */
  protected async withMaxConcurrency<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    if (this.#queue) {
      return this.#queue.runExclusive(operation);
    }
    return operation();
  }

  protected async trace<ReturnType>(
    request: TraceRequest,
    fn: () => Promise<ReturnType>,
  ): Promise<ReturnType> {
    return this.#trace(request, fn);
  }

  #createSender(snapId: string): Sender {
    return {
      send: async (request: JsonRpcRequest): Promise<Json> => {
        const response = await this.messenger.call(
          'SnapController:handleRequest',
          {
            snapId: snapId as SnapId,
            origin: 'metamask',
            handler: HandlerType.OnKeyringRequest,
            request,
          },
        );
        return response as Json;
      },
    };
  }

  /**
   * Whether the Snap supports the v2 keyring protocol, inferred from its
   * declared capabilities (a v2-capable Snap declares BIP-44 capabilities).
   *
   * @returns `true` if the Snap is v2-capable.
   */
  protected isV2(): boolean {
    return Boolean(this.capabilities.bip44);
  }

  /**
   * Resolves the version-agnostic keyring client, fetching the Snap's
   * capabilities from `SnapAccountService` on first use and caching both the
   * capabilities and the resulting client.
   *
   * Callers must ensure the Snap is ready (via
   * {@link SnapAccountProvider.ensureReady}) beforehand so that the
   * capabilities are reliably populated — {@link SnapAccountProvider.withSnap}
   * guarantees this ordering.
   *
   * @returns The resolved {@link SnapKeyringClient}.
   */
  async #resolveClient(): Promise<SnapKeyringClient> {
    if (!this.#client) {
      this.capabilities = await this.messenger.call(
        'SnapAccountService:getCapabilities',
        this.snapId,
      );
      this.#client = createSnapKeyringClient(this.#sender, this.isV2());
    }
    return this.#client;
  }

  async resyncAccounts(
    accounts: Bip44Account<InternalAccount>[],
  ): Promise<void> {
    await this.withSnap(async ({ client, keyring }) => {
      const localSnapAccounts = accounts.filter(
        (account) => account.metadata.snap?.id === this.snapId,
      );
      const snapAccounts = new Set(
        (await client.getAccounts()).map((account) => account.id),
      );

      // NOTE: This should never happen, but if it does, we recover by deleting the
      // extra accounts from the Snap to bring it back in sync with MetaMask.
      if (localSnapAccounts.length < snapAccounts.size) {
        const autoRemoveExtraSnapAccounts =
          this.config.resyncAccounts?.autoRemoveExtraSnapAccounts ?? true;

        if (autoRemoveExtraSnapAccounts) {
          // Build a set of local account IDs for quick lookup
          const localAccountIds = new Set(
            localSnapAccounts.map((account) => account.id),
          );

          // Find and delete accounts that exist in Snap but not in MetaMask
          await Promise.all(
            [...snapAccounts].map(async (snapAccountId) => {
              try {
                if (!localAccountIds.has(snapAccountId)) {
                  // This account exists in the Snap but not in MetaMask, delete it from
                  // the Snap.
                  await client.deleteAccount(snapAccountId);
                  // Update the local Set so subsequent checks use the correct size
                  snapAccounts.delete(snapAccountId);
                }
              } catch (error) {
                reportError(
                  this.messenger,
                  `Unable to delete de-synced Snap account: ${this.snapId}`,
                  error,
                  {
                    provider: this.getName(),
                    snapAccountId,
                  },
                );
              }
            }),
          );
        } else {
          const message = `Snap "${this.snapId}" has de-synced accounts, Snap has more accounts than MetaMask! (${localSnapAccounts.length} < ${snapAccounts.size})`;
          log(`${WARNING_PREFIX} ${message}`);
          console.warn(message);
          return;
        }
      }

      // We want this part to be fast, so we only check for sizes, but we might need
      // to make a real "diff" between the 2 states to not miss any de-sync.
      if (localSnapAccounts.length > snapAccounts.size) {
        // We always use the MetaMask list as the main reference here.
        await Promise.all(
          localSnapAccounts.map(async (account) => {
            const { id: entropySource, groupIndex } = account.options.entropy;

            try {
              if (!snapAccounts.has(account.id)) {
                // We still need to remove the accounts from the Snap keyring since we're
                // about to create the same account again, which will use a new ID, but will
                // keep using the same address, and the Snap keyring does not allow this.
                await keyring.deleteAccount(account.id);
                // The Snap has no account in its state for this one, we re-create it.
                await this.createAccounts({
                  type: AccountCreationType.Bip44DeriveIndex,
                  entropySource,
                  groupIndex,
                });
              }
            } catch (error) {
              reportError(this.messenger, 'Unable to re-sync accounts', error, {
                provider: this.getName(),
                groupIndex,
              });
            }
          }),
        );
      }
    });
  }

  async #withSnapKeyring<CallbackResult = void>(
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SnapKeyringV2;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult> {
    return this.withKeyringV2<SnapKeyringV2, CallbackResult>(
      {
        filter: (keyring) =>
          isSnapKeyring(keyring) && keyring.snapId === this.snapId,
      },
      (args) => operation(args),
    );
  }

  protected async withSnap<CallbackResult = void>(
    operation: (snap: {
      client: SnapKeyringClient;
      keyring: SnapKeyringProxy;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult> {
    await this.ensureReady();
    const client = await this.#resolveClient();
    const keyring: SnapKeyringProxy = {
      createAccounts: (options) =>
        this.#withSnapKeyring(({ keyring: snapKeyring }) =>
          snapKeyring.createAccounts(options),
        ),
      deleteAccount: (id) =>
        this.#withSnapKeyring(({ keyring: snapKeyring }) =>
          snapKeyring.deleteAccount(id),
        ),
    };
    return await operation({ client, keyring });
  }

  abstract isAccountCompatible(account: Bip44Account<InternalAccount>): boolean;

  protected toBip44Account(
    account: KeyringAccount,
    _options: { entropySource: EntropySourceId; groupIndex: number },
  ): Bip44Account<KeyringAccount> {
    assertIsBip44Account(account);
    return account;
  }

  protected async createBip44Accounts(
    keyring: SnapKeyringProxy,
    options:
      | CreateAccountBip44DeriveIndexOptions
      | CreateAccountBip44DeriveIndexRangeOptions
      | CreateAccountBip44DiscoverOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    return this.withMaxConcurrency(async () => {
      const { entropySource } = options;

      const snapAccounts = await withTimeout(
        () =>
          this.trace(
            {
              name: TraceName.ProviderCreateAccounts,
              data: {
                provider: this.getName(),
                ...toCreateAccountsV2DataTraces(options),
              },
            },
            () => keyring.createAccounts(options),
          ),
        this.config.createAccounts.timeoutMs,
      );

      const groupIndexOffset =
        options.type === `${AccountCreationType.Bip44DeriveIndexRange}`
          ? options.range.from
          : options.groupIndex;

      return snapAccounts.map((snapAccount, index) => {
        const groupIndex = groupIndexOffset + index;
        const account = this.toBip44Account(snapAccount, {
          entropySource,
          groupIndex,
        });

        this.accounts.add(snapAccount.id);
        return account;
      });
    });
  }

  async createAccounts(
    options: CreateAccountOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    assertCreateAccountOptionIsSupported(options, [
      `${AccountCreationType.Bip44DeriveIndex}`,
      `${AccountCreationType.Bip44DeriveIndexRange}`,
    ]);

    return this.withSnap(async ({ keyring }) =>
      this.createBip44Accounts(keyring, options),
    );
  }

  /**
   * Delete a snap account by id.
   *
   * Resolves the account's address from the tracked account, then forwards to
   * the legacy `SnapKeyring.removeAccount(address)`. The Snap keyring takes
   * care of notifying the snap to clean up its own state through the normal
   * account-removal flow (same path used by `resyncAccounts`).
   *
   * @param id - The id of the account to delete.
   */
  async deleteAccount(id: Bip44Account<KeyringAccount>['id']): Promise<void> {
    const account = this.getAccount(id);

    await this.#withSnapKeyring(async ({ keyring }) => {
      await keyring.deleteAccount(account.id);
    });

    this.accounts.delete(id);
  }

  /**
   * Discovers accounts for the given entropy source and group index.
   *
   * v2 Snaps drive discovery through `createAccounts({ bip44:discover })`: the
   * Snap checks for on-chain activity (using its own supported scopes) and
   * returns the created account(s), or nothing once discovery is exhausted.
   *
   * v1 Snaps use the client's `discoverAccounts` to detect activity on
   * {@link v1DiscoveryScopes}, then create the account for the group index.
   *
   * @param options - The discovery options.
   * @param options.entropySource - The entropy source to discover accounts for.
   * @param options.groupIndex - The group index to discover accounts for.
   * @returns The discovered (and created) accounts, or an empty array when
   * there is nothing to discover at this group index.
   */
  async discoverAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return this.withSnap(async ({ client, keyring }) =>
      this.trace(
        {
          name: TraceName.SnapDiscoverAccounts,
          data: {
            provider: this.getName(),
          },
        },
        async () => {
          if (!this.config.discovery.enabled) {
            return [];
          }

          if (this.isV2()) {
            // The v2 client has no `discoverAccounts`, so discovery is only
            // possible when the Snap supports `bip44:discover`. Otherwise there
            // is no way to discover and we report nothing.
            if (!this.capabilities.bip44?.discover) {
              return [];
            }

            // v2: the Snap detects on-chain activity and creates the account in
            // a single `createAccounts({ bip44:discover })` call. An empty
            // result means discovery is exhausted at this group index.
            return this.createBip44Accounts(keyring, {
              type: AccountCreationType.Bip44Discover,
              entropySource,
              groupIndex,
            });
          }

          // v1: detect activity via the client, then create the account for
          // this group index.
          const discoveredAccounts = await withRetry(
            () =>
              withTimeout(
                () =>
                  client.discoverAccounts(
                    this.v1DiscoveryScopes,
                    entropySource,
                    groupIndex,
                  ),
                this.config.discovery.timeoutMs,
              ),
            {
              maxAttempts: this.config.discovery.maxAttempts,
              backOffMs: this.config.discovery.backOffMs,
            },
          );

          if (!discoveredAccounts.length) {
            return [];
          }

          return this.createBip44Accounts(keyring, {
            type: AccountCreationType.Bip44DeriveIndex,
            entropySource,
            groupIndex,
          });
        },
      ),
    );
  }
}

export const isSnapAccountProvider = (
  provider: unknown,
): provider is SnapAccountProvider => {
  return provider instanceof SnapAccountProvider;
};
