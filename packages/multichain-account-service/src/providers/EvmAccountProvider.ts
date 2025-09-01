import type { Bip44Account } from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
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

  /**
   * Get the Evm provider.
   *
   * @returns The Evm provider.
   */
  getEvmProvider(): Provider {
    const networkClientId = this.messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      '0x1',
    );
    const { provider } = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return provider;
  }

  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    const [address] = await this.withKeyring<EthKeyring, Hex[]>(
      { id: entropySource },
      async ({ keyring }) => {
        const accounts = await keyring.getAccounts();
        if (groupIndex < accounts.length) {
          // Nothing new to create, we just re-use the existing accounts here,
          return [accounts[groupIndex]];
        }

        // For now, we don't allow for gap, so if we need to create a new
        // account, this has to be the next one.
        if (groupIndex !== accounts.length) {
          throw new Error('Trying to create too many accounts');
        }

        // Create next account (and returns their addresses).
        return await keyring.addAccounts(1);
      },
    );

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
   * Discover and create accounts for the Evm provider.
   *
   * NOTE: This method should only be called on a newly created wallet.
   * There should be already one existing account on this associated entropy source.
   *
   * @param opts - The options for the discovery and creation of accounts.
   * @param opts.entropySource - The entropy source to use for the discovery and creation of accounts.
   * @param opts.groupIndex - The index of the group to create the accounts for.
   * @returns The accounts for the Evm provider.
   */
  async discoverAndCreateAccounts(opts: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    const provider = this.getEvmProvider();
    const { entropySource, groupIndex } = opts;

    const [address, didCreate] = await this.withKeyring<
      EthKeyring,
      [Hex, boolean]
    >({ id: entropySource }, async ({ keyring }) => {
      const existing = await keyring.getAccounts();
      if (groupIndex < existing.length) {
        return [existing[groupIndex], false];
      }
      const [added] = await keyring.addAccounts(1);
      return [added, true];
    });

    const countHex = (await provider.request({
      method: 'eth_getTransactionCount',
      params: [address, 'latest'],
    })) as Hex;
    const count = parseInt(countHex, 16);

    // We don't want to remove the account if it's the first one.
    if (count === 0 && didCreate && groupIndex !== 0) {
      await this.withKeyring<EthKeyring>(
        { id: entropySource },
        async ({ keyring }) => {
          keyring.removeAccount?.(address);
        },
      );
      return [];
    }

    const account = this.messenger.call(
      'AccountsController:getAccountByAddress',
      address,
    );
    assertInternalAccountExists(account);
    assertIsBip44Account(account);
    return [account];
  }
}
