import type { TypedTransaction, TypedTxData } from '@ethereumjs/tx';
import { isValidPrivate, getBinarySize } from '@ethereumjs/util';
import { BaseController } from '@metamask/base-controller';
import type * as encryptorUtils from '@metamask/browser-passworder';
import { HdKeyring } from '@metamask/eth-hd-keyring';
import { normalize as ethNormalize } from '@metamask/eth-sig-util';
import SimpleKeyring from '@metamask/eth-simple-keyring';
import type {
  KeyringExecutionContext,
  EthBaseTransaction,
  EthBaseUserOperation,
  EthUserOperation,
  EthUserOperationPatch,
} from '@metamask/keyring-api';
import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Keyring, KeyringClass } from '@metamask/keyring-utils';
import type { Messenger } from '@metamask/messenger';
import type { Eip1024EncryptedData, Hex, Json } from '@metamask/utils';
import {
  add0x,
  assertIsStrictHexString,
  bytesToHex,
  hasProperty,
  hexToBytes,
  isObject,
  isStrictHexString,
  isValidHexAddress,
  isValidJson,
  remove0x,
} from '@metamask/utils';
import { Mutex } from 'async-mutex';
import type { MutexInterface } from 'async-mutex';
import Wallet, { thirdparty as importers } from 'ethereumjs-wallet';
import type { Patch } from 'immer';
import { cloneDeep, isEqual } from 'lodash';
// When generating a ULID within the same millisecond, monotonicFactory provides some guarantees regarding sort order.
import { ulid } from 'ulid';

import { KeyringControllerErrorMessage } from './constants';
import { KeyringControllerError } from './errors';
import type {
  Eip7702AuthorizationParams,
  PersonalMessageParams,
  TypedMessageParams,
} from './types';

const name = 'KeyringController';

/**
 * Available keyring types
 */
export enum KeyringTypes {
  // Changing this would be a breaking change, and not worth the effort at this
  // time, so we disable the linting rule for this block.
  /* eslint-disable @typescript-eslint/naming-convention */
  simple = 'Simple Key Pair',
  hd = 'HD Key Tree',
  qr = 'QR Hardware Wallet Device',
  trezor = 'Trezor Hardware',
  oneKey = 'OneKey Hardware',
  ledger = 'Ledger Hardware',
  lattice = 'Lattice Hardware',
  snap = 'Snap Keyring',
  mpc = 'MPC Keyring',
  /* eslint-enable @typescript-eslint/naming-convention */
}

/**
 * Custody keyring types are a special case, as they are not a single type
 * but they all start with the prefix "Custody".
 *
 * @param keyringType - The type of the keyring.
 * @returns Whether the keyring type is a custody keyring.
 */
export const isCustodyKeyring = (keyringType: string): boolean => {
  return keyringType.startsWith('Custody');
};

/**
 * The KeyringController state
 */
