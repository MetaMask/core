import { publicToAddress } from '@ethereumjs/util';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { HdKeyring } from '@metamask/eth-hd-keyring';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import type { Provider } from '@metamask/network-controller';
import { add0x, assert, bytesToHex, type Hex } from '@metamask/utils';

import {
  assertAreBip44Accounts,
  assertIsBip44Account,
  BaseBip44AccountProvider,
} from './BaseBip44AccountProvider';
import { withRetry, withTimeout } from './utils';
import { traceFallback } from '../analytics';
import { TraceName } from '../constants/traces';
import type { MultichainAccountServiceMessenger } from '../types';

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

  readonly #trace: TraceCallback;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: EvmAccountProviderConfig = {
      discovery: {
        maxAttempts: 3,
        timeoutMs: 500,
        backOffMs: 500,
      },
    },
    trace?: TraceCallback,
  ) {
    super(messenger);
    this.#config = config;
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
   * Creates multiple accounts in a single keyring transaction.
   * This is more efficient than calling createAccounts multiple times
   * as it only triggers one vault update.
   *
   * @param opts - Options.
   * @param opts.entropySource - The entropy source to use.
   * @param opts.count - The number of accounts to create.
   * @returns The addresses of the created accounts.
   */
  async #createAccountsBatch({
    entropySource,
    count,
  }: {
    entropySource: EntropySourceId;
    count: number;
  }): Promise<Hex[]> {
    if (count <= 0) {
      return [];
    }

    return await this.withKeyring<EthKeyring, Hex[]>(
      { id: entropySource },
      async ({ keyring }) => {
        const existingCount = (await keyring.getAccounts()).length;
        const toCreate = count - existingCount;

        if (toCreate > 0) {
          await keyring.addAccounts(toCreate);
        }

        // Return all accounts up to the requested count
        const allAccounts = await keyring.getAccounts();
        return allAccounts.slice(0, count);
      },
    );
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

  async #getAddressFromGroupIndex({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Hex> {
    // NOTE: To avoid exposing this function at keyring level, we just re-use its internal state
    // and compute the derivation here.
    return await this.withKeyring<HdKeyring, Hex>(
      { id: entropySource },
      async ({ keyring }) => {
        // If the account already exist, do not re-derive and just re-use that account.
        const existing = await keyring.getAccounts();
        if (groupIndex < existing.length) {
          return existing[groupIndex];
        }

        // If not, then we just "peek" the next address to avoid creating the account.
        assert(keyring.root, 'Expected HD keyring.root to be set');
        const hdKey = keyring.root.deriveChild(groupIndex);
        assert(hdKey.publicKey, 'Expected public key to be set');

        return add0x(
          bytesToHex(publicToAddress(hdKey.publicKey, true)).toLowerCase(),
        );
      },
    );
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
    return this.#trace(
      {
        name: TraceName.EvmDiscoverAccounts,
        data: {
          provider: this.getName(),
        },
      },
      async () => {
        const provider = this.getEvmProvider();
        const { entropySource, groupIndex } = opts;

        const addressFromGroupIndex = await this.#getAddressFromGroupIndex({
          entropySource,
          groupIndex,
        });

        const count = await this.#getTransactionCount(
          provider,
          addressFromGroupIndex,
        );
        if (count === 0) {
          return [];
        }

        // We have some activity on this address, we try to create the account.
        const [address] = await this.#createAccount({
          entropySource,
          groupIndex,
        });
        assert(
          addressFromGroupIndex === address,
          'Created account does not match address from group index.',
        );

        const account = this.messenger.call(
          'AccountsController:getAccountByAddress',
          address,
        );
        assertInternalAccountExists(account);
        assertIsBip44Account(account);
        return [account];
      },
    );
  }

  /**
   * Find the number of active accounts starting from a given index.
   * This method is used to optimize the discovery process by batching the checks
   * before creating the accounts.
   *
   * @param opts - Options.
   * @param opts.entropySource - The entropy source to use.
   * @param opts.startIndex - The index to start checking from.
   * @returns The number of active accounts found.
   */
  async findActiveAccountCount(opts: {
    entropySource: EntropySourceId;
    startIndex: number;
  }): Promise<number> {
    const { entropySource, startIndex } = opts;
    const provider = this.getEvmProvider();
    let currentIndex = startIndex;
    let activeCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const address = await this.#getAddressFromGroupIndex({
        entropySource,
        groupIndex: currentIndex,
      });

      const count = await this.#getTransactionCount(provider, address);
      if (count === 0) {
        break;
      }

      activeCount += 1;
      currentIndex += 1;
    }

    return activeCount;
  }

  /**
   * Bulk create accounts for a given entropy source.
   *
   * @param opts - Options.
   * @param opts.entropySource - The entropy source to use.
   * @param opts.count - The number of accounts to create.
   */
  async bulkCreateAccounts({
    entropySource,
    count,
  }: {
    entropySource: EntropySourceId;
    count: number;
  }): Promise<void> {
    if (count === 0) {
      return;
    }

    await this.withKeyring<EthKeyring>(
      { id: entropySource },
      async ({ keyring }) => {
        await keyring.addAccounts(count);
      },
    );
  }

  async resyncAccounts(): Promise<void> {
    // No-op for the EVM account provider, since keyring accounts are already on
    // the MetaMask side.
  }
}
