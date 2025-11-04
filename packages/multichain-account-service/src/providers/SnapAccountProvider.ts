import { type Bip44Account } from '@metamask/account-api';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Json, SnapId } from '@metamask/snaps-sdk';
import { Semaphore } from 'async-mutex';

import { BaseBip44AccountProvider } from './BaseBip44AccountProvider';
import type { MultichainAccountServiceMessenger } from '../types';

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

  readonly #queue?: Semaphore;

  constructor(
    snapId: SnapId,
    messenger: MultichainAccountServiceMessenger,
    config: SnapAccountProviderConfig,
  ) {
    super(messenger);

    this.snapId = snapId;

    const maxConcurrency = config.maxConcurrency ?? Infinity;
    this.config = {
      ...config,
      maxConcurrency,
    };

    // Create semaphore only if concurrency is limited
    if (isFinite(maxConcurrency)) {
      this.#queue = new Semaphore(maxConcurrency);
    }
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

  protected async getRestrictedSnapAccountCreator(): Promise<RestrictedSnapKeyringCreateAccount> {
    // NOTE: We're not supposed to make the keyring instance escape `withKeyring` but
    // we have to use the `SnapKeyring` instance to be able to create Solana account
    // without triggering UI confirmation.
    // Also, creating account that way won't invalidate the Snap keyring state. The
    // account will get created and persisted properly with the Snap account creation
    // flow "asynchronously" (with `notify:accountCreated`).
    const createAccount = await this.withKeyring<
      SnapKeyring,
      SnapKeyring['createAccount']
    >({ type: KeyringTypes.snap }, async ({ keyring }) =>
      keyring.createAccount.bind(keyring),
    );

    return (options) =>
      createAccount(this.snapId, options, {
        displayAccountNameSuggestion: false,
        displayConfirmation: false,
        setSelectedAccount: false,
      });
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
