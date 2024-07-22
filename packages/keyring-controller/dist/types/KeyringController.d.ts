import type { TxData, TypedTransaction } from '@ethereumjs/tx';
import type { MetaMaskKeyring as QRKeyring, IKeyringState as IQRKeyringState } from '@keystonehq/metamask-airgapped-keyring';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import * as encryptorUtils from '@metamask/browser-passworder';
import type { EthBaseTransaction, EthBaseUserOperation, EthKeyring, EthUserOperation, EthUserOperationPatch, KeyringExecutionContext } from '@metamask/keyring-api';
import type { PersonalMessageParams, TypedMessageParams } from '@metamask/message-manager';
import type { Eip1024EncryptedData, Hex, Json, KeyringClass } from '@metamask/utils';
import type { Patch } from 'immer';
declare const name = "KeyringController";
/**
 * Available keyring types
 */
export declare enum KeyringTypes {
    simple = "Simple Key Pair",
    hd = "HD Key Tree",
    qr = "QR Hardware Wallet Device",
    trezor = "Trezor Hardware",
    ledger = "Ledger Hardware",
    lattice = "Lattice Hardware",
    snap = "Snap Keyring"
}
/**
 * Custody keyring types are a special case, as they are not a single type
 * but they all start with the prefix "Custody".
 * @param keyringType - The type of the keyring.
 * @returns Whether the keyring type is a custody keyring.
 */
export declare const isCustodyKeyring: (keyringType: string) => boolean;
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
export type KeyringControllerMemState = Omit<KeyringControllerState, 'vault' | 'encryptionKey' | 'encryptionSalt'>;
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
export type KeyringControllerActions = KeyringControllerGetStateAction | KeyringControllerSignMessageAction | KeyringControllerSignPersonalMessageAction | KeyringControllerSignTypedMessageAction | KeyringControllerDecryptMessageAction | KeyringControllerGetEncryptionPublicKeyAction | KeyringControllerGetAccountsAction | KeyringControllerGetKeyringsByTypeAction | KeyringControllerGetKeyringForAccountAction | KeyringControllerPersistAllKeyringsAction | KeyringControllerPrepareUserOperationAction | KeyringControllerPatchUserOperationAction | KeyringControllerSignUserOperationAction;
export type KeyringControllerEvents = KeyringControllerStateChangeEvent | KeyringControllerLockEvent | KeyringControllerUnlockEvent | KeyringControllerAccountRemovedEvent | KeyringControllerQRKeyringStateChangeEvent;
export type KeyringControllerMessenger = RestrictedControllerMessenger<typeof name, KeyringControllerActions, KeyringControllerEvents, never, never>;
export type KeyringControllerOptions = {
    keyringBuilders?: {
        (): EthKeyring<Json>;
        type: string;
    }[];
    messenger: KeyringControllerMessenger;
    state?: {
        vault?: string;
    };
} & ({
    cacheEncryptionKey: true;
    encryptor?: ExportableKeyEncryptor;
} | {
    cacheEncryptionKey?: false;
    encryptor?: GenericEncryptor | ExportableKeyEncryptor;
});
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
export declare enum AccountImportStrategy {
    privateKey = "privateKey",
    json = "json"
}
/**
 * The `signTypedMessage` version
 *
 * @see https://docs.metamask.io/guide/signing-data.html
 */
export declare enum SignTypedDataVersion {
    V1 = "V1",
    V3 = "V3",
    V4 = "V4"
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
    isVaultUpdated?: (vault: string, targetDerivationParams?: encryptorUtils.KeyDerivationOptions) => boolean;
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
    encryptWithKey: (key: unknown, object: Json) => Promise<encryptorUtils.EncryptionResult>;
    /**
     * Encrypts the given object with the given password, and returns the
     * encryption result and the exported key string.
     *
     * @param password - The password to encrypt with.
     * @param object - The object to encrypt.
     * @param salt - The optional salt to use for encryption.
     * @returns The encrypted string and the exported key string.
     */
    encryptWithDetail: (password: string, object: Json, salt?: string) => Promise<encryptorUtils.DetailedEncryptionResult>;
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
    decryptWithDetail: (password: string, encryptedString: string) => Promise<encryptorUtils.DetailedDecryptResult>;
    /**
     * Generates an encryption key from exported key string.
     *
     * @param key - The exported key string.
     * @returns The encryption key.
     */
    importKey: (key: string) => Promise<unknown>;
};
export type KeyringSelector = {
    type: string;
    index?: number;
} | {
    address: Hex;
};
/**
 * Get builder function for `Keyring`
 *
 * Returns a builder function for `Keyring` with a `type` property.
 *
 * @param KeyringConstructor - The Keyring class for the builder.
 * @returns A builder function for the given Keyring.
 */
