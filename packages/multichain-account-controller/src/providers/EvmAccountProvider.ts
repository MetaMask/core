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
import type { MultichainAccountControllerMessenger } from '../types';

// Max index used by discovery (until we move the proper discovery here).
const MAX_GROUP_INDEX = 1;

type EoaInternalAccount = InternalAccount & {
  options: {
    index: number;
    entropySource: EntropySourceId;
  };
};

// eslint-disable-next-line jsdoc/require-jsdoc
function assertInternalAccountExists(
  account: InternalAccount | undefined,
): asserts account is InternalAccount {
  if (!account) {
    throw new Error('Internal account does not exist');
  }
}

export class EvmAccountProvider implements AccountProvider {
  readonly #messenger: MultichainAccountControllerMessenger;

  constructor(messenger: MultichainAccountControllerMessenger) {
    this.#messenger = messenger;
  }

  async #withKeyring<
    SelectedKeyring extends EthKeyring = EthKeyring,
    CallbackResult = void,
  >(
    selector: KeyringSelector,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult> {
    const result = await this.#messenger.call(
      'KeyringController:withKeyring',
      selector,
      ({ keyring, metadata }) =>
        operation({
          keyring: keyring as SelectedKeyring,
          metadata,
        }),
    );

    return result as CallbackResult;
  }

  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    const addresses = await this.#withKeyring(
      { id: entropySource },
      async ({ keyring }) => {
        const accounts = await keyring.getAccounts();
        if (groupIndex <= accounts.length) {
          // Nothing new to create, we just re-use the existing accounts here,
          return [accounts[groupIndex]];
        }

        // Create new accounts (and returns their addresses).
        return await keyring.addAccounts(groupIndex);
      },
    );

    // Only use the account associated for that index.
    const address = addresses[groupIndex];
    const account = this.#messenger.call(
      'AccountsController:getAccountByAddress',
      address,
    );

    // We MUST have the associated internal account.
    assertInternalAccountExists(account);

    return [account];
  }

  async discoverAndCreateAccounts({
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

  #getAccounts(): EoaInternalAccount[] {
    return this.#messenger
      .call('AccountsController:listMultichainAccounts')
      .filter((account) => {
        // We only check for EOA accounts for multichain accounts.
        if (
          account.type !== EthAccountType.Eoa ||
          account.metadata.keyring.type !== (KeyringTypes.hd as string)
        ) {
          return false;
        }

        // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
        if (!account.options.entropySource) {
          console.warn(
            "! Found an HD account with no entropy source: account won't be associated to its wallet.",
          );
          return false;
        }

        // TODO: We need to add this index for native accounts too!
        if (account.options.index === undefined) {
          console.warn(
            "! Found an HD account with no index: account won't be associated to its wallet.",
          );
          return false;
        }

        return true;
      }) as EoaInternalAccount[]; // Safe, we did check for options fields during filtering.
  }

  getAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): InternalAccount[] {
    return this.#getAccounts().filter((account) => {
      return (
        account.options.entropySource === entropySource &&
        account.options.index === groupIndex
      );
    });
  }

  getEntropySources(): EntropySourceId[] {
    const entropySources = new Set<EntropySourceId>();

    for (const account of this.#getAccounts()) {
      entropySources.add(account.options.entropySource);
    }

    return Array.from(entropySources);
  }
}
