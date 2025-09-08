import type { Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';

import { BaseBip44AccountProvider } from './BaseBip44AccountProvider';
import type { MultichainAccountServiceMessenger } from '../types';

/**
 * A simple wrapper that adds disable functionality to any BaseBip44AccountProvider.
 * When disabled, the provider will not create new accounts and return empty results.
 */
export class AccountProviderWrapper extends BaseBip44AccountProvider {
  private isEnabled: boolean = true;

  private readonly provider: BaseBip44AccountProvider;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    provider: BaseBip44AccountProvider,
  ) {
    super(messenger);
    this.provider = provider;
  }

  override getName(): string {
    return this.provider.getName();
  }

  /**
   * Set the enabled state for this provider.
   *
   * @param enabled - Whether the provider should be enabled.
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Override getAccounts to return empty array when disabled.
   *
   * @returns Array of accounts, or empty array if disabled.
   */
  override getAccounts(): Bip44Account<KeyringAccount>[] {
    if (!this.isEnabled) {
      return [];
    }
    return this.provider.getAccounts();
  }

  /**
   * Override getAccount to throw when disabled.
   *
   * @param id - The account ID to retrieve.
   * @returns The account with the specified ID.
   * @throws When disabled or account not found.
   */
  override getAccount(
    id: Bip44Account<KeyringAccount>['id'],
  ): Bip44Account<KeyringAccount> {
    if (!this.isEnabled) {
      throw new Error('Provider is disabled');
    }
    return this.provider.getAccount(id);
  }

  /**
   * Implement abstract method: Check if account is compatible.
   * Delegates directly to wrapped provider - no runtime checks needed!
   *
   * @param account - The account to check.
   * @returns True if the account is compatible.
   */
  isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean {
    return this.provider.isAccountCompatible(account);
  }

  /**
   * Implement abstract method: Create accounts, returns empty array when disabled.
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
    if (!this.isEnabled) {
      return [];
    }
    return this.provider.createAccounts(options);
  }

  /**
   * Implement abstract method: Discover and create accounts, returns empty array when disabled.
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
    if (!this.isEnabled) {
      return [];
    }
    return this.provider.discoverAndCreateAccounts(options);
  }
}

/**
 * Simple type guard to check if a provider is wrapped.
 *
 * @param provider - The provider to check.
 * @returns True if the provider is an AccountProviderWrapper.
 */
export function isAccountProviderWrapper(
  provider: unknown,
): provider is AccountProviderWrapper {
  return provider instanceof AccountProviderWrapper;
}
