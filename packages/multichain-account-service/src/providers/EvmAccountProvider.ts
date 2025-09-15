import type { Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import type { Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import {
  assertAreBip44Accounts,
  assertIsBip44Account,
  BaseBip44AccountProvider,
} from './BaseBip44AccountProvider';

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

export class EvmAccountProvider extends BaseBip44AccountProvider {
  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === EthAccountType.Eoa &&
      account.metadata.keyring.type === (KeyringTypes.hd as string)
    );
  }

  getName(): string {
    return 'EVM';
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

    const account = this.messenger.call(
      'AccountsController:getAccountByAddress',
      address,
    );

    // We MUST have the associated internal account.
    assertInternalAccountExists(account);

    const accountsArray = [account];
    assertAreBip44Accounts(accountsArray);

    return accountsArray;
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
      const count = await this.#getTransactionCountWithRetry(provider, address);

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

    const account = this.messenger.call(
      'AccountsController:getAccountByAddress',
      address,
    );
    assertInternalAccountExists(account);
    assertIsBip44Account(account);
    return [account];
  }

  /**
   * Retrieve the transaction count with exponential backoff on transient failures.
   *
   * @param provider - The provider to use.
   * @param address - The address to get the transaction count for.
   * @param options - The options for the retry.
   * @param options.maxAttempts - The maximum number of attempts.
   * @param options.timeoutMs - The timeout in milliseconds.
   * @param options.backOffMs - The backoff in milliseconds.
   * @throws An error if the transaction count cannot be retrieved.
   * @returns The transaction count.
   */
  async #getTransactionCountWithRetry(
    provider: Provider,
    address: Hex,
    {
      maxAttempts = 3,
      timeoutMs = 500,
      backOffMs = 500,
    }: { maxAttempts?: number; timeoutMs?: number; backOffMs?: number } = {},
  ): Promise<number> {
    let lastError;
    let backOff = backOffMs;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const countHex = await this.#withTimeout<Hex>(
          provider.request({
            method: 'eth_getTransactionCount',
            params: [address, 'latest'],
          }) as Promise<Hex>,
          timeoutMs,
        );
        return parseInt(countHex, 16);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }
        const delay = backOff;
        await new Promise((resolve) => setTimeout(resolve, delay));
        backOff *= 2;
      }
    }
    throw lastError;
  }

  /**
   * Execute a promise with a timeout.
   *
   * @param promise - The promise to execute.
   * @param timeoutMs - The timeout in milliseconds.
   * @returns The result of the promise.
   */
  async #withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('RPC request timed out')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
