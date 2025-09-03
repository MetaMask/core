import {
  isBip44Account,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import type {
  MultichainAccountWalletId,
  Bip44Account,
  AccountProvider,
} from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type { MultichainAccountGroup } from './MultichainAccountGroup';
import { MultichainAccountWallet } from './MultichainAccountWallet';
import {
  AccountProviderWrapper,
  isAccountProviderWrapper,
} from './providers/AccountProviderWrapper';
import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import type { MultichainAccountServiceMessenger } from './types';

export const serviceName = 'MultichainAccountService';

/**
 * The options that {@link MultichainAccountService} takes.
 */
type MultichainAccountServiceOptions = {
  messenger: MultichainAccountServiceMessenger;
  providers?: AccountProvider<Bip44Account<KeyringAccount>>[];
};

/** Reverse mapping object used to map account IDs and their wallet/multichain account. */
type AccountContext<Account extends Bip44Account<KeyringAccount>> = {
  wallet: MultichainAccountWallet<Account>;
  group: MultichainAccountGroup<Account>;
};

/**
 * Service to expose multichain accounts capabilities.
 */
export class MultichainAccountService {
  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #providers: AccountProvider<Bip44Account<KeyringAccount>>[];

  readonly #wallets: Map<
    MultichainAccountWalletId,
    MultichainAccountWallet<Bip44Account<KeyringAccount>>
  >;

  readonly #accountIdToContext: Map<
    Bip44Account<KeyringAccount>['id'],
    AccountContext<Bip44Account<KeyringAccount>>
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
   * @param options.providers - Optional list of account
   * providers.
   */
  constructor({ messenger, providers = [] }: MultichainAccountServiceOptions) {
    this.#messenger = messenger;
    this.#wallets = new Map();
    this.#accountIdToContext = new Map();

    // TODO: Rely on keyring capabilities once the keyring API is used by all keyrings.
    this.#providers = [
      new EvmAccountProvider(this.#messenger),
      new AccountProviderWrapper(
        this.#messenger,
        new SolAccountProvider(this.#messenger),
      ),
      // Custom account providers that can be provided by the MetaMask client.
      ...providers,
    ];

    this.#messenger.registerActionHandler(
      'MultichainAccountService:getMultichainAccountGroup',
      (...args) => this.getMultichainAccountGroup(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:getMultichainAccountGroups',
      (...args) => this.getMultichainAccountGroups(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:getMultichainAccountWallet',
      (...args) => this.getMultichainAccountWallet(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:getMultichainAccountWallets',
      (...args) => this.getMultichainAccountWallets(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:createNextMultichainAccountGroup',
      (...args) => this.createNextMultichainAccountGroup(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:createMultichainAccountGroup',
      (...args) => this.createMultichainAccountGroup(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:setBasicFunctionality',
      (...args) => this.setBasicFunctionality(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:alignWallets',
      (...args) => this.alignWallets(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:alignWallet',
      (...args) => this.alignWallet(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:getIsAlignmentInProgress',
      () => this.getIsAlignmentInProgress(),
    );

    this.#messenger.subscribe('AccountsController:accountAdded', (account) =>
      this.#handleOnAccountAdded(account),
    );
    this.#messenger.subscribe('AccountsController:accountRemoved', (id) =>
      this.#handleOnAccountRemoved(id),
    );
  }

  /**
   * Initialize the service and constructs the internal reprensentation of
   * multichain accounts and wallets.
   */
  init(): void {
    this.#wallets.clear();
    this.#accountIdToContext.clear();

    // Create initial wallets.
    const { keyrings } = this.#messenger.call('KeyringController:getState');
    for (const keyring of keyrings) {
      if (keyring.type === (KeyringTypes.hd as string)) {
        // Only HD keyrings have an entropy source/SRP.
        const entropySource = keyring.metadata.id;

        // This will automatically "associate" all multichain accounts for that wallet
        // (based on the accounts owned by each account providers).
        const wallet = new MultichainAccountWallet({
          entropySource,
          providers: this.#providers,
        });
        this.#wallets.set(wallet.id, wallet);

        // Reverse mapping between account ID and their multichain wallet/account:
        for (const group of wallet.getMultichainAccountGroups()) {
          for (const account of group.getAccounts()) {
            this.#accountIdToContext.set(account.id, {
              wallet,
              group,
            });
          }
        }
      }
    }
  }

  #handleOnAccountAdded(account: KeyringAccount): void {
    // We completely omit non-BIP-44 accounts!
    if (!isBip44Account(account)) {
      return;
    }

    let sync = true;

    let wallet = this.#wallets.get(
      toMultichainAccountWalletId(account.options.entropy.id),
    );
    if (!wallet) {
      // That's a new wallet.
      wallet = new MultichainAccountWallet({
        entropySource: account.options.entropy.id,
        providers: this.#providers,
      });
      this.#wallets.set(wallet.id, wallet);

      // If that's a new wallet wallet. There's nothing to "force-sync".
      sync = false;
    }

    let group = wallet.getMultichainAccountGroup(
      account.options.entropy.groupIndex,
    );
    if (!group) {
      // This new account is a new multichain account, let the wallet know
      // it has to re-sync with its providers.
      if (sync) {
        wallet.sync();

        // Emit updated events for all groups in this wallet since wallet.sync()
        // may affect multiple groups
        for (const updatedGroup of wallet.getMultichainAccountGroups()) {
          this.#messenger.publish(
            'MultichainAccountService:multichainAccountGroupUpdated',
            updatedGroup,
          );
        }
      }

      group = wallet.getMultichainAccountGroup(
        account.options.entropy.groupIndex,
      );

      // If that's a new multichain account. There's nothing to "force-sync".
      sync = false;
    }

    // We have to check against `undefined` in case `getMultichainAccount` is
    // not able to find this multichain account (which should not be possible...)
    if (group) {
      if (sync) {
        group.sync();
        this.#messenger.publish(
          'MultichainAccountService:multichainAccountGroupUpdated',
          group,
        );
      }

      // Same here, this account should have been already grouped in that
      // multichain account.
      this.#accountIdToContext.set(account.id, {
        wallet,
        group,
      });
    }
  }

  #handleOnAccountRemoved(id: KeyringAccount['id']): void {
    // Force sync of the appropriate wallet if an account got removed.
    const found = this.#accountIdToContext.get(id);
    if (found) {
      const { wallet } = found;

      wallet.sync();

      // Emit updated events for all groups in this wallet since wallet.sync()
      // may affect multiple groups
      for (const group of wallet.getMultichainAccountGroups()) {
        this.#messenger.publish(
          'MultichainAccountService:multichainAccountGroupUpdated',
          group,
        );
      }
    }

    // Safe to call delete even if the `id` was not referencing a BIP-44 account.
    this.#accountIdToContext.delete(id);
  }

  #getWallet(
    entropySource: EntropySourceId,
  ): MultichainAccountWallet<Bip44Account<KeyringAccount>> {
    const wallet = this.#wallets.get(
      toMultichainAccountWalletId(entropySource),
    );

    if (!wallet) {
      throw new Error('Unknown wallet, no wallet matching this entropy source');
    }

    return wallet;
  }

  /**
   * Gets the account's context which contains its multichain wallet and
   * multichain account group references.
   *
   * @param id - Account ID.
   * @returns The account context if any, undefined otherwise.
   */
  getAccountContext(
    id: KeyringAccount['id'],
  ): AccountContext<Bip44Account<KeyringAccount>> | undefined {
    return this.#accountIdToContext.get(id);
  }

  /**
   * Gets a reference to the multichain account wallet matching this entropy source.
   *
   * @param options - Options.
   * @param options.entropySource - The entropy source of the multichain account.
   * @throws If none multichain account match this entropy.
   * @returns A reference to the multichain account wallet.
   */
  getMultichainAccountWallet({
    entropySource,
  }: {
    entropySource: EntropySourceId;
  }): MultichainAccountWallet<Bip44Account<KeyringAccount>> {
    return this.#getWallet(entropySource);
  }

  /**
   * Gets an array of all multichain account wallets.
   *
   * @returns An array of all multichain account wallets.
   */
  getMultichainAccountWallets(): MultichainAccountWallet<
    Bip44Account<KeyringAccount>
  >[] {
    return Array.from(this.#wallets.values());
  }

  /**
   * Gets a reference to the multichain account group matching this entropy source
   * and a group index.
   *
   * @param options - Options.
   * @param options.entropySource - The entropy source of the multichain account.
   * @param options.groupIndex - The group index of the multichain account.
   * @throws If none multichain account match this entropy source and group index.
   * @returns A reference to the multichain account.
   */
  getMultichainAccountGroup({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): MultichainAccountGroup<Bip44Account<KeyringAccount>> {
    const multichainAccount =
      this.#getWallet(entropySource).getMultichainAccountGroup(groupIndex);

    if (!multichainAccount) {
      throw new Error(`No multichain account for index: ${groupIndex}`);
    }

    return multichainAccount;
  }

  /**
   * Gets all multichain account groups for a given entropy source.
   *
   * @param options - Options.
   * @param options.entropySource - The entropy source to query.
   * @throws If no multichain accounts match this entropy source.
   * @returns A list of all multichain accounts.
   */
  getMultichainAccountGroups({
    entropySource,
  }: {
    entropySource: EntropySourceId;
  }): MultichainAccountGroup<Bip44Account<KeyringAccount>>[] {
    return this.#getWallet(entropySource).getMultichainAccountGroups();
  }

  /**
   * Creates the next multichain account group.
   *
   * @param options - Options.
   * @param options.entropySource - The wallet's entropy source.
   * @returns The next multichain account group.
   */
  async createNextMultichainAccountGroup({
    entropySource,
  }: {
    entropySource: EntropySourceId;
  }): Promise<MultichainAccountGroup<Bip44Account<KeyringAccount>>> {
    const group =
      await this.#getWallet(entropySource).createNextMultichainAccountGroup();

    this.#messenger.publish(
      'MultichainAccountService:multichainAccountGroupCreated',
      group,
    );

    return group;
  }

  /**
   * Creates a multichain account group.
   *
   * @param options - Options.
   * @param options.groupIndex - The group index to use.
   * @param options.entropySource - The wallet's entropy source.
   * @returns The multichain account group for this group index.
   */
  async createMultichainAccountGroup({
    groupIndex,
    entropySource,
  }: {
    groupIndex: number;
    entropySource: EntropySourceId;
  }): Promise<MultichainAccountGroup<Bip44Account<KeyringAccount>>> {
    const group =
      await this.#getWallet(entropySource).createMultichainAccountGroup(
        groupIndex,
      );

    this.#messenger.publish(
      'MultichainAccountService:multichainAccountGroupCreated',
      group,
    );

    return group;
  }

  /**
   * Set basic functionality state and trigger alignment if enabled.
   * When basic functionality is disabled, snap-based providers are disabled.
   * When enabled, all snap providers are enabled and wallet alignment is triggered.
   * EVM providers are never disabled as they're required for basic wallet functionality.
   *
   * @param enabled - Whether basic functionality is enabled.
   */
  async setBasicFunctionality(enabled: boolean): Promise<void> {
    // Loop through providers and enable/disable only wrapped ones when basic functionality changes
    for (const provider of this.#providers) {
      if (isAccountProviderWrapper(provider)) {
        provider.setEnabled(enabled);
      }
      // Regular providers (like EVM) are never disabled for basic functionality
    }

    // Trigger alignment only when basic functionality is enabled
    if (enabled) {
      await this.alignWallets();
    }
  }

  /**
   * Gets whether wallet alignment is currently in progress.
   *
   * @returns True if any wallet alignment is in progress, false otherwise.
   */
  getIsAlignmentInProgress(): boolean {
    return Array.from(this.#wallets.values()).some((wallet) =>
      wallet.getIsAlignmentInProgress(),
    );
  }

  /**
   * Align all multichain account wallets.
   */
  async alignWallets(): Promise<void> {
    const wallets = this.getMultichainAccountWallets();
    await Promise.all(wallets.map((w) => w.alignGroups()));
  }

  /**
   * Align a specific multichain account wallet.
   *
   * @param entropySource - The entropy source of the multichain account wallet.
   */
  async alignWallet(entropySource: EntropySourceId): Promise<void> {
    const wallet = this.getMultichainAccountWallet({ entropySource });
    await wallet.alignGroups();
  }
}
