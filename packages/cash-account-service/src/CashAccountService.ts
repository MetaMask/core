import { HdKeyring } from '@metamask/eth-hd-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringMetadata } from '@metamask/keyring-controller';

import type { CashAccountServiceMessenger } from './types';

export const serviceName = 'CashAccountService';

const MESSENGER_EXPOSED_METHODS = ['createCashAccount'] as const;

export class CashAccountService {
  readonly #messenger: CashAccountServiceMessenger;

  name: typeof serviceName = serviceName;

  constructor({ messenger }: { messenger: CashAccountServiceMessenger }) {
    this.#messenger = messenger;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Creates a Cash keyring derived from the HD keyring identified by
   * the given entropy source, and returns the new keyring's metadata.
   *
   * @param entropySource - The metadata id of the HD keyring to derive from.
   * @returns The metadata of the newly created Cash keyring.
   */
  async createCashAccount(entropySource: string): Promise<KeyringMetadata> {
    const mnemonic = await this.#messenger.call(
      'KeyringController:withKeyring',
      { id: entropySource },
      async ({ keyring }) => {
        if (keyring.type !== HdKeyring.type) {
          throw new Error(
            'HD keyring  not have a mnemonic for the given entropy source.',
          );
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

    const existingCashMetadata = (await this.#messenger
      .call(
        'KeyringController:withKeyring',
        { type: KeyringTypes.cash },
        async ({ keyring, metadata }) => {
          const accounts = await keyring.getAccounts();
          return accounts.length > 0 ? metadata : null;
        },
      )
      .catch(() => null)) as KeyringMetadata | null;

    if (existingCashMetadata) {
      return existingCashMetadata;
    }

    return await this.#messenger.call(
      'KeyringController:addNewKeyring',
      KeyringTypes.cash,
      { mnemonic },
    );
  }
}
