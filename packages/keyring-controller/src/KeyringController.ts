import type { TxData, TypedTransaction } from '@ethereumjs/tx';
import type {
  MetaMaskKeyring as QRKeyring,
  IKeyringState as IQRKeyringState,
} from '@keystonehq/metamask-airgapped-keyring';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { KeyringController as EthKeyringController } from '@metamask/eth-keyring-controller';
import type {
  PersonalMessageParams,
  TypedMessageParams,
} from '@metamask/message-manager';
import type { PreferencesController } from '@metamask/preferences-controller';
import type { Eip1024EncryptedData, Hex, Keyring, Json } from '@metamask/utils';
import { assertIsStrictHexString, hasProperty } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import {
  addHexPrefix,
  bufferToHex,
  isValidPrivate,
  toBuffer,
  stripHexPrefix,
  getBinarySize,
} from 'ethereumjs-util';
import Wallet, { thirdparty as importers } from 'ethereumjs-wallet';
import type { Patch } from 'immer';

const name = 'KeyringController';

/**
 * Available keyring types
 */
export enum KeyringType {
  simple = 'Simple Key Pair',
  hd = 'HD Key Tree',
  qr = 'QR Hardware Wallet Device',
  trezor = 'Trezor Hardware',
  ledger = 'Ledger Hardware',
  lattice = 'Lattice Hardware',
  snap = 'Snap Keyring',
  custody = 'Custody',
}

export type KeyringTypes = `${KeyringType}` | '';

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
  keyrings: KeyringObject[];
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

export type KeyringControllerSignMessageAction = {
  type: `${typeof name}:signMessage`;
  handler: KeyringController['signMessage'];
};

export type KeyringControllerSignPersonalMessageAction = {
  type: `${typeof name}:signPersonalMessage`;
  handler: KeyringController['signPersonalMessage'];
};

export type KeyringControllerSignTypedMessageAction = {
  type: `${typeof name}:signTypedMessage`;
  handler: KeyringController['signTypedMessage'];
};

export type KeyringControllerDecryptMessageAction = {
  type: `${typeof name}:decryptMessage`;
  handler: KeyringController['decryptMessage'];
};

export type KeyringControllerGetEncryptionPublicKeyAction = {
  type: `${typeof name}:getEncryptionPublicKey`;
  handler: KeyringController['getEncryptionPublicKey'];
};

export type KeyringControllerGetKeyringsByTypeAction = {
  type: `${typeof name}:getKeyringsByType`;
  handler: KeyringController['getKeyringsByType'];
};

export type KeyringControllerGetKeyringForAccountAction = {
  type: `${typeof name}:getKeyringForAccount`;
  handler: KeyringController['getKeyringForAccount'];
};