export type KeyringControllerState = {
  /**
   * Encrypted array of serialized keyrings data.
   */
  vault?: string;
  /**
   * Whether the vault has been decrypted successfully and
   * keyrings contained within are deserialized and available.
   */
  isUnlocked: boolean;
  /**
   * Representations of managed keyrings.
   */
  keyrings: KeyringObject[];
  /**
   * The encryption key derived from the password and used to encrypt
   * the vault. This is only stored if the `cacheEncryptionKey` option
   * is enabled.
   */
  encryptionKey?: string;
  /**
   * The salt used to derive the encryption key from the password.
   */
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

export type KeyringControllerSignEip7702AuthorizationAction = {
  type: `${typeof name}:signEip7702Authorization`;
  handler: KeyringController['signEip7702Authorization'];
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

export type KeyringControllerAddNewAccountAction = {
  type: `${typeof name}:addNewAccount`;
  handler: KeyringController['addNewAccount'];
};

export type KeyringControllerWithKeyringAction = {
  type: `${typeof name}:withKeyring`;
  handler: KeyringController['withKeyring'];
};

export type KeyringControllerCreateNewVaultAndKeychainAction = {
  type: `${typeof name}:createNewVaultAndKeychain`;
  handler: KeyringController['createNewVaultAndKeychain'];
};

export type KeyringControllerCreateNewVaultAndRestoreAction = {
  type: `${typeof name}:createNewVaultAndRestore`;
  handler: KeyringController['createNewVaultAndRestore'];
};

export type KeyringControllerAddNewKeyringAction = {
  type: `${typeof name}:addNewKeyring`;
  handler: KeyringController['addNewKeyring'];
};

export type KeyringControllerRemoveAccountAction = {
  type: `${typeof name}:removeAccount`;
  handler: KeyringController['removeAccount'];
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

export type KeyringControllerActions =
  | KeyringControllerGetStateAction
  | KeyringControllerSignMessageAction
  | KeyringControllerSignEip7702AuthorizationAction
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
  | KeyringControllerSignUserOperationAction
  | KeyringControllerAddNewAccountAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerAddNewKeyringAction
  | KeyringControllerCreateNewVaultAndKeychainAction
  | KeyringControllerCreateNewVaultAndRestoreAction
  | KeyringControllerRemoveAccountAction;

export type KeyringControllerEvents =
  | KeyringControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | KeyringControllerAccountRemovedEvent;

export type KeyringControllerMessenger = Messenger<
  typeof name,
  KeyringControllerActions,
  KeyringControllerEvents
>;

export type KeyringControllerOptions<
  EncryptionKey = encryptorUtils.EncryptionKey | CryptoKey,
  SupportedKeyDerivationOptions = encryptorUtils.KeyDerivationOptions,
  EncryptionResult extends
    EncryptionResultConstraint<SupportedKeyDerivationOptions> = DefaultEncryptionResult<SupportedKeyDerivationOptions>,
> = {
  keyringBuilders?: { (): EthKeyring; type: string }[];
  messenger: KeyringControllerMessenger;
  state?: { vault?: string; keyringsMetadata?: KeyringMetadata[] };
  encryptor: Encryptor<
    EncryptionKey,
    SupportedKeyDerivationOptions,
    EncryptionResult
  >;
};

/**
 * A keyring object representation.
 */
export type KeyringObject = {
  /**
   * Accounts associated with the keyring.
   */
  accounts: string[];
  /**
   * Keyring type.
   */
  type: string;
  /**
   * Additional data associated with the keyring.
   */
  metadata: KeyringMetadata;
};

/**
 * Additional information related to a keyring.
 */
export type KeyringMetadata = {
  /**
   * Keyring ID
   */
  id: string;
  /**
   * Keyring name
   */
  name: string;
};

/**
 * A strategy for importing an account
 */
export enum AccountImportStrategy {
  // Changing this would be a breaking change, and not worth the effort at this
  // time, so we disable the linting rule for this block.
  /* eslint-disable @typescript-eslint/naming-convention */
  privateKey = 'privateKey',
  json = 'json',
  /* eslint-enable @typescript-eslint/naming-convention */
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
  metadata?: KeyringMetadata;
};

/**
 * Cached encryption key used to encrypt/decrypt the vault.
 */
type CachedEncryptionKey = {
  /**
   * The serialized encryption key.
   */
  serialized: string;
  /**
   * The salt used to derive the encryption key.
   */
  salt: string;
};

/**
 * State/data that can be updated during a `withKeyring` operation.
 */
type SessionState = {
  keyrings: SerializedKeyring[];
  encryptionKey?: CachedEncryptionKey;
};

export type EncryptionResultConstraint<SupportedKeyMetadata> = {
  salt?: string;
  keyMetadata?: SupportedKeyMetadata;
};

export type DefaultEncryptionResult<SupportedKeyMetadata> = {
  data: string;
  iv: string;
  salt?: string;
  keyMetadata?: SupportedKeyMetadata;
};

/**
 * An encryptor interface that supports encrypting and decrypting
 * serializable data with a password, and exporting and importing keys.
 */
export type Encryptor<
  EncryptionKey = encryptorUtils.EncryptionKey | CryptoKey,
  SupportedKeyDerivationParams = encryptorUtils.KeyDerivationOptions,
  EncryptionResult extends
    EncryptionResultConstraint<SupportedKeyDerivationParams> = DefaultEncryptionResult<SupportedKeyDerivationParams>,
> = {
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
  /**
   * Encrypts the given object with the given encryption key.
   *
   * @param key - The encryption key to encrypt with.
   * @param object - The object to encrypt.
   * @returns The encryption result.
   */
  encryptWithKey: (
    key: EncryptionKey,
    object: Json,
  ) => Promise<EncryptionResult>;
  /**
   * Encrypts the given object with the given password, and returns the
   * encryption result and the serialized key string.
   *
   * @param password - The password to encrypt with.
   * @param object - The object to encrypt.
   * @param salt - The optional salt to use for encryption.
   * @returns The encrypted string and the serialized key string.
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
   * @param encryptedObject - The encrypted string to decrypt.
   * @returns The decrypted object.
   */
  decryptWithKey: (
    key: EncryptionKey,
    encryptedObject: EncryptionResult,
  ) => Promise<unknown>;
  /**
   * Decrypts the given encrypted string with the given password, and returns
   * the decrypted object and the salt and serialized key string used for
   * encryption.
   *
   * @param password - The password to decrypt with.
   * @param encryptedString - The encrypted string to decrypt.
   * @returns The decrypted object and the salt and serialized key string used for
   * encryption.
   */
  decryptWithDetail: (
    password: string,
    encryptedString: string,
  ) => Promise<encryptorUtils.DetailedDecryptResult>;
  /**
   * Generates an encryption key from a serialized key.
   *
   * @param key - The serialized key string.
   * @returns The encryption key.
   */
  importKey: (key: string) => Promise<EncryptionKey>;
  /**
   * Exports the encryption key as a string.
   *
   * @param key - The encryption key to export.
   * @returns The serialized key string.
   */
  exportKey: (key: EncryptionKey) => Promise<string>;
  /**
   * Derives an encryption key from a password.
   *
   * @param password - The password to derive the key from.
   * @param salt - The salt to use for key derivation.
   * @param exportable - Whether the key should be exportable or not.
   * @param options - Optional key derivation options.
   * @returns The derived encryption key.
   */
  keyFromPassword: (
    password: string,
    salt: string,
    exportable?: boolean,
    keyDerivationOptions?: SupportedKeyDerivationParams,
  ) => Promise<EncryptionKey>;
  /**
   * Generates a random salt for key derivation.
   */
  generateSalt: typeof encryptorUtils.generateSalt;
};

/**
 * Keyring selector used for `withKeyring`.
 */
export type KeyringSelector =
  | {
      type: string;
      index?: number;
    }
  | {
      address: Hex;
    }
  | {
      id: string;
    };

/**
 * Keyring builder.
 */
export type KeyringBuilder = {
  (): Keyring;
  type: string;
};

/**
 * A function executed within a mutually exclusive lock, with
 * a mutex releaser in its option bag.
 *
 * @param releaseLock - A function to release the lock.
 */
type MutuallyExclusiveCallback<Result> = ({
  releaseLock,
}: {
  releaseLock: MutexInterface.Releaser;
}) => Promise<Result>;

/**
 * Get builder function for `Keyring`
 *
 * Returns a builder function for `Keyring` with a `type` property.
 *
 * @param KeyringConstructor - The Keyring class for the builder.
 * @returns A builder function for the given Keyring.
 */
export function keyringBuilderFactory(
  KeyringConstructor: KeyringClass,
): KeyringBuilder {
  const builder: KeyringBuilder = (): Keyring => new KeyringConstructor();

  builder.type = KeyringConstructor.type;

  return builder;
}

const defaultKeyringBuilders = [
  // todo: keyring types are mismatched, this should be fixed in they keyrings themselves
  // @ts-expect-error keyring types are mismatched
  keyringBuilderFactory(SimpleKeyring),
  keyringBuilderFactory(HdKeyring),
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
  keyring: EthKeyring,
): asserts keyring is EthKeyring & { mnemonic: Uint8Array } {
  if (
    !(
      hasProperty(keyring, 'mnemonic') && keyring.mnemonic instanceof Uint8Array
    )
  ) {
    throw new KeyringControllerError("Can't get mnemonic bytes from keyring");
  }
}

/**
 * Assert that the provided password is a valid non-empty string.
 *
 * @param password - The password to check.
 * @throws If the password is not a valid string.
 */
function assertIsValidPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string') {
    throw new KeyringControllerError(
      KeyringControllerErrorMessage.WrongPasswordType,
    );
  }

  if (!password?.length) {
    throw new KeyringControllerError(
      KeyringControllerErrorMessage.InvalidEmptyPassword,
    );
  }
}

/**
 * Assert that the provided encryption key is a valid non-empty string.
 *
 * @param encryptionKey - The encryption key to check.
 * @throws If the encryption key is not a valid string.
 */
function assertIsEncryptionKeySet(
  encryptionKey: string | undefined,
): asserts encryptionKey is string {
  if (!encryptionKey) {
    throw new KeyringControllerError(
      KeyringControllerErrorMessage.EncryptionKeyNotSet,
    );
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
 * @param keyringWithMetadata - The keyring and its metadata.
 * @param keyringWithMetadata.keyring - The keyring to display.
 * @param keyringWithMetadata.metadata - The metadata of the keyring.
 * @returns A keyring display object, with type and accounts properties.
 */
async function displayForKeyring({
  keyring,
  metadata,
}: {
  keyring: EthKeyring;
  metadata: KeyringMetadata;
}): Promise<KeyringObject> {
  const accounts = await keyring.getAccounts();

  return {
    type: keyring.type,
    // Cast to `string[]` here is safe here because `accounts` has no nullish
    // values, and `normalize` returns `string` unless given a nullish value
    accounts: accounts.map(normalize) as string[],
    metadata,
  };
}

/**
 * Check if address is an ethereum address
 *
 * @param address - An address.
 * @returns Returns true if the address is an ethereum one, false otherwise.
 */
function isEthAddress(address: string): boolean {
  // We first check if it's a matching `Hex` string, so that is narrows down
  // `address` as an `Hex` type, allowing us to use `isValidHexAddress`
  return (
    // NOTE: This function only checks for lowercased strings
    isStrictHexString(address.toLowerCase()) &&
    // This checks for lowercased addresses and checksum addresses too
    isValidHexAddress(address as Hex)
  );
}

/**
 * Normalize ethereum or non-EVM address.
 *
 * @param address - Ethereum or non-EVM address.
 * @returns The normalized address.
 */
function normalize(address: string): string | undefined {
  // Since the `KeyringController` is only dealing with address, we have
  // no other way to get the associated account type with this address. So we
  // are down to check the actual address format for now
  // TODO: Find a better way to not have those runtime checks based on the
  //       address value!
  return isEthAddress(address) ? ethNormalize(address) : address;
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
export class KeyringController<
  EncryptionKey = encryptorUtils.EncryptionKey | CryptoKey,
  SupportedKeyDerivationOptions = encryptorUtils.KeyDerivationOptions,
  EncryptionResult extends
    EncryptionResultConstraint<SupportedKeyDerivationOptions> = DefaultEncryptionResult<SupportedKeyDerivationOptions>,
> extends BaseController<
  typeof name,
  KeyringControllerState,
  KeyringControllerMessenger
> {
  readonly #controllerOperationMutex = new Mutex();

  readonly #vaultOperationMutex = new Mutex();

  readonly #keyringBuilders: { (): EthKeyring; type: string }[];

  readonly #encryptor: Encryptor<
    EncryptionKey,
    SupportedKeyDerivationOptions,
    EncryptionResult
  >;

  #keyrings: { keyring: EthKeyring; metadata: KeyringMetadata }[];

  #unsupportedKeyrings: SerializedKeyring[];

  #encryptionKey?: CachedEncryptionKey;

  /**
   * Creates a KeyringController instance.
   *
   * @param options - Initial options used to configure this controller
   * @param options.encryptor - An optional object for defining encryption schemes.
   * @param options.keyringBuilders - Set a new name for account.
   * @param options.cacheEncryptionKey - Whether to cache or not encryption key.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   */
  constructor(
    options: KeyringControllerOptions<
      EncryptionKey,
      SupportedKeyDerivationOptions,
      EncryptionResult
    >,
  ) {
    const { encryptor, keyringBuilders, messenger, state } = options;

    super({
      name,
      metadata: {
        vault: {
          includeInStateLogs: false,
          persist: true,
          includeInDebugSnapshot: false,
          usedInUi: false,
        },
        isUnlocked: {
          includeInStateLogs: true,
          persist: false,
          includeInDebugSnapshot: true,
          usedInUi: true,
        },
        keyrings: {
          includeInStateLogs: true,
          persist: false,
          includeInDebugSnapshot: false,
          usedInUi: true,
        },
        encryptionKey: {
          includeInStateLogs: false,
          persist: false,
          includeInDebugSnapshot: false,
          usedInUi: false,
        },
        encryptionSalt: {
          includeInStateLogs: false,
          persist: false,
          includeInDebugSnapshot: false,
          usedInUi: false,
        },
      },
      messenger,
      state: {
        ...getDefaultKeyringState(),
        ...state,
      },
    });

    this.#keyringBuilders = keyringBuilders
      ? keyringBuilders.concat(defaultKeyringBuilders)
      : defaultKeyringBuilders;

    this.#encryptor = encryptor;
    this.#keyrings = [];
    this.#unsupportedKeyrings = [];

    this.#registerMessageHandlers();
  }

  /**
   * Adds a new account to the default (first) HD seed phrase keyring.
   *
   * @param accountCount - Number of accounts before adding a new one, used to
   * make the method idempotent.
   * @returns Promise resolving to the added account address.
   */
  async addNewAccount(accountCount?: number): Promise<string> {
    this.#assertIsUnlocked();

    return this.#persistOrRollback(async () => {
      const primaryKeyring = this.getKeyringsByType('HD Key Tree')[0] as
        | EthKeyring
        | undefined;
      if (!primaryKeyring) {
        throw new KeyringControllerError('No HD keyring found');
      }
      const oldAccounts = await primaryKeyring.getAccounts();

      if (accountCount && oldAccounts.length !== accountCount) {
        if (accountCount > oldAccounts.length) {
          throw new KeyringControllerError('Account out of sequence');
        }
        // we return the account already existing at index `accountCount`
        const existingAccount = oldAccounts[accountCount];

        if (!existingAccount) {
          throw new KeyringControllerError(
            `Can't find account at index ${accountCount}`,
          );
        }

        return existingAccount;
      }

      const [addedAccountAddress] = await primaryKeyring.addAccounts(1);
      await this.#verifySeedPhrase();

      return addedAccountAddress;
    });
  }

  /**
   * Adds a new account to the specified keyring.
   *
   * @param keyring - Keyring to add the account to.
   * @param accountCount - Number of accounts before adding a new one, used to make the method idempotent.
   * @returns Promise resolving to the added account address
   */
  async addNewAccountForKeyring(
    keyring: EthKeyring,
    accountCount?: number,
  ): Promise<Hex> {
    // READ THIS CAREFULLY:
    // We still uses `Hex` here, since we are not using this method when creating
    // and account using a "Snap Keyring". This function assume the `keyring` is
    // ethereum compatible, but "Snap Keyring" might not be.
    this.#assertIsUnlocked();

    return this.#persistOrRollback(async () => {
      const oldAccounts = await this.#getAccountsFromKeyrings();

      if (accountCount && oldAccounts.length !== accountCount) {
        if (accountCount > oldAccounts.length) {
          throw new KeyringControllerError('Account out of sequence');
        }

        const existingAccount = oldAccounts[accountCount];
        assertIsStrictHexString(existingAccount);

        return existingAccount;
      }

      await keyring.addAccounts(1);

      const addedAccountAddress = (await this.#getAccountsFromKeyrings()).find(
        (selectedAddress) => !oldAccounts.includes(selectedAddress),
      );
      assertIsStrictHexString(addedAccountAddress);

      return addedAccountAddress;
    });
  }

  /**
   * Effectively the same as creating a new keychain then populating it
   * using the given seed phrase.
   *
   * @param password - Password to unlock keychain.
   * @param seed - A BIP39-compliant seed phrase as Uint8Array,
   * either as a string or an array of UTF-8 bytes that represent the string.
   * @returns Promise resolving when the operation ends successfully.
   */
  async createNewVaultAndRestore(
    password: string,
    seed: Uint8Array,
  ): Promise<void> {
    return this.#persistOrRollback(async () => {
      assertIsValidPassword(password);

      await this.#createNewVaultWithKeyring(password, {
        type: KeyringTypes.hd,
        opts: {
          mnemonic: seed,
          numberOfAccounts: 1,
        },
      });
    });
  }

  /**
   * Create a new vault and primary keyring.
   *
   * This only works if keyrings are empty. If there is a pre-existing unlocked vault, calling this will have no effect.
   * If there is a pre-existing locked vault, it will be replaced.
   *
   * @param password - Password to unlock the new vault.
   * @returns Promise resolving when the operation ends successfully.
   */
  async createNewVaultAndKeychain(password: string): Promise<void> {
    return this.#persistOrRollback(async () => {
      const accounts = await this.#getAccountsFromKeyrings();
      if (!accounts.length) {
        await this.#createNewVaultWithKeyring(password, {
          type: KeyringTypes.hd,
        });
      }
    });
  }

  /**
   * Adds a new keyring of the given `type`.
   *
   * @param type - Keyring type name.
   * @param opts - Keyring options.
   * @throws If a builder for the given `type` does not exist.
   * @returns Promise resolving to the new keyring metadata.
   */
  async addNewKeyring(
    type: KeyringTypes | string,
    opts?: unknown,
  ): Promise<KeyringMetadata> {
    this.#assertIsUnlocked();

    return this.#getKeyringMetadata(
      await this.#persistOrRollback(async () => this.#newKeyring(type, opts)),
    );
  }

  /**
   * Method to verify a given password validity. Throws an
   * error if the password is invalid.
   *
   * @param password - Password of the keyring.
   */
  async verifyPassword(password: string): Promise<void> {
    if (!this.state.vault) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.VaultError,
      );
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
   * @param keyringId - The id of the keyring.
   * @returns Promise resolving to the seed phrase.
   */
  async exportSeedPhrase(
    password: string,
    keyringId?: string,
  ): Promise<Uint8Array> {
    this.#assertIsUnlocked();
    await this.verifyPassword(password);
    const selectedKeyring = this.#getKeyringByIdOrDefault(keyringId);
    if (!selectedKeyring) {
      throw new KeyringControllerError('Keyring not found');
    }
    assertHasUint8ArrayMnemonic(selectedKeyring);

    return selectedKeyring.mnemonic;
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

    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;
    if (!keyring.exportAccount) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedExportAccount,
      );
    }

    return await keyring.exportAccount(normalize(address) as Hex);
  }

  /**
   * Returns the public addresses of all accounts from every keyring.
   *
   * @returns A promise resolving to an array of addresses.
   */
  async getAccounts(): Promise<string[]> {
    this.#assertIsUnlocked();
    return this.state.keyrings.reduce<string[]>(
      (accounts, keyring) => accounts.concat(keyring.accounts),
      [],
    );
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
    this.#assertIsUnlocked();
    const address = ethNormalize(account) as Hex;
    const keyring = (await this.getKeyringForAccount(account)) as EthKeyring;
    if (!keyring.getEncryptionPublicKey) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedGetEncryptionPublicKey,
      );
    }

    return await keyring.getEncryptionPublicKey(address, opts);
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
    this.#assertIsUnlocked();
    const address = ethNormalize(messageParams.from) as Hex;
    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;
    if (!keyring.decryptMessage) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedDecryptMessage,
      );
    }

    return keyring.decryptMessage(address, messageParams.data);
  }

  /**
   * Returns the currently initialized keyring that manages
   * the specified `address` if one exists.
   *
   * @deprecated Use of this method is discouraged as actions executed directly on
   * keyrings are not being reflected in the KeyringController state and not
   * persisted in the vault. Use `withKeyring` instead.
   * @param account - An account address.
   * @returns Promise resolving to keyring of the `account` if one exists.
   */
  async getKeyringForAccount(account: string): Promise<unknown> {
    this.#assertIsUnlocked();
    const keyringIndex = await this.#findKeyringIndexForAccount(account);
    if (keyringIndex > -1) {
      return this.#keyrings[keyringIndex].keyring;
    }

    // Adding more info to the error
    let errorInfo = '';
    if (this.#keyrings.length === 0) {
      errorInfo = 'There are no keyrings';
    } else {
      errorInfo = 'There are keyrings, but none match the address';
    }
    throw new KeyringControllerError(
      `${KeyringControllerErrorMessage.NoKeyring}. Error info: ${errorInfo}`,
    );
  }

  async #findKeyringIndexForAccount(account: string): Promise<number> {
    this.#assertIsUnlocked();
    const address = account.toLowerCase();
    const accountsPerKeyring = await Promise.all(
      this.#keyrings.map(({ keyring }) => keyring.getAccounts()),
    );
    return accountsPerKeyring.findIndex((accounts) =>
      accounts.map((a) => a.toLowerCase()).includes(address),
    );
  }

  /**
   * Returns all keyrings of the given type.
   *
   * @deprecated Use of this method is discouraged as actions executed directly on
   * keyrings are not being reflected in the KeyringController state and not
   * persisted in the vault. Use `withKeyring` instead.
   * @param type - Keyring type name.
   * @returns An array of keyrings of the given type.
   */
  getKeyringsByType(type: KeyringTypes | string): unknown[] {
    this.#assertIsUnlocked();
    return this.#keyrings
      .filter(({ keyring }) => keyring.type === type)
      .map(({ keyring }) => keyring);
  }

  /**
   * Persist all serialized keyrings in the vault.
   *
   * @deprecated This method is being phased out in favor of `withKeyring`.
   * @returns Promise resolving with `true` value when the
   * operation completes.
   */
  async persistAllKeyrings(): Promise<boolean> {
    return this.#withRollback(async () => {
      this.#assertIsUnlocked();

      await this.#updateVault();
      return true;
    });
  }

  /**
   * Imports an account with the specified import strategy.
   *
   * @param strategy - Import strategy name.
   * @param args - Array of arguments to pass to the underlying stategy.
   * @throws Will throw when passed an unrecognized strategy.
   * @returns Promise resolving to the imported account address.
   */
  async importAccountWithStrategy(
    strategy: AccountImportStrategy,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[],
  ): Promise<string> {
    this.#assertIsUnlocked();
    return this.#persistOrRollback(async () => {
      let privateKey;
      switch (strategy) {
        case AccountImportStrategy.privateKey: {
          const [importedKey] = args;
          if (!importedKey) {
            throw new KeyringControllerError('Cannot import an empty key.');
          }
          const prefixed = add0x(importedKey);

          let bufferedPrivateKey;
          try {
            bufferedPrivateKey = hexToBytes(prefixed);
          } catch {
            throw new KeyringControllerError(
              'Cannot import invalid private key.',
            );
          }

          if (
            !isValidPrivate(bufferedPrivateKey) ||
            // ensures that the key is 64 bytes long
            getBinarySize(prefixed) !== 64 + '0x'.length
          ) {
            throw new KeyringControllerError(
              'Cannot import invalid private key.',
            );
          }

          privateKey = remove0x(prefixed);
          break;
        }
        case AccountImportStrategy.json: {
          let wallet;
          const [input, password] = args;
          try {
            wallet = importers.fromEtherWallet(input, password);
          } catch {
            wallet = wallet ?? (await Wallet.fromV3(input, password, true));
          }
          privateKey = bytesToHex(new Uint8Array(wallet.getPrivateKey()));
          break;
        }
        default:
          throw new KeyringControllerError(
            `Unexpected import strategy: '${String(strategy)}'`,
          );
      }
      const newKeyring = await this.#newKeyring(KeyringTypes.simple, [
        privateKey,
      ]);
      const accounts = await newKeyring.getAccounts();
      return accounts[0];
    });
  }

  /**
   * Removes an account from keyring state.
   *
   * @param address - Address of the account to remove.
   * @fires KeyringController:accountRemoved
   * @returns Promise resolving when the account is removed.
   */
  async removeAccount(address: string): Promise<void> {
    this.#assertIsUnlocked();

    await this.#persistOrRollback(async () => {
      const keyringIndex = await this.#findKeyringIndexForAccount(address);

      if (keyringIndex === -1) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.NoKeyring,
        );
      }

      const { keyring } = this.#keyrings[keyringIndex];

      const isPrimaryKeyring = keyringIndex === 0;
      const shouldRemoveKeyring = (await keyring.getAccounts()).length === 1;

      // Primary keyring should never be removed, so we need to keep at least one account in it
      if (isPrimaryKeyring && shouldRemoveKeyring) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.LastAccountInPrimaryKeyring,
        );
      }

      // Not all the keyrings support this, so we have to check
      if (!keyring.removeAccount) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.UnsupportedRemoveAccount,
        );
      }

      // FIXME #1: We do cast to `Hex` to make the type checker happy here, and
      // because `Keyring<State>.removeAccount` requires address to be `Hex`.
      // Those types would need to be updated for a full non-EVM support.
      //
      // FIXME #2: The `removeAccount` method of snaps keyring is async. We have
      // to update the interface of the other keyrings to be async as well.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await keyring.removeAccount(address as Hex);

      if (shouldRemoveKeyring) {
        this.#keyrings.splice(keyringIndex, 1);
        await this.#destroyKeyring(keyring);
      }
    });

    this.messenger.publish(`${name}:accountRemoved`, address);
  }

  /**
   * Deallocates all secrets and locks the wallet.
   *
   * @returns Promise resolving when the operation completes.
   */
  async setLocked(): Promise<void> {
    this.#assertIsUnlocked();

    return this.#withRollback(async () => {
      this.#encryptionKey = undefined;
      await this.#clearKeyrings();

      this.update((state) => {
        state.isUnlocked = false;
        state.keyrings = [];
        delete state.encryptionKey;
        delete state.encryptionSalt;
      });

      this.messenger.publish(`${name}:lock`);
    });
  }

  /**
   * Signs message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  async signMessage(messageParams: PersonalMessageParams): Promise<string> {
    this.#assertIsUnlocked();

    if (!messageParams.data) {
      throw new KeyringControllerError("Can't sign an empty message");
    }

    const address = ethNormalize(messageParams.from) as Hex;
    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;
    if (!keyring.signMessage) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedSignMessage,
      );
    }

    return await keyring.signMessage(address, messageParams.data);
  }

  /**
   * Signs EIP-7702 Authorization message by calling down into a specific keyring.
   *
   * @param params - EIP7702AuthorizationParams object to sign.
   * @returns Promise resolving to an EIP-7702 Authorization signature.
   * @throws Will throw UnsupportedSignEIP7702Authorization if the keyring does not support signing EIP-7702 Authorization messages.
   */
  async signEip7702Authorization(
    params: Eip7702AuthorizationParams,
  ): Promise<string> {
    const from = ethNormalize(params.from) as Hex;

    const keyring = (await this.getKeyringForAccount(from)) as EthKeyring;

    if (!keyring.signEip7702Authorization) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedSignEip7702Authorization,
      );
    }

    const { chainId, nonce } = params;
    const contractAddress = ethNormalize(params.contractAddress) as
      | Hex
      | undefined;

    if (contractAddress === undefined) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.MissingEip7702AuthorizationContractAddress,
      );
    }

    return await keyring.signEip7702Authorization(from, [
      chainId,
      contractAddress,
      nonce,
    ]);
  }

  /**
   * Signs personal message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  async signPersonalMessage(
    messageParams: PersonalMessageParams,
  ): Promise<string> {
    this.#assertIsUnlocked();
    const address = ethNormalize(messageParams.from) as Hex;
    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;
    if (!keyring.signPersonalMessage) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedSignPersonalMessage,
      );
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
    this.#assertIsUnlocked();

    try {
      if (
        ![
          SignTypedDataVersion.V1,
          SignTypedDataVersion.V3,
          SignTypedDataVersion.V4,
        ].includes(version)
      ) {
        throw new KeyringControllerError(
          `Unexpected signTypedMessage version: '${version}'`,
        );
      }

      // Cast to `Hex` here is safe here because `messageParams.from` is not nullish.
      // `normalize` returns `Hex` unless given a nullish value.
      const address = ethNormalize(messageParams.from) as Hex;
      const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;
      if (!keyring.signTypedData) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.UnsupportedSignTypedMessage,
        );
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
      const errorMessage =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      throw new KeyringControllerError(
        `Keyring Controller signTypedMessage: ${errorMessage}`,
        error instanceof Error ? error : undefined,
      );
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
  ): Promise<TypedTxData> {
    this.#assertIsUnlocked();
    const address = ethNormalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;
    if (!keyring.signTransaction) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedSignTransaction,
      );
    }

    return await keyring.signTransaction(address, transaction, opts);
  }

  /**
   * Convert a base transaction to a base UserOperation.
   *
   * @param from - Address of the sender.
   * @param transactions - Base transactions to include in the UserOperation.
   * @param executionContext - The execution context to use for the UserOperation.
   * @returns A pseudo-UserOperation that can be used to construct a real.
   */
  async prepareUserOperation(
    from: string,
    transactions: EthBaseTransaction[],
    executionContext: KeyringExecutionContext,
  ): Promise<EthBaseUserOperation> {
    this.#assertIsUnlocked();
    const address = ethNormalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;

    if (!keyring.prepareUserOperation) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedPrepareUserOperation,
      );
    }

    return await keyring.prepareUserOperation(
      address,
      transactions,
      executionContext,
    );
  }

  /**
   * Patches properties of a UserOperation. Currently, only the
   * `paymasterAndData` can be patched.
   *
   * @param from - Address of the sender.
   * @param userOp - UserOperation to patch.
   * @param executionContext - The execution context to use for the UserOperation.
   * @returns A patch to apply to the UserOperation.
   */
  async patchUserOperation(
    from: string,
    userOp: EthUserOperation,
    executionContext: KeyringExecutionContext,
  ): Promise<EthUserOperationPatch> {
    this.#assertIsUnlocked();
    const address = ethNormalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;

    if (!keyring.patchUserOperation) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedPatchUserOperation,
      );
    }

    return await keyring.patchUserOperation(address, userOp, executionContext);
  }

  /**
   * Signs an UserOperation.
   *
   * @param from - Address of the sender.
   * @param userOp - UserOperation to sign.
   * @param executionContext - The execution context to use for the UserOperation.
   * @returns The signature of the UserOperation.
   */
  async signUserOperation(
    from: string,
    userOp: EthUserOperation,
    executionContext: KeyringExecutionContext,
  ): Promise<string> {
    this.#assertIsUnlocked();
    const address = ethNormalize(from) as Hex;
    const keyring = (await this.getKeyringForAccount(address)) as EthKeyring;

    if (!keyring.signUserOperation) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedSignUserOperation,
      );
    }

    return await keyring.signUserOperation(address, userOp, executionContext);
  }

  /**
   * Changes the password used to encrypt the vault.
   *
   * @param password - The new password.
   * @returns Promise resolving when the operation completes.
   */
  changePassword(password: string): Promise<void> {
    this.#assertIsUnlocked();

    return this.#persistOrRollback(async () => {
      assertIsValidPassword(password);
      await this.#deriveAndSetEncryptionKey(password, {
        ignoreExistingVault: true,
      });
    });
  }

  /**
   * Attempts to decrypt the current vault and load its keyrings, using the
   * given encryption key and salt. The optional salt can be used to check for
   * consistency with the vault salt.
   *
   * @param encryptionKey - Key to unlock the keychain.
   * @param encryptionSalt - Optional salt to unlock the keychain.
   * @returns Promise resolving when the operation completes.
   */
  async submitEncryptionKey(
    encryptionKey: string,
    encryptionSalt?: string,
  ): Promise<void> {
    const { newMetadata } = await this.#withRollback(async () => {
      const result = await this.#unlockKeyrings({
        encryptionKey,
        encryptionSalt,
      });
      this.#setUnlocked();
      return result;
    });

    try {
      // if new metadata has been generated during login, we
      // can attempt to upgrade the vault.
      await this.#withRollback(async () => {
        if (newMetadata) {
          await this.#updateVault();
        }
      });
    } catch (error) {
      // We don't want to throw an error if the upgrade fails
      // since the controller is already unlocked.
      console.error('Failed to update vault during login:', error);
    }
  }

  /**
   * Exports the vault encryption key.
   *
   * @returns The vault encryption key.
   */
  async exportEncryptionKey(): Promise<string> {
    this.#assertIsUnlocked();

    return await this.#withControllerLock(async () => {
      assertIsEncryptionKeySet(this.#encryptionKey?.serialized);
      return this.#encryptionKey.serialized;
    });
  }

  /**
   * Attempts to decrypt the current vault and load its keyrings,
   * using the given password.
   *
   * @param password - Password to unlock the keychain.
   * @returns Promise resolving when the operation completes.
   */
  async submitPassword(password: string): Promise<void> {
    const { newMetadata } = await this.#withRollback(async () => {
      const result = await this.#unlockKeyrings({ password });
      this.#setUnlocked();
      return result;
    });

    try {
      // If there are stronger encryption params available, or
      // if new metadata has been generated during login, we
      // can attempt to upgrade the vault.
      await this.#withRollback(async () => {
        if (newMetadata || this.#isNewEncryptionAvailable()) {
          await this.#deriveAndSetEncryptionKey(password, {
            // If the vault is being upgraded, we want to ignore the metadata
            // that is already in the vault, so we can effectively
            // re-encrypt the vault with the new encryption config.
            ignoreExistingVault: true,
          });
          await this.#updateVault();
        }
      });
    } catch (error) {
      // We don't want to throw an error if the upgrade fails
      // since the controller is already unlocked.
      console.error('Failed to update vault during login:', error);
    }
  }

  /**
   * Verifies the that the seed phrase restores the current keychain's accounts.
   *
   * @param keyringId - The id of the keyring to verify.
   * @returns Promise resolving to the seed phrase as Uint8Array.
   */
  async verifySeedPhrase(keyringId?: string): Promise<Uint8Array> {
    this.#assertIsUnlocked();

    return this.#withControllerLock(async () =>
      this.#verifySeedPhrase(keyringId),
    );
  }

  /**
   * Select a keyring and execute the given operation with
   * the selected keyring, as a mutually exclusive atomic
   * operation.
   *
   * The method automatically persists changes at the end of the
   * function execution, or rolls back the changes if an error
   * is thrown.
   *
   * @param selector - Keyring selector object.
   * @param operation - Function to execute with the selected keyring.
   * @param options - Additional options.
   * @param options.createIfMissing - Whether to create a new keyring if the selected one is missing.
   * @param options.createWithData - Optional data to use when creating a new keyring.
   * @returns Promise resolving to the result of the function execution.
   * @template SelectedKeyring - The type of the selected keyring.
   * @template CallbackResult - The type of the value resolved by the callback function.
   * @deprecated This method overload is deprecated. Use `withKeyring` without options instead.
   */
  async withKeyring<
    SelectedKeyring extends EthKeyring = EthKeyring,
    CallbackResult = void,
  >(
    selector: KeyringSelector,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    options:
      | { createIfMissing?: false }
      | { createIfMissing: true; createWithData?: unknown },
  ): Promise<CallbackResult>;

  /**
   * Select a keyring and execute the given operation with
   * the selected keyring, as a mutually exclusive atomic
   * operation.
   *
   * The method automatically persists changes at the end of the
   * function execution, or rolls back the changes if an error
   * is thrown.
   *
   * @param selector - Keyring selector object.
   * @param operation - Function to execute with the selected keyring.
   * @returns Promise resolving to the result of the function execution.
   * @template SelectedKeyring - The type of the selected keyring.
   * @template CallbackResult - The type of the value resolved by the callback function.
   */
  async withKeyring<
    SelectedKeyring extends EthKeyring = EthKeyring,
    CallbackResult = void,
  >(
    selector: KeyringSelector,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult>;

  async withKeyring<
    SelectedKeyring extends EthKeyring = EthKeyring,
    CallbackResult = void,
  >(
    selector: KeyringSelector,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
    options:
      | { createIfMissing?: false }
      | { createIfMissing: true; createWithData?: unknown } = {
      createIfMissing: false,
    },
  ): Promise<CallbackResult> {
    this.#assertIsUnlocked();

    return this.#persistOrRollback(async () => {
      let keyring: SelectedKeyring | undefined;

      if ('address' in selector) {
        keyring = (await this.getKeyringForAccount(selector.address)) as
          | SelectedKeyring
          | undefined;
      } else if ('type' in selector) {
        keyring = this.getKeyringsByType(selector.type)[selector.index ?? 0] as
          | SelectedKeyring
          | undefined;

        if (!keyring && options.createIfMissing) {
          keyring = (await this.#newKeyring(
            selector.type,
            options.createWithData,
          )) as SelectedKeyring;
        }
      } else if ('id' in selector) {
        keyring = this.#getKeyringById(selector.id) as SelectedKeyring;
      }

      if (!keyring) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.KeyringNotFound,
        );
      }

      const result = await operation({
        keyring,
        metadata: this.#getKeyringMetadata(keyring),
      });

      if (Object.is(result, keyring)) {
        // Access to a keyring instance outside of controller safeguards
        // should be discouraged, as it can lead to unexpected behavior.
        // This error is thrown to prevent consumers using `withKeyring`
        // as a way to get a reference to a keyring instance.
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.UnsafeDirectKeyringAccess,
        );
      }

      return result;
    });
  }

  async getAccountKeyringType(account: string): Promise<string> {
    this.#assertIsUnlocked();

    const keyring = (await this.getKeyringForAccount(account)) as EthKeyring;
    return keyring.type;
  }

  /**
   * Constructor helper for registering this controller's messeger
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      `${name}:signMessage`,
      this.signMessage.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:signEip7702Authorization`,
      this.signEip7702Authorization.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:signPersonalMessage`,
      this.signPersonalMessage.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:signTypedMessage`,
      this.signTypedMessage.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:decryptMessage`,
      this.decryptMessage.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:getEncryptionPublicKey`,
      this.getEncryptionPublicKey.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:getAccounts`,
      this.getAccounts.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:getKeyringsByType`,
      this.getKeyringsByType.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:getKeyringForAccount`,
      this.getKeyringForAccount.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:persistAllKeyrings`,
      this.persistAllKeyrings.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:prepareUserOperation`,
      this.prepareUserOperation.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:patchUserOperation`,
      this.patchUserOperation.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:signUserOperation`,
      this.signUserOperation.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:addNewAccount`,
      this.addNewAccount.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:withKeyring`,
      this.withKeyring.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:addNewKeyring`,
      this.addNewKeyring.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:createNewVaultAndKeychain`,
      this.createNewVaultAndKeychain.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:createNewVaultAndRestore`,
      this.createNewVaultAndRestore.bind(this),
    );

    this.messenger.registerActionHandler(
      `${name}:removeAccount`,
      this.removeAccount.bind(this),
    );
  }

  /**
   * Get the keyring by id.
   *
   * @param keyringId - The id of the keyring.
   * @returns The keyring.
   */
  #getKeyringById(keyringId: string): EthKeyring | undefined {
    return this.#keyrings.find(({ metadata }) => metadata.id === keyringId)
      ?.keyring;
  }

  /**
   * Get the keyring by id or return the first keyring if the id is not found.
   *
   * @param keyringId - The id of the keyring.
   * @returns The keyring.
   */
  #getKeyringByIdOrDefault(keyringId?: string): EthKeyring | undefined {
    if (!keyringId) {
      return this.#keyrings[0]?.keyring;
    }

    return this.#getKeyringById(keyringId);
  }

  /**
   * Get the metadata for the specified keyring.
   *
   * @param keyring - The keyring instance to get the metadata for.
   * @returns The keyring metadata.
   */
  #getKeyringMetadata(keyring: unknown): KeyringMetadata {
    const keyringWithMetadata = this.#keyrings.find(
      (candidate) => candidate.keyring === keyring,
    );
    if (!keyringWithMetadata) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.KeyringNotFound,
      );
    }
    return keyringWithMetadata.metadata;
  }

  /**
   * Get the keyring builder for the given `type`.
   *
   * @param type - The type of keyring to get the builder for.
   * @returns The keyring builder, or undefined if none exists.
   */
  #getKeyringBuilderForType(
    type: string,
  ): { (): EthKeyring; type: string } | undefined {
    return this.#keyringBuilders.find(
      (keyringBuilder) => keyringBuilder.type === type,
    );
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
  ): Promise<void> {
    this.#assertControllerMutexIsLocked();

    if (typeof password !== 'string') {
      throw new TypeError(KeyringControllerErrorMessage.WrongPasswordType);
    }

    this.update((state) => {
      delete state.encryptionKey;
      delete state.encryptionSalt;
    });

    await this.#deriveAndSetEncryptionKey(password, {
      ignoreExistingVault: true,
    });

    await this.#clearKeyrings();
    await this.#createKeyringWithFirstAccount(keyring.type, keyring.opts);
    this.#setUnlocked();
  }

  /**
   * Derive the vault encryption key from the provided password, and
   * assign it to the instance variable for later use with cryptographic
   * functions.
   *
   * When the controller has a vault in its state, the key is derived
   * using the salt from the vault. If the vault is empty, a new salt
   * is generated and used to derive the key.
   *
   * If `options.ignoreExistingVault` is set to `true`, the existing
   * vault is completely ignored: the new key won't be able to decrypt
   * the existing vault, and should be used to re-encrypt it.
   *
   * @param password - The password to use for decryption or derivation.
   * @param options - Options for the key derivation.
   * @param options.ignoreExistingVault - Whether to ignore the existing vault salt and key metadata
   */
  async #deriveAndSetEncryptionKey(
    password: string,
    options: { ignoreExistingVault: boolean } = {
      ignoreExistingVault: false,
    },
  ): Promise<void> {
    this.#assertControllerMutexIsLocked();
    const { vault } = this.state;

    if (typeof password !== 'string') {
      throw new TypeError(KeyringControllerErrorMessage.WrongPasswordType);
    }

    let serializedEncryptionKey: string, salt: string;
    if (vault && !options.ignoreExistingVault) {
      // The `decryptWithDetail` method is being used here instead of
      // `keyFromPassword` + `exportKey` to let the encryptor handle
      // any legacy encryption formats and metadata that might be
      // present (or absent) in the vault.
      const { exportedKeyString, salt: existingSalt } =
        await this.#encryptor.decryptWithDetail(password, vault);
      serializedEncryptionKey = exportedKeyString;
      salt = existingSalt;
    } else {
      salt = this.#encryptor.generateSalt();
      serializedEncryptionKey = await this.#encryptor.exportKey(
        await this.#encryptor.keyFromPassword(password, salt, true),
      );
    }

    this.#encryptionKey = {
      salt,
      serialized: serializedEncryptionKey,
    };
  }

  /**
   * Set the the `#encryptionKey` instance variable.
   * This method is used when the user provides an encryption key and salt
   * to unlock the keychain, instead of using a password.
   *
   * @param encryptionKey - The encryption key to use.
   * @param keyDerivationSalt - The salt to use for the encryption key.
   */
  #setEncryptionKey(encryptionKey: string, keyDerivationSalt: string): void {
    this.#assertControllerMutexIsLocked();

    if (
      typeof encryptionKey !== 'string' ||
      typeof keyDerivationSalt !== 'string'
    ) {
      throw new TypeError(KeyringControllerErrorMessage.WrongEncryptionKeyType);
    }

    const { vault } = this.state;
    if (vault && JSON.parse(vault).salt !== keyDerivationSalt) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.ExpiredCredentials,
      );
    }

    this.#encryptionKey = {
      salt: keyDerivationSalt,
      serialized: encryptionKey,
    };
  }

  /**
   * Internal non-exclusive method to verify the seed phrase.
   *
   * @param keyringId - The id of the keyring to verify the seed phrase for.
   * @returns A promise resolving to the seed phrase as Uint8Array.
   */
  async #verifySeedPhrase(keyringId?: string): Promise<Uint8Array> {
    this.#assertControllerMutexIsLocked();

    const keyring = this.#getKeyringByIdOrDefault(keyringId);

    if (!keyring) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.KeyringNotFound,
      );
    }

    if (keyring.type !== (KeyringTypes.hd as string)) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.UnsupportedVerifySeedPhrase,
      );
    }

    assertHasUint8ArrayMnemonic(keyring);

    const seedWords = keyring.mnemonic;
    const accounts = await keyring.getAccounts();
    /* istanbul ignore if */
    if (accounts.length === 0) {
      throw new KeyringControllerError('Cannot verify an empty keyring.');
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
      throw new KeyringControllerError(
        'Seed phrase imported incorrect number of accounts.',
      );
    }

    testAccounts.forEach((account: string, i: number) => {
      /* istanbul ignore if */
      if (account.toLowerCase() !== accounts[i].toLowerCase()) {
        throw new KeyringControllerError(
          'Seed phrase imported different accounts.',
        );
      }
    });

    return seedWords;
  }

  /**
   * Get the updated array of each keyring's type and
   * accounts list.
   *
   * @returns A promise resolving to the updated keyrings array.
   */
  async #getUpdatedKeyrings(): Promise<KeyringObject[]> {
    return Promise.all(this.#keyrings.map(displayForKeyring));
  }

  /**
   * Serialize the current array of keyring instances,
   * including unsupported keyrings by default.
   *
   * @param options - Method options.
   * @param options.includeUnsupported - Whether to include unsupported keyrings.
   * @returns The serialized keyrings.
   */
  async #getSerializedKeyrings(
    { includeUnsupported }: { includeUnsupported: boolean } = {
      includeUnsupported: true,
    },
  ): Promise<SerializedKeyring[]> {
    const serializedKeyrings: SerializedKeyring[] = await Promise.all(
      this.#keyrings.map(async ({ keyring, metadata }) => {
        return {
          type: keyring.type,
          data: await keyring.serialize(),
          metadata,
        };
      }),
    );

    if (includeUnsupported) {
      serializedKeyrings.push(...this.#unsupportedKeyrings);
    }

    return serializedKeyrings;
  }

  /**
   * Get a snapshot of session data held by instance variables.
   *
   * @returns An object with serialized keyrings, keyrings metadata,
   * and the user password.
   */
  async #getSessionState(): Promise<SessionState> {
    return {
      keyrings: await this.#getSerializedKeyrings(),
      encryptionKey: this.#encryptionKey,
    };
  }

  /**
   * Restore a serialized keyrings array.
   *
   * @param serializedKeyrings - The serialized keyrings array.
   * @returns The restored keyrings.
   */
  async #restoreSerializedKeyrings(
    serializedKeyrings: SerializedKeyring[],
  ): Promise<{
    keyrings: { keyring: EthKeyring; metadata: KeyringMetadata }[];
    newMetadata: boolean;
  }> {
    await this.#clearKeyrings();
    const keyrings: { keyring: EthKeyring; metadata: KeyringMetadata }[] = [];
    let newMetadata = false;

    for (const serializedKeyring of serializedKeyrings) {
      const result = await this.#restoreKeyring(serializedKeyring);
      if (result) {
        const { keyring, metadata } = result;
        keyrings.push({ keyring, metadata });
        if (result.newMetadata) {
          newMetadata = true;
        }
      }
    }

    return { keyrings, newMetadata };
  }

  /**
   * Unlock Keyrings, decrypting the vault and deserializing all
   * keyrings contained in it, using a password or an encryption key with salt.
   *
   * @param credentials - The credentials to unlock the keyrings.
   * @returns A promise resolving to the deserialized keyrings array.
   */
  async #unlockKeyrings(
    credentials:
      | {
          password: string;
        }
      | {
          encryptionKey: string;
          encryptionSalt?: string;
        },
  ): Promise<{
    keyrings: { keyring: EthKeyring; metadata: KeyringMetadata }[];
    newMetadata: boolean;
  }> {
    return this.#withVaultLock(async () => {
      if (!this.state.vault) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.VaultError,
        );
      }
      const parsedEncryptedVault = JSON.parse(this.state.vault);

      if ('password' in credentials) {
        await this.#deriveAndSetEncryptionKey(credentials.password);
      } else {
        this.#setEncryptionKey(
          credentials.encryptionKey,
          credentials.encryptionSalt ?? parsedEncryptedVault.salt,
        );
      }

      const encryptionKey = this.#encryptionKey?.serialized;
      if (!encryptionKey) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.MissingCredentials,
        );
      }

      const key = await this.#encryptor.importKey(encryptionKey);
      const vault = await this.#encryptor.decryptWithKey(
        key,
        parsedEncryptedVault,
      );

      if (!isSerializedKeyringsArray(vault)) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.VaultDataError,
        );
      }

      const { keyrings, newMetadata } =
        await this.#restoreSerializedKeyrings(vault);

      const updatedKeyrings = await this.#getUpdatedKeyrings();

      this.update((state) => {
        state.keyrings = updatedKeyrings;
        state.encryptionKey = encryptionKey;
        state.encryptionSalt = this.#encryptionKey?.salt;
      });

      return { keyrings, newMetadata };
    });
  }

  /**
   * Update the vault with the current keyrings.
   *
   * @returns A promise resolving to `true` if the operation is successful.
   */
  #updateVault(): Promise<boolean> {
    return this.#withVaultLock(async () => {
      // Ensure no duplicate accounts are persisted.
      await this.#assertNoDuplicateAccounts();

      if (!this.#encryptionKey) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.MissingCredentials,
        );
      }

      const serializedKeyrings = await this.#getSerializedKeyrings();

      if (
        !serializedKeyrings.some(
          (keyring) => keyring.type === (KeyringTypes.hd as string),
        )
      ) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.NoHdKeyring,
        );
      }

      const key = await this.#encryptor.importKey(
        this.#encryptionKey.serialized,
      );
      const encryptedVault = await this.#encryptor.encryptWithKey(
        key,
        serializedKeyrings,
      );
      // We need to include the salt used to derive
      // the encryption key, to be able to derive it
      // from password again.
      encryptedVault.salt = this.#encryptionKey.salt;
      const updatedState: Partial<KeyringControllerState> = {
        vault: JSON.stringify(encryptedVault),
        encryptionKey: this.#encryptionKey.serialized,
        encryptionSalt: this.#encryptionKey.salt,
      };

      const updatedKeyrings = await this.#getUpdatedKeyrings();

      this.update((state) => {
        state.vault = updatedState.vault;
        state.keyrings = updatedKeyrings;
        state.encryptionKey = updatedState.encryptionKey;
        state.encryptionSalt = updatedState.encryptionSalt;
      });

      return true;
    });
  }

  /**
   * Check if there are new encryption parameters available.
   *
   * @returns A promise resolving to `void`.
   */
  #isNewEncryptionAvailable(): boolean {
    const { vault } = this.state;

    if (!vault || !this.#encryptor.isVaultUpdated) {
      return false;
    }

    return !this.#encryptor.isVaultUpdated(vault);
  }

  /**
   * Retrieves all the accounts from keyrings instances
   * that are currently in memory.
   *
   * @param additionalKeyrings - Additional keyrings to include in the search.
   * @returns A promise resolving to an array of accounts.
   */
  async #getAccountsFromKeyrings(
    additionalKeyrings: EthKeyring[] = [],
  ): Promise<string[]> {
    const keyrings = this.#keyrings.map(({ keyring }) => keyring);

    const keyringArrays = await Promise.all(
      [...keyrings, ...additionalKeyrings].map(async (keyring) =>
        keyring.getAccounts(),
      ),
    );
    const addresses = keyringArrays.reduce((res, arr) => {
      return res.concat(arr);
    }, []);

    // Cast to `string[]` here is safe here because `addresses` has no nullish
    // values, and `normalize` returns `string` unless given a nullish value
    return addresses.map(normalize) as string[];
  }

  /**
   * Create a new keyring, ensuring that the first account is
   * also created.
   *
   * @param type - Keyring type to instantiate.
   * @param opts - Optional parameters required to instantiate the keyring.
   * @returns A promise that resolves if the operation is successful.
   */
  async #createKeyringWithFirstAccount(
    type: string,
    opts?: unknown,
  ): Promise<Hex> {
    this.#assertControllerMutexIsLocked();

    const keyring = await this.#newKeyring(type, opts);

    const [firstAccount] = await keyring.getAccounts();
    if (!firstAccount) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.NoFirstAccount,
      );
    }
    return firstAccount;
  }

  /**
   * Instantiate, initialize and return a new keyring of the given `type`,
   * using the given `opts`. The keyring is built using the keyring builder
   * registered for the given `type`.
   *
   * The internal keyring and keyring metadata arrays are updated with the new
   * keyring as well.
   *
   * @param type - The type of keyring to add.
   * @param data - Keyring initialization options.
   * @returns The new keyring.
   * @throws If the keyring includes duplicated accounts.
   */
  async #newKeyring(type: string, data?: unknown): Promise<EthKeyring> {
    const keyring = await this.#createKeyring(type, data);

    this.#keyrings.push({ keyring, metadata: getDefaultKeyringMetadata() });

    return keyring;
  }

  /**
   * Instantiate, initialize and return a keyring of the given `type` using the
   * given `opts`. The keyring is built using the keyring builder registered
   * for the given `type`.
   *
   * The keyring might be new, or it might be restored from the vault. This
   * function should only be called from `#newKeyring` or `#restoreKeyring`,
   * for the "new" and "restore" cases respectively.
   *
   * The internal keyring and keyring metadata arrays are *not* updated, the
   * caller is expected to update them.
   *
   * @param type - The type of keyring to add.
   * @param data - Keyring initialization options.
   * @returns The new keyring.
   * @throws If the keyring includes duplicated accounts.
   */
  async #createKeyring(type: string, data?: unknown): Promise<EthKeyring> {
    this.#assertControllerMutexIsLocked();

    const keyringBuilder = this.#getKeyringBuilderForType(type);

    if (!keyringBuilder) {
      throw new KeyringControllerError(
        `${KeyringControllerErrorMessage.NoKeyringBuilder}. Keyring type: ${type}`,
      );
    }

    const keyring = keyringBuilder();
    if (data) {
      // @ts-expect-error Enforce data type after updating clients
      await keyring.deserialize(data);
    }

    if (keyring.init) {
      await keyring.init();
    }

    if (
      type === (KeyringTypes.hd as string) &&
      (!isObject(data) || !data.mnemonic)
    ) {
      if (!keyring.generateRandomMnemonic) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.UnsupportedGenerateRandomMnemonic,
        );
      }

      // NOTE: Not all keyrings implement this method in a asynchronous-way. Using `await` for
      // non-thenable will still be valid (despite not being really useful). It allows us to cover both
      // cases and allow retro-compatibility too.
      await keyring.generateRandomMnemonic();
      await keyring.addAccounts(1);
    }

    return keyring;
  }

  /**
   * Remove all managed keyrings, destroying all their
   * instances in memory.
   */
  async #clearKeyrings(): Promise<void> {
    this.#assertControllerMutexIsLocked();
    for (const { keyring } of this.#keyrings) {
      await this.#destroyKeyring(keyring);
    }
    this.#keyrings = [];
    this.#unsupportedKeyrings = [];
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
  ): Promise<
    | { keyring: EthKeyring; metadata: KeyringMetadata; newMetadata: boolean }
    | undefined
  > {
    this.#assertControllerMutexIsLocked();

    try {
      const { type, data, metadata: serializedMetadata } = serialized;
      let newMetadata = false;
      let metadata = serializedMetadata;
      const keyring = await this.#createKeyring(type, data);
      await this.#assertNoDuplicateAccounts([keyring]);
      // If metadata is missing, assume the data is from an installation before
      // we had keyring metadata.
      if (!metadata) {
        newMetadata = true;
        metadata = getDefaultKeyringMetadata();
      }
      // The keyring is added to the keyrings array only if it's successfully restored
      // and the metadata is successfully added to the controller
      this.#keyrings.push({
        keyring,
        metadata,
      });
      return { keyring, metadata, newMetadata };
    } catch (error) {
      console.error(error);
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
  async #destroyKeyring(keyring: EthKeyring): Promise<void> {
    await keyring.destroy?.();
  }

  /**
   * Assert that there are no duplicate accounts in the keyrings.
   *
   * @param additionalKeyrings - Additional keyrings to include in the check.
   * @throws If there are duplicate accounts.
   */
  async #assertNoDuplicateAccounts(
    additionalKeyrings: EthKeyring[] = [],
  ): Promise<void> {
    const accounts = await this.#getAccountsFromKeyrings(additionalKeyrings);

    if (new Set(accounts).size !== accounts.length) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.DuplicatedAccount,
      );
    }
  }

  /**
   * Set the `isUnlocked` to true and notify listeners
   * through the messenger.
   *
   * @fires KeyringController:unlock
   */
  #setUnlocked(): void {
    this.#assertControllerMutexIsLocked();

    this.update((state) => {
      state.isUnlocked = true;
    });
    this.messenger.publish(`${name}:unlock`);
  }

  /**
   * Assert that the controller is unlocked.
   *
   * @throws If the controller is locked.
   */
  #assertIsUnlocked(): void {
    if (!this.state.isUnlocked) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.ControllerLocked,
      );
    }
  }

  /**
   * Execute the given function after acquiring the controller lock
   * and save the vault to state after it (only if needed), or rollback to their
   * previous state in case of error.
   *
   * @param callback - The function to execute.
   * @returns The result of the function.
   */
  async #persistOrRollback<Result>(
    callback: MutuallyExclusiveCallback<Result>,
  ): Promise<Result> {
    return this.#withRollback(async ({ releaseLock }) => {
      const oldState = JSON.stringify(await this.#getSessionState());
      const callbackResult = await callback({ releaseLock });
      const newState = JSON.stringify(await this.#getSessionState());

      // State is committed only if the operation is successful and need to trigger a vault update.
      if (!isEqual(oldState, newState)) {
        await this.#updateVault();
      }

      return callbackResult;
    });
  }

  /**
   * Execute the given function after acquiring the controller lock
   * and rollback keyrings and password states in case of error.
   *
   * @param callback - The function to execute atomically.
   * @returns The result of the function.
   */
  async #withRollback<Result>(
    callback: MutuallyExclusiveCallback<Result>,
  ): Promise<Result> {
    return this.#withControllerLock(async ({ releaseLock }) => {
      const currentSerializedKeyrings = await this.#getSerializedKeyrings();
      const currentEncryptionKey = cloneDeep(this.#encryptionKey);

      try {
        return await callback({ releaseLock });
      } catch (error) {
        // Keyrings and encryption credentials are restored to their previous state
        this.#encryptionKey = currentEncryptionKey;
        await this.#restoreSerializedKeyrings(currentSerializedKeyrings);

        throw error;
      }
    });
  }

  /**
   * Assert that the controller mutex is locked.
   *
   * @throws If the controller mutex is not locked.
   */
  #assertControllerMutexIsLocked(): void {
    if (!this.#controllerOperationMutex.isLocked()) {
      throw new KeyringControllerError(
        KeyringControllerErrorMessage.ControllerLockRequired,
      );
    }
  }

  /**
   * Lock the controller mutex before executing the given function,
   * and release it after the function is resolved or after an
   * error is thrown.
   *
   * This wrapper ensures that each mutable operation that interacts with the
   * controller and that changes its state is executed in a mutually exclusive way,
   * preventing unsafe concurrent access that could lead to unpredictable behavior.
   *
   * @param callback - The function to execute while the controller mutex is locked.
   * @returns The result of the function.
   */
  async #withControllerLock<Result>(
    callback: MutuallyExclusiveCallback<Result>,
  ): Promise<Result> {
    return withLock(this.#controllerOperationMutex, callback);
  }

  /**
   * Lock the vault mutex before executing the given function,
   * and release it after the function is resolved or after an
   * error is thrown.
   *
   * This ensures that each operation that interacts with the vault
   * is executed in a mutually exclusive way.
   *
   * @param callback - The function to execute while the vault mutex is locked.
   * @returns The result of the function.
   */
  async #withVaultLock<Result>(
    callback: MutuallyExclusiveCallback<Result>,
  ): Promise<Result> {
    this.#assertControllerMutexIsLocked();

    return withLock(this.#vaultOperationMutex, callback);
  }
}

/**
 * Lock the given mutex before executing the given function,
 * and release it after the function is resolved or after an
 * error is thrown.
 *
 * @param mutex - The mutex to lock.
 * @param callback - The function to execute while the mutex is locked.
 * @returns The result of the function.
 */
async function withLock<Result>(
  mutex: Mutex,
  callback: MutuallyExclusiveCallback<Result>,
): Promise<Result> {
  const releaseLock = await mutex.acquire();

  try {
    return await callback({ releaseLock });
  } finally {
    releaseLock();
  }
}

/**
 * Generate a new keyring metadata object.
 *
 * @returns Keyring metadata.
 */
function getDefaultKeyringMetadata(): KeyringMetadata {
  return { id: ulid(), name: '' };
}

export default KeyringController;
