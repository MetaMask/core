import { HdKeyring } from '@metamask/eth-hd-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringMetadata } from '@metamask/keyring-controller';

import type { MoneyAccountServiceMessenger } from './types';

export const serviceName = 'MoneyAccountService';

const MESSENGER_EXPOSED_METHODS = ['createMoneyAccount'] as const;

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
   * Creates a Money keyring derived from the HD keyring identified by
   * the given entropy source, and returns the new keyring's metadata.
   *
   * @param entropySource - The metadata id of the HD keyring to derive from.
   * @returns The metadata of the newly created Money keyring.
   */
  async createMoneyAccount(entropySource: string): Promise<KeyringMetadata> {
    const mnemonic = await this.#messenger.call(
      'KeyringController:withKeyring',
      { id: entropySource },
      async ({ keyring }) => {
        if (keyring.type !== HdKeyring.type) {
          throw new Error('Got keyring without HD Keyring type');
        }
        const hdKeyring = keyring as HdKeyring;

        if (!hdKeyring.mnemonic) {
          throw new Error(
            'HD keyring does not have a mnemonic for the given entropy source.',
          );
        }
        return hdKeyring.mnemonic;
      },
    );

    const existingMoneyMetadata = (await this.#messenger
      .call(
        'KeyringController:withKeyring',
        { type: KeyringTypes.money },
        async ({ keyring, metadata }) => {
          const accounts = await keyring.getAccounts();
          return accounts.length > 0 ? metadata : null;
        },
      )
      .catch(() => null)) as KeyringMetadata | null;

    if (existingMoneyMetadata) {
      return existingMoneyMetadata;
    }

    return await this.#messenger.call(
      'KeyringController:addNewKeyring',
      KeyringTypes.money,
      { mnemonic },
    );
  }
}
