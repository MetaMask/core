import { isBip44Account } from '@metamask/account-api';
import type { AccountProvider, Bip44Account } from '@metamask/account-api';
import type {
  CreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
} from '@metamask/keyring-api';
import type {
  Keyring as KeyringV2,
  KeyringCapabilities,
} from '@metamask/keyring-api/v2';
import type {
  KeyringMetadata,
  KeyringSelectorV2,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { MultichainAccountServiceMessenger } from '../types.js';

/**
 * Asserts a keyring account is BIP-44 compatible.
 *
 * @param account - Keyring account to check.
 * @throws If the keyring account is not compatible.
 */
export function assertIsBip44Account(
  account: KeyringAccount,
): asserts account is Bip44Account<KeyringAccount> {
  if (!isBip44Account(account)) {
    throw new Error('Created account is not BIP-44 compatible');
  }
}

/**
 * Asserts that a list of keyring accounts are all BIP-44 compatible.
 *
 * @param accounts - Keyring accounts to check.
 * @throws If any of the keyring account is not compatible.
 */
export function assertAreBip44Accounts(
  accounts: KeyringAccount[],
): asserts accounts is Bip44Account<KeyringAccount>[] {
  accounts.forEach(assertIsBip44Account);
}

export type Bip44AccountProvider<
  Account extends Bip44Account<KeyringAccount> = Bip44Account<KeyringAccount>,
> = AccountProvider<Account> & {
  /**
   * Provider capabilities, including supported scopes and BIP-44 options.
   *
   * @returns The provider capabilities.
   */
  get capabilities(): KeyringCapabilities;
  /**
   * Get the name of the provider.
   *
   * @returns The name of the provider.
   */
  getName(): string;
  /**
   * Initialize the provider with the given accounts.
   *
   * @param accounts - The accounts to initialize the provider with.
   */
  init(accounts: Bip44Account<KeyringAccount>['id'][]): void;
  /**
   * Check if the account is compatible with the provider.
   */
  isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean;
  /**
   * Create accounts for the provider.
   *
   * @param options - The options for creating the accounts.
   * @param options.entropySource - The entropy source.
   * @param options.groupIndex - The group index.
   * @param options.type - The type of account creation.
   * @returns The created accounts.
   */
  createAccounts(options: CreateAccountOptions): Promise<Account[]>;
  /**
   * Delete an account managed by this provider.
   *
   * Mirrors the v2 keyring `deleteAccount(accountId)` contract. Each provider
   * implementation is responsible for resolving any extra information it needs
   * (e.g. address for snap-based providers) and for performing the underlying
   * keyring removal.
   *
   * @param id - The id of the account to delete.
   */
  deleteAccount(id: Account['id']): Promise<void>;
  /**
   * Re-synchronize MetaMask accounts and the providers accounts if needed.
   *
   * NOTE: This is mostly required if one of the providers (keyrings or Snaps)
   * have different sets of accounts. This method would ensure that both are
   * in-sync and use the same accounts (and same IDs).
   */
  resyncAccounts(accounts: Bip44Account<InternalAccount>[]): Promise<void>;
  /**
   * Check if the provider has an aligned (i.e. present and owned) account for
   * the given entropy source and group index.
   *
   * Callers pre-filter the relevant account IDs from the group and pass them
   * in so the provider needs no messenger call.
   *
   * @param context - The entropy source and group index to check.
   * @param context.entropySource - The entropy source to check against.
   * @param context.groupIndex - The group index to check against.
   * @param accountIds - Account IDs already associated with this provider for
   * the given group (may be empty if no alignment has happened yet).
   * @returns `true` when `accountIds` is non-empty and every ID is in the
   * provider's internal accounts Set.
   */
  isAligned(
    context: { entropySource: EntropySourceId; groupIndex: number },
    accountIds: Account['id'][],
  ): boolean;
};

export abstract class BaseBip44AccountProvider<
  Account extends Bip44Account<KeyringAccount> = Bip44Account<KeyringAccount>,
> implements Bip44AccountProvider<Account> {
  protected readonly messenger: MultichainAccountServiceMessenger;

  protected accounts: Set<Bip44Account<KeyringAccount>['id']> = new Set();

  constructor(messenger: MultichainAccountServiceMessenger) {
    this.messenger = messenger;
  }

  /**
   * Add accounts to the provider.
   *
   * Note: There's an implicit assumption that the accounts are BIP-44 compatible.
   *
   * @param accounts - The accounts to add.
   */
  init(accounts: Account['id'][]): void {
    for (const account of accounts) {
      this.accounts.add(account);
    }
  }

  /**
   * Get the accounts list for the provider.
   *
   * @returns The accounts list.
   */
  #getAccountIds(): Account['id'][] {
    return [...this.accounts];
  }

  /**
   * Get the accounts list for the provider from the AccountsController.
   *
   * @returns The accounts list.
   */
  getAccounts(): Account[] {
    const accountsIds = this.#getAccountIds();
    const internalAccounts = this.messenger.call(
      'AccountsController:getAccounts',
      accountsIds,
    );
    // we cast here because we know that the accounts are BIP-44 compatible
    return internalAccounts as unknown as Account[];
  }

  /**
   * Get the account for the provider.
   *
   * @param id - The account ID.
   * @returns The account.
   * @throws If the account is not found.
   */
  getAccount(id: Account['id']): Account {
    const hasAccount = this.accounts.has(id);

    if (!hasAccount) {
      throw new Error(`Unable to find account: ${id}`);
    }

    // We need to upcast here since InternalAccounts are not always BIP-44 compatible
    // but we know that the account is BIP-44 compatible here so it is safe to do so
    return this.messenger.call(
      'AccountsController:getAccount',
      id,
    ) as unknown as Account;
  }

  /**
   * Run an operation against a V2 keyring selected by `selector`.
   *
   * Forwards to `KeyringController:withKeyringV2`. Use this for keyrings
   * that implement the unified V2 `Keyring` interface from
   * `@metamask/keyring-api/v2`.
   *
   * @param selector - The selector identifying the keyring.
   * @param operation - The operation to run with the selected keyring.
   * @returns The result of the operation.
   */
  protected async withKeyringV2<
    SelectedKeyring extends KeyringV2 = KeyringV2,
    CallbackResult = void,
  >(
    selector: KeyringSelectorV2<SelectedKeyring>,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult> {
    const result = await this.messenger.call(
      'KeyringController:withKeyringV2',
      selector,
      ({ keyring, metadata }) =>
        operation({
          keyring: keyring as SelectedKeyring,
          metadata,
        }),
    );

    return result as CallbackResult;
  }

  isAligned(
    _context: { entropySource: EntropySourceId; groupIndex: number },
    accountIds: Account['id'][],
  ): boolean {
    return (
      accountIds.length >= 1 && accountIds.every((id) => this.accounts.has(id))
    );
  }

  abstract get capabilities(): KeyringCapabilities;

  abstract getName(): string;

  abstract resyncAccounts(
    accounts: Bip44Account<InternalAccount>[],
  ): Promise<void>;

  abstract isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean;

  abstract createAccounts(options: CreateAccountOptions): Promise<Account[]>;

  abstract deleteAccount(id: Account['id']): Promise<void>;

  abstract discoverAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Account[]>;
}
