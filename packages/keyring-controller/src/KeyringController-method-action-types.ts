/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KeyringController } from './KeyringController';

/**
 * Adds a new account to the default (first) HD seed phrase keyring.
 *
 * @param accountCount - Number of accounts before adding a new one, used to
 * make the method idempotent.
 * @returns Promise resolving to the added account address.
 */
export type KeyringControllerAddNewAccountAction = {
  type: `KeyringController:addNewAccount`;
  handler: KeyringController['addNewAccount'];
};

/**
 * Effectively the same as creating a new keychain then populating it
 * using the given seed phrase.
 *
 * @param password - Password to unlock keychain.
 * @param seed - A BIP39-compliant seed phrase as Uint8Array,
 * either as a string or an array of UTF-8 bytes that represent the string.
 * @returns Promise resolving when the operation ends successfully.
 */
export type KeyringControllerCreateNewVaultAndRestoreAction = {
  type: `KeyringController:createNewVaultAndRestore`;
  handler: KeyringController['createNewVaultAndRestore'];
};

/**
 * Create a new vault and primary keyring.
 *
 * This only works if keyrings are empty. If there is a pre-existing unlocked vault, calling this will have no effect.
 * If there is a pre-existing locked vault, it will be replaced.
 *
 * @param password - Password to unlock the new vault.
 * @returns Promise resolving when the operation ends successfully.
 */
export type KeyringControllerCreateNewVaultAndKeychainAction = {
  type: `KeyringController:createNewVaultAndKeychain`;
  handler: KeyringController['createNewVaultAndKeychain'];
};

/**
 * Adds a new keyring of the given `type`.
 *
 * @param type - Keyring type name.
 * @param opts - Keyring options.
 * @throws If a builder for the given `type` does not exist.
 * @returns Promise resolving to the new keyring metadata.
 */
export type KeyringControllerAddNewKeyringAction = {
  type: `KeyringController:addNewKeyring`;
  handler: KeyringController['addNewKeyring'];
};

/**
 * Returns the status of the vault.
 *
 * @returns Boolean returning true if the vault is unlocked.
 */
export type KeyringControllerIsUnlockedAction = {
  type: `KeyringController:isUnlocked`;
  handler: KeyringController['isUnlocked'];
};

/**
 * Returns the public addresses of all accounts from every keyring.
 *
 * @returns A promise resolving to an array of addresses.
 */
export type KeyringControllerGetAccountsAction = {
  type: `KeyringController:getAccounts`;
  handler: KeyringController['getAccounts'];
};

/**
 * Get encryption public key.
 *
 * @param account - An account address.
 * @param opts - Additional encryption options.
 * @throws If the `account` does not exist or does not support the `getEncryptionPublicKey` method
 * @returns Promise resolving to encyption public key of the `account` if one exists.
 */
export type KeyringControllerGetEncryptionPublicKeyAction = {
  type: `KeyringController:getEncryptionPublicKey`;
  handler: KeyringController['getEncryptionPublicKey'];
};

/**
 * Attempts to decrypt the provided message parameters.
 *
 * @param messageParams - The decryption message parameters.
 * @param messageParams.from - The address of the account you want to use to decrypt the message.
 * @param messageParams.data - The encrypted data that you want to decrypt.
 * @returns The raw decryption result.
 */
export type KeyringControllerDecryptMessageAction = {
  type: `KeyringController:decryptMessage`;
  handler: KeyringController['decryptMessage'];
};

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
export type KeyringControllerGetKeyringForAccountAction = {
  type: `KeyringController:getKeyringForAccount`;
  handler: KeyringController['getKeyringForAccount'];
};

/**
 * Returns all keyrings of the given type.
 *
 * @deprecated Use of this method is discouraged as actions executed directly on
 * keyrings are not being reflected in the KeyringController state and not
 * persisted in the vault. Use `withKeyring` instead.
 * @param type - Keyring type name.
 * @returns An array of keyrings of the given type.
 */
export type KeyringControllerGetKeyringsByTypeAction = {
  type: `KeyringController:getKeyringsByType`;
  handler: KeyringController['getKeyringsByType'];
};

/**
 * Persist all serialized keyrings in the vault.
 *
 * @deprecated This method is being phased out in favor of `withKeyring`.
 * @returns Promise resolving with `true` value when the
 * operation completes.
 */
export type KeyringControllerPersistAllKeyringsAction = {
  type: `KeyringController:persistAllKeyrings`;
  handler: KeyringController['persistAllKeyrings'];
};

/**
 * Removes an account from keyring state.
 *
 * @param address - Address of the account to remove.
 * @fires KeyringController:accountRemoved
 * @returns Promise resolving when the account is removed.
 */
export type KeyringControllerRemoveAccountAction = {
  type: `KeyringController:removeAccount`;
  handler: KeyringController['removeAccount'];
};

