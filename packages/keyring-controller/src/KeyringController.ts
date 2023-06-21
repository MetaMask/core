import {
  MetaMaskKeyring as QRKeyring,
  type IKeyringState as IQRKeyringState,
} from '@keystonehq/metamask-airgapped-keyring';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { KeyringController as EthKeyringController } from '@metamask/eth-keyring-controller';
import type {
  PersonalMessageParams,
  TypedMessageParams,
} from '@metamask/message-manager';
import type { PreferencesController } from '@metamask/preferences-controller';
import { Mutex } from 'async-mutex';
import {
  addHexPrefix,
  bufferToHex,
  isValidPrivate,
  toBuffer,
  stripHexPrefix,
  getBinarySize,
} from 'ethereumjs-util';
import { isValidHexAddress } from '@metamask/controller-utils';
import {
  type Hex,
  type Keyring as KeyringObject,
  type Json,
} from '@metamask/utils';
import {
  normalize as normalizeAddress,
  signTypedData,
} from '@metamask/eth-sig-util';
import Wallet, { thirdparty as importers } from 'ethereumjs-wallet';
import type { Patch } from 'immer';
import type { TxData, TypedTransaction } from '@ethereumjs/tx';

const name = 'KeyringController';

/**
 * Available keyring types
 */
export enum KeyringTypes {
  simple = 'Simple Key Pair',
  hd = 'HD Key Tree',
  qr = 'QR Hardware Wallet Device',
}

/**
 * @type KeyringControllerState
 *
 * Keyring controller state
 * @property vault - Encrypted string representing keyring data
 * @property isUnlocked - Whether vault is unlocked
 * @property keyringTypes - Account types
 * @property keyrings - Group of accounts
 * @property encryptionKey - Keyring encryption key
 * @property encryptionSalt - Keyring encryption salt
 */
export type KeyringControllerState = {
  vault?: string;
  isUnlocked: boolean;
  keyringTypes: string[];
  keyrings: Keyring[];
  encryptionKey?: string;
  encryptionSalt?: string;
};

export type KeyringControllerMemState = Omit<
  KeyringControllerState,
  'vault' | 'encryptionKey' | 'encryptionSalt'
>;

export type KeyringControllerGetStateAction = {
  type: `${typeof name}:getState`;
  handler: () => KeyringControllerState;
};

export type KeyringControllerStateChangeEvent = {
  type: `${typeof name}:stateChange`;
  payload: [KeyringControllerState, Patch[]];
};

export type KeyringControllerAccountRemovedEvent = {
  type: `${typeof name}:accountRemoved`;
  payload: [string];
};

export type KeyringControllerLockEvent = {
  type: `${typeof name}:lock`;
  payload: [];
};

export type KeyringControllerUnlockEvent = {
  type: `${typeof name}:unlock`;
  payload: [];
};

export type KeyringControllerActions = KeyringControllerGetStateAction;

export type KeyringControllerEvents =
  | KeyringControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | KeyringControllerAccountRemovedEvent;

export type KeyringControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  KeyringControllerActions,
  KeyringControllerEvents,
  string,
  string
>;

export type KeyringControllerOptions = {
  removeIdentity: PreferencesController['removeIdentity'];
  syncIdentities: PreferencesController['syncIdentities'];
  updateIdentities: PreferencesController['updateIdentities'];
  setSelectedAddress: PreferencesController['setSelectedAddress'];
  setAccountLabel?: PreferencesController['setAccountLabel'];
  encryptor?: any;
  keyringBuilders?:
    | { (): KeyringObject<Json>; type: string }
    | ConcatArray<{ (): KeyringObject<Json>; type: string }>;
  cacheEncryptionKey?: boolean;
  messenger: KeyringControllerMessenger;
  state?: Partial<KeyringControllerState>;
};

/**
 * @type Keyring
 *
 * Keyring object to return in fullUpdate
 * @property type - Keyring type
 * @property accounts - Associated accounts
 */
export type Keyring = {
  accounts: string[];
  type: string;
};

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

const defaultState: KeyringControllerState = {
  isUnlocked: false,
  keyringTypes: [],
  keyrings: [],
};

/**
 * Type guard for checking if a keyring has an exportable
 * mnemonic.
 *
 * @param keyring - The keyring to check
 * @returns Whether the keyring has a mnemonic
 */
function hasMnemonic(
  keyring: KeyringObject<Json>,
): keyring is KeyringObject<Json> & { mnemonic: unknown } {
  return 'mnemonic' in keyring;
}

