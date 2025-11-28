import { type Bip44Account } from '@metamask/account-api';
import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import {
  KeyringRpcMethod,
  type EntropySourceId,
  type KeyringAccount,
} from '@metamask/keyring-api';
import type { KeyringMetadata } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { Json, JsonRpcRequest, SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import { createDeferredPromise } from '@metamask/utils';
import { Semaphore } from 'async-mutex';

import { BaseBip44AccountProvider } from './BaseBip44AccountProvider';
import { traceFallback } from '../analytics';
import { projectLogger as log } from '../logger';
import type { MultichainAccountServiceMessenger } from '../types';
import { createSentryError } from '../utils';

export type RestrictedSnapKeyringCreateAccount = (
  options: Record<string, Json>,
) => Promise<KeyringAccount>;

export type SnapAccountProviderConfig = {
  maxConcurrency?: number;
  discovery: {
    maxAttempts: number;
    timeoutMs: number;
    backOffMs: number;
  };
  createAccounts: {
    timeoutMs: number;
  };
};

export abstract class SnapAccountProvider extends BaseBip44AccountProvider {
  readonly snapId: SnapId;

  protected readonly config: SnapAccountProviderConfig;

  protected readonly client: KeyringClient;

  readonly #queue?: Semaphore;

  readonly #trace: TraceCallback;

  protected static ensureSnapPlatformIsReadyPromise: Promise<void> | null =
    null;

  constructor(
    snapId: SnapId,
    messenger: MultichainAccountServiceMessenger,
    config: SnapAccountProviderConfig,
    /* istanbul ignore next */
    trace: TraceCallback = traceFallback,
  ) {
    super(messenger);

    this.snapId = snapId;
    this.client = this.#getKeyringClientFromSnapId(snapId);

    // All Snap requests are queued until the Snap platform is ready, so we use a basic "get"
    // request to detect that and make sure any request to the client will wait for that first.
    // eslint-disable-next-line no-void
    void this.ensureSnapPlatformIsReady();

    const maxConcurrency = config.maxConcurrency ?? Infinity;
    this.config = {
      ...config,
      maxConcurrency,
    };

    // Create semaphore only if concurrency is limited
    if (isFinite(maxConcurrency)) {
      this.#queue = new Semaphore(maxConcurrency);
    }

    this.#trace = trace;
  }

  async ensureSnapPlatformIsReady(): Promise<void> {
    // Use a static property to ensure we only create one promise for all instances of any
    // Snap providers.
    if (!SnapAccountProvider.ensureSnapPlatformIsReadyPromise) {
      // We create the deferred promise here to ensure that any request to the Snap platform
      // will go through once it's ready. The platform is considered ready when the onboarding
      // is complete.
      const ensureSnapPlatformIsReadyDeferred = createDeferredPromise<void>();
      SnapAccountProvider.ensureSnapPlatformIsReadyPromise =
        ensureSnapPlatformIsReadyDeferred.promise;

      log('Waiting for Snap platform to be ready...');

      // We just need to make a simple request to ensure the Snap platform is ready.
      // eslint-disable-next-line no-void
      void this.#ping().finally(() => {
        log('Snap platform is ready!');
        // No matter if the request succeeded or failed, we consider the Snap platform
        // is ready to process requests.
        ensureSnapPlatformIsReadyDeferred.resolve();
      });
    }

    return SnapAccountProvider.ensureSnapPlatformIsReadyPromise;
  }

  async #ping(): Promise<void> {
    // Can be used to ping and check if the Snap is responsive.
    // NOTE: We're trying to do this the fastest way possible, so we check for 1 account
    // if any exists, or just list accounts (which would be 0 in that case).
    const account = this.getAnyAccount();
    if (account) {
      log(
        `Ping (used "${KeyringRpcMethod.GetAccount}" and "${account.id}" with Snap: ${this.snapId}`,
      );
      await this.client.getAccount(account.id);
    } else {
      log(
        `Ping (used "${KeyringRpcMethod.ListAccounts}" with Snap: ${this.snapId}`,
      );
      await this.client.listAccounts();
    }
  }

  protected async withClient(
    operation: (client: KeyringClient) => Promise<void>,
  ): Promise<void> {
    // This will make sure the Snap platform is ready before sending any request
    // to the Snap.
    await this.ensureSnapPlatformIsReady();

    return operation(this.client);
  }

  /**
   * Wraps an async operation with concurrency limiting based on maxConcurrency config.
   * If maxConcurrency is Infinity (the default), the operation runs immediately without throttling.
   * Otherwise, it's queued through the semaphore to respect the concurrency limit.
   *
   * @param operation - The async operation to execute.
   * @returns The result of the operation.
   */
  protected async withMaxConcurrency<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
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

  protected async getRestrictedSnapAccountCreator(): Promise<RestrictedSnapKeyringCreateAccount> {
    await this.ensureSnapPlatformIsReady();

    // NOTE: We're not supposed to make the keyring instance escape `withKeyring` but
    // we have to use the `SnapKeyring` instance to be able to create Solana account
    // without triggering UI confirmation.
    // Also, creating account that way won't invalidate the Snap keyring state. The
    // account will get created and persisted properly with the Snap account creation
    // flow "asynchronously" (with `notify:accountCreated`).
    const createAccount = await this.#withSnapKeyring<
      SnapKeyring['createAccount']
    >(async ({ keyring }) => keyring.createAccount.bind(keyring));

    return (options) =>
      createAccount(this.snapId, options, {
        displayAccountNameSuggestion: false,
        displayConfirmation: false,
        setSelectedAccount: false,
      });
  }

  #getKeyringClientFromSnapId(snapId: string): KeyringClient {
    return new KeyringClient({
      send: async (request: JsonRpcRequest) => {
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
    });
  }

  async resyncAccounts(
    accounts: Bip44Account<InternalAccount>[],
  ): Promise<void> {
    const localSnapAccounts = accounts.filter(
      (account) =>
        account.metadata.snap && account.metadata.snap.id === this.snapId,
    );
    const snapAccounts = new Set(
      (await this.client.listAccounts()).map((account) => account.id),
    );

    // NOTE: This should never happen, but we want to report that kind of errors still
    // in case states are de-sync.
    if (localSnapAccounts.length < snapAccounts.size) {
      this.messenger.call(
        'ErrorReportingService:captureException',
        new Error(
          `Snap "${this.snapId}" has de-synced accounts, Snap has more accounts than MetaMask!`,
        ),
      );

      // We don't recover from this case yet.
      return;
    }

    // We want this part to be fast, so we only check for sizes, but we might need
    // to make a real "diff" between the 2 states to not miss any de-sync.
    if (localSnapAccounts.length > snapAccounts.size) {
      // Accounts should never really be de-synced, so we want to log this to see how often this
      // happens, cause that means that something else is buggy elsewhere...
      this.messenger.call(
        'ErrorReportingService:captureException',
        new Error(
          `Snap "${this.snapId}" has de-synced accounts, we'll attempt to re-sync them...`,
        ),
      );

      // We always use the MetaMask list as the main reference here.
      await Promise.all(
        localSnapAccounts.map(async (account) => {
          const { id: entropySource, groupIndex } = account.options.entropy;

          try {
            if (!snapAccounts.has(account.id)) {
              // We still need to remove the accounts from the Snap keyring since we're
              // about to create the same account again, which will use a new ID, but will
              // keep using the same address, and the Snap keyring does not allow this.
              await this.#withSnapKeyring(
                async ({ keyring }) =>
                  await keyring.removeAccount(account.address),
              );

              // The Snap has no account in its state for this one, we re-create it.
              await this.createAccounts({
                entropySource,
                groupIndex,
              });
            }
          } catch (error) {
            const sentryError = createSentryError(
              `Unable to re-sync account: ${groupIndex}`,
              error as Error,
              {
                provider: this.getName(),
                groupIndex,
              },
            );
            this.messenger.call(
              'ErrorReportingService:captureException',
              sentryError,
            );
          }
        }),
      );
    }
  }

  async #withSnapKeyring<CallbackResult = void>(
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SnapKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult> {
    return this.withKeyring<SnapKeyring, CallbackResult>(
      { type: KeyringTypes.snap },
      (args) => {
        return operation(args);
      },
    );
  }

  abstract isAccountCompatible(account: Bip44Account<InternalAccount>): boolean;

  abstract createAccounts(options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]>;

  abstract discoverAccounts(options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]>;
}

export const isSnapAccountProvider = (
  provider: unknown,
): provider is SnapAccountProvider => {
  return provider instanceof SnapAccountProvider;
};
