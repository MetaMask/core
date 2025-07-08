import type { AccountId } from '@metamask/accounts-controller';
import { EthAccountType, type EntropySourceId } from '@metamask/keyring-api';
import {
  KeyringTypes,
  type KeyringMetadata,
  type KeyringSelector,
} from '@metamask/keyring-controller';
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
import type { AccountProvider } from '@metamask/multichain-account-api';
import type { Hex } from '@metamask/utils';

import { BaseAccountProvider } from './BaseAccountProvider';
import type { MultichainAccountControllerMessenger } from '../types';

// Max index used by discovery (until we move the proper discovery here).
const MAX_GROUP_INDEX = 1;

// eslint-disable-next-line jsdoc/require-jsdoc
function assertInternalAccountExists(
  account: InternalAccount | undefined,
): asserts account is InternalAccount {
  if (!account) {
    throw new Error('Internal account does not exist');
  }
}

export class EvmAccountProvider extends BaseAccountProvider {
  isAccountCompatible(account: InternalAccount): boolean {
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

    return [account.id];
  }

  override async discoverAndCreateAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    // TODO: Move account discovery here (for EVM).

    if (groupIndex < MAX_GROUP_INDEX) {
      return await this.createAccounts({ entropySource, groupIndex });
    }
    return [];
  }
}
