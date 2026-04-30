import type { Bip44Account } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type {
  CreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
} from '@metamask/keyring-api';
import {
  AccountCreationType,
  assertCreateAccountOptionIsSupported,
  EthAccountType,
  EthScope,
} from '@metamask/keyring-api';
import type { KeyringCapabilities, Keyring } from '@metamask/keyring-api/v2';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { AccountId } from '@metamask/keyring-utils';
import type { Provider } from '@metamask/network-controller';
import { isStrictHexString } from '@metamask/utils';

import { traceFallback } from '../analytics';
import { TraceName } from '../analytics/traces';
import { projectLogger as log, WARNING_PREFIX } from '../logger';
import type { MultichainAccountServiceMessenger } from '../types';
import {
  assertAreBip44Accounts,
  assertIsBip44Account,
  BaseBip44AccountProvider,
} from './BaseBip44AccountProvider';
import { withRetry, withTimeout } from './utils';

const ETH_MAINNET_CHAIN_ID = '0x1';

/**
 * Asserts an internal account exists.
 *
 * @param account - The internal account to check.
 * @throws An error if the internal account does not exist.
 */
function assertInternalAccountExists(
  account: InternalAccount | undefined,
): asserts account is InternalAccount {
  if (!account) {
    throw new Error('Internal account does not exist');
  }
}

export type EvmAccountProviderConfig = {
  discovery: {
    enabled?: boolean;
    maxAttempts: number;
    timeoutMs: number;
    backOffMs: number;
  };
};

export const EVM_ACCOUNT_PROVIDER_NAME = 'EVM';

export const EVM_ACCOUNT_PROVIDER_DEFAULT_CONFIG = {
  discovery: {
    maxAttempts: 3,
    timeoutMs: 500,
    backOffMs: 500,
  },
};

export class EvmAccountProvider extends BaseBip44AccountProvider {
  static NAME = EVM_ACCOUNT_PROVIDER_NAME;

  readonly #config: EvmAccountProviderConfig;

  readonly #trace: TraceCallback;

