import {
  isBip44Account,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import type {
  MultichainAccountWalletId,
  Bip44Account,
} from '@metamask/account-api';
import type { HdKeyring } from '@metamask/eth-hd-keyring';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { areUint8ArraysEqual, assert } from '@metamask/utils';

import { projectLogger as log } from './logger';
import type { MultichainAccountGroup } from './MultichainAccountGroup';
import { MultichainAccountWallet } from './MultichainAccountWallet';
import type {
  Bip44AccountProvider,
  EvmAccountProviderConfig,
  SolAccountProviderConfig,
} from './providers';
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
export type MultichainAccountServiceOptions = {
  messenger: MultichainAccountServiceMessenger;
  providers?: Bip44AccountProvider[];
  providerConfigs?: {
    [EvmAccountProvider.NAME]?: EvmAccountProviderConfig;
    [SolAccountProvider.NAME]?: SolAccountProviderConfig;
  };
};

/**
 * The keys used to identify an account in the service state.
 */
export type StateKeys = {
  entropySource: EntropySourceId;
  groupIndex: number;
  providerName: string;
};

/**
 * The service state.
 */
export type ServiceState = {
  [entropySource: StateKeys['entropySource']]: {
    [groupIndex: string]: {
      [
        providerName: StateKeys['providerName']
      ]: Bip44Account<KeyringAccount>['id'][];
    };
  };
};

export type CreateWalletType = 'restore' | 'import' | 'create';

type RestoreType = Extract<CreateWalletType, 'restore'>;
type ImportType = Extract<CreateWalletType, 'import'>;
type CreateType = Extract<CreateWalletType, 'create'>;

type CreateWalletParams = {
  type: CreateWalletType;
  password?: string;
  mnemonic?: Uint8Array;
};

type CreateWalletValidatedParams =
  | {
      type: RestoreType;
      password: string;
      mnemonic: Uint8Array;
    }
  | {
      type: ImportType;
      mnemonic: Uint8Array;
    }
  | {
      type: CreateType;
      password: string;
    };

/**
 * Service to expose multichain accounts capabilities.
 */
export class MultichainAccountService {
  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #providers: Bip44AccountProvider[];

  readonly #wallets: Map<
    MultichainAccountWalletId,
    MultichainAccountWallet<Bip44Account<KeyringAccount>>
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
   * providers.
   */
  constructor({
    messenger,
    providers = [],
    providerConfigs,
  }: MultichainAccountServiceOptions) {
    this.#messenger = messenger;
    this.#wallets = new Map();

    // TODO: Rely on keyring capabilities once the keyring API is used by all keyrings.
    this.#providers = [
      new EvmAccountProvider(
        this.#messenger,
        providerConfigs?.[EvmAccountProvider.NAME],
      ),
      new AccountProviderWrapper(
        this.#messenger,
        new SolAccountProvider(
          this.#messenger,
          providerConfigs?.[SolAccountProvider.NAME],
        ),
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
      'MultichainAccountService:createMultichainAccountWallet',
      (...args) => this.createMultichainAccountWallet(...args),
    );
  }

  /**
   * Get the keys used to identify an account in the service state.
   *
   * @param account - The account to get the keys for.
   * @returns The keys used to identify an account in the service state.
   * Returns null if the account is not compatible with any provider.
   */
  #getStateKeys(account: InternalAccount): StateKeys | null {
    for (const provider of this.#providers) {
      if (isBip44Account(account) && provider.isAccountCompatible(account)) {
        return {
          entropySource: account.options.entropy.id,
          groupIndex: account.options.entropy.groupIndex,
          providerName: provider.getName(),
        };
      }
    }
    return null;
  }

  /**
   * Construct the service state.
   *
   * @returns The service state.
   */
  #constructServiceState() {
    const accounts = this.#messenger.call(
      'AccountsController:listMultichainAccounts',
    );

    const serviceState: ServiceState = {};
    const { keyrings } = this.#messenger.call('KeyringController:getState');

    // We set up the wallet level keys for this constructed state object
    for (const keyring of keyrings) {
      if (keyring.type === (KeyringTypes.hd as string)) {
        serviceState[keyring.metadata.id] = {};
      }
    }

    for (const account of accounts) {
      const keys = this.#getStateKeys(account);
      if (keys) {
        const { entropySource, groupIndex, providerName } = keys;
        serviceState[entropySource][groupIndex] ??= {};
        serviceState[entropySource][groupIndex][providerName] ??= [];
        serviceState[entropySource][groupIndex][providerName].push(account.id);
      }
    }

    return serviceState;
  }

  /**
   * Initialize the service and constructs the internal reprensentation of
   * multichain accounts and wallets.
   */
  init(): void {
    log('Initializing...');

    this.#wallets.clear();

    const serviceState = this.#constructServiceState();
    for (const entropySource of Object.keys(serviceState)) {
      const wallet = new MultichainAccountWallet({
        entropySource,
        providers: this.#providers,
        messenger: this.#messenger,
      });
      wallet.init(serviceState[entropySource]);
      this.#wallets.set(wallet.id, wallet);
    }

    log('Initialized');
  }

  /**
   * Get the wallet matching the given entropy source.
   *
   * @param entropySource - The entropy source of the wallet.
   * @returns The wallet matching the given entropy source.
   * @throws If no wallet matches the given entropy source.
   */
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
   * Gets the validated create wallet parameters.
   *
   * @param options - Options.
   * @param options.mnemonic - The mnemonic to use to create the new wallet.
   * @param options.password - The password to encrypt the vault with.
   * @param options.type - The flow type to use to create the new wallet.
   * @returns The validated create wallet parameters.
   */
  #getValidatedCreateWalletParams({
    mnemonic,
    password,
    type,
  }: CreateWalletParams): CreateWalletValidatedParams {
    if (type === 'restore' && password && mnemonic) {
      return {
        password,
        mnemonic,
        type: 'restore',
      };
    }

    if (type === 'import' && mnemonic) {
      return { mnemonic, type: 'import' };
    }

    if (type === 'create' && password) {
      return { password, type: 'create' };
    }

    throw new Error('Invalid create wallet parameters.');
  }

  /**
   * Creates a new multichain account wallet by importing an existing mnemonic.
   *
   * @param mnemonic - The mnemonic to use to create the new wallet.
   * @returns The new multichain account wallet.
   */
  async #createWalletByImport(
    mnemonic: Uint8Array,
  ): Promise<MultichainAccountWallet<Bip44Account<KeyringAccount>>> {
    log(`Creating new wallet by importing an existing mnemonic...`);
    const existingKeyrings = this.#messenger.call(
      'KeyringController:getKeyringsByType',
      KeyringTypes.hd,
    ) as HdKeyring[];

    const alreadyHasImportedSrp = existingKeyrings.some((keyring) => {
      if (!keyring.mnemonic) {
        return false;
      }
      return areUint8ArraysEqual(keyring.mnemonic, mnemonic);
    });

    if (alreadyHasImportedSrp) {
      throw new Error('This Secret Recovery Phrase has already been imported.');
    }

    const result = await this.#messenger.call(
      'KeyringController:addNewKeyring',
      KeyringTypes.hd,
      { mnemonic },
    );

    // The wallet is ripe for discovery
    return new MultichainAccountWallet({
      providers: this.#providers,
      entropySource: result.id,
      messenger: this.#messenger,
    });
  }

  /**
   * Creates a new multichain account wallet by creating a new vault and keychain.
   *
   * @param password - The password to encrypt the vault with.
   * @returns The new multichain account wallet.
   */
  async #createWalletByNewVault(
    password: string,
  ): Promise<MultichainAccountWallet<Bip44Account<KeyringAccount>>> {
    log(`Creating new wallet by creating a new vault and keychain...`);
    await this.#messenger.call(
      'KeyringController:createNewVaultAndKeychain',
      password,
    );

    const entropySourceId = (await this.#messenger.call(
      'KeyringController:withKeyring',
      { type: KeyringTypes.hd },
      async ({ metadata }) => {
        return metadata.id;
      },
    )) as string;

    // The wallet is ripe for discovery
    return new MultichainAccountWallet({
      providers: this.#providers,
      entropySource: entropySourceId,
      messenger: this.#messenger,
    });
  }

  /**
   * Creates a new multichain account wallet by restoring a vault and keyring.
   *
   * @param password - The password to encrypt the vault with.
   * @param mnemonic - The mnemonic to use to restore the new wallet.
   * @returns The new multichain account wallet.
   */
  async #createWalletByRestore(
    password: string,
    mnemonic: Uint8Array,
  ): Promise<MultichainAccountWallet<Bip44Account<KeyringAccount>>> {
    log(`Creating new wallet by restoring vault and keyring...`);
    await this.#messenger.call(
      'KeyringController:createNewVaultAndRestore',
      password,
      mnemonic,
    );

    const entropySourceId = (await this.#messenger.call(
      'KeyringController:withKeyring',
      { type: KeyringTypes.hd },
      async ({ metadata }) => {
        return metadata.id;
      },
    )) as string;

    // The wallet is ripe for discovery
    return new MultichainAccountWallet({
      providers: this.#providers,
      entropySource: entropySourceId,
      messenger: this.#messenger,
    });
  }

  /**
   * Creates a new multichain account wallet by either importing an existing mnemonic,
   * creating a new vault and keychain, or restoring a vault and keyring.
   *
   * NOTE: This method should only be called in client code where a mutex lock is acquired.
   * `discoverAccounts` should be called after this method to discover and create accounts.
   *
   * @param options - Options.
   * @param options.mnemonic - The mnemonic to use to create the new wallet.
   * @param options.password - The password to encrypt the vault with.
   * @param options.type - The flow type to use to create the new wallet.
   * @throws If the mnemonic has already been imported.
   * @returns The new multichain account wallet.
   */
  async createMultichainAccountWallet({
    mnemonic,
    password,
    type,
  }: CreateWalletParams): Promise<
    MultichainAccountWallet<Bip44Account<KeyringAccount>>
  > {
    const params: CreateWalletValidatedParams =
      this.#getValidatedCreateWalletParams({
        mnemonic,
        password,
        type,
      });

    let wallet:
      | MultichainAccountWallet<Bip44Account<KeyringAccount>>
      | undefined;

    if (params.type === 'import') {
      wallet = await this.#createWalletByImport(params.mnemonic);
    } else if (params.type === 'create') {
      wallet = await this.#createWalletByNewVault(params.password);
    } else if (params.type === 'restore') {
      wallet = await this.#createWalletByRestore(
        params.password,
        params.mnemonic,
      );
    }

    assert(wallet, 'Failed to create wallet.');

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
