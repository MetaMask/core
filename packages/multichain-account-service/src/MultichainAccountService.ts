import {
  isBip44Account,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import type {
  MultichainAccountWalletId,
  Bip44Account,
} from '@metamask/account-api';
import type { HdKeyring } from '@metamask/eth-hd-keyring';
import { mnemonicPhraseToBytes } from '@metamask/key-tree';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import { areUint8ArraysEqual } from '@metamask/utils';

import { traceFallback } from './analytics';
import { projectLogger as log } from './logger';
import type { MultichainAccountGroup } from './MultichainAccountGroup';
import { MultichainAccountWallet } from './MultichainAccountWallet';
import {
  EvmAccountProviderConfig,
  Bip44AccountProvider,
  EVM_ACCOUNT_PROVIDER_NAME,
} from './providers';
import {
  AccountProviderWrapper,
  isAccountProviderWrapper,
} from './providers/AccountProviderWrapper';
import { EvmAccountProvider } from './providers/EvmAccountProvider';
import { SolAccountProvider } from './providers/SolAccountProvider';
import {
  SOL_ACCOUNT_PROVIDER_NAME,
  SolAccountProviderConfig,
} from './providers/SolAccountProvider';
import { SnapPlatformWatcher } from './snaps/SnapPlatformWatcher';
import type {
  MultichainAccountServiceConfig,
  MultichainAccountServiceMessenger,
} from './types';
import { createSentryError } from './utils';

export const serviceName = 'MultichainAccountService';

/**
 * The options that {@link MultichainAccountService} takes.
 */
export type MultichainAccountServiceOptions = {
  messenger: MultichainAccountServiceMessenger;
  providers?: Bip44AccountProvider[];
  providerConfigs?: {
    [EVM_ACCOUNT_PROVIDER_NAME]?: EvmAccountProviderConfig;
    [SOL_ACCOUNT_PROVIDER_NAME]?: SolAccountProviderConfig;
  };
  config?: MultichainAccountServiceConfig;
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

  readonly #watcher: SnapPlatformWatcher;

  readonly #providers: Bip44AccountProvider[];

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
   * @param options.providerConfigs - Optional provider configs
   * @param options.config - Optional config.
   */
  constructor({
    messenger,
    providers = [],
    providerConfigs,
    config,
  }: MultichainAccountServiceOptions) {
    this.#messenger = messenger;
    this.#wallets = new Map();
    this.#accountIdToContext = new Map();

    // Pass trace callback directly to preserve original 'this' context
    // This avoids binding the callback to the MultichainAccountService instance
    const traceCallback = config?.trace ?? traceFallback;

    // TODO: Rely on keyring capabilities once the keyring API is used by all keyrings.
    this.#providers = [
      new EvmAccountProvider(
        this.#messenger,
        providerConfigs?.[EVM_ACCOUNT_PROVIDER_NAME],
        traceCallback,
      ),
      new AccountProviderWrapper(
        this.#messenger,
        new SolAccountProvider(
          this.#messenger,
          providerConfigs?.[SOL_ACCOUNT_PROVIDER_NAME],
          traceCallback,
        ),
      ),
      // Custom account providers that can be provided by the MetaMask client.
      ...providers,
    ];

    this.#watcher = new SnapPlatformWatcher(messenger);

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
      'MultichainAccountService:createMultichainAccountWallet',
      (...args) => this.createMultichainAccountWallet(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:resyncAccounts',
      (...args) => this.resyncAccounts(...args),
    );
    this.#messenger.registerActionHandler(
      'MultichainAccountService:ensureCanUseSnapPlatform',
      (...args) => this.ensureCanUseSnapPlatform(...args),
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
  async init(): Promise<void> {
    log('Initializing...');

    this.#wallets.clear();
    this.#accountIdToContext.clear();

    // Create initial wallets.
    const { keyrings } = this.#messenger.call('KeyringController:getState');
    for (const keyring of keyrings) {
      if (keyring.type === (KeyringTypes.hd as string)) {
        // Only HD keyrings have an entropy source/SRP.
        const entropySource = keyring.metadata.id;

        log(`Adding new wallet for entropy: "${entropySource}"`);

        // This will automatically "associate" all multichain accounts for that wallet
        // (based on the accounts owned by each account providers).
        const wallet = new MultichainAccountWallet({
          entropySource,
          providers: this.#providers,
          messenger: this.#messenger,
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

    log('Initialized');
  }

  /**
   * Re-synchronize MetaMask accounts and the providers accounts if needed.
   *
   * NOTE: This is mostly required if one of the providers (keyrings or Snaps)
   * have different sets of accounts. This method would ensure that both are
   * in-sync and use the same accounts (and same IDs).
   *
   * READ THIS CAREFULLY (State inconsistency bugs/de-sync)
   * We've seen some problems were keyring accounts on some Snaps were not synchronized
   * with the accounts on MM side. This causes problems where we cannot interact with
   * those accounts because the Snap does know about them.
   * To "workaround" this de-sync problem for now, we make sure that both parties are
   * in-sync when the service boots up.
   * ----------------------------------------------------------------------------------
   */
  async resyncAccounts(): Promise<void> {
    log('Re-sync provider accounts if needed...');
    const accounts = this.#messenger
      .call('AccountsController:listMultichainAccounts')
      .filter(isBip44Account);
    // We use `Promise.all` + `try-catch` combo, since we don't wanna block the wallet
    // from being used even if some accounts are not sync (best-effort).
    await Promise.all(
      this.#providers.map(async (provider) => {
        try {
          await provider.resyncAccounts(accounts);
        } catch (error) {
          const errorMessage = `Unable to re-sync provider "${provider.getName()}"`;
          log(errorMessage);
          console.error(errorMessage);

          const sentryError = createSentryError(errorMessage, error as Error, {
            provider: provider.getName(),
          });
          this.#messenger.captureException?.(sentryError);
        }
      }),
    );
    log('Providers got re-synced!');
  }

  ensureCanUseSnapPlatform(): Promise<void> {
    return this.#watcher.ensureCanUseSnapPlatform();
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
      log(
        `Adding new wallet for entropy: "${account.options.entropy.id}" (for account: "${account.id}")`,
      );

      // That's a new wallet.
      wallet = new MultichainAccountWallet({
        entropySource: account.options.entropy.id,
        providers: this.#providers,
        messenger: this.#messenger,
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

      log(
        `Re-synchronize wallet [${wallet.id}] since account "${id}" got removed`,
      );
      wallet.sync();
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
   * Creates a new multichain account wallet with the given mnemonic.
   *
   * NOTE: This method should only be called in client code where a mutex lock is acquired.
   * `discoverAndCreateAccounts` should be called after this method to discover and create accounts.
   *
   * @param options - Options.
   * @param options.mnemonic - The mnemonic to use to create the new wallet.
   * @throws If the mnemonic has already been imported.
   * @returns The new multichain account wallet.
   */
  async createMultichainAccountWallet({
    mnemonic,
  }: {
    mnemonic: string;
  }): Promise<MultichainAccountWallet<Bip44Account<KeyringAccount>>> {
    const existingKeyrings = this.#messenger.call(
      'KeyringController:getKeyringsByType',
      KeyringTypes.hd,
    ) as HdKeyring[];

    const mnemonicAsBytes = mnemonicPhraseToBytes(mnemonic);

    const alreadyHasImportedSrp = existingKeyrings.some((keyring) => {
      if (!keyring.mnemonic) {
        return false;
      }
      return areUint8ArraysEqual(keyring.mnemonic, mnemonicAsBytes);
    });

    if (alreadyHasImportedSrp) {
      throw new Error('This Secret Recovery Phrase has already been imported.');
    }

    log(`Creating new wallet...`);

    const result = await this.#messenger.call(
      'KeyringController:addNewKeyring',
      KeyringTypes.hd,
      { mnemonic },
    );

    const wallet = new MultichainAccountWallet({
      providers: this.#providers,
      entropySource: result.id,
      messenger: this.#messenger,
    });

    this.#wallets.set(wallet.id, wallet);

    log(`Wallet created: [${wallet.id}]`);

    return wallet;
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
    return await this.#getWallet(
      entropySource,
    ).createNextMultichainAccountGroup();
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
    return await this.#getWallet(entropySource).createMultichainAccountGroup(
      groupIndex,
    );
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
    log(`Turning basic functionality: ${enabled ? 'ON' : 'OFF'}`);

    // Loop through providers and enable/disable only wrapped ones when basic functionality changes
    for (const provider of this.#providers) {
      if (isAccountProviderWrapper(provider)) {
        log(
          `${enabled ? 'Enabling' : 'Disabling'} account provider: "${provider.getName()}"`,
        );
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
   * Align all multichain account wallets.
   */
  async alignWallets(): Promise<void> {
    log(`Triggering alignment on all wallets...`);

    const wallets = this.getMultichainAccountWallets();
    await Promise.all(wallets.map((w) => w.alignAccounts()));

    log(`Wallets aligned`);
  }

  /**
   * Align a specific multichain account wallet.
   *
   * @param entropySource - The entropy source of the multichain account wallet.
   */
  async alignWallet(entropySource: EntropySourceId): Promise<void> {
    const wallet = this.getMultichainAccountWallet({ entropySource });

    log(`Triggering alignment for wallet: [${wallet.id}]`);
    await wallet.alignAccounts();
    log(`Wallet [${wallet.id}] aligned`);
  }
}
