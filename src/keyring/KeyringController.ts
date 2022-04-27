import {
  addHexPrefix,
  bufferToHex,
  isValidPrivate,
  toBuffer,
  stripHexPrefix,
} from 'ethereumjs-util';
import {
  normalize as normalizeAddress,
  signTypedData,
  signTypedData_v4,
  signTypedDataLegacy,
} from 'eth-sig-util';
import Wallet, { thirdparty as importers } from 'ethereumjs-wallet';
import Keyring from 'eth-keyring-controller';
import { Mutex } from 'async-mutex';
import {
  MetaMaskKeyring as QRKeyring,
  IKeyringState as IQRKeyringState,
} from '@keystonehq/metamask-airgapped-keyring';
import {
  BaseController,
  BaseConfig,
  BaseState,
  Listener,
} from '../BaseController';
import { PreferencesController } from '../user/PreferencesController';
import { PersonalMessageParams } from '../message-manager/PersonalMessageManager';
import { TypedMessageParams } from '../message-manager/TypedMessageManager';
import { toChecksumHexAddress } from '../util';

/**
 * Available keyring types
 */
export enum KeyringTypes {
  simple = 'Simple Key Pair',
  hd = 'HD Key Tree',
  qr = 'QR Hardware Wallet Device',
}

/**
 * @type KeyringObject
 *
 * Keyring object
 * @property type - Keyring type
 * @property accounts - Associated accounts
 * @function getAccounts - Get associated accounts
 */
export interface KeyringObject {
  type: string;
  accounts: string[];
  getAccounts(): string[];
}

/**
 * @type KeyringState
 *
 * Keyring controller state
 * @property vault - Encrypted string representing keyring data
 * @property keyrings - Group of accounts
 */
export interface KeyringState extends BaseState {
  vault?: string;
  keyrings: Keyring[];
}

/**
 * @type KeyringMemState
 *
 * Keyring mem controller state
 * @property isUnlocked - Whether vault is unlocked
 * @property keyringTypes - Account types
 * @property keyrings - Group of accounts
 */
export interface KeyringMemState extends BaseState {
  isUnlocked: boolean;
  keyringTypes: string[];
  keyrings: Keyring[];
}

/**
 * @type KeyringConfig
 *
 * Keyring controller configuration
 * @property encryptor - Keyring encryptor
 */
export interface KeyringConfig extends BaseConfig {
  encryptor?: any;
  keyringTypes?: any[];
}

/**
 * @type Keyring
 *
 * Keyring object to return in fullUpdate
 * @property type - Keyring type
 * @property accounts - Associated accounts
 * @property index - Associated index
 */
export interface Keyring {
  accounts: string[];
  type: string;
  index?: number;
}

/**
 * A strategy for importing an account
 */
export enum AccountImportStrategy {
  privateKey = 'privateKey',
  json = 'json',
}

/**
 * The `signTypedMessage` version
 *
 * @see https://docs.metamask.io/guide/signing-data.html
 */
export enum SignTypedDataVersion {
  V1 = 'V1',
  V3 = 'V3',
  V4 = 'V4',
}

/**
 * Controller responsible for establishing and managing user identity
 */
export class KeyringController extends BaseController<
  KeyringConfig,
  KeyringState
