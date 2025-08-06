import type { Bip44Account } from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import { EthAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import type { Hex } from '@metamask/utils';

import {
  assertIsBip44Account,
  BaseAccountProvider,
} from './BaseAccountProvider';

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

export class EvmAccountProvider extends BaseAccountProvider {
  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === EthAccountType.Eoa &&
      account.metadata.keyring.type === (KeyringTypes.hd as string)
    );
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
    assertIsBip44Account(account);

    return [account];
  }

  async discoverAndCreateAccounts(_: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    return []; // TODO: Implement account discovery.
  }
}