/**
 * Signs message by calling down into a specific keyring.
 *
 * @param messageParams - PersonalMessageParams object to sign.
 * @returns Promise resolving to a signed message string.
 */
export type KeyringControllerSignMessageAction = {
  type: `KeyringController:signMessage`;
  handler: KeyringController['signMessage'];
};

/**
 * Signs EIP-7702 Authorization message by calling down into a specific keyring.
 *
 * @param params - EIP7702AuthorizationParams object to sign.
 * @returns Promise resolving to an EIP-7702 Authorization signature.
 * @throws Will throw UnsupportedSignEIP7702Authorization if the keyring does not support signing EIP-7702 Authorization messages.
 */
export type KeyringControllerSignEip7702AuthorizationAction = {
  type: `KeyringController:signEip7702Authorization`;
  handler: KeyringController['signEip7702Authorization'];
};

/**
 * Signs personal message by calling down into a specific keyring.
 *
 * @param messageParams - PersonalMessageParams object to sign.
 * @returns Promise resolving to a signed message string.
 */
export type KeyringControllerSignPersonalMessageAction = {
  type: `KeyringController:signPersonalMessage`;
  handler: KeyringController['signPersonalMessage'];
};

/**
 * Signs typed message by calling down into a specific keyring.
 *
 * @param messageParams - TypedMessageParams object to sign.
 * @param version - Compatibility version EIP712.
 * @throws Will throw when passed an unrecognized version.
 * @returns Promise resolving to a signed message string or an error if any.
 */
export type KeyringControllerSignTypedMessageAction = {
  type: `KeyringController:signTypedMessage`;
  handler: KeyringController['signTypedMessage'];
};

/**
 * Signs a transaction by calling down into a specific keyring.
 *
 * @param transaction - Transaction object to sign. Must be a `ethereumjs-tx` transaction instance.
 * @param from - Address to sign from, should be in keychain.
 * @param opts - An optional options object.
 * @returns Promise resolving to a signed transaction string.
 */
export type KeyringControllerSignTransactionAction = {
  type: `KeyringController:signTransaction`;
  handler: KeyringController['signTransaction'];
};

/**
 * Convert a base transaction to a base UserOperation.
 *
 * @param from - Address of the sender.
 * @param transactions - Base transactions to include in the UserOperation.
 * @param executionContext - The execution context to use for the UserOperation.
 * @returns A pseudo-UserOperation that can be used to construct a real.
 */
export type KeyringControllerPrepareUserOperationAction = {
  type: `KeyringController:prepareUserOperation`;
  handler: KeyringController['prepareUserOperation'];
};

/**
 * Patches properties of a UserOperation. Currently, only the
 * `paymasterAndData` can be patched.
 *
 * @param from - Address of the sender.
 * @param userOp - UserOperation to patch.
 * @param executionContext - The execution context to use for the UserOperation.
 * @returns A patch to apply to the UserOperation.
 */
export type KeyringControllerPatchUserOperationAction = {
  type: `KeyringController:patchUserOperation`;
  handler: KeyringController['patchUserOperation'];
};

/**
 * Signs an UserOperation.
 *
 * @param from - Address of the sender.
 * @param userOp - UserOperation to sign.
 * @param executionContext - The execution context to use for the UserOperation.
 * @returns The signature of the UserOperation.
 */
export type KeyringControllerSignUserOperationAction = {
  type: `KeyringController:signUserOperation`;
  handler: KeyringController['signUserOperation'];
};

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
export type KeyringControllerWithKeyringAction = {
  type: `KeyringController:withKeyring`;
  handler: KeyringController['withKeyring'];
};

/**
 * Select a keyring and execute the given operation with the selected
 * keyring, **without** acquiring the controller's mutual exclusion lock.
 *
 * ## When to use this method
 *
 * This method is an escape hatch for read-only access to keyring data that
 * is immutable once the keyring is initialized. A typical safe use case is
 * reading the `mnemonic` from an `HdKeyring`: the mnemonic is set during
 * `deserialize()` and never mutated afterwards, so it can safely be read
 * without holding the lock.
 *
 * ## Why it is "unsafe"
 *
 * The "unsafe" designation mirrors the semantics of `unsafe { }` blocks in
 * Rust: the method itself does not enforce thread-safety guarantees. By
 * calling this method the **caller** explicitly takes responsibility for
 * ensuring that:
 *
 * - The operation is **read-only** — no state is mutated.
 * - The data being read is **immutable** after the keyring is initialized,
 * so concurrent locked operations cannot alter it while this callback
 * runs.
 *
 * Do **not** use this method to:
 * - Mutate keyring state (add accounts, sign, etc.) — use `withKeyring`.
 * - Read mutable fields that could change during concurrent operations.
 *
 * @param selector - Keyring selector object.
 * @param operation - Read-only function to execute with the selected keyring.
 * @returns Promise resolving to the result of the function execution.
 * @template SelectedKeyring - The type of the selected keyring.
 * @template CallbackResult - The type of the value resolved by the callback function.
 */