> {
  private mutex = new Mutex();

  /**
   * Name of this controller used during composition
   */
  override name = 'KeyringController';

  private removeIdentity: PreferencesController['removeIdentity'];

  private syncIdentities: PreferencesController['syncIdentities'];

  private updateIdentities: PreferencesController['updateIdentities'];

  private setSelectedAddress: PreferencesController['setSelectedAddress'];

  private setAccountLabel?: PreferencesController['setAccountLabel'];

  #keyring: typeof Keyring;

  /**
   * Creates a KeyringController instance.
   *
   * @param options - The controller options.
   * @param options.removeIdentity - Remove the identity with the given address.
   * @param options.syncIdentities - Sync identities with the given list of addresses.
   * @param options.updateIdentities - Generate an identity for each address given that doesn't already have an identity.
   * @param options.setSelectedAddress - Set the selected address.
   * @param options.setAccountLabel - Set a new name for account.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      removeIdentity,
      syncIdentities,
      updateIdentities,
      setSelectedAddress,
      setAccountLabel,
    }: {
      removeIdentity: PreferencesController['removeIdentity'];
      syncIdentities: PreferencesController['syncIdentities'];
      updateIdentities: PreferencesController['updateIdentities'];
      setSelectedAddress: PreferencesController['setSelectedAddress'];
      setAccountLabel?: PreferencesController['setAccountLabel'];
    },
    config?: Partial<KeyringConfig>,
    state?: Partial<KeyringState>,
  ) {
    super(config, state);
    this.#keyring = new Keyring(Object.assign({ initState: state }, config));

    this.defaultState = {
      ...this.#keyring.store.getState(),
      keyrings: [],
    };
    this.removeIdentity = removeIdentity;
    this.syncIdentities = syncIdentities;
    this.updateIdentities = updateIdentities;
    this.setSelectedAddress = setSelectedAddress;
    this.setAccountLabel = setAccountLabel;
    this.initialize();
    this.fullUpdate();
  }

  /**
   * Adds a new account to the default (first) HD seed phrase keyring.
   *
   * @returns Promise resolving to current state when the account is added.
   */
  async addNewAccount(): Promise<KeyringMemState> {
    const primaryKeyring = this.#keyring.getKeyringsByType('HD Key Tree')[0];
    /* istanbul ignore if */
    if (!primaryKeyring) {
      throw new Error('No HD keyring found');
    }
    const oldAccounts = await this.#keyring.getAccounts();
    await this.#keyring.addNewAccount(primaryKeyring);
    const newAccounts = await this.#keyring.getAccounts();

    await this.verifySeedPhrase();

    this.updateIdentities(newAccounts);
    newAccounts.forEach((selectedAddress: string) => {
      if (!oldAccounts.includes(selectedAddress)) {
        this.setSelectedAddress(selectedAddress);
      }
    });
    return this.fullUpdate();
  }

  /**
   * Adds a new account to the default (first) HD seed phrase keyring without updating identities in preferences.
   *
   * @returns Promise resolving to current state when the account is added.
   */
  async addNewAccountWithoutUpdate(): Promise<KeyringMemState> {
    const primaryKeyring = this.#keyring.getKeyringsByType('HD Key Tree')[0];
    /* istanbul ignore if */
    if (!primaryKeyring) {
      throw new Error('No HD keyring found');
    }
    await this.#keyring.addNewAccount(primaryKeyring);
    await this.verifySeedPhrase();
    return this.fullUpdate();
  }

  /**
   * Effectively the same as creating a new keychain then populating it
   * using the given seed phrase.
   *
   * @param password - Password to unlock keychain.
   * @param seed - Seed phrase to restore keychain.
   * @returns Promise resolving to th restored keychain object.
   */
  async createNewVaultAndRestore(password: string, seed: string) {
    const releaseLock = await this.mutex.acquire();
    if (!password || !password.length) {
      throw new Error('Invalid password');
    }

    try {
      this.updateIdentities([]);
      const vault = await this.#keyring.createNewVaultAndRestore(
        password,
        seed,
      );
      this.updateIdentities(await this.#keyring.getAccounts());
      this.fullUpdate();
      return vault;
    } finally {
      releaseLock();
    }
  }

  /**
   * Create a new primary keychain and wipe any previous keychains.
   *
   * @param password - Password to unlock the new vault.
   * @returns Newly-created keychain object.
   */
  async createNewVaultAndKeychain(password: string) {
    const releaseLock = await this.mutex.acquire();
    try {
      const vault = await this.#keyring.createNewVaultAndKeychain(password);
      this.updateIdentities(await this.#keyring.getAccounts());
      this.fullUpdate();
      return vault;
    } finally {
      releaseLock();
    }
  }

  /**
   * Returns the status of the vault.
   *
   * @returns Boolean returning true if the vault is unlocked.
   */
  isUnlocked(): boolean {
    return this.#keyring.memStore.getState().isUnlocked;
  }

  /**
   * Gets the seed phrase of the HD keyring.
   *
   * @param password - Password of the keyring.
   * @returns Promise resolving to the seed phrase.
   */
  exportSeedPhrase(password: string) {
    if (this.#keyring.password === password) {
      return this.#keyring.keyrings[0].mnemonic;
    }
    throw new Error('Invalid password');
  }

  /**
   * Gets the private key from the keyring controlling an address.
   *
   * @param password - Password of the keyring.
   * @param address - Address to export.
   * @returns Promise resolving to the private key for an address.
   */
  exportAccount(password: string, address: string): Promise<string> {
    if (this.#keyring.password === password) {
      return this.#keyring.exportAccount(address);
    }
    throw new Error('Invalid password');
  }

  /**
   * Returns the public addresses of all accounts for the current keyring.
   *
   * @returns A promise resolving to an array of addresses.
   */
  getAccounts(): Promise<string[]> {
    return this.#keyring.getAccounts();
  }

  /**
   * Imports an account with the specified import strategy.
   *
   * @param strategy - Import strategy name.
   * @param args - Array of arguments to pass to the underlying stategy.
   * @throws Will throw when passed an unrecognized strategy.
   * @returns Promise resolving to current state when the import is complete.
   */
  async importAccountWithStrategy(
    strategy: AccountImportStrategy,
    args: any[],
  ): Promise<KeyringMemState> {
    let privateKey;
    switch (strategy) {
      case 'privateKey':
        const [importedKey] = args;
        if (!importedKey) {
          throw new Error('Cannot import an empty key.');
        }
        const prefixed = addHexPrefix(importedKey);

        let bufferedPrivateKey;
        try {
          bufferedPrivateKey = toBuffer(prefixed);
        } catch {
          throw new Error('Cannot import invalid private key.');
        }

        /* istanbul ignore if */
        if (!isValidPrivate(bufferedPrivateKey)) {
          throw new Error('Cannot import invalid private key.');
        }

        privateKey = stripHexPrefix(prefixed);
        break;
      case 'json':
        let wallet;
        const [input, password] = args;
        try {
          wallet = importers.fromEtherWallet(input, password);
        } catch (e) {
          wallet = wallet || (await Wallet.fromV3(input, password, true));
        }
        privateKey = bufferToHex(wallet.getPrivateKey());
        break;
      default:
        throw new Error(`Unexpected import strategy: '${strategy}'`);
    }
    const newKeyring = await this.#keyring.addNewKeyring(KeyringTypes.simple, [
      privateKey,
    ]);
    const accounts = await newKeyring.getAccounts();
    const allAccounts = await this.#keyring.getAccounts();
    this.updateIdentities(allAccounts);
    this.setSelectedAddress(accounts[0]);
    return this.fullUpdate();
  }

  /**
   * Removes an account from keyring state.
   *
   * @param address - Address of the account to remove.
   * @returns Promise resolving current state when this account removal completes.
   */
  async removeAccount(address: string): Promise<KeyringMemState> {
    this.removeIdentity(address);
    await this.#keyring.removeAccount(address);
    return this.fullUpdate();
  }

  /**
   * Deallocates all secrets and locks the wallet.
   *
   * @returns Promise resolving to current state.
   */
  setLocked(): Promise<KeyringMemState> {
    return this.#keyring.setLocked();
  }

  /**
   * Signs message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  signMessage(messageParams: PersonalMessageParams) {
    return this.#keyring.signMessage(messageParams);
  }

  /**
   * Signs personal message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  signPersonalMessage(messageParams: PersonalMessageParams) {
    return this.#keyring.signPersonalMessage(messageParams);
  }

  /**
   * Signs typed message by calling down into a specific keyring.
   *
   * @param messageParams - TypedMessageParams object to sign.
   * @param version - Compatibility version EIP712.
   * @throws Will throw when passed an unrecognized version.
   * @returns Promise resolving to a signed message string or an error if any.
   */
  async signTypedMessage(
    messageParams: TypedMessageParams,
    version: SignTypedDataVersion,
  ) {
    try {
      const address = normalizeAddress(messageParams.from);
      const qrKeyring = await this.getOrAddQRKeyring();
      const qrAccounts = await qrKeyring.getAccounts();
      if (
        qrAccounts.findIndex(
          (qrAddress: string) =>
            qrAddress.toLowerCase() === address.toLowerCase(),
        ) !== -1
      ) {
        const messageParamsClone = { ...messageParams };
        if (
          version !== SignTypedDataVersion.V1 &&
          typeof messageParamsClone.data === 'string'
        ) {
          messageParamsClone.data = JSON.parse(messageParamsClone.data);
        }
        return this.#keyring.signTypedMessage(messageParamsClone, { version });
      }

      const { password } = this.#keyring;
      const privateKey = await this.exportAccount(password, address);
      const privateKeyBuffer = toBuffer(addHexPrefix(privateKey));
      switch (version) {
        case SignTypedDataVersion.V1:
          // signTypedDataLegacy will throw if the data is invalid.
          return signTypedDataLegacy(privateKeyBuffer, {
            data: messageParams.data as any,
          });
        case SignTypedDataVersion.V3:
          return signTypedData(privateKeyBuffer, {
            data: JSON.parse(messageParams.data as string),
          });
        case SignTypedDataVersion.V4:
          return signTypedData_v4(privateKeyBuffer, {
            data: JSON.parse(messageParams.data as string),
          });
        default:
          throw new Error(`Unexpected signTypedMessage version: '${version}'`);
      }
    } catch (error) {
      throw new Error(`Keyring Controller signTypedMessage: ${error}`);
    }
  }

  /**
   * Signs a transaction by calling down into a specific keyring.
   *
   * @param transaction - Transaction object to sign. Must be a `ethereumjs-tx` transaction instance.
   * @param from - Address to sign from, should be in keychain.
   * @returns Promise resolving to a signed transaction string.
   */
  signTransaction(transaction: unknown, from: string) {
    return this.#keyring.signTransaction(transaction, from);
  }

  /**
   * Attempts to decrypt the current vault and load its keyrings.
   *
   * @param password - Password to unlock the keychain.
   * @returns Promise resolving to the current state.
   */
  async submitPassword(password: string): Promise<KeyringMemState> {
    await this.#keyring.submitPassword(password);
    const accounts = await this.#keyring.getAccounts();
    await this.syncIdentities(accounts);
    return this.fullUpdate();
  }

  /**
   * Adds new listener to be notified of state changes.
   *
   * @param listener - Callback triggered when state changes.
   */
  override subscribe(listener: Listener<KeyringState>) {
    this.#keyring.store.subscribe(listener);
  }

  /**
   * Removes existing listener from receiving state changes.
   *
   * @param listener - Callback to remove.
   * @returns True if a listener is found and unsubscribed.
   */
  override unsubscribe(listener: Listener<KeyringState>) {
    return this.#keyring.store.unsubscribe(listener);
  }

  /**
   * Adds new listener to be notified when the wallet is locked.
   *
   * @param listener - Callback triggered when wallet is locked.
   * @returns EventEmitter if listener added.
   */
  onLock(listener: () => void) {
    return this.#keyring.on('lock', listener);
  }

  /**
   * Adds new listener to be notified when the wallet is unlocked.
   *
   * @param listener - Callback triggered when wallet is unlocked.
   * @returns EventEmitter if listener added.
   */
  onUnlock(listener: () => void) {
    return this.#keyring.on('unlock', listener);
  }

  /**
   * Verifies the that the seed phrase restores the current keychain's accounts.
   *
   * @returns Whether the verification succeeds.
   */
  async verifySeedPhrase(): Promise<string> {
    const primaryKeyring = this.#keyring.getKeyringsByType(KeyringTypes.hd)[0];
    /* istanbul ignore if */
    if (!primaryKeyring) {
      throw new Error('No HD keyring found.');
    }

    const seedWords = (await primaryKeyring.serialize()).mnemonic;
    const accounts = await primaryKeyring.getAccounts();
    /* istanbul ignore if */
    if (accounts.length === 0) {
      throw new Error('Cannot verify an empty keyring.');
    }

    const TestKeyringClass = this.#keyring.getKeyringClassForType(
      KeyringTypes.hd,
    );
    const testKeyring = new TestKeyringClass({
      mnemonic: seedWords,
      numberOfAccounts: accounts.length,
    });
    const testAccounts = await testKeyring.getAccounts();
    /* istanbul ignore if */
    if (testAccounts.length !== accounts.length) {
      throw new Error('Seed phrase imported incorrect number of accounts.');
    }

    testAccounts.forEach((account: string, i: number) => {
      /* istanbul ignore if */
      if (account.toLowerCase() !== accounts[i].toLowerCase()) {
        throw new Error('Seed phrase imported different accounts.');
      }
    });

    return seedWords;
  }

  /**
   * Update keyrings in state and calls KeyringController fullUpdate method returning current state.
   *
   * @returns The current state.
   */
  async fullUpdate(): Promise<KeyringMemState> {
    const keyrings: Keyring[] = await Promise.all<Keyring>(
      this.#keyring.keyrings.map(
        async (keyring: KeyringObject, index: number): Promise<Keyring> => {
          const keyringAccounts = await keyring.getAccounts();
          const accounts = Array.isArray(keyringAccounts)
            ? keyringAccounts.map((address) => toChecksumHexAddress(address))
            : /* istanbul ignore next */ [];
          return {
            accounts,
            index,
            type: keyring.type,
          };
        },
      ),
    );
    this.update({ keyrings: [...keyrings] });
    return this.#keyring.fullUpdate();
  }

  // QR Hardware related methods

  /**
   * Add qr hardware keyring.
   *
   * @returns The added keyring
   */
  private async addQRKeyring(): Promise<QRKeyring> {
    const keyring = await this.#keyring.addNewKeyring(KeyringTypes.qr);
    await this.fullUpdate();
    return keyring;
  }

  /**
   * Get qr hardware keyring.
   *
   * @returns The added keyring
   */
  async getOrAddQRKeyring(): Promise<QRKeyring> {
    const keyring = this.#keyring.getKeyringsByType(KeyringTypes.qr)[0];
    return keyring || (await this.addQRKeyring());
  }

  async restoreQRKeyring(serialized: any): Promise<void> {
    (await this.getOrAddQRKeyring()).deserialize(serialized);
    this.updateIdentities(await this.#keyring.getAccounts());
    await this.fullUpdate();
  }

  async resetQRKeyringState(): Promise<void> {
    (await this.getOrAddQRKeyring()).resetStore();
  }

  async getQRKeyringState(): Promise<IQRKeyringState> {
    return (await this.getOrAddQRKeyring()).getMemStore();
  }

  async submitQRCryptoHDKey(cryptoHDKey: string): Promise<void> {
    (await this.getOrAddQRKeyring()).submitCryptoHDKey(cryptoHDKey);
  }

  async submitQRCryptoAccount(cryptoAccount: string): Promise<void> {
    (await this.getOrAddQRKeyring()).submitCryptoAccount(cryptoAccount);
  }

  async submitQRSignature(
    requestId: string,
    ethSignature: string,
  ): Promise<void> {
    (await this.getOrAddQRKeyring()).submitSignature(requestId, ethSignature);
  }

  async cancelQRSignRequest(): Promise<void> {
    (await this.getOrAddQRKeyring()).cancelSignRequest();
  }

  async connectQRHardware(
    page: number,
  ): Promise<{ balance: string; address: string; index: number }[]> {
    try {
      const keyring = await this.getOrAddQRKeyring();
      let accounts;
      switch (page) {
        case -1:
          accounts = await keyring.getPreviousPage();
          break;
        case 1:
          accounts = await keyring.getNextPage();
          break;
        default:
          accounts = await keyring.getFirstPage();
      }
      return accounts.map((account: any) => {
        return {
          ...account,
          balance: '0x0',
        };
      });
    } catch (e) {
      throw new Error(`Unspecified error when connect QR Hardware, ${e}`);
    }
  }

  async unlockQRHardwareWalletAccount(index: number): Promise<void> {
    const keyring = await this.getOrAddQRKeyring();

    keyring.setAccountToUnlock(index);
    const oldAccounts = await this.#keyring.getAccounts();
    await this.#keyring.addNewAccount(keyring);
    const newAccounts = await this.#keyring.getAccounts();
    this.updateIdentities(newAccounts);
    newAccounts.forEach((address: string) => {
      if (!oldAccounts.includes(address)) {
        if (this.setAccountLabel) {
          this.setAccountLabel(address, `${keyring.getName()} ${index}`);
        }
        this.setSelectedAddress(address);
      }
    });
    await this.#keyring.persistAllKeyrings();
    await this.fullUpdate();
  }

  async getAccountKeyringType(account: string): Promise<KeyringTypes> {
    return (await this.#keyring.getKeyringForAccount(account)).type;
  }

  async forgetQRDevice(): Promise<void> {
    const keyring = await this.getOrAddQRKeyring();
    keyring.forgetDevice();
    const accounts = (await this.#keyring.getAccounts()) as string[];
    accounts.forEach((account) => {
      this.setSelectedAddress(account);
    });
    await this.#keyring.persistAllKeyrings();
    await this.fullUpdate();
  }
}

export default KeyringController;
