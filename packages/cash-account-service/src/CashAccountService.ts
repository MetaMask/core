import type { HdKeyring } from '@metamask/eth-hd-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  KeyringMetadata,
  KeyringObject,
} from '@metamask/keyring-controller';

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
    const { keyrings } = this.#messenger.call('KeyringController:getState');

    const hdKeyringsFromState = keyrings.filter(
      (kr: KeyringObject) => kr.type === KeyringTypes.hd,
    );
    const hdKeyringIndex = hdKeyringsFromState.findIndex(
      (kr: KeyringObject) => kr.metadata.id === entropySource,
    );
    if (hdKeyringIndex === -1) {
      throw new Error(
        `No HD keyring found for entropy source: ${entropySource}`,
      );
    }

    const hdKeyrings = this.#messenger.call(
      'KeyringController:getKeyringsByType',
      KeyringTypes.hd,
    ) as HdKeyring[];

    const hdKeyring = hdKeyrings[hdKeyringIndex];
    if (!hdKeyring?.mnemonic) {
      throw new Error(
        'HD keyring does not have a mnemonic for the given entropy source.',
      );
    }

    return await this.#messenger.call(
      'KeyringController:addNewKeyring',
      KeyringTypes.cash,
      { mnemonic: hdKeyring.mnemonic },
    );
  }
}
