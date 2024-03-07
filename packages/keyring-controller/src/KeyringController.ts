import type { TxData, TypedTransaction } from '@ethereumjs/tx';
import { isValidPrivate, toBuffer, getBinarySize } from '@ethereumjs/util';
import type {
  MetaMaskKeyring as QRKeyring,
  IKeyringState as IQRKeyringState,
} from '@keystonehq/metamask-airgapped-keyring';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import * as encryptorUtils from '@metamask/browser-passworder';
import HDKeyring from '@metamask/eth-hd-keyring';
import { normalize } from '@metamask/eth-sig-util';
import SimpleKeyring from '@metamask/eth-simple-keyring';
import type {
  EthBaseTransaction,
  EthBaseUserOperation,
  EthKeyring,
  EthUserOperation,
  EthUserOperationPatch,
} from '@metamask/keyring-api';
import type {
  PersonalMessageParams,
  TypedMessageParams,
} from '@metamask/message-manager';
import type {
  Eip1024EncryptedData,
  Hex,
  Json,
  KeyringClass,
} from '@metamask/utils';
import {
  add0x,
  assertIsStrictHexString,
  bytesToHex,
  hasProperty,
  isObject,
  isValidHexAddress,
  isValidJson,
  remove0x,
} from '@metamask/utils';
import { Mutex } from 'async-mutex';
import Wallet, { thirdparty as importers } from 'ethereumjs-wallet';
import type { Patch } from 'immer';

import { KeyringControllerError } from './constants';

const name = 'KeyringController';

/**
 * Available keyring types
 */
export enum KeyringTypes {
  simple = 'Simple Key Pair',
  hd = 'HD Key Tree',
  qr = 'QR Hardware Wallet Device',
  trezor = 'Trezor Hardware',
  ledger = 'Ledger Hardware',
  lattice = 'Lattice Hardware',
  snap = 'Snap Keyring',
}

/**
 * Custody keyring types are a special case, as they are not a single type
 * but they all start with the prefix "Custody".
 * @param keyringType - The type of the keyring.
 * @returns Whether the keyring type is a custody keyring.
 */
export const isCustodyKeyring = (keyringType: string): boolean => {
  return keyringType.startsWith('Custody');
};

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

export type KeyringControllerPersistAllKeyringsAction = {
  type: `${typeof name}:persistAllKeyrings`;
  handler: KeyringController['persistAllKeyrings'];
};

export type KeyringControllerPrepareUserOperationAction = {
  type: `${typeof name}:prepareUserOperation`;
  handler: KeyringController['prepareUserOperation'];
};

export type KeyringControllerPatchUserOperationAction = {
  type: `${typeof name}:patchUserOperation`;
  handler: KeyringController['patchUserOperation'];
};

