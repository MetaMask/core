import type { EntropySourceId } from '@metamask/keyring-api';
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

import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import type { MultichainAccountControllerMessenger } from './types';

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
  }

  init(): void {
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
