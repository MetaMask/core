import type { AccountProvider, Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';

/**
 * A simple wrapper that adds disable functionality to any AccountProvider.
 * When disabled, the provider will not create new accounts and return empty results.
 */
export class ProviderWrapper
  implements AccountProvider<Bip44Account<KeyringAccount>>
{
  private isDisabled: boolean = false;

  private readonly provider: AccountProvider<Bip44Account<KeyringAccount>>;

  constructor(provider: AccountProvider<Bip44Account<KeyringAccount>>) {
    this.provider = provider;
  }

  /**
   * Set the disabled state for this provider.
   *
   * @param disabled - Whether the provider should be disabled.
   */
  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled;
    console.log(
      `Provider ${this.provider.constructor.name} ${disabled ? 'disabled' : 'enabled'}`,
    );
  }

  /**
   * Get accounts, returns empty array when disabled.
   *
   * @returns Array of accounts, or empty array if disabled.
   */
  getAccounts(): Bip44Account<KeyringAccount>[] {
    if (this.isDisabled) {
      return [];
    }
    return this.provider.getAccounts();
  }

  /**
   * Get account by ID, throws error when disabled.
   *
   * @param id - The account ID to retrieve.
   * @returns The account with the specified ID, or undefined if not found.
   */
  getAccount(
    id: Bip44Account<KeyringAccount>['id'],
  ): Bip44Account<KeyringAccount> | undefined {
    if (this.isDisabled) {
      throw new Error(`Provider ${this.provider.constructor.name} is disabled`);
    }
    return this.provider.getAccount(id);
  }

  /**
   * Create accounts, returns empty array when disabled.
   *
   * @param options - Account creation options.
   * @param options.entropySource - The entropy source to use.
   * @param options.groupIndex - The group index to use.
   * @returns Promise resolving to created accounts, or empty array if disabled.
   */
  async createAccounts(options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    if (this.isDisabled) {
      console.log(
        `Provider ${this.provider.constructor.name} is disabled - skipping account creation`,
      );
      return [];
    }
    return this.provider.createAccounts(options);
  }

  /**
   * Discover and create accounts, returns empty array when disabled.
   *
   * @param options - Account discovery options.
   * @param options.entropySource - The entropy source to use.
   * @param options.groupIndex - The group index to use.
   * @returns Promise resolving to discovered accounts, or empty array if disabled.
   */
  async discoverAndCreateAccounts(options: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    if (this.isDisabled) {
      console.log(
        `Provider ${this.provider.constructor.name} is disabled - skipping account discovery`,
      );
      return [];
    }
    return this.provider.discoverAndCreateAccounts(options);
  }

  /**
   * Check if account is compatible.
   *
   * @param account - The account to check.
   * @returns True if the account is compatible.
   */
  isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean {
    // Check if the provider has the method (from BaseAccountProvider)
    if (
      'isAccountCompatible' in this.provider &&
      typeof this.provider.isAccountCompatible === 'function'
    ) {
      return this.provider.isAccountCompatible(account);
    }
    // Fallback: return true if the method doesn't exist
    return true;
  }
}

/**
 * Simple type guard to check if a provider is wrapped.
 *
 * @param provider - The provider to check.
 * @returns True if the provider is a ProviderWrapper.
 */
export function isProviderWrapper(
  provider: AccountProvider<Bip44Account<KeyringAccount>> | ProviderWrapper,
): provider is ProviderWrapper {
  return provider instanceof ProviderWrapper;
}
