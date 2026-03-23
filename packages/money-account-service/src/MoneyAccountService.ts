import { AccountWalletType, toAccountWalletId } from '@metamask/account-api';
import type {
  AccountGroupObject,
  AccountWalletObject,
} from '@metamask/account-tree-controller';
import { HdKeyring } from '@metamask/eth-hd-keyring';
import { MONEY_DERIVATION_PATH } from '@metamask/eth-money-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import { InternalAccount } from '@metamask/keyring-internal-api';
import { EthKeyring } from '@metamask/keyring-utils';

import type { MoneyAccountServiceMessenger } from './types';

export const serviceName = 'MoneyAccountService';

const MESSENGER_EXPOSED_METHODS = [
  'createMoneyAccount',
  'getMoneyAccount',
  'getMoneyAccountWallet',
  'getMoneyAccountGroup',
] as const;

/**
 * Asserts that the given keyring instance is an HD keyring.
 *
 * @param keyring - The keyring instance to check.
 * @throws Will throw an error if the keyring is not an HD keyring.
 */
function assertIsHdKeyring(keyring: EthKeyring): asserts keyring is HdKeyring {
  if (keyring.type !== KeyringTypes.hd) {
    throw new Error(`Expected HD keyring, got ${keyring.type}`);
  }
}

/**
 * Gets the serialized mnemonic from the given HD keyring.
 *
 * @param hdKeyring - The HD keyring instance to extract the mnemonic from.
 * @returns The serialized mnemonic as an array of numbers.
 * @throws Will throw an error if the HD keyring does not have a mnemonic.
 */
async function getSerializedMnemonicFromHdKeyring(
  hdKeyring: HdKeyring,
): Promise<number[]> {
  if (!hdKeyring.mnemonic) {
    throw new Error(
      'HD keyring does not have a mnemonic for the given entropy source.',
    );
  }

  const serialized = await hdKeyring.serialize();
  return serialized.mnemonic;
}

export class MoneyAccountService {
  readonly #messenger: MoneyAccountServiceMessenger;

  name: typeof serviceName = serviceName;

  constructor({ messenger }: { messenger: MoneyAccountServiceMessenger }) {
    this.#messenger = messenger;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Creates a Money keyring derived from the primary HD keyring, and returns
   * the associated account.
   *
   * If a Money keyring already exists, returns undefined.
   *
   * @returns The account of the newly created Money keyring, or undefined if one already existed.
   */
  async createMoneyAccount(): Promise<InternalAccount> {
    const { keyrings } = this.#messenger.call('KeyringController:getState');

    const hasMoneyKeyring = keyrings.some(
      (keyring) => keyring.type === KeyringTypes.money,
    );
    if (!hasMoneyKeyring) {
      // Money keyring re-use the same SRP than the primary HD keyring.
      const primaryHdKeyring = keyrings.find(
        (keyring) => keyring.type === KeyringTypes.hd,
      );
      if (!primaryHdKeyring) {
        throw new Error('No primary HD keyring found.');
      }

      // Extract the mnemonic from the primary HD keyring, and use it to
      // create the Money keyring.
      const mnemonic = await this.#messenger.call(
        'KeyringController:withKeyring',
        { id: primaryHdKeyring.metadata.id },
        async ({ keyring }) => {
          assertIsHdKeyring(keyring);
          return getSerializedMnemonicFromHdKeyring(keyring);
        },
      );

      // This keyring can contain only 1 account, so we can hardcode the number of accounts
      // to 1 directly.
      await this.#messenger.call(
        'KeyringController:addNewKeyring',
        KeyringTypes.money,
        { mnemonic, numberOfAccounts: 1, hdPath: MONEY_DERIVATION_PATH },
      );
    }

    // Now, the account should have been created by now.
    const account = await this.getMoneyAccount();
    if (!account) {
      throw new Error('Failed to create Money account.');
    }

    return account;
  }

  /**
   * Returns the account associated with the Money keyring, or undefined if none exists.
   *
   * @returns The Money keyring account, or undefined if none exists.
   */
  async getMoneyAccount(): Promise<InternalAccount | undefined> {
    const group = this.getMoneyAccountGroup();
    if (!group) {
      return undefined;
    }

    const [accountId] = group.accounts;
    if (!accountId) {
      return undefined;
    }

    return this.#messenger.call('AccountsController:getAccount', accountId);
  }

  /**
   * Returns the account wallet associated with the Money keyring, or undefined if none exists.
   *
   * @returns The Money keyring account wallet, or undefined if none exists.
   */
  getMoneyAccountWallet(): AccountWalletObject | undefined {
    return this.#messenger.call(
      'AccountTreeController:getAccountWalletObject',
      toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.money),
    );
  }

  /**
   * Returns the account group associated with the Money keyring, or undefined if none exists.
   *
   * @returns The account group of the Money keyring, or undefined if none exists.
   */
  getMoneyAccountGroup(): AccountGroupObject | undefined {
    const wallet = this.getMoneyAccountWallet();
    if (!wallet) {
      return undefined;
    }

    // This wallet should only have 1 group at most.
    const [group] = Object.values(wallet.groups);
    return group;
  }
}