export type KeyringControllerSignUserOperationAction = {
  type: `${typeof name}:signUserOperation`;
  handler: KeyringController['signUserOperation'];
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
  | KeyringControllerGetKeyringForAccountAction
  | KeyringControllerPersistAllKeyringsAction
  | KeyringControllerPrepareUserOperationAction
  | KeyringControllerPatchUserOperationAction
  | KeyringControllerSignUserOperationAction;

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
  never,
  never
>;

export type KeyringControllerOptions = {
  keyringBuilders?: { (): EthKeyring<Json>; type: string }[];
  messenger: KeyringControllerMessenger;
  state?: { vault?: string };
} & (
  | {
      cacheEncryptionKey: true;
      encryptor?: ExportableKeyEncryptor;
    }
  | {
      cacheEncryptionKey?: false;
      encryptor?: GenericEncryptor | ExportableKeyEncryptor;
    }
);

/**
 * @type KeyringObject
 *
 * Keyring object to return in fullUpdate
 * @property type - Keyring type
 * @property accounts - Associated accounts
 */
export type KeyringObject = {
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

/**
 * A serialized keyring object.
 */
export type SerializedKeyring = {
  type: string;
  data: Json;
};

/**
 * A generic encryptor interface that supports encrypting and decrypting
 * serializable data with a password.
 */
export type GenericEncryptor = {
  /**
   * Encrypts the given object with the given password.
   *
   * @param password - The password to encrypt with.
   * @param object - The object to encrypt.
   * @returns The encrypted string.
   */
  encrypt: (password: string, object: Json) => Promise<string>;
  /**
   * Decrypts the given encrypted string with the given password.
   *
   * @param password - The password to decrypt with.
   * @param encryptedString - The encrypted string to decrypt.
   * @returns The decrypted object.
   */
  decrypt: (password: string, encryptedString: string) => Promise<unknown>;
  /**
   * Optional vault migration helper. Checks if the provided vault is up to date
   * with the desired encryption algorithm.
   *
   * @param vault - The encrypted string to check.
   * @param targetDerivationParams - The desired target derivation params.
   * @returns The updated encrypted string.
   */
  isVaultUpdated?: (
    vault: string,
    targetDerivationParams?: encryptorUtils.KeyDerivationOptions,
  ) => boolean;
};

/**
 * An encryptor interface that supports encrypting and decrypting
 * serializable data with a password, and exporting and importing keys.
 */
export type ExportableKeyEncryptor = GenericEncryptor & {
  /**
   * Encrypts the given object with the given encryption key.
   *
   * @param key - The encryption key to encrypt with.
   * @param object - The object to encrypt.
   * @returns The encryption result.
   */
  encryptWithKey: (
    key: unknown,
    object: Json,
  ) => Promise<encryptorUtils.EncryptionResult>;
  /**
   * Encrypts the given object with the given password, and returns the
   * encryption result and the exported key string.
   *
   * @param password - The password to encrypt with.
   * @param object - The object to encrypt.
   * @param salt - The optional salt to use for encryption.
   * @returns The encrypted string and the exported key string.
   */
  encryptWithDetail: (
    password: string,
    object: Json,
    salt?: string,
  ) => Promise<encryptorUtils.DetailedEncryptionResult>;
  /**
   * Decrypts the given encrypted string with the given encryption key.
   *
   * @param key - The encryption key to decrypt with.
   * @param encryptedString - The encrypted string to decrypt.
   * @returns The decrypted object.
   */
  decryptWithKey: (key: unknown, encryptedString: string) => Promise<unknown>;
  /**
   * Decrypts the given encrypted string with the given password, and returns
   * the decrypted object and the salt and exported key string used for
   * encryption.
   *
   * @param password - The password to decrypt with.
   * @param encryptedString - The encrypted string to decrypt.
   * @returns The decrypted object and the salt and exported key string used for
   * encryption.
   */
  decryptWithDetail: (
    password: string,
    encryptedString: string,
  ) => Promise<encryptorUtils.DetailedDecryptResult>;
  /**
   * Generates an encryption key from exported key string.
   *
   * @param key - The exported key string.
   * @returns The encryption key.
   */
  importKey: (key: string) => Promise<unknown>;
};

/**
 * Get builder function for `Keyring`
 *
 * Returns a builder function for `Keyring` with a `type` property.
 *
 * @param KeyringConstructor - The Keyring class for the builder.
 * @returns A builder function for the given Keyring.
 */
export function keyringBuilderFactory(KeyringConstructor: KeyringClass<Json>) {
  const builder = () => new KeyringConstructor();

  builder.type = KeyringConstructor.type;

  return builder;
}

const defaultKeyringBuilders = [
  keyringBuilderFactory(SimpleKeyring),
  keyringBuilderFactory(HDKeyring),
];

export const getDefaultKeyringState = (): KeyringControllerState => {
  return {
    isUnlocked: false,
    keyrings: [],
  };
};

/**
 * Assert that the given keyring has an exportable
 * mnemonic.
 *
 * @param keyring - The keyring to check
 * @throws When the keyring does not have a mnemonic
 */
function assertHasUint8ArrayMnemonic(
  keyring: EthKeyring<Json>,
): asserts keyring is EthKeyring<Json> & { mnemonic: Uint8Array } {
  if (
    !(
      hasProperty(keyring, 'mnemonic') && keyring.mnemonic instanceof Uint8Array
    )
  ) {
    throw new Error("Can't get mnemonic bytes from keyring");
  }
}

/**
 * Assert that the provided encryptor supports
 * encryption and encryption key export.
 *
 * @param encryptor - The encryptor to check.
 * @throws If the encryptor does not support key encryption.
 */
function assertIsExportableKeyEncryptor(
  encryptor: GenericEncryptor | ExportableKeyEncryptor,
): asserts encryptor is ExportableKeyEncryptor {
  if (
    !(
      'importKey' in encryptor &&
      typeof encryptor.importKey === 'function' &&
      'decryptWithKey' in encryptor &&
      typeof encryptor.decryptWithKey === 'function' &&
      'encryptWithKey' in encryptor &&
      typeof encryptor.encryptWithKey === 'function'
    )
  ) {
    throw new Error(KeyringControllerError.UnsupportedEncryptionKeyExport);
  }
}

/**
 * Checks if the provided value is a serialized keyrings array.
 *
 * @param array - The value to check.
 * @returns True if the value is a serialized keyrings array.
 */
function isSerializedKeyringsArray(
  array: unknown,
): array is SerializedKeyring[] {
  return (
    typeof array === 'object' &&
    Array.isArray(array) &&
    array.every((value) => value.type && isValidJson(value.data))
  );
}

/**
 * Display For Keyring
 *
 * Is used for adding the current keyrings to the state object.
 *
 * @param keyring - The keyring to display.
 * @returns A keyring display object, with type and accounts properties.
 */
async function displayForKeyring(
  keyring: EthKeyring<Json>,
): Promise<{ type: string; accounts: string[] }> {
  const accounts = await keyring.getAccounts();

  return {
    type: keyring.type,
    // Cast to `Hex[]` here is safe here because `accounts` has no nullish
    // values, and `normalize` returns `Hex` unless given a nullish value
    accounts: accounts.map(normalize) as Hex[],
  };
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
export class KeyringController extends BaseController<
  typeof name,
  KeyringControllerState,
  KeyringControllerMessenger
> {
  private readonly mutex = new Mutex();

  #keyringBuilders: { (): EthKeyring<Json>; type: string }[];

  #keyrings: EthKeyring<Json>[];

  #unsupportedKeyrings: SerializedKeyring[];

  #password?: string;

  #encryptor: GenericEncryptor | ExportableKeyEncryptor;

  #cacheEncryptionKey: boolean;

  #qrKeyringStateListener?: (
    state: ReturnType<IQRKeyringState['getState']>,
  ) => void;

  /**
   * Creates a KeyringController instance.
   *
   * @param options - Initial options used to configure this controller
   * @param options.encryptor - An optional object for defining encryption schemes.
   * @param options.keyringBuilders - Set a new name for account.
   * @param options.cacheEncryptionKey - Whether to cache or not encryption key.
   * @param options.messenger - A restricted controller messenger.
   * @param options.state - Initial state to set on this controller.
   */
  constructor(options: KeyringControllerOptions) {
    const {
      encryptor = encryptorUtils,
      keyringBuilders,
      messenger,
      state,
    } = options;

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
        ...getDefaultKeyringState(),
        ...state,
      },
    });

    this.#keyringBuilders = keyringBuilders
      ? defaultKeyringBuilders.concat(keyringBuilders)
      : defaultKeyringBuilders;

    this.#encryptor = encryptor;
    this.#keyrings = [];
    this.#unsupportedKeyrings = [];

    // This option allows the controller to cache an exported key
    // for use in decrypting and encrypting data without password
    this.#cacheEncryptionKey = Boolean(options.cacheEncryptionKey);
    if (this.#cacheEncryptionKey) {
      assertIsExportableKeyEncryptor(encryptor);
    }

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
    const primaryKeyring = this.getKeyringsByType('HD Key Tree')[0] as
      | EthKeyring<Json>
      | undefined;
    if (!primaryKeyring) {
      throw new Error('No HD keyring found');
    }
    const oldAccounts = await this.getAccounts();

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

    const addedAccountAddress = await this.addNewAccountForKeyring(
      primaryKeyring,
    );
    await this.verifySeedPhrase();

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
    keyring: EthKeyring<Json>,
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

    await keyring.addAccounts(1);
    await this.persistAllKeyrings();

    const addedAccountAddress = (await this.getAccounts()).find(
      (selectedAddress) => !oldAccounts.includes(selectedAddress),
    );
    assertIsStrictHexString(addedAccountAddress);

    return addedAccountAddress;
  }

  /**
   * Adds a new account to the default (first) HD seed phrase keyring without updating identities in preferences.
   *
   * @returns Promise resolving to current state when the account is added.
   */
  async addNewAccountWithoutUpdate(): Promise<KeyringControllerMemState> {
    const primaryKeyring = this.getKeyringsByType('HD Key Tree')[0] as
      | EthKeyring<Json>
      | undefined;
    if (!primaryKeyring) {
      throw new Error('No HD keyring found');
    }
    await primaryKeyring.addAccounts(1);
    await this.persistAllKeyrings();
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
      await this.#createNewVaultWithKeyring(password, {
        type: KeyringTypes.hd,
        opts: {
          mnemonic: seed,
          numberOfAccounts: 1,
        },
      });
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
        await this.#createNewVaultWithKeyring(password, {
          type: KeyringTypes.hd,
        });
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
    if (type === KeyringTypes.qr) {
      return this.getOrAddQRKeyring();
    }

    const keyring = await this.#newKeyring(type, opts);

    if (type === KeyringTypes.hd && (!isObject(opts) || !opts.mnemonic)) {
      if (!keyring.generateRandomMnemonic) {
        throw new Error(
          KeyringControllerError.UnsupportedGenerateRandomMnemonic,
        );
      }

      keyring.generateRandomMnemonic();
      await keyring.addAccounts(1);
    }

    const accounts = await keyring.getAccounts();
    await this.#checkForDuplicate(type, accounts);

    this.#keyrings.push(keyring);
    await this.persistAllKeyrings();

    return keyring;
  }

  /**
   * Method to verify a given password validity. Throws an
   * error if the password is invalid.
   *
   * @param password - Password of the keyring.
   */
  async verifyPassword(password: string) {
    if (!this.state.vault) {
      throw new Error(KeyringControllerError.VaultError);
    }
    await this.#encryptor.decrypt(password, this.state.vault);
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
    assertHasUint8ArrayMnemonic(this.#keyrings[0]);
    return this.#keyrings[0].mnemonic;
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

    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;
    if (!keyring.exportAccount) {
      throw new Error(KeyringControllerError.UnsupportedExportAccount);
    }

    return await keyring.exportAccount(normalize(address) as Hex);
  }

  /**
   * Returns the public addresses of all accounts for the current keyring.
   *
   * @returns A promise resolving to an array of addresses.
   */
  async getAccounts(): Promise<string[]> {
    const keyrings = this.#keyrings;

    const keyringArrays = await Promise.all(
      keyrings.map(async (keyring) => keyring.getAccounts()),
    );
    const addresses = keyringArrays.reduce((res, arr) => {
      return res.concat(arr);
    }, []);

    // Cast to `Hex[]` here is safe here because `addresses` has no nullish
    // values, and `normalize` returns `Hex` unless given a nullish value
    return addresses.map(normalize) as Hex[];
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
    const normalizedAddress = normalize(account) as Hex;
    const keyring = (await this.getKeyringForAccount(
      account,
    )) as EthKeyring<Json>;
    if (!keyring.getEncryptionPublicKey) {
      throw new Error(KeyringControllerError.UnsupportedGetEncryptionPublicKey);
    }

    return await keyring.getEncryptionPublicKey(normalizedAddress, opts);
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
    const address = normalize(messageParams.from) as Hex;
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;
    if (!keyring.decryptMessage) {
      throw new Error(KeyringControllerError.UnsupportedDecryptMessage);
    }

    return keyring.decryptMessage(address, messageParams.data);
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
    // Cast to `Hex` here is safe here because `address` is not nullish.
    // `normalizeToHex` returns `Hex` unless given a nullish value.
    const hexed = normalize(account) as Hex;

    const candidates = await Promise.all(
      this.#keyrings.map(async (keyring) => {
        return Promise.all([keyring, keyring.getAccounts()]);
      }),
    );

    const winners = candidates.filter((candidate) => {
      const accounts = candidate[1].map(normalize);
      return accounts.includes(hexed);
    });

    if (winners.length && winners[0]?.length) {
      return winners[0][0];
    }

    // Adding more info to the error
    let errorInfo = '';
    if (!isValidHexAddress(hexed)) {
      errorInfo = 'The address passed in is invalid/empty';
    } else if (!candidates.length) {
      errorInfo = 'There are no keyrings';
    } else if (!winners.length) {
      errorInfo = 'There are keyrings, but none match the address';
    }
    throw new Error(
      `${KeyringControllerError.NoKeyring}. Error info: ${errorInfo}`,
    );
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
    return this.#keyrings.filter((keyring) => keyring.type === type);
  }

  /**
   * Persist all serialized keyrings in the vault.
   *
   * @returns Promise resolving with `true` value when the
   * operation completes.
   */
  async persistAllKeyrings(): Promise<boolean> {
    const { encryptionKey, encryptionSalt } = this.state;

    if (!this.#password && !encryptionKey) {
      throw new Error(KeyringControllerError.MissingCredentials);
    }

    const serializedKeyrings = await Promise.all(
      this.#keyrings.map(async (keyring) => {
        const [type, data] = await Promise.all([
          keyring.type,
          keyring.serialize(),
        ]);
        return { type, data };
      }),
    );

    serializedKeyrings.push(...this.#unsupportedKeyrings);

    let vault: string | undefined;
    let newEncryptionKey: string | undefined;

    if (this.#cacheEncryptionKey) {
      assertIsExportableKeyEncryptor(this.#encryptor);

      if (encryptionKey) {
        const key = await this.#encryptor.importKey(encryptionKey);
        const vaultJSON = await this.#encryptor.encryptWithKey(
          key,
          serializedKeyrings,
        );
        vaultJSON.salt = encryptionSalt;
        vault = JSON.stringify(vaultJSON);
      } else if (this.#password) {
        const { vault: newVault, exportedKeyString } =
          await this.#encryptor.encryptWithDetail(
            this.#password,
            serializedKeyrings,
          );

        vault = newVault;
        newEncryptionKey = exportedKeyString;
      }
    } else {
      if (typeof this.#password !== 'string') {
        throw new TypeError(KeyringControllerError.WrongPasswordType);
      }
      vault = await this.#encryptor.encrypt(this.#password, serializedKeyrings);
    }

    if (!vault) {
      throw new Error(KeyringControllerError.MissingVaultData);
    }

    this.update((state) => {
      state.vault = vault;
    });

    // The keyring updates need to be announced before updating the encryptionKey
    // so that the updated keyring gets propagated to the extension first.
    // Not calling {@link updateKeyringsInState} results in the wrong account being selected
    // in the extension.
    await this.#updateKeyringsInState();
    if (newEncryptionKey) {
      this.update((state) => {
        state.encryptionKey = newEncryptionKey;
        state.encryptionSalt = JSON.parse(vault as string).salt;
      });
    }

    return true;
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
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const prefixed = add0x(importedKey);

        let bufferedPrivateKey;
        try {
          bufferedPrivateKey = toBuffer(prefixed);
        } catch {
          throw new Error('Cannot import invalid private key.');
        }

        if (
          !isValidPrivate(bufferedPrivateKey) ||
          // ensures that the key is 64 bytes long
          getBinarySize(prefixed) !== 64 + '0x'.length
        ) {
          throw new Error('Cannot import invalid private key.');
        }

        privateKey = remove0x(prefixed);
        break;
      case 'json':
        let wallet;
        const [input, password] = args;
        try {
          wallet = importers.fromEtherWallet(input, password);
        } catch (e) {
          wallet = wallet || (await Wallet.fromV3(input, password, true));
        }
        privateKey = bytesToHex(wallet.getPrivateKey());
        break;
      default:
        throw new Error(`Unexpected import strategy: '${strategy}'`);
    }
    const newKeyring = (await this.addNewKeyring(KeyringTypes.simple, [
      privateKey,
    ])) as EthKeyring<Json>;
    const accounts = await newKeyring.getAccounts();
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
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;

    // Not all the keyrings support this, so we have to check
    if (!keyring.removeAccount) {
      throw new Error(KeyringControllerError.UnsupportedRemoveAccount);
    }

    // The `removeAccount` method of snaps keyring is async. We have to update
    // the interface of the other keyrings to be async as well.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await keyring.removeAccount(address);

    const accounts = await keyring.getAccounts();
    // Check if this was the last/only account
    if (accounts.length === 0) {
      await this.#removeEmptyKeyrings();
    }

    await this.persistAllKeyrings();

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

    this.#password = undefined;
    this.update((state) => {
      state.isUnlocked = false;
      state.keyrings = [];
    });
    await this.#clearKeyrings();

    this.messagingSystem.publish(`${name}:lock`);

    return this.#getMemState();
  }

  /**
   * Signs message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  async signMessage(messageParams: PersonalMessageParams): Promise<string> {
    if (!messageParams.data) {
      throw new Error("Can't sign an empty message");
    }

    const address = normalize(messageParams.from) as Hex;
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;
    if (!keyring.signMessage) {
      throw new Error(KeyringControllerError.UnsupportedSignMessage);
    }

    return await keyring.signMessage(address, messageParams.data);
  }

  /**
   * Signs personal message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  async signPersonalMessage(messageParams: PersonalMessageParams) {
    const address = normalize(messageParams.from) as Hex;
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;
    if (!keyring.signPersonalMessage) {
      throw new Error(KeyringControllerError.UnsupportedSignPersonalMessage);
    }

    const normalizedData = normalize(messageParams.data) as Hex;

    return await keyring.signPersonalMessage(address, normalizedData);
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

      // Cast to `Hex` here is safe here because `messageParams.from` is not nullish.
      // `normalize` returns `Hex` unless given a nullish value.
      const address = normalize(messageParams.from) as Hex;
      const keyring = (await this.getKeyringForAccount(
        address,
      )) as EthKeyring<Json>;
      if (!keyring.signTypedData) {
        throw new Error(KeyringControllerError.UnsupportedSignTypedMessage);
      }

      return await keyring.signTypedData(
        address,
        version !== SignTypedDataVersion.V1 &&
          typeof messageParams.data === 'string'
          ? JSON.parse(messageParams.data)
          : messageParams.data,
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
  async signTransaction(
    transaction: TypedTransaction,
    from: string,
    opts?: Record<string, unknown>,
  ): Promise<TxData> {
    const address = normalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;
    if (!keyring.signTransaction) {
      throw new Error(KeyringControllerError.UnsupportedSignTransaction);
    }

    return await keyring.signTransaction(address, transaction, opts);
  }

  /**
   * Convert a base transaction to a base UserOperation.
   *
   * @param from - Address of the sender.
   * @param transactions - Base transactions to include in the UserOperation.
   * @returns A pseudo-UserOperation that can be used to construct a real.
   */
  async prepareUserOperation(
    from: string,
    transactions: EthBaseTransaction[],
  ): Promise<EthBaseUserOperation> {
    const address = normalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;

    if (!keyring.prepareUserOperation) {
      throw new Error(KeyringControllerError.UnsupportedPrepareUserOperation);
    }

    return await keyring.prepareUserOperation(address, transactions);
  }

  /**
   * Patches properties of a UserOperation. Currently, only the
   * `paymasterAndData` can be patched.
   *
   * @param from - Address of the sender.
   * @param userOp - UserOperation to patch.
   * @returns A patch to apply to the UserOperation.
   */
  async patchUserOperation(
    from: string,
    userOp: EthUserOperation,
  ): Promise<EthUserOperationPatch> {
    const address = normalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;

    if (!keyring.patchUserOperation) {
      throw new Error(KeyringControllerError.UnsupportedPatchUserOperation);
    }

    return await keyring.patchUserOperation(address, userOp);
  }

  /**
   * Signs an UserOperation.
   *
   * @param from - Address of the sender.
   * @param userOp - UserOperation to sign.
   * @returns The signature of the UserOperation.
   */
  async signUserOperation(
    from: string,
    userOp: EthUserOperation,
  ): Promise<string> {
    const address = normalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(
      address,
    )) as EthKeyring<Json>;

    if (!keyring.signUserOperation) {
      throw new Error(KeyringControllerError.UnsupportedSignUserOperation);
    }

    return await keyring.signUserOperation(address, userOp);
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
    this.#keyrings = await this.#unlockKeyrings(
      undefined,
      encryptionKey,
      encryptionSalt,
    );
    this.#setUnlocked();

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
    this.#keyrings = await this.#unlockKeyrings(password);
    this.#setUnlocked();

    const qrKeyring = this.getQRKeyring();
    if (qrKeyring) {
      // if there is a QR keyring, we need to subscribe
      // to its events after unlocking the vault
      this.#subscribeToQRKeyringEvents(qrKeyring);
    }

    return this.#getMemState();
  }

  /**
   * Verifies the that the seed phrase restores the current keychain's accounts.
   *
   * @returns Promise resolving to the seed phrase as Uint8Array.
   */
  async verifySeedPhrase(): Promise<Uint8Array> {
    const primaryKeyring = this.getKeyringsByType(KeyringTypes.hd)[0] as
      | EthKeyring<Json>
      | undefined;
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
    const hdKeyringBuilder = this.#getKeyringBuilderForType(KeyringTypes.hd)!;

    const hdKeyring = hdKeyringBuilder();
    // @ts-expect-error @metamask/eth-hd-keyring correctly handles
    // Uint8Array seed phrases in the `deserialize` method.
    await hdKeyring.deserialize({
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
    return this.getKeyringsByType(KeyringTypes.qr)[0] as unknown as QRKeyring;
  }

  /**
   * Get QR hardware keyring. If it doesn't exist, add it.
   *
   * @returns The added keyring
   */
  async getOrAddQRKeyring(): Promise<QRKeyring> {
    return this.getQRKeyring() || (await this.#addQRKeyring());
  }

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async restoreQRKeyring(serialized: any): Promise<void> {
    (await this.getOrAddQRKeyring()).deserialize(serialized);
    await this.persistAllKeyrings();
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // QRKeyring is not yet compatible with Keyring from
    // @metamask/utils, but we can use the `addNewAccount` method
    // as it internally calls `addAccounts` from on the keyring instance,
    // which is supported by QRKeyring API.
    await this.addNewAccountForKeyring(keyring as unknown as EthKeyring<Json>);
    await this.persistAllKeyrings();
  }

  async getAccountKeyringType(account: string): Promise<string> {
    const keyring = (await this.getKeyringForAccount(
      account,
    )) as EthKeyring<Json>;
    return keyring.type;
  }

  async forgetQRDevice(): Promise<{
    removedAccounts: string[];
    remainingAccounts: string[];
  }> {
    const keyring = await this.getOrAddQRKeyring();
    const allAccounts = (await this.getAccounts()) as string[];
    keyring.forgetDevice();
    const remainingAccounts = (await this.getAccounts()) as string[];
    const removedAccounts = allAccounts.filter(
      (address: string) => !remainingAccounts.includes(address),
    );
    await this.persistAllKeyrings();
    return { removedAccounts, remainingAccounts };
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

    this.messagingSystem.registerActionHandler(
      `${name}:persistAllKeyrings`,
      this.persistAllKeyrings.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:prepareUserOperation`,
      this.prepareUserOperation.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:patchUserOperation`,
      this.patchUserOperation.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:signUserOperation`,
      this.signUserOperation.bind(this),
    );
  }

  /**
   * Get the keyring builder for the given `type`.
   *
   * @param type - The type of keyring to get the builder for.
   * @returns The keyring builder, or undefined if none exists.
   */
  #getKeyringBuilderForType(
    type: string,
  ): { (): EthKeyring<Json>; type: string } | undefined {
    return this.#keyringBuilders.find(
      (keyringBuilder) => keyringBuilder.type === type,
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
    const qrKeyring = (await this.#newKeyring(KeyringTypes.qr, {
      accounts: [],
    })) as unknown as QRKeyring;

    const accounts = await qrKeyring.getAccounts();
    await this.#checkForDuplicate(KeyringTypes.qr, accounts);

    this.#keyrings.push(qrKeyring as unknown as EthKeyring<Json>);
    await this.persistAllKeyrings();

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
    const qrKeyrings = this.getKeyringsByType(
      KeyringTypes.qr,
    ) as unknown as QRKeyring[];

    qrKeyrings.forEach((qrKeyring) => {
      if (this.#qrKeyringStateListener) {
        qrKeyring.getMemStore().unsubscribe(this.#qrKeyringStateListener);
      }
    });
  }

  /**
   * Create new vault with an initial keyring
   *
   * Destroys any old encrypted storage,
   * creates a new encrypted store with the given password,
   * creates a new wallet with 1 account.
   *
   * @fires KeyringController:unlock
   * @param password - The password to encrypt the vault with.
   * @param keyring - A object containing the params to instantiate a new keyring.
   * @param keyring.type - The keyring type.
   * @param keyring.opts - Optional parameters required to instantiate the keyring.
   * @returns A promise that resolves to the state.
   */
  async #createNewVaultWithKeyring(
    password: string,
    keyring: {
      type: string;
      opts?: unknown;
    },
  ): Promise<KeyringControllerMemState> {
    if (typeof password !== 'string') {
      throw new TypeError(KeyringControllerError.WrongPasswordType);
    }
    this.#password = password;

    await this.#clearKeyrings();
    await this.#createKeyringWithFirstAccount(keyring.type, keyring.opts);
    this.#setUnlocked();
    return this.#getMemState();
  }

  /**
   * Update the controller state with its current keyrings.
   */
  async #updateKeyringsInState(): Promise<void> {
    const keyrings = await Promise.all(this.#keyrings.map(displayForKeyring));
    this.update((state) => {
      state.keyrings = keyrings;
    });
  }

  /**
   * Unlock Keyrings, decrypting the vault and deserializing all
   * keyrings contained in it, using a password or an encryption key with salt.
   *
   * @param password - The keyring controller password.
   * @param encryptionKey - An exported key string to unlock keyrings with.
   * @param encryptionSalt - The salt used to encrypt the vault.
   * @returns A promise resolving to the deserialized keyrings array.
   */
  async #unlockKeyrings(
    password: string | undefined,
    encryptionKey?: string,
    encryptionSalt?: string,
  ): Promise<EthKeyring<Json>[]> {
    const encryptedVault = this.state.vault;
    if (!encryptedVault) {
      throw new Error(KeyringControllerError.VaultError);
    }

    await this.#clearKeyrings();

    let vault;

    if (this.#cacheEncryptionKey) {
      assertIsExportableKeyEncryptor(this.#encryptor);

      if (password) {
        const result = await this.#encryptor.decryptWithDetail(
          password,
          encryptedVault,
        );
        vault = result.vault;
        this.#password = password;

        this.update((state) => {
          state.encryptionKey = result.exportedKeyString;
          state.encryptionSalt = result.salt;
        });
      } else {
        const parsedEncryptedVault = JSON.parse(encryptedVault);

        if (encryptionSalt !== parsedEncryptedVault.salt) {
          throw new Error(KeyringControllerError.ExpiredCredentials);
        }

        if (typeof encryptionKey !== 'string') {
          throw new TypeError(KeyringControllerError.WrongPasswordType);
        }

        const key = await this.#encryptor.importKey(encryptionKey);
        vault = await this.#encryptor.decryptWithKey(key, parsedEncryptedVault);

        // This call is required on the first call because encryptionKey
        // is not yet inside the memStore
        this.update((state) => {
          state.encryptionKey = encryptionKey;
          // we can safely assume that encryptionSalt is defined here
          // because we compare it with the salt from the vault
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          state.encryptionSalt = encryptionSalt!;
        });
      }
    } else {
      if (typeof password !== 'string') {
        throw new TypeError(KeyringControllerError.WrongPasswordType);
      }

      vault = await this.#encryptor.decrypt(password, encryptedVault);
      this.#password = password;
    }

    if (!isSerializedKeyringsArray(vault)) {
      throw new Error(KeyringControllerError.VaultDataError);
    }

    await Promise.all(vault.map(this.#restoreKeyring.bind(this)));
    await this.#updateKeyringsInState();

    if (
      this.#password &&
      (!this.#cacheEncryptionKey || !encryptionKey) &&
      this.#encryptor.isVaultUpdated &&
      !this.#encryptor.isVaultUpdated(encryptedVault)
    ) {
      // Re-encrypt the vault with safer method if one is available
      await this.persistAllKeyrings();
    }

    return this.#keyrings;
  }

  /**
   * Create a new keyring, ensuring that the first account is
   * also created.
   *
   * @param type - Keyring type to instantiate.
   * @param opts - Optional parameters required to instantiate the keyring.
   * @returns A promise that resolves if the operation is successful.
   */
  async #createKeyringWithFirstAccount(type: string, opts?: unknown) {
    const keyring = (await this.addNewKeyring(type, opts)) as EthKeyring<Json>;

    const [firstAccount] = await keyring.getAccounts();
    if (!firstAccount) {
      throw new Error(KeyringControllerError.NoFirstAccount);
    }
  }

  /**
   * Instantiate, initialize and return a new keyring of the given `type`,
   * using the given `opts`. The keyring is built using the keyring builder
   * registered for the given `type`.
   *
   * @param type - The type of keyring to add.
   * @param data - The data to restore a previously serialized keyring.
   * @returns The new keyring.
   */
  async #newKeyring(type: string, data: unknown): Promise<EthKeyring<Json>> {
    const keyringBuilder = this.#getKeyringBuilderForType(type);

    if (!keyringBuilder) {
      throw new Error(
        `${KeyringControllerError.NoKeyringBuilder}. Keyring type: ${type}`,
      );
    }

    const keyring = keyringBuilder();

    // @ts-expect-error Enforce data type after updating clients
    await keyring.deserialize(data);

    if (keyring.init) {
      await keyring.init();
    }

    return keyring;
  }

  /**
   * Remove all managed keyrings, destroying all their
   * instances in memory.
   */
  async #clearKeyrings() {
    for (const keyring of this.#keyrings) {
      await this.#destroyKeyring(keyring);
    }
    this.#keyrings = [];
    this.update((state) => {
      state.keyrings = [];
    });
  }

  /**
   * Restore a Keyring from a provided serialized payload.
   * On success, returns the resulting keyring instance.
   *
   * @param serialized - The serialized keyring.
   * @returns The deserialized keyring or undefined if the keyring type is unsupported.
   */
  async #restoreKeyring(
    serialized: SerializedKeyring,
  ): Promise<EthKeyring<Json> | undefined> {
    try {
      const { type, data } = serialized;
      const keyring = await this.#newKeyring(type, data);

      // getAccounts also validates the accounts for some keyrings
      await keyring.getAccounts();
      this.#keyrings.push(keyring);

      return keyring;
    } catch (_) {
      this.#unsupportedKeyrings.push(serialized);
      return undefined;
    }
  }

  /**
   * Destroy Keyring
   *
   * Some keyrings support a method called `destroy`, that destroys the
   * keyring along with removing all its event listeners and, in some cases,
   * clears the keyring bridge iframe from the DOM.
   *
   * @param keyring - The keyring to destroy.
   */
  async #destroyKeyring(keyring: EthKeyring<Json>) {
    await keyring.destroy?.();
  }

  /**
   * Remove empty keyrings.
   *
   * Loops through the keyrings and removes the ones with empty accounts
   * (usually after removing the last / only account) from a keyring.
   */
  async #removeEmptyKeyrings(): Promise<void> {
    const validKeyrings: EthKeyring<Json>[] = [];

    // Since getAccounts returns a Promise
    // We need to wait to hear back form each keyring
    // in order to decide which ones are now valid (accounts.length > 0)

    await Promise.all(
      this.#keyrings.map(async (keyring: EthKeyring<Json>) => {
        const accounts = await keyring.getAccounts();
        if (accounts.length > 0) {
          validKeyrings.push(keyring);
        } else {
          await this.#destroyKeyring(keyring);
        }
      }),
    );
    this.#keyrings = validKeyrings;
  }

  /**
   * Checks for duplicate keypairs, using the the first account in the given
   * array. Rejects if a duplicate is found.
   *
   * Only supports 'Simple Key Pair'.
   *
   * @param type - The key pair type to check for.
   * @param newAccountArray - Array of new accounts.
   * @returns The account, if no duplicate is found.
   */
  async #checkForDuplicate(
    type: string,
    newAccountArray: string[],
  ): Promise<string[]> {
    const accounts = await this.getAccounts();

    switch (type) {
      case KeyringTypes.simple: {
        const isIncluded = Boolean(
          accounts.find(
            (key) =>
              newAccountArray[0] &&
              (key === newAccountArray[0] ||
                key === remove0x(newAccountArray[0])),
          ),
        );

        if (isIncluded) {
          throw new Error(KeyringControllerError.DuplicatedAccount);
        }
        return newAccountArray;
      }

      default: {
        return newAccountArray;
      }
    }
  }

  /**
   * Set the `isUnlocked` to true and notify listeners
   * through the messenger.
   *
   * @fires KeyringController:unlock
   */
  #setUnlocked(): void {
    this.update((state) => {
      state.isUnlocked = true;
    });
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