export declare function keyringBuilderFactory(KeyringConstructor: KeyringClass<Json>): {
    (): import("@metamask/utils").Keyring<Json>;
    type: string;
};
export declare const getDefaultKeyringState: () => KeyringControllerState;
/**
 * Controller responsible for establishing and managing user identity.
 *
 * This class is a wrapper around the `eth-keyring-controller` package. The
 * `eth-keyring-controller` manages the "vault", which is an encrypted store of private keys, and
 * it manages the wallet "lock" state. This wrapper class has convenience methods for interacting
 * with the internal keyring controller and handling certain complex operations that involve the
 * keyrings.
 */
export declare class KeyringController extends BaseController<typeof name, KeyringControllerState, KeyringControllerMessenger> {
    #private;
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
    constructor(options: KeyringControllerOptions);
    /**
     * Adds a new account to the default (first) HD seed phrase keyring.
     *
     * @param accountCount - Number of accounts before adding a new one, used to
     * make the method idempotent.
     * @returns Promise resolving to the added account address.
     */
    addNewAccount(accountCount?: number): Promise<string>;
    /**
     * Adds a new account to the specified keyring.
     *
     * @param keyring - Keyring to add the account to.
     * @param accountCount - Number of accounts before adding a new one, used to make the method idempotent.
     * @returns Promise resolving to the added account address
     */
    addNewAccountForKeyring(keyring: EthKeyring<Json>, accountCount?: number): Promise<Hex>;
    /**
     * Adds a new account to the default (first) HD seed phrase keyring without updating identities in preferences.
     *
     * @returns Promise resolving to the added account address.
     */
    addNewAccountWithoutUpdate(): Promise<string>;
    /**
     * Effectively the same as creating a new keychain then populating it
     * using the given seed phrase.
     *
     * @param password - Password to unlock keychain.
     * @param seed - A BIP39-compliant seed phrase as Uint8Array,
     * either as a string or an array of UTF-8 bytes that represent the string.
     * @returns Promise resolving when the operation ends successfully.
     */
    createNewVaultAndRestore(password: string, seed: Uint8Array): Promise<void>;
    /**
     * Create a new vault and primary keyring.
     *
     * This only works if keyrings are empty. If there is a pre-existing unlocked vault, calling this will have no effect.
     * If there is a pre-existing locked vault, it will be replaced.
     *
     * @param password - Password to unlock the new vault.
     */
    createNewVaultAndKeychain(password: string): Promise<void>;
    /**
     * Adds a new keyring of the given `type`.
     *
     * @param type - Keyring type name.
     * @param opts - Keyring options.
     * @throws If a builder for the given `type` does not exist.
     * @returns Promise resolving to the added keyring.
     */
    addNewKeyring(type: KeyringTypes | string, opts?: unknown): Promise<unknown>;
    /**
     * Method to verify a given password validity. Throws an
     * error if the password is invalid.
     *
     * @param password - Password of the keyring.
     */
    verifyPassword(password: string): Promise<void>;
    /**
     * Returns the status of the vault.
     *
     * @returns Boolean returning true if the vault is unlocked.
     */
    isUnlocked(): boolean;
    /**
     * Gets the seed phrase of the HD keyring.
     *
     * @param password - Password of the keyring.
     * @returns Promise resolving to the seed phrase.
     */
    exportSeedPhrase(password: string): Promise<Uint8Array>;
    /**
     * Gets the private key from the keyring controlling an address.
     *
     * @param password - Password of the keyring.
     * @param address - Address to export.
     * @returns Promise resolving to the private key for an address.
     */
    exportAccount(password: string, address: string): Promise<string>;
    /**
     * Returns the public addresses of all accounts from every keyring.
     *
     * @returns A promise resolving to an array of addresses.
     */
    getAccounts(): Promise<string[]>;
    /**
     * Get encryption public key.
     *
     * @param account - An account address.
     * @param opts - Additional encryption options.
     * @throws If the `account` does not exist or does not support the `getEncryptionPublicKey` method
     * @returns Promise resolving to encyption public key of the `account` if one exists.
     */
    getEncryptionPublicKey(account: string, opts?: Record<string, unknown>): Promise<string>;
    /**
     * Attempts to decrypt the provided message parameters.
     *
     * @param messageParams - The decryption message parameters.
     * @param messageParams.from - The address of the account you want to use to decrypt the message.
     * @param messageParams.data - The encrypted data that you want to decrypt.
     * @returns The raw decryption result.
     */
    decryptMessage(messageParams: {
        from: string;
        data: Eip1024EncryptedData;
    }): Promise<string>;
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
    getKeyringForAccount(account: string): Promise<unknown>;
    /**
     * Returns all keyrings of the given type.
     *
     * @deprecated Use of this method is discouraged as actions executed directly on
     * keyrings are not being reflected in the KeyringController state and not
     * persisted in the vault. Use `withKeyring` instead.
     * @param type - Keyring type name.
     * @returns An array of keyrings of the given type.
     */
    getKeyringsByType(type: KeyringTypes | string): unknown[];
    /**
     * Persist all serialized keyrings in the vault.
     *
     * @deprecated This method is being phased out in favor of `withKeyring`.
     * @returns Promise resolving with `true` value when the
     * operation completes.
     */
    persistAllKeyrings(): Promise<boolean>;
    /**
     * Imports an account with the specified import strategy.
     *
     * @param strategy - Import strategy name.
     * @param args - Array of arguments to pass to the underlying stategy.
     * @throws Will throw when passed an unrecognized strategy.
     * @returns Promise resolving to the imported account address.
     */
    importAccountWithStrategy(strategy: AccountImportStrategy, args: any[]): Promise<string>;
    /**
     * Removes an account from keyring state.
     *
     * @param address - Address of the account to remove.
     * @fires KeyringController:accountRemoved
     * @returns Promise resolving when the account is removed.
     */
    removeAccount(address: string): Promise<void>;
    /**
     * Deallocates all secrets and locks the wallet.
     *
     * @returns Promise resolving when the operation completes.
     */
    setLocked(): Promise<void>;
    /**
     * Signs message by calling down into a specific keyring.
     *
     * @param messageParams - PersonalMessageParams object to sign.
     * @returns Promise resolving to a signed message string.
     */
    signMessage(messageParams: PersonalMessageParams): Promise<string>;
    /**
     * Signs personal message by calling down into a specific keyring.
     *
     * @param messageParams - PersonalMessageParams object to sign.
     * @returns Promise resolving to a signed message string.
     */
    signPersonalMessage(messageParams: PersonalMessageParams): Promise<string>;
    /**
     * Signs typed message by calling down into a specific keyring.
     *
     * @param messageParams - TypedMessageParams object to sign.
     * @param version - Compatibility version EIP712.
     * @throws Will throw when passed an unrecognized version.
     * @returns Promise resolving to a signed message string or an error if any.
     */
    signTypedMessage(messageParams: TypedMessageParams, version: SignTypedDataVersion): Promise<string>;
    /**
     * Signs a transaction by calling down into a specific keyring.
     *
     * @param transaction - Transaction object to sign. Must be a `ethereumjs-tx` transaction instance.
     * @param from - Address to sign from, should be in keychain.
     * @param opts - An optional options object.
     * @returns Promise resolving to a signed transaction string.
     */
    signTransaction(transaction: TypedTransaction, from: string, opts?: Record<string, unknown>): Promise<TxData>;
    /**
     * Convert a base transaction to a base UserOperation.
     *
     * @param from - Address of the sender.
     * @param transactions - Base transactions to include in the UserOperation.
     * @param executionContext - The execution context to use for the UserOperation.
     * @returns A pseudo-UserOperation that can be used to construct a real.
     */
    prepareUserOperation(from: string, transactions: EthBaseTransaction[], executionContext: KeyringExecutionContext): Promise<EthBaseUserOperation>;
    /**
     * Patches properties of a UserOperation. Currently, only the
     * `paymasterAndData` can be patched.
     *
     * @param from - Address of the sender.
     * @param userOp - UserOperation to patch.
     * @param executionContext - The execution context to use for the UserOperation.
     * @returns A patch to apply to the UserOperation.
     */
    patchUserOperation(from: string, userOp: EthUserOperation, executionContext: KeyringExecutionContext): Promise<EthUserOperationPatch>;
    /**
     * Signs an UserOperation.
     *
     * @param from - Address of the sender.
     * @param userOp - UserOperation to sign.
     * @param executionContext - The execution context to use for the UserOperation.
     * @returns The signature of the UserOperation.
     */
    signUserOperation(from: string, userOp: EthUserOperation, executionContext: KeyringExecutionContext): Promise<string>;
    /**
     * Changes the password used to encrypt the vault.
     *
     * @param password - The new password.
     * @returns Promise resolving when the operation completes.
     */
    changePassword(password: string): Promise<void>;
    /**
     * Attempts to decrypt the current vault and load its keyrings,
     * using the given encryption key and salt.
     *
     * @param encryptionKey - Key to unlock the keychain.
     * @param encryptionSalt - Salt to unlock the keychain.
     * @returns Promise resolving when the operation completes.
     */
    submitEncryptionKey(encryptionKey: string, encryptionSalt: string): Promise<void>;
    /**
     * Attempts to decrypt the current vault and load its keyrings,
     * using the given password.
     *
     * @param password - Password to unlock the keychain.
     * @returns Promise resolving when the operation completes.
     */
    submitPassword(password: string): Promise<void>;
    /**
     * Verifies the that the seed phrase restores the current keychain's accounts.
     *
     * @returns Promise resolving to the seed phrase as Uint8Array.
     */
    verifySeedPhrase(): Promise<Uint8Array>;
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
    withKeyring<SelectedKeyring extends EthKeyring<Json> = EthKeyring<Json>, CallbackResult = void>(selector: KeyringSelector, operation: (keyring: SelectedKeyring) => Promise<CallbackResult>, options: {
        createIfMissing?: false;
    } | {
        createIfMissing: true;
        createWithData?: unknown;
    }): Promise<CallbackResult>;
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
    withKeyring<SelectedKeyring extends EthKeyring<Json> = EthKeyring<Json>, CallbackResult = void>(selector: KeyringSelector, operation: (keyring: SelectedKeyring) => Promise<CallbackResult>): Promise<CallbackResult>;
    /**
     * Get QR Hardware keyring.
     *
     * @returns The QR Keyring if defined, otherwise undefined
     * @deprecated Use `withKeyring` instead.
     */
    getQRKeyring(): QRKeyring | undefined;
    /**
     * Get QR hardware keyring. If it doesn't exist, add it.
     *
     * @returns The added keyring
     * @deprecated Use `addNewKeyring` and `withKeyring` instead.
     */
    getOrAddQRKeyring(): Promise<QRKeyring>;
    /**
     * Restore QR keyring from serialized data.
     *
     * @param serialized - Serialized data to restore the keyring from.
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    restoreQRKeyring(serialized: any): Promise<void>;
    /**
     * Reset QR keyring state.
     *
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    resetQRKeyringState(): Promise<void>;
    /**
     * Get QR keyring state.
     *
     * @returns Promise resolving to the keyring state.
     * @deprecated Use `withKeyring` or subscribe to `"KeyringController:qrKeyringStateChange"`
     * instead.
     */
    getQRKeyringState(): Promise<IQRKeyringState>;
    /**
     * Submit QR hardware wallet public HDKey.
     *
     * @param cryptoHDKey - The key to submit.
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    submitQRCryptoHDKey(cryptoHDKey: string): Promise<void>;
    /**
     * Submit QR hardware wallet account.
     *
     * @param cryptoAccount - The account to submit.
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    submitQRCryptoAccount(cryptoAccount: string): Promise<void>;
    /**
     * Submit QR hardware wallet signature.
     *
     * @param requestId - The request ID.
     * @param ethSignature - The signature to submit.
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    submitQRSignature(requestId: string, ethSignature: string): Promise<void>;
    /**
     * Cancel QR sign request.
     *
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    cancelQRSignRequest(): Promise<void>;
    /**
     * Cancels qr keyring sync.
     *
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    cancelQRSynchronization(): Promise<void>;
    /**
     * Connect to QR hardware wallet.
     *
     * @param page - The page to connect to.
     * @returns Promise resolving to the connected accounts.
     * @deprecated Use of this method is discouraged as it creates a dangling promise
     * internal to the `QRKeyring`, which can lead to unpredictable deadlocks. Please use
     * `withKeyring` instead.
     */
    connectQRHardware(page: number): Promise<{
        balance: string;
        address: string;
        index: number;
    }[]>;
    /**
     * Unlock a QR hardware wallet account.
     *
     * @param index - The index of the account to unlock.
     * @returns Promise resolving when the operation completes.
     * @deprecated Use `withKeyring` instead.
     */
    unlockQRHardwareWalletAccount(index: number): Promise<void>;
    getAccountKeyringType(account: string): Promise<string>;
    /**
     * Forget the QR hardware wallet.
     *
     * @returns Promise resolving to the removed accounts and the remaining accounts.
     * @deprecated Use `withKeyring` instead.
     */
    forgetQRDevice(): Promise<{
        removedAccounts: string[];
        remainingAccounts: string[];
    }>;
}
export default KeyringController;
//# sourceMappingURL=KeyringController.d.ts.map