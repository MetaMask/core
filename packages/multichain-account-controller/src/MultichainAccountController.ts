import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { KeyringControllerWithKeyringAction } from '@metamask/keyring-controller';
import type {
  AccountProvider,
  MultichainAccountWalletId,
} from '@metamask/multichain-account-api';
import {
  MultichainAccountWalletAdapter,
  toMultichainAccountWalletId,
  type MultichainAccount,
  type MultichainAccountWallet,
} from '@metamask/multichain-account-api';
import type { HandleSnapRequest as SnapControllerHandleSnapRequestAction } from '@metamask/snaps-controllers';

import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';

/**
 * All actions that {@link MultichainAccountController} registers so that other
 * modules can call them.
 */
export type MultichainAccountControllerActions = never;
/**
 * All events that {@link MultichainAccountController} publishes so that other modules
 * can subscribe to them.
 */
export type MultichainAccountControllerEvents = never;

/**
 * All actions registered by other modules that {@link MultichainAccountController}
 * calls.
 */
export type AllowedActions =
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerGetAccountAction
  | AccountsControllerGetAccountByAddressAction
  | SnapControllerHandleSnapRequestAction
  | KeyringControllerWithKeyringAction;

/**
 * All events published by other modules that {@link MultichainAccountController}
 * subscribes to.
 */
export type AllowedEvents = never;

/**
 * The messenger restricted to actions and events that
 * {@link MultichainAccountController} needs to access.
 */
export type MultichainAccountControllerMessenger = RestrictedMessenger<
  'MultichainAccountController',
  MultichainAccountControllerActions | AllowedActions,
  MultichainAccountControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * The options that {@link MultichainAccountController} takes.
 */
type MultichainAccountControllerOptions = {
  messenger: MultichainAccountControllerMessenger;
};

/**
 * Stateless controller to expose multichain accounts capabilities.
 */
export class MultichainAccountController {
  readonly #messenger: MultichainAccountControllerMessenger;

  readonly #providers: AccountProvider[];

  readonly #wallets: Map<MultichainAccountWalletId, MultichainAccountWallet>;

  /**
   * Constructs a new MultichainAccountController.
   *
   * @param options - The options.
   * @param options.messenger - The messenger suited to this
   * MultichainAccountController.
   */
  constructor({ messenger }: MultichainAccountControllerOptions) {
    this.#messenger = messenger;
    this.#wallets = new Map();
    // TODO: Rely on keyring capabilities once the keyring API is used by all keyrings.
    this.#providers = [
      new EvmAccountProvider(this.#messenger),
      new SolAccountProvider(this.#messenger),
    ];

    // Gather all entropy sources first.
    const entropySources = new Set<EntropySourceId>();
    for (const provider of this.#providers) {
      for (const entropySource of provider.getEntropySources()) {
        entropySources.add(entropySource);
      }
    }

    for (const entropySource of entropySources) {
      // This will automatically create all multichain accounts for that wallet (based
      // on the accounts owned by each account providers).
      const wallet = new MultichainAccountWalletAdapter({
        entropySource,
        providers: this.#providers,
      });

      this.#wallets.set(wallet.id, wallet);
    }
  }

  #getWallet(entropySource: EntropySourceId): MultichainAccountWallet {
    const wallet = this.#wallets.get(
      toMultichainAccountWalletId(entropySource),
    );

    if (!wallet) {
      throw new Error(
        'Unknown wallet, not wallet matching this entropy source',
      );
    }

    return wallet;
  }

  getMultichainAccount({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): MultichainAccount {
    const multichainAccount =
      this.#getWallet(entropySource).accounts[groupIndex];

    if (!multichainAccount) {
      throw new Error(`No multichain account for index: ${groupIndex}`);
    }

    return multichainAccount;
  }

  getMultichainAccounts({
    entropySource,
  }: {
    entropySource: EntropySourceId;
  }): MultichainAccount[] {
    return this.#getWallet(entropySource).accounts;
  }

  async createNextMultichainAccount({
    entropySource,
  }: {
    entropySource: EntropySourceId;
  }): Promise<MultichainAccount> {
    return await this.#getWallet(entropySource).createNextMultichainAccount();
  }

  async discoverAndCreateMultichainAccounts({
    entropySource,
  }: {
    entropySource: EntropySourceId;
  }): Promise<MultichainAccount[]> {
    return await this.#getWallet(
      entropySource,
    ).discoverAndCreateMultichainAccounts();
  }
}