/**
 * Type guard for checking if a keyring is a QRKeyring.
 * This is needed as currently `@keystonehq/metamask-airgapped-keyring`
 * is not compatible with the `Keyring` type from `@metamask/utils`.
 *
 * @param keyring - The keyring to check
 * @returns Whether the keyring is a QRKeyring
 */
function isQRKeyring(
  keyring: KeyringObject<Json> | QRKeyring,
): keyring is QRKeyring {
  return keyring instanceof QRKeyring;
}

/**
 * Controller responsible for establishing and managing user identity.
 *
 * This class is a wrapper around the `eth-keyring-controller` package. The
 * `eth-keyring-controller` manages the "vault", which is an encrypted store of private keys, and
 * it manages the wallet "lock" state. This wrapper class has convenience methods for interacting
 * with the internal keyring controller and handling certain complex operations that involve the
 * keyrings.
 */
export class KeyringController extends BaseControllerV2<
  typeof name,
  KeyringControllerState,
  KeyringControllerMessenger
> {
  private readonly mutex = new Mutex();

  private readonly removeIdentity: PreferencesController['removeIdentity'];

  private readonly syncIdentities: PreferencesController['syncIdentities'];

  private readonly updateIdentities: PreferencesController['updateIdentities'];

  private readonly setSelectedAddress: PreferencesController['setSelectedAddress'];

  private readonly setAccountLabel?: PreferencesController['setAccountLabel'];

  #keyring: EthKeyringController;

  /**
   * Creates a KeyringController instance.
   *
   * @param opts - Initial options used to configure this controller
   * @param opts.removeIdentity - Remove the identity with the given address.
   * @param opts.syncIdentities - Sync identities with the given list of addresses.
   * @param opts.updateIdentities - Generate an identity for each address given that doesn't already have an identity.
   * @param opts.setSelectedAddress - Set the selected address.
   * @param opts.setAccountLabel - Set a new name for account.
   * @param opts.encryptor - An optional object for defining encryption schemes.
   * @param opts.keyringBuilders - Set a new name for account.
   * @param opts.cacheEncryptionKey - Whether to cache or not encryption key.
   * @param opts.messenger - A restricted controller messenger.
   * @param opts.state - Initial state to set on this controller.
   */
  constructor({
    removeIdentity,
    syncIdentities,
    updateIdentities,
    setSelectedAddress,
    setAccountLabel,
    encryptor,
    keyringBuilders = [],
    cacheEncryptionKey = false,
    messenger,
    state,
  }: KeyringControllerOptions) {
    super({
      name,
      metadata: {
        vault: { persist: true, anonymous: false },
        isUnlocked: { persist: false, anonymous: true },
        keyringTypes: { persist: false, anonymous: false },
        keyrings: { persist: false, anonymous: false },
        encryptionKey: { persist: false, anonymous: false },
        encryptionSalt: { persist: false, anonymous: false },
      },
      messenger,
      state: {
        ...defaultState,
        ...state,
      },
    });

    this.#keyring = new EthKeyringController({
      // @ts-expect-error - This is a valid type
      initState: state,
      encryptor,
      keyringBuilders,
      cacheEncryptionKey,
    });
    this.#keyring.memStore.subscribe(this.#fullUpdate.bind(this));
    this.#keyring.store.subscribe(this.#fullUpdate.bind(this));
    this.#keyring.on('lock', this.#handleLock.bind(this));
    this.#keyring.on('unlock', this.#handleUnlock.bind(this));

    this.removeIdentity = removeIdentity;
    this.syncIdentities = syncIdentities;
    this.updateIdentities = updateIdentities;
    this.setSelectedAddress = setSelectedAddress;
    this.setAccountLabel = setAccountLabel;
  }

  /**
   * Adds a new account to the default (first) HD seed phrase keyring.
   *
   * @param accountCount - Number of accounts before adding a new one, used to
   * make the method idempotent.
   * @returns Promise resolving to keyring current state and added account
   * address.
   */
  async addNewAccount(accountCount?: number): Promise<{
    keyringState: KeyringControllerMemState;
    addedAccountAddress: string;
  }> {
    const primaryKeyring = this.#keyring.getKeyringsByType('HD Key Tree')[0];
    /* istanbul ignore if */
    if (!primaryKeyring) {
      throw new Error('No HD keyring found');
    }
    const oldAccounts = await this.#keyring.getAccounts();

    if (accountCount && oldAccounts.length !== accountCount) {
      if (accountCount > oldAccounts.length) {
        throw new Error('Account out of sequence');
      }
      // we return the account already existing at index `accountCount`
      const primaryKeyringAccounts = await primaryKeyring.getAccounts();
      return {
        keyringState: this.#getMemState(),
        addedAccountAddress: primaryKeyringAccounts[accountCount],
      };
    }

    await this.#keyring.addNewAccount(primaryKeyring);
    const newAccounts = await this.#keyring.getAccounts();

    await this.verifySeedPhrase();

    this.updateIdentities(newAccounts);
    const addedAccountAddress = newAccounts.find(
      (selectedAddress: string) => !oldAccounts.includes(selectedAddress),
    );

    if (!addedAccountAddress) {
      throw new Error('Could not find added account');
    }
    return {
      keyringState: this.#getMemState(),
      addedAccountAddress,
    };
  }

  /**
   * Adds a new account to the default (first) HD seed phrase keyring without updating identities in preferences.
   *
   * @returns Promise resolving to current state when the account is added.
   */
  async addNewAccountWithoutUpdate(): Promise<KeyringControllerMemState> {
    const primaryKeyring = this.#keyring.getKeyringsByType('HD Key Tree')[0];
    /* istanbul ignore if */
    if (!primaryKeyring) {
      throw new Error('No HD keyring found');
    }
    await this.#keyring.addNewAccount(primaryKeyring);
    await this.verifySeedPhrase();
    return this.#getMemState();
  }

  /**
   * Effectively the same as creating a new keychain then populating it
   * using the given seed phrase.
   *
   * @param password - Password to unlock keychain.
   * @param seed - A BIP39-compliant seed phrase as Uint8Array,
   * either as a string or an array of UTF-8 bytes that represent the string.
   * @returns Promise resolving to the restored keychain object.
   */
  async createNewVaultAndRestore(
    password: string,
    seed: Uint8Array,
  ): Promise<KeyringControllerMemState> {
    const releaseLock = await this.mutex.acquire();
    if (!password || !password.length) {
      throw new Error('Invalid password');
    }

    try {
      this.updateIdentities([]);
      await this.#keyring.createNewVaultAndRestore(password, seed);
      this.updateIdentities(await this.#keyring.getAccounts());
      return this.#getMemState();
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
      const accounts = await this.getAccounts();
      if (!accounts.length) {
        await this.#keyring.createNewVaultAndKeychain(password);
        this.updateIdentities(await this.getAccounts());
      }
      return this.#getMemState();
    } finally {
      releaseLock();
    }
  }

  /**
   * Method to verify a given password validity. Throws an
   * error if the password is invalid.
   *
   * @param password - Password of the keyring.
   */
  async verifyPassword(password: string) {
    await this.#keyring.verifyPassword(password);
  }

  /**
   * Returns the status of the vault.
   *
   * @returns Boolean returning true if the vault is unlocked.
   */
  isUnlocked(): boolean {
    return this.state.isUnlocked;
  }

  /**
   * Gets the seed phrase of the HD keyring.
   *
   * @param password - Password of the keyring.
   * @returns Promise resolving to the seed phrase.
   */
  async exportSeedPhrase(password: string): Promise<unknown> {
    await this.verifyPassword(password);
    if (!hasMnemonic(this.#keyring.keyrings[0])) {
      throw new Error(`Can't get seed phrase from HD Key Tree`);
    }
    return this.#keyring.keyrings[0].mnemonic;
  }

  /**
   * Gets the private key from the keyring controlling an address.
   *
   * @param password - Password of the keyring.
   * @param address - Address to export.
   * @returns Promise resolving to the private key for an address.
   */
  async exportAccount(password: string, address: string): Promise<string> {
    await this.verifyPassword(password);
    return this.#keyring.exportAccount(address);
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
   * Returns the currently initialized keyring that manages
   * the specified `address` if one exists.
   *
   * @deprecated Use of this method is discouraged as actions executed directly on
   * keyrings are not being reflected in the KeyringController state and not
   * persisted in the vault.
   * @param account - An account address.
   * @returns Promise resolving to keyring of the `account` if one exists.
   */
  async getKeyringForAccount(account: string): Promise<KeyringObject<Json>> {
    return this.#keyring.getKeyringForAccount(account);
  }

  /**
   * Returns all keyrings of the given type.
   *
   * @deprecated Use of this method is discouraged as actions executed directly on
   * keyrings are not being reflected in the KeyringController state and not
   * persisted in the vault.
   * @param type - Keyring type name.
   * @returns An array of keyrings of the given type.
   */
  getKeyringsByType(type: KeyringTypes | string): KeyringObject<Json>[] {
    return this.#keyring.getKeyringsByType(type);
  }

  /**
   * Imports an account with the specified import strategy.
   *
   * @param strategy - Import strategy name.
   * @param args - Array of arguments to pass to the underlying stategy.
   * @throws Will throw when passed an unrecognized strategy.
   * @returns Promise resolving to keyring current state and imported account
   * address.
   */
  async importAccountWithStrategy(
    strategy: AccountImportStrategy,
    args: any[],
  ): Promise<{
    keyringState: KeyringControllerMemState;
    importedAccountAddress: string;
  }> {
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
        if (
          !isValidPrivate(bufferedPrivateKey) ||
          // ensures that the key is 64 bytes long
          getBinarySize(prefixed) !== 64 + '0x'.length
        ) {
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
    const newKeyring = await this.#keyring.addNewKeyring(KeyringTypes.simple, {
      privateKeys: [privateKey],
    });
    const accounts = await newKeyring.getAccounts();
    const allAccounts = await this.#keyring.getAccounts();
    this.updateIdentities(allAccounts);
    return {
      keyringState: this.#getMemState(),
      importedAccountAddress: accounts[0],
    };
  }

  /**
   * Removes an account from keyring state.
   *
   * @param address - Address of the account to remove.
   * @fires KeyringController:accountRemoved
   * @returns Promise resolving current state when this account removal completes.
   */
  async removeAccount(address: Hex): Promise<KeyringControllerMemState> {
    this.removeIdentity(address);
    await this.#keyring.removeAccount(address);
    this.messagingSystem.publish(`${name}:accountRemoved`, address);
    return this.#getMemState();
  }

  /**
   * Deallocates all secrets and locks the wallet.
   *
   * @returns Promise resolving to current state.
   */
  async setLocked(): Promise<KeyringControllerMemState> {
    await this.#keyring.setLocked();
    return this.#getMemState();
  }

  /**
   * Signs message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  signMessage(messageParams: PersonalMessageParams) {
    if (!messageParams.data) {
      throw new Error("Can't sign an empty message");
    }
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
      if (!address || !isValidHexAddress(address)) {
        throw new Error(
          `Missing or invalid address ${JSON.stringify(messageParams.from)}`,
        );
      }

      if ((await this.getAccountKeyringType(address)) === KeyringTypes.qr) {
        const qrKeyring = await this.getOrAddQRKeyring();
        const qrAccounts = await qrKeyring.getAccounts();
        if (
          qrAccounts.findIndex(
            (qrAddress: string) =>
              qrAddress.toLowerCase() === address.toLowerCase(),
          ) !== -1
        ) {
          return this.#keyring.signTypedMessage(
            {
              from: messageParams.from,
              data:
                version !== SignTypedDataVersion.V1 &&
                typeof messageParams.data === 'string'
                  ? JSON.parse(messageParams.data)
                  : messageParams.data,
            },
            { version },
          );
        }
      }

      if (!this.#keyring.password) {
        throw new Error('Keyring must be unlocked to sign typed message.');
      }
      const privateKey = await this.exportAccount(
        this.#keyring.password,
        address,
      );
      const privateKeyBuffer = toBuffer(addHexPrefix(privateKey));
      switch (version) {
        case SignTypedDataVersion.V1:
          return signTypedData({
            privateKey: privateKeyBuffer,
            data: messageParams.data as any,
            version: SignTypedDataVersion.V1,
          });
        case SignTypedDataVersion.V3:
          return signTypedData({
            privateKey: privateKeyBuffer,
            data: JSON.parse(messageParams.data as string),
            version: SignTypedDataVersion.V3,
          });
        case SignTypedDataVersion.V4:
          return signTypedData({
            privateKey: privateKeyBuffer,
            data: JSON.parse(messageParams.data as string),
            version: SignTypedDataVersion.V4,
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
  signTransaction(
    transaction: TypedTransaction,
    from: string,
  ): Promise<TxData> {
    return this.#keyring.signTransaction(transaction, from);
  }

  /**
   * Attempts to decrypt the current vault and load its keyrings,
   * using the given encryption key and salt.
   *
   * @param encryptionKey - Key to unlock the keychain.
   * @param encryptionSalt - Salt to unlock the keychain.
   * @returns Promise resolving to the current state.
   */
  async submitEncryptionKey(
    encryptionKey: string,
    encryptionSalt: string,
  ): Promise<KeyringControllerMemState> {
    await this.#keyring.submitEncryptionKey(encryptionKey, encryptionSalt);
    return this.#getMemState();
  }

  /**
   * Attempts to decrypt the current vault and load its keyrings,
   * using the given password.
   *
   * @param password - Password to unlock the keychain.
   * @returns Promise resolving to the current state.
   */
  async submitPassword(password: string): Promise<KeyringControllerMemState> {
    await this.#keyring.submitPassword(password);
    const accounts = await this.#keyring.getAccounts();
    await this.syncIdentities(accounts);
    return this.#getMemState();
  }

  /**
   * Verifies the that the seed phrase restores the current keychain's accounts.
   *
   * @returns Promise resolving to the seed phrase as Uint8Array.
   */
  async verifySeedPhrase(): Promise<Uint8Array> {
    const primaryKeyring = this.#keyring.getKeyringsByType(KeyringTypes.hd)[0];
    /* istanbul ignore if */
    if (!primaryKeyring) {
      throw new Error('No HD keyring found.');
    }

    if (!hasMnemonic(primaryKeyring)) {
      throw new Error('Cannot find HD keyring seed phrase.');
    }
    const seedWords = primaryKeyring.mnemonic as Uint8Array;
    const accounts = await primaryKeyring.getAccounts();
    /* istanbul ignore if */
    if (accounts.length === 0) {
      throw new Error('Cannot verify an empty keyring.');
    }

    const hdKeyringBuilder = this.#keyring.getKeyringBuilderForType(
      KeyringTypes.hd,
    );
    if (!hdKeyringBuilder) {
      throw new Error('Cannot find HD keyring builder.');
    }

    const hdKeyring = hdKeyringBuilder();
    // @ts-expect-error @metamask/eth-hd-keyring correctly handles
    // Uint8Array seed phrases in the `deserialize` method.
    hdKeyring.deserialize({
      mnemonic: seedWords,
      numberOfAccounts: accounts.length,
    });
    const testAccounts = await hdKeyring.getAccounts();
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

  // QR Hardware related methods

  /**
   * Add qr hardware keyring.
   *
   * @returns The added keyring
   * @throws If a QRKeyring builder is not provided
   * when initializing the controller
   */
  private async addQRKeyring(): Promise<KeyringObject<Json>> {
    return this.#keyring.addNewKeyring(KeyringTypes.qr);
  }

  /**
   * Get qr hardware keyring.
   *
   * @returns The added keyring
   */
  async getOrAddQRKeyring(): Promise<QRKeyring> {
    const keyring =
      this.#keyring.getKeyringsByType(KeyringTypes.qr)[0] ||
      (await this.addQRKeyring());

    if (!isQRKeyring(keyring)) {
      throw new Error('QR keyring not found');
    }
    return keyring;
  }

  async restoreQRKeyring(serialized: any): Promise<void> {
    (await this.getOrAddQRKeyring()).deserialize(serialized);
    await this.#keyring.persistAllKeyrings();
    this.updateIdentities(await this.#keyring.getAccounts());
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

  /**
   * Cancels qr keyring sync.
   */
  async cancelQRSynchronization(): Promise<void> {
    // eslint-disable-next-line n/no-sync
    (await this.getOrAddQRKeyring()).cancelSync();
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
      // TODO: Add test case for when keyring throws
      /* istanbul ignore next */
      throw new Error(`Unspecified error when connect QR Hardware, ${e}`);
    }
  }

  async unlockQRHardwareWalletAccount(index: number): Promise<void> {
    const keyring = await this.getOrAddQRKeyring();

    keyring.setAccountToUnlock(index);
    const oldAccounts = await this.#keyring.getAccounts();
    await this.#keyring.addNewAccount(
      keyring as unknown as KeyringObject<Json>,
    );
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
  }

  async getAccountKeyringType(account: string): Promise<string> {
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
  }

  /**
   * Sync controller state with current keyring store
   * and memStore states.
   *
   * @fires KeyringController:stateChange
   */
  #fullUpdate() {
    this.update(() => ({
      ...this.#keyring.store.getState(),
      ...this.#keyring.memStore.getState(),
    }));
  }

  /**
   * Handle keyring lock event.
   *
   * @fires KeyringController:lock
   */
  #handleLock() {
    this.messagingSystem.publish(`${name}:lock`);
  }

  /**
   * Handle keyring unlock event.
   *
   * @fires KeyringController:unlock
   */
  #handleUnlock() {
    this.messagingSystem.publish(`${name}:unlock`);
  }

  #getMemState(): KeyringControllerMemState {
    return {
      isUnlocked: this.state.isUnlocked,
      keyrings: this.state.keyrings,
      keyringTypes: this.state.keyringTypes,
    };
  }
}

export default KeyringController;