  readonly capabilities: KeyringCapabilities = {
    scopes: [EthScope.Eoa],
    bip44: {
      deriveIndex: true,
      deriveIndexRange: true,
    },
  };

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: EvmAccountProviderConfig = EVM_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
    trace?: TraceCallback,
  ) {
    super(messenger);
    this.#config = {
      ...config,
      discovery: {
        ...config.discovery,
        enabled: config.discovery.enabled ?? true,
      },
    };
    this.#trace = trace ?? traceFallback;
  }

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === EthAccountType.Eoa &&
      account.metadata.keyring.type === (KeyringTypes.hd as string)
    );
  }

  getName(): string {
    return EvmAccountProvider.NAME;
  }

  /**
   * Get the EVM provider.
   *
   * @returns The EVM provider.
   */
  getEvmProvider(): Provider {
    const networkClientId = this.messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      ETH_MAINNET_CHAIN_ID,
    );
    const { provider } = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return provider;
  }

  /**
   * Get the account ID for an EVM account.
   *
   * Note: Since the account ID is deterministic at the AccountsController level,
   * we can use this method to get the account ID from the address.
   *
   * @param address - The address of the account.
   * @returns The account ID.
   */
  #getAccountId(address: string): string {
    return getUUIDFromAddressOfNormalAccount(address);
  }

  /**
   * Create an EVM account.
   *
   * @param opts - The options for the creation of the account.
   * @param opts.entropySource - The entropy source to use for the creation of the account.
   * @param opts.groupIndex - The index of the group to create the account for.
   * @param opts.throwOnGap - Whether to throw an error if the account index is not contiguous.
   * @returns The account ID and a boolean indicating if the account was created.
   */
  async #createAccount({
    entropySource,
    groupIndex,
    throwOnGap,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
    throwOnGap: boolean;
  }): Promise<[string, boolean]> {
    const result = await this.withKeyringV2<Keyring, [string, boolean]>(
      { id: entropySource },
      async ({ keyring }) => {
        const existing = await keyring.getAccounts();
        if (groupIndex < existing.length) {
          return [existing[groupIndex].address, false];
        }

        // If the throwOnGap flag is set, we throw an error to prevent index gaps.
        if (throwOnGap && groupIndex !== existing.length) {
          throw new Error('Trying to create too many accounts');
        }

        const [added] = await keyring.createAccounts({
          type: AccountCreationType.Bip44DeriveIndex,
          entropySource,
          groupIndex,
        });
        return [added.address, true];
      },
    );

    return result;
  }

  /**
   * Create accounts for the EVM provider.
   *
   * @param options - The options for the creation of the accounts.
   * @returns The accounts for the EVM provider.
   */
  async createAccounts(
    options: CreateAccountOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    assertCreateAccountOptionIsSupported(options, [
      `${AccountCreationType.Bip44DeriveIndex}`,
      `${AccountCreationType.Bip44DeriveIndexRange}`,
    ]);

    const { entropySource } = options;

    if (options.type === AccountCreationType.Bip44DeriveIndexRange) {
      const { range } = options;

      // Use a single withKeyring call for the entire range.
      const accountIds = await this.withKeyringV2<Keyring, AccountId[]>(
        { id: entropySource },
        async ({ keyring }) => {
          const existing = await keyring.getAccounts();

          // Validate no gaps: we can only create accounts starting from existing.length.
          if (range.from > existing.length) {
            throw new Error(
              `Bad account creation request, group index range would create gaps (${range.from} (from) > ${existing.length} (next available index))`,
            );
          }

          const result: AccountId[] = [];

          // Collect existing accounts within the range.
          for (
            let groupIndex = range.from;
            groupIndex <= range.to;
            groupIndex++
          ) {
            if (groupIndex < existing.length) {
              // Account already exists.
              result.push(this.#getAccountId(existing[groupIndex].address));
            }
          }

          // Create new accounts one-by-one since HdKeyringV2 only supports
          // bip44:derive-index (not bip44:derive-index-range).
          for (
            let groupIndex = Math.max(range.from, existing.length);
            groupIndex <= range.to;
            groupIndex++
          ) {
            const [created] = await keyring.createAccounts({
              type: AccountCreationType.Bip44DeriveIndex,
              entropySource,
              groupIndex,
            });
            result.push(this.#getAccountId(created.address));
          }

          return result;
        },
      );

      const accounts: InternalAccount[] = [];
      for (const account of this.messenger.call(
        'AccountsController:getAccounts',
        accountIds,
      )) {
        assertInternalAccountExists(account);
        this.accounts.add(account.id);
        accounts.push(account);
      }

      assertAreBip44Accounts(accounts);
      return accounts;
    }

    // Handle Bip44DeriveIndex (single account creation).
    const { groupIndex } = options;

    const [address] = await this.#createAccount({
      entropySource,
      groupIndex,
      throwOnGap: true,
    });

    const accountId = this.#getAccountId(address);

    const account = this.messenger.call(
      'AccountsController:getAccount',
      accountId,
    );

    // We MUST have the associated internal account.
    assertInternalAccountExists(account);

    const accountsArray = [account];
    assertAreBip44Accounts(accountsArray);

    this.accounts.add(account.id);
    return accountsArray;
  }

  /**
   * Get the transaction count for an EVM account.
   * This method uses a retry and timeout mechanism to handle transient failures.
   *
   * @param provider - The provider to use for the transaction count.
   * @param address - The address of the account.
   * @returns The transaction count.
   */
  async #getTransactionCount(
    provider: Provider,
    address: string,
  ): Promise<number> {
    const method = 'eth_getTransactionCount';

    const response = await withRetry(
      () =>
        withTimeout(
          () =>
            provider.request({
              method,
              params: [address, 'latest'],
            }),
          this.#config.discovery.timeoutMs,
        ),
      {
        maxAttempts: this.#config.discovery.maxAttempts,
        backOffMs: this.#config.discovery.backOffMs,
      },
    );

    // Make sure we got the right response format, if not, we fallback to "0x0", to avoid having to deal with `NaN`.
    if (!isStrictHexString(response)) {
      const message = `Received invalid hex response from "${method}" request: ${JSON.stringify(response)}`;

      log(`${WARNING_PREFIX} ${message}`);
      console.warn(message);

      return 0;
    }

    return parseInt(response, 16);
  }

  /**
   * Discover and create accounts for the EVM provider.
   *
   * Uses a single withKeyringV2 callback to create the account, check for
   * on-chain activity, and delete it if inactive — all atomically. This
   * ensures that when no activity is found, the net keyring state change is
   * zero (no vault write, no stateChange event).
   *
   * @param opts - The options for the discovery and creation of accounts.
   * @param opts.entropySource - The entropy source to use for the discovery and creation of accounts.
   * @param opts.groupIndex - The index of the group to create the accounts for.
   * @returns The accounts for the EVM provider.
   */
  async discoverAccounts(opts: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return this.#trace(
      {
        name: TraceName.EvmDiscoverAccounts,
        data: {
          provider: this.getName(),
        },
      },
      async () => {
        if (!this.#config.discovery.enabled) {
          return [];
        }

        const provider = this.getEvmProvider();
        const { entropySource, groupIndex } = opts;

        // Everything happens inside a single withKeyringV2 callback so that
        // a create+delete for inactive accounts results in zero net state
        // change (no vault write, no events fired).
        //
        // The callback returns the address if activity was found, or null if
        // not. The AccountsController lookup happens AFTER the callback
        // completes, because newly created accounts are only visible to the
        // AccountsController after withKeyringV2 persists and fires stateChange.
        const discoveredAddress = await this.withKeyringV2<
          Keyring,
          string | null
        >({ id: entropySource }, async ({ keyring }) => {
          const existing = await keyring.getAccounts();

          let address: string;
          let created: KeyringAccount | undefined;

          if (groupIndex < existing.length) {
            // Account already exists — use its address.
            address = existing[groupIndex].address;
          } else {
            // Account doesn't exist — create it to discover the address.
            [created] = await keyring.createAccounts({
              type: AccountCreationType.Bip44DeriveIndex,
              entropySource,
              groupIndex,
            });
            address = created.address;
          }

          const count = await this.#getTransactionCount(provider, address);
          if (count === 0) {
            // No activity. If we created the account, undo it within this
            // same callback so the net state change is zero.
            if (created) {
              await keyring.deleteAccount(created.id);
            }
            return null;
          }

          // Activity found — account stays. Return the address so we can
          // look it up in the AccountsController after the callback persists.
          return address;
        });

        if (!discoveredAddress) {
          return [];
        }

        const accountId = this.#getAccountId(discoveredAddress);
        const account = this.messenger.call(
          'AccountsController:getAccount',
          accountId,
        );
        assertInternalAccountExists(account);
        assertIsBip44Account(account);
        this.accounts.add(account.id);
        return [account];
      },
    );
  }

  async resyncAccounts(): Promise<void> {
    // No-op for the EVM account provider, since keyring accounts are already on
    // the MetaMask side.
  }
}
