import type { Bip44Account } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import type { Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import type { MultichainAccountServiceMessenger } from 'src/types';

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
    maxAttempts: number;
    timeoutMs: number;
    backOffMs: number;
  };
};

export const EVM_ACCOUNT_PROVIDER_NAME = 'EVM' as const;

export class EvmAccountProvider extends BaseBip44AccountProvider {
  static NAME = EVM_ACCOUNT_PROVIDER_NAME;

  readonly #config: EvmAccountProviderConfig;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: EvmAccountProviderConfig = {
      discovery: {
        maxAttempts: 3,
        timeoutMs: 500,
        backOffMs: 500,
      },
    },
  ) {
    super(messenger);
    this.#config = config;
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
  #getAccountId(address: Hex): string {
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
    throwOnGap = false,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
    throwOnGap?: boolean;
  }): Promise<[Hex, boolean]> {
    const result = await this.withKeyring<EthKeyring, [Hex, boolean]>(
      { id: entropySource },
      async ({ keyring }) => {
        const existing = await keyring.getAccounts();
        if (groupIndex < existing.length) {
          return [existing[groupIndex], false];
        }

        // If the throwOnGap flag is set, we throw an error to prevent index gaps.
        if (throwOnGap && groupIndex !== existing.length) {
          throw new Error('Trying to create too many accounts');
        }

        const [added] = await keyring.addAccounts(1);
        return [added, true];
      },
    );

    return result;
  }

  /**
   * Create accounts for the EVM provider.
   *
   * @param opts - The options for the creation of the accounts.
   * @param opts.entropySource - The entropy source to use for the creation of the accounts.
   * @param opts.groupIndex - The index of the group to create the accounts for.
   * @returns The accounts for the EVM provider.
   */
  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
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
    address: Hex,
  ): Promise<number> {
    const countHex = await withRetry<Hex>(
      () =>
        withTimeout(
          provider.request({
            method: 'eth_getTransactionCount',
            params: [address, 'latest'],
          }),
          this.#config.discovery.timeoutMs,
        ),
      {
        maxAttempts: this.#config.discovery.maxAttempts,
        backOffMs: this.#config.discovery.backOffMs,
      },
    );

    return parseInt(countHex, 16);
  }

  /**
   * Discover and create accounts for the EVM provider.
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
    const provider = this.getEvmProvider();
    const { entropySource, groupIndex } = opts;

    const [address, didCreate] = await this.#createAccount({
      entropySource,
      groupIndex,
    });

    // We don't want to remove the account if it's the first one.
    const shouldCleanup = didCreate && groupIndex !== 0;
    try {
      const count = await this.#getTransactionCount(provider, address);

      if (count === 0 && shouldCleanup) {
        await this.withKeyring<EthKeyring>(
          { id: entropySource },
          async ({ keyring }) => {
            keyring.removeAccount?.(address);
          },
        );
        return [];
      }
    } catch (error) {
      // If the RPC request fails and we just created this account for discovery,
      // remove it to avoid leaving a dangling account.
      if (shouldCleanup) {
        await this.withKeyring<EthKeyring>(
          { id: entropySource },
          async ({ keyring }) => {
            keyring.removeAccount?.(address);
          },
        );
      }
      throw error;
    }

    const accountId = this.#getAccountId(address);

    const account = this.messenger.call(
      'AccountsController:getAccount',
      accountId,
    );
    assertInternalAccountExists(account);
    assertIsBip44Account(account);
    return [account];
  }
}