export type KeyringControllerWithKeyringUnsafeAction = {
  type: `KeyringController:withKeyringUnsafe`;
  handler: KeyringController['withKeyringUnsafe'];
};

/**
 * Select a keyring using its `KeyringV2` adapter, and execute
 * the given operation with the wrapped keyring as a mutually
 * exclusive atomic operation.
 *
 * The cached `KeyringV2` adapter is retrieved from the keyring
 * entry.
 *
 * A `KeyringV2Builder` for the selected keyring's type must exist
 * (either as a default or registered via the `keyringV2Builders`
 * constructor option); otherwise an error is thrown.
 *
 * The method automatically persists changes at the end of the
 * function execution, or rolls back the changes if an error
 * is thrown.
 *
 * @param selector - Keyring selector object.
 * @param operation - Function to execute with the wrapped V2 keyring.
 * @returns Promise resolving to the result of the function execution.
 * @template CallbackResult - The type of the value resolved by the callback function.
 */
export type KeyringControllerWithKeyringV2Action = {
  type: `KeyringController:withKeyringV2`;
  handler: KeyringController['withKeyringV2'];
};

/**
 * Select a keyring, wrap it in a `KeyringV2` adapter, and execute
 * the given read-only operation **without** acquiring the controller's
 * mutual exclusion lock.
 *
 * ## When to use this method
 *
 * This method is an escape hatch for read-only access to keyring data that
 * is immutable once the keyring is initialized. A typical safe use case is
 * reading immutable fields from a `KeyringV2` adapter: data that is set
 * during initialization and never mutated afterwards.
 *
 * ## Why it is "unsafe"
 *
 * The "unsafe" designation mirrors the semantics of `unsafe { }` blocks in
 * Rust: the method itself does not enforce thread-safety guarantees. By
 * calling this method the **caller** explicitly takes responsibility for
 * ensuring that:
 *
 * - The operation is **read-only** — no state is mutated.
 * - The data being read is **immutable** after the keyring is initialized,
 * so concurrent locked operations cannot alter it while this callback
 * runs.
 *
 * Do **not** use this method to:
 * - Mutate keyring state (add accounts, sign, etc.) — use `withKeyringV2`.
 * - Read mutable fields that could change during concurrent operations.
 *
 * @param selector - Keyring selector object.
 * @param operation - Read-only function to execute with the wrapped V2 keyring.
 * @returns Promise resolving to the result of the function execution.
 * @template SelectedKeyring - The type of the selected V2 keyring.
 * @template CallbackResult - The type of the value resolved by the callback function.
 */
export type KeyringControllerWithKeyringV2UnsafeAction = {
  type: `KeyringController:withKeyringV2Unsafe`;
  handler: KeyringController['withKeyringV2Unsafe'];
};

/**
 * Execute an operation against all keyrings as a mutually exclusive atomic
 * operation. The operation receives a {@link RestrictedController} instance
 * that exposes a read-only live view of all keyrings as well as
 * `addNewKeyring` and `removeKeyring` methods to stage mutations.
 *
 * The method automatically persists changes at the end of the function
 * execution, or rolls back the changes if an error is thrown.
 *
 * @param operation - Function to execute with the restricted controller.
 * @returns Promise resolving to the result of the function execution.
 * @template CallbackResult - The type of the value resolved by the callback function.
 */
export type KeyringControllerWithControllerAction = {
  type: `KeyringController:withController`;
  handler: KeyringController['withController'];
};

/**
 * Union of all KeyringController action types.
 */
export type KeyringControllerMethodActions =
  | KeyringControllerAddNewAccountAction
  | KeyringControllerCreateNewVaultAndRestoreAction
  | KeyringControllerCreateNewVaultAndKeychainAction
  | KeyringControllerAddNewKeyringAction
  | KeyringControllerIsUnlockedAction
  | KeyringControllerGetAccountsAction
  | KeyringControllerGetEncryptionPublicKeyAction
  | KeyringControllerDecryptMessageAction
  | KeyringControllerGetKeyringForAccountAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerPersistAllKeyringsAction
  | KeyringControllerRemoveAccountAction
  | KeyringControllerSignMessageAction
  | KeyringControllerSignEip7702AuthorizationAction
  | KeyringControllerSignPersonalMessageAction
  | KeyringControllerSignTypedMessageAction
  | KeyringControllerSignTransactionAction
  | KeyringControllerPrepareUserOperationAction
  | KeyringControllerPatchUserOperationAction
  | KeyringControllerSignUserOperationAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerWithKeyringUnsafeAction
  | KeyringControllerWithKeyringV2Action
  | KeyringControllerWithKeyringV2UnsafeAction
  | KeyringControllerWithControllerAction;
