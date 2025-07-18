import type {
  MultichainAccountWalletId,
  AccountProvider,
} from '@metamask/account-api';
import {
  MultichainAccountWallet,
  toMultichainAccountWalletId,
  type MultichainAccount,
} from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type {
  KeyringControllerState,
  KeyringObject,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import type { MultichainAccountServiceMessenger } from './types';

/**
 * The options that {@link MultichainAccountService} takes.
 */
type MultichainAccountServiceOptions = {
  messenger: MultichainAccountServiceMessenger;
};

/**
 * Select keyrings from keyring controller state.
 *
 * @param state - The keyring controller state.
 * @returns The keyrings.
 */
function selectKeyringControllerKeyrings(state: KeyringControllerState) {
  return state.keyrings;
}

/**
 * Service to expose multichain accounts capabilities.
 */
export class MultichainAccountService {
  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #providers: AccountProvider<InternalAccount>[];

  readonly #wallets: Map<
    MultichainAccountWalletId,
    MultichainAccountWallet<InternalAccount>
  >;

  /**
   * Constructs a new MultichainAccountService.
   *
   * @param options - The options.
   * @param options.messenger - The messenger suited to this
   * MultichainAccountService.
   */
  constructor({ messenger }: MultichainAccountServiceOptions) {
    this.#messenger = messenger;
    this.#wallets = new Map();
    // TODO: Rely on keyring capabilities once the keyring API is used by all keyrings.
    this.#providers = [
      new EvmAccountProvider(this.#messenger),
      new SolAccountProvider(this.#messenger),
    ];
  }

  /**
   * Initialize the service and constructs the internal reprensentation of
   * multichain accounts and wallets.
   */
  init(): void {
    // Gather all entropy sources first.
    const state = this.#messenger.call('KeyringController:getState');
    this.#setMultichainAccountWallets(state.keyrings);

    this.#messenger.subscribe(
      'KeyringController:stateChange',
      (keyrings) => {
        this.#setMultichainAccountWallets(keyrings);
      },
      selectKeyringControllerKeyrings,
    );
  }

  #setMultichainAccountWallets(keyrings: KeyringObject[]) {
    for (const keyring of keyrings) {
      if (keyring.type === (KeyringTypes.hd as string)) {
        // Only HD keyrings have an entropy source/SRP.
        const entropySource = keyring.metadata.id;

        // Do not re-create wallets if they exists. Even if a keyrings got new accounts, this
        // will be handled by the `*AccountProvider`s which are always in-sync with their
        // keyrings and controllers (like the `AccountsController`).
        if (!this.#wallets.has(toMultichainAccountWalletId(entropySource))) {
          // This will automatically "associate" all multichain accounts for that wallet
          // (based on the accounts owned by each account providers).
          const wallet = new MultichainAccountWallet({
            entropySource,
            providers: this.#providers,
          });

          this.#wallets.set(wallet.id, wallet);
        }
      }
    }
  }

  #getWallet(
    entropySource: EntropySourceId,
  ): MultichainAccountWallet<InternalAccount> {
    const wallet = this.#wallets.get(
      toMultichainAccountWalletId(entropySource),
    );

    if (!wallet) {
      throw new Error('Unknown wallet, no wallet matching this entropy source');
    }

    return wallet;
  }

  /**
   * Gets a reference to the multichain account matching this entropy source and group index.
   *
   * @param options - Options.
   * @param options.entropySource - The entropy source of the multichain account.
   * @param options.groupIndex - The group index of the multichain account.
   * @throws If none multichain account match this entropy source and group index.
   * @returns A reference to the multichain account.
   */
  getMultichainAccount({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): MultichainAccount<InternalAccount> {
    const multichainAccount =
      this.#getWallet(entropySource).getMultichainAccount(groupIndex);

    if (!multichainAccount) {
      throw new Error(`No multichain account for index: ${groupIndex}`);
    }

    return multichainAccount;
  }

  /**
   * Gets all multichain accounts for a given entropy source.
   *
   * @param options - Options.
   * @param options.entropySource - The entropy source to query.
   * @throws If no multichain accounts match this entropy source.
   * @returns A list of all multichain accounts.
   */
  getMultichainAccounts({
    entropySource,
  }: {
    entropySource: EntropySourceId;
  }): MultichainAccount<InternalAccount>[] {
    return this.#getWallet(entropySource).getMultichainAccounts();
  }
}