export type KeyringControllerGetAccountsAction = {
  type: `${typeof name}:getAccounts`;
  handler: KeyringController['getAccounts'];
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

export type KeyringControllerQRKeyringStateChangeEvent = {
  type: `${typeof name}:qrKeyringStateChange`;
  payload: [ReturnType<IQRKeyringState['getState']>];
};

export type KeyringControllerActions =
  | KeyringControllerGetStateAction
  | KeyringControllerSignMessageAction
  | KeyringControllerSignPersonalMessageAction
  | KeyringControllerSignTypedMessageAction
  | KeyringControllerDecryptMessageAction
  | KeyringControllerGetEncryptionPublicKeyAction
  | KeyringControllerGetAccountsAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerGetKeyringForAccountAction;

export type KeyringControllerEvents =
  | KeyringControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | KeyringControllerAccountRemovedEvent
  | KeyringControllerQRKeyringStateChangeEvent;

export type KeyringControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  KeyringControllerActions,
  KeyringControllerEvents,
  string,
  string
>;

export type KeyringControllerOptions = {
  syncIdentities: PreferencesController['syncIdentities'];
  updateIdentities: PreferencesController['updateIdentities'];
  setSelectedAddress: PreferencesController['setSelectedAddress'];
  setAccountLabel?: PreferencesController['setAccountLabel'];
  encryptor?: any;
  keyringBuilders?: { (): Keyring<Json>; type: string }[];
  cacheEncryptionKey?: boolean;
  messenger: KeyringControllerMessenger;
  state?: { vault?: string };
};

/**
 * @type KeyringObject
 *
 * Keyring object to return in fullUpdate
 * @property type - Keyring type
 * @property accounts - Associated accounts
 */
export type KeyringObject = {
  accounts: string[];
  type: KeyringTypes;
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
  keyrings: [],
};

/**
 * Assert that the given keyring has an exportable
 * mnemonic.
 *
 * @param keyring - The keyring to check
 * @throws When the keyring does not have a mnemonic
 */
function assertHasUint8ArrayMnemonic(
  keyring: Keyring<Json>,
): asserts keyring is Keyring<Json> & { mnemonic: Uint8Array } {
  if (
    !(
      hasProperty(keyring, 'mnemonic') && keyring.mnemonic instanceof Uint8Array
    )
  ) {
    throw new Error("Can't get mnemonic bytes from keyring");
  }
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

  private readonly syncIdentities: PreferencesController['syncIdentities'];

  private readonly updateIdentities: PreferencesController['updateIdentities'];

  private readonly setSelectedAddress: PreferencesController['setSelectedAddress'];

  private readonly setAccountLabel?: PreferencesController['setAccountLabel'];

  #keyring: EthKeyringController;

  #qrKeyringStateListener?: (
    state: ReturnType<IQRKeyringState['getState']>,
  ) => void;

  /**
   * Creates a KeyringController instance.
   *
   * @param opts - Initial options used to configure this controller
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
    syncIdentities,
    updateIdentities,
    setSelectedAddress,
    setAccountLabel,
    encryptor,
    keyringBuilders,
    cacheEncryptionKey = false,
    messenger,
    state,
  }: KeyringControllerOptions) {
    super({
      name,
      metadata: {
        vault: { persist: true, anonymous: false },
        isUnlocked: { persist: false, anonymous: true },
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
      initState: state,
      encryptor,
      keyringBuilders,
      cacheEncryptionKey,
    });
    this.#keyring.memStore.subscribe(this.#fullUpdate.bind(this));
    this.#keyring.store.subscribe(this.#fullUpdate.bind(this));
    this.#keyring.on('lock', this.#handleLock.bind(this));
    this.#keyring.on('unlock', this.#handleUnlock.bind(this));

    this.syncIdentities = syncIdentities;
    this.updateIdentities = updateIdentities;
    this.setSelectedAddress = setSelectedAddress;
    this.setAccountLabel = setAccountLabel;

    this.#registerMessageHandlers();
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

    assertIsStrictHexString(addedAccountAddress);
    return {
      keyringState: this.#getMemState(),
      addedAccountAddress,
    };
  }

  /**
   * Adds a new account to the specified keyring.
   *
   * @param keyring - Keyring to add the account to.
   * @param accountCount - Number of accounts before adding a new one, used to make the method idempotent.
   * @returns Promise resolving to keyring current state and added account
   */
  async addNewAccountForKeyring(
    keyring: Keyring<Json>,
    accountCount?: number,
  ): Promise<Hex> {
    const oldAccounts = await this.getAccounts();

    if (accountCount && oldAccounts.length !== accountCount) {
      if (accountCount > oldAccounts.length) {
        throw new Error('Account out of sequence');
      }

      const existingAccount = oldAccounts[accountCount];
      assertIsStrictHexString(existingAccount);

      return existingAccount;
    }

    await this.#keyring.addNewAccount(keyring);
    const addedAccountAddress = (await this.getAccounts()).find(
      (selectedAddress) => !oldAccounts.includes(selectedAddress),
    );
    assertIsStrictHexString(addedAccountAddress);

    this.updateIdentities(await this.#keyring.getAccounts());

    return addedAccountAddress;
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
   * Adds a new keyring of the given `type`.
   *
   * @param type - Keyring type name.
   * @param opts - Keyring options.
   * @throws If a builder for the given `type` does not exist.
   * @returns Promise resolving to the added keyring.
   */
  async addNewKeyring(
    type: KeyringTypes | string,
    opts?: unknown,
  ): Promise<unknown> {
    if (type === KeyringType.qr) {
      return this.getOrAddQRKeyring();
    }

    return this.#keyring.addNewKeyring(type, opts);
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
  async exportSeedPhrase(password: string): Promise<Uint8Array> {
    await this.verifyPassword(password);
    assertHasUint8ArrayMnemonic(this.#keyring.keyrings[0]);
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
   * Get encryption public key.
   *
   * @param account - An account address.
   * @param opts - Additional encryption options.
   * @throws If the `account` does not exist or does not support the `getEncryptionPublicKey` method
   * @returns Promise resolving to encyption public key of the `account` if one exists.
   */
  async getEncryptionPublicKey(
    account: string,
    opts?: Record<string, unknown>,
  ): Promise<string> {
    return this.#keyring.getEncryptionPublicKey(account, opts);
  }

  /**
   * Attempts to decrypt the provided message parameters.
   *
   * @param messageParams - The decryption message parameters.
   * @param messageParams.from - The address of the account you want to use to decrypt the message.
   * @param messageParams.data - The encrypted data that you want to decrypt.
   * @returns The raw decryption result.
   */
  async decryptMessage(messageParams: {
    from: string;
    data: Eip1024EncryptedData;
  }): Promise<string> {
    return this.#keyring.decryptMessage(messageParams);
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
  async getKeyringForAccount(account: string): Promise<unknown> {
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
  getKeyringsByType(type: KeyringTypes | string): unknown[] {
    return this.#keyring.getKeyringsByType(type);
  }

  /**
   * Persist all serialized keyrings in the vault.
   *
   * @returns Promise resolving with `true` value when the
   * operation completes.
   */
  async persistAllKeyrings(): Promise<boolean> {
    return this.#keyring.persistAllKeyrings();
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
    const newKeyring = await this.#keyring.addNewKeyring(KeyringType.simple, [
      privateKey,
    ]);
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
    this.#unsubscribeFromQRKeyringsEvents();
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
  ): Promise<string> {
    try {
      if (
        ![
          SignTypedDataVersion.V1,
          SignTypedDataVersion.V3,
          SignTypedDataVersion.V4,
        ].includes(version)
      ) {
        throw new Error(`Unexpected signTypedMessage version: '${version}'`);
      }

      return await this.#keyring.signTypedMessage(
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
    } catch (error) {
      throw new Error(`Keyring Controller signTypedMessage: ${error}`);
    }
  }

  /**
   * Signs a transaction by calling down into a specific keyring.
   *
   * @param transaction - Transaction object to sign. Must be a `ethereumjs-tx` transaction instance.
   * @param from - Address to sign from, should be in keychain.
   * @param opts - An optional options object.
   * @returns Promise resolving to a signed transaction string.
   */
  signTransaction(
    transaction: TypedTransaction,
    from: string,
    opts?: Record<string, unknown>,
  ): Promise<TxData> {
    return this.#keyring.signTransaction(transaction, from, opts);
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

    const qrKeyring = this.getQRKeyring();
    if (qrKeyring) {
      // if there is a QR keyring, we need to subscribe
      // to its events after unlocking the vault
      this.#subscribeToQRKeyringEvents(qrKeyring);
    }

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

    const qrKeyring = this.getQRKeyring();
    if (qrKeyring) {
      // if there is a QR keyring, we need to subscribe
      // to its events after unlocking the vault
      this.#subscribeToQRKeyringEvents(qrKeyring);
    }

    await this.syncIdentities(accounts);
    return this.#getMemState();
  }

  /**
   * Verifies the that the seed phrase restores the current keychain's accounts.
   *
   * @returns Promise resolving to the seed phrase as Uint8Array.
   */
  async verifySeedPhrase(): Promise<Uint8Array> {
    const primaryKeyring = this.#keyring.getKeyringsByType(KeyringType.hd)[0];
    /* istanbul ignore if */
    if (!primaryKeyring) {
      throw new Error('No HD keyring found.');
    }

    assertHasUint8ArrayMnemonic(primaryKeyring);

    const seedWords = primaryKeyring.mnemonic;
    const accounts = await primaryKeyring.getAccounts();
    /* istanbul ignore if */
    if (accounts.length === 0) {
      throw new Error('Cannot verify an empty keyring.');
    }

    // The HD Keyring Builder is a default keyring builder
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const hdKeyringBuilder = this.#keyring.getKeyringBuilderForType(
      KeyringType.hd,
    )!;

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
   * Get QR Hardware keyring.
   *
   * @returns The QR Keyring if defined, otherwise undefined
   */
  getQRKeyring(): QRKeyring | undefined {
    // QRKeyring is not yet compatible with Keyring type from @metamask/utils
    return this.#keyring.getKeyringsByType(
      KeyringType.qr,
    )[0] as unknown as QRKeyring;
  }

  /**
   * Get QR hardware keyring. If it doesn't exist, add it.
   *
   * @returns The added keyring
   */
  async getOrAddQRKeyring(): Promise<QRKeyring> {
    return this.getQRKeyring() || (await this.#addQRKeyring());
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
    // QRKeyring is not yet compatible with Keyring from
    // @metamask/utils, but we can use the `addNewAccount` method
    // as it internally calls `addAccounts` from on the keyring instance,
    // which is supported by QRKeyring API.
    await this.#keyring.addNewAccount(keyring as unknown as Keyring<Json>);
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
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      `${name}:signMessage`,
      this.signMessage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:signPersonalMessage`,
      this.signPersonalMessage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:signTypedMessage`,
      this.signTypedMessage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:decryptMessage`,
      this.decryptMessage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:getEncryptionPublicKey`,
      this.getEncryptionPublicKey.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:getAccounts`,
      this.getAccounts.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:getKeyringsByType`,
      this.getKeyringsByType.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:getKeyringForAccount`,
      this.getKeyringForAccount.bind(this),
    );
  }

  /**
   * Add qr hardware keyring.
   *
   * @returns The added keyring
   * @throws If a QRKeyring builder is not provided
   * when initializing the controller
   */
  async #addQRKeyring(): Promise<QRKeyring> {
    // QRKeyring is not yet compatible with Keyring type from @metamask/utils
    const qrKeyring = (await this.#keyring.addNewKeyring(
      KeyringType.qr,
    )) as unknown as QRKeyring;

    this.#subscribeToQRKeyringEvents(qrKeyring);

    return qrKeyring;
  }

  /**
   * Subscribe to a QRKeyring state change events and
   * forward them through the messaging system.
   *
   * @param qrKeyring - The QRKeyring instance to subscribe to
   */
  #subscribeToQRKeyringEvents(qrKeyring: QRKeyring) {
    this.#qrKeyringStateListener = (state) => {
      this.messagingSystem.publish(`${name}:qrKeyringStateChange`, state);
    };

    qrKeyring.getMemStore().subscribe(this.#qrKeyringStateListener);
  }

  #unsubscribeFromQRKeyringsEvents() {
    const qrKeyrings = this.#keyring.getKeyringsByType(
      KeyringType.qr,
    ) as unknown as QRKeyring[];

    qrKeyrings.forEach((qrKeyring) => {
      if (this.#qrKeyringStateListener) {
        qrKeyring.getMemStore().unsubscribe(this.#qrKeyringStateListener);
      }
    });
  }

  /**
   * Sync controller state with current keyring store
   * and memStore states.
   *
   * @fires KeyringController:stateChange
   */
  #fullUpdate() {
    const { vault } = this.#keyring.store.getState();
    const { keyrings, isUnlocked, encryptionKey, encryptionSalt } =
      this.#keyring.memStore.getState();

    this.update(() => ({
      vault,
      keyrings,
      isUnlocked,
      encryptionKey,
      encryptionSalt,
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
    };
  }
}

export default KeyringController;
