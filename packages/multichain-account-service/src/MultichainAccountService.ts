import type {
  MultichainAccountWalletId,
  AccountProvider,
  Bip44Account,
} from '@metamask/account-api';
import {
  isBip44Account,
  MultichainAccountWallet,
  toMultichainAccountWalletId,
  type MultichainAccount,
} from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringControllerState,
  KeyringObject,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import type { MultichainAccountServiceMessenger } from './types';

const serviceName = 'MultichainAccountService';

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

/** Reverse mapping object used to map account IDs and their wallet/multichain account. */
type AccountContext<Account extends Bip44Account<KeyringAccount>> = {
  wallet: MultichainAccountWallet<Account>;
  multichainAccount: MultichainAccount<Account>;
};

/**
 * Service to expose multichain accounts capabilities.
 */
export class MultichainAccountService {
  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #providers: AccountProvider<Bip44Account<InternalAccount>>[];

  readonly #wallets: Map<
    MultichainAccountWalletId,
    MultichainAccountWallet<Bip44Account<InternalAccount>>
  >;

  readonly #accountIdToContext: Map<
    Bip44Account<InternalAccount>['id'],
    AccountContext<Bip44Account<InternalAccount>>
  >;

  /**
   * The name of the service.
   */
  name: typeof serviceName = serviceName;

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
    this.#accountIdToContext = new Map();
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

    // Reverse mapping between account ID and their multichain wallet/account:
    // QUESTION: Should we move the reverse mapping logic to the
    // `MultichainAccount{,Wallet}` implementation instead? For now they do not
    // store any accounts and they heavily rely on the `AccountProvider`s, which
    // makes it hard to implement it there...
    for (const wallet of this.#wallets.values()) {
      for (const multichainAccount of wallet.getMultichainAccounts()) {
        for (const account of multichainAccount.getAccounts()) {
          this.#accountIdToContext.set(account.id, {
            wallet,
            multichainAccount,
          });
        }
      }
    }

    this.#messenger.subscribe('AccountsController:accountAdded', (account) =>
      this.#handleOnAccountAdded(account),
    );
    this.#messenger.subscribe('AccountsController:accountRemoved', (id) =>
      this.#handleOnAccountRemoved(id),
    );
  }

  #handleOnAccountAdded(account: InternalAccount): void {
    // We completely omit non-BIP-44 accounts!
    if (!isBip44Account(account)) {
      return;
    }

    const wallet = this.#wallets.get(
      toMultichainAccountWalletId(account.options.entropy.id),
    );
    if (wallet) {
      // This new account might be a new multichain account, and the wallet might not
      // know it yet, so we need to force-sync here.
      wallet.sync();

      // We should always have a wallet here, since we are refreshing that
      // list when any keyring's states got changed.
      const multichainAccount = wallet.getMultichainAccount(
        account.options.entropy.groupIndex,
      );
      if (multichainAccount) {
        // Same here, this account should have been already grouped in that
        // multichain account.
        this.#accountIdToContext.set(account.id, {
          wallet,
          multichainAccount,
        });
      }
    }
  }

  #handleOnAccountRemoved(id: InternalAccount['id']): void {
    // Force sync of the appropriate wallet if an account got removed.
    const found = this.#accountIdToContext.get(id);
    if (found) {
      const { wallet } = found;

      wallet.sync();
    }

    // Safe to call delete even if the `id` was not referencing a BIP-44 account.
    this.#accountIdToContext.delete(id);
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
  ): MultichainAccountWallet<Bip44Account<InternalAccount>> {
    const wallet = this.#wallets.get(
      toMultichainAccountWalletId(entropySource),
    );

    if (!wallet) {
      throw new Error('Unknown wallet, no wallet matching this entropy source');
    }

    return wallet;
  }

  /**
   * Gets a reference to the wallet and multichain account for a given account ID.
   *
   * @param id - Account ID.
   * @returns An object with references to the wallet and multichain account associated for
   * that account ID, or undefined if this account ID is not part of any.
   */
  getMultichainAccountAndWallet(
    id: InternalAccount['id'],
  ): AccountContext<Bip44Account<InternalAccount>> | undefined {
    return this.#accountIdToContext.get(id);
  }

  /**
   * Gets a reference to the multichain account wallet matching this entropy source.
   *
   * @param entropySource - The entropy source of the multichain account.
   * @throws If none multichain account match this entropy.
   * @returns A reference to the multichain account wallet.
   */
  getMultichainAccountWallet(
    entropySource: EntropySourceId,
  ): MultichainAccountWallet<Bip44Account<InternalAccount>> {
    return this.#getWallet(entropySource);
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
  }): MultichainAccount<Bip44Account<InternalAccount>> {
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
  }): MultichainAccount<Bip44Account<InternalAccount>>[] {
    return this.#getWallet(entropySource).getMultichainAccounts();
  }
}
