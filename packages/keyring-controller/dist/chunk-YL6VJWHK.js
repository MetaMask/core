"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { newObj[key] = obj[key]; } } } newObj.default = obj; return newObj; } } function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }




var _chunkNOCGQCUMjs = require('./chunk-NOCGQCUM.js');

// src/KeyringController.ts
var _util = require('@ethereumjs/util');
var _basecontroller = require('@metamask/base-controller');
var _browserpassworder = require('@metamask/browser-passworder'); var encryptorUtils = _interopRequireWildcard(_browserpassworder);
var _ethhdkeyring = require('@metamask/eth-hd-keyring'); var _ethhdkeyring2 = _interopRequireDefault(_ethhdkeyring);
var _ethsigutil = require('@metamask/eth-sig-util');
var _ethsimplekeyring = require('@metamask/eth-simple-keyring'); var _ethsimplekeyring2 = _interopRequireDefault(_ethsimplekeyring);










var _utils = require('@metamask/utils');
var _asyncmutex = require('async-mutex');
var _ethereumjswallet = require('ethereumjs-wallet'); var _ethereumjswallet2 = _interopRequireDefault(_ethereumjswallet);
var name = "KeyringController";
var KeyringTypes = /* @__PURE__ */ ((KeyringTypes2) => {
  KeyringTypes2["simple"] = "Simple Key Pair";
  KeyringTypes2["hd"] = "HD Key Tree";
  KeyringTypes2["qr"] = "QR Hardware Wallet Device";
  KeyringTypes2["trezor"] = "Trezor Hardware";
  KeyringTypes2["ledger"] = "Ledger Hardware";
  KeyringTypes2["lattice"] = "Lattice Hardware";
  KeyringTypes2["snap"] = "Snap Keyring";
  return KeyringTypes2;
})(KeyringTypes || {});
var isCustodyKeyring = (keyringType) => {
  return keyringType.startsWith("Custody");
};
var AccountImportStrategy = /* @__PURE__ */ ((AccountImportStrategy2) => {
  AccountImportStrategy2["privateKey"] = "privateKey";
  AccountImportStrategy2["json"] = "json";
  return AccountImportStrategy2;
})(AccountImportStrategy || {});
var SignTypedDataVersion = /* @__PURE__ */ ((SignTypedDataVersion2) => {
  SignTypedDataVersion2["V1"] = "V1";
  SignTypedDataVersion2["V3"] = "V3";
  SignTypedDataVersion2["V4"] = "V4";
  return SignTypedDataVersion2;
})(SignTypedDataVersion || {});
function keyringBuilderFactory(KeyringConstructor) {
  const builder = () => new KeyringConstructor();
  builder.type = KeyringConstructor.type;
  return builder;
}
var defaultKeyringBuilders = [
  keyringBuilderFactory(_ethsimplekeyring2.default),
  keyringBuilderFactory(_ethhdkeyring2.default)
];
var getDefaultKeyringState = () => {
  return {
    isUnlocked: false,
    keyrings: []
  };
};
function assertHasUint8ArrayMnemonic(keyring) {
  if (!(_utils.hasProperty.call(void 0, keyring, "mnemonic") && keyring.mnemonic instanceof Uint8Array)) {
    throw new Error("Can't get mnemonic bytes from keyring");
  }
}
function assertIsExportableKeyEncryptor(encryptor) {
  if (!("importKey" in encryptor && typeof encryptor.importKey === "function" && "decryptWithKey" in encryptor && typeof encryptor.decryptWithKey === "function" && "encryptWithKey" in encryptor && typeof encryptor.encryptWithKey === "function")) {
    throw new Error("KeyringController - The encryptor does not support encryption key export." /* UnsupportedEncryptionKeyExport */);
  }
}
function assertIsValidPassword(password) {
  if (typeof password !== "string") {
    throw new Error("KeyringController - Password must be of type string." /* WrongPasswordType */);
  }
  if (!password || !password.length) {
    throw new Error("KeyringController - Password cannot be empty." /* InvalidEmptyPassword */);
  }
}
function isSerializedKeyringsArray(array) {
  return typeof array === "object" && Array.isArray(array) && array.every((value) => value.type && _utils.isValidJson.call(void 0, value.data));
}
async function displayForKeyring(keyring) {
  const accounts = await keyring.getAccounts();
  return {
    type: keyring.type,
    // Cast to `string[]` here is safe here because `accounts` has no nullish
    // values, and `normalize` returns `string` unless given a nullish value
    accounts: accounts.map(normalize)
  };
}
function isEthAddress(address) {
  return (
    // NOTE: This function only checks for lowercased strings
    _utils.isStrictHexString.call(void 0, address.toLowerCase()) && // This checks for lowercased addresses and checksum addresses too
    _utils.isValidHexAddress.call(void 0, address)
  );
}
function normalize(address) {
  return isEthAddress(address) ? _ethsigutil.normalize.call(void 0, address) : address;
}
var _controllerOperationMutex, _vaultOperationMutex, _keyringBuilders, _keyrings, _unsupportedKeyrings, _password, _encryptor, _cacheEncryptionKey, _qrKeyringStateListener, _registerMessageHandlers, registerMessageHandlers_fn, _getKeyringBuilderForType, getKeyringBuilderForType_fn, _addQRKeyring, addQRKeyring_fn, _subscribeToQRKeyringEvents, subscribeToQRKeyringEvents_fn, _unsubscribeFromQRKeyringsEvents, unsubscribeFromQRKeyringsEvents_fn, _createNewVaultWithKeyring, createNewVaultWithKeyring_fn, _getUpdatedKeyrings, getUpdatedKeyrings_fn, _getSerializedKeyrings, getSerializedKeyrings_fn, _restoreSerializedKeyrings, restoreSerializedKeyrings_fn, _unlockKeyrings, unlockKeyrings_fn, _updateVault, updateVault_fn, _getAccountsFromKeyrings, getAccountsFromKeyrings_fn, _createKeyringWithFirstAccount, createKeyringWithFirstAccount_fn, _newKeyring, newKeyring_fn, _clearKeyrings, clearKeyrings_fn, _restoreKeyring, restoreKeyring_fn, _destroyKeyring, destroyKeyring_fn, _removeEmptyKeyrings, removeEmptyKeyrings_fn, _checkForDuplicate, checkForDuplicate_fn, _setUnlocked, setUnlocked_fn, _persistOrRollback, persistOrRollback_fn, _withRollback, withRollback_fn, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn, _withControllerLock, withControllerLock_fn, _withVaultLock, withVaultLock_fn;
var KeyringController = class extends _basecontroller.BaseController {
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
  constructor(options) {
    const {
      encryptor = encryptorUtils,
      keyringBuilders,
      messenger,
      state
    } = options;
    super({
      name,
      metadata: {
        vault: { persist: true, anonymous: false },
        isUnlocked: { persist: false, anonymous: true },
        keyrings: { persist: false, anonymous: false },
        encryptionKey: { persist: false, anonymous: false },
        encryptionSalt: { persist: false, anonymous: false }
      },
      messenger,
      state: {
        ...getDefaultKeyringState(),
        ...state
      }
    });
    /**
     * Constructor helper for registering this controller's messaging system
     * actions.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    /**
     * Get the keyring builder for the given `type`.
     *
     * @param type - The type of keyring to get the builder for.
     * @returns The keyring builder, or undefined if none exists.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _getKeyringBuilderForType);
    /**
     * Add qr hardware keyring.
     *
     * @returns The added keyring
     * @throws If a QRKeyring builder is not provided
     * when initializing the controller
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _addQRKeyring);
    /**
     * Subscribe to a QRKeyring state change events and
     * forward them through the messaging system.
     *
     * @param qrKeyring - The QRKeyring instance to subscribe to
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _subscribeToQRKeyringEvents);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _unsubscribeFromQRKeyringsEvents);
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
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _createNewVaultWithKeyring);
    /**
     * Get the updated array of each keyring's type and
     * accounts list.
     *
     * @returns A promise resolving to the updated keyrings array.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _getUpdatedKeyrings);
    /**
     * Serialize the current array of keyring instances,
     * including unsupported keyrings by default.
     *
     * @param options - Method options.
     * @param options.includeUnsupported - Whether to include unsupported keyrings.
     * @returns The serialized keyrings.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _getSerializedKeyrings);
    /**
     * Restore a serialized keyrings array.
     *
     * @param serializedKeyrings - The serialized keyrings array.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _restoreSerializedKeyrings);
    /**
     * Unlock Keyrings, decrypting the vault and deserializing all
     * keyrings contained in it, using a password or an encryption key with salt.
     *
     * @param password - The keyring controller password.
     * @param encryptionKey - An exported key string to unlock keyrings with.
     * @param encryptionSalt - The salt used to encrypt the vault.
     * @returns A promise resolving to the deserialized keyrings array.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _unlockKeyrings);
    /**
     * Update the vault with the current keyrings.
     *
     * @returns A promise resolving to `true` if the operation is successful.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _updateVault);
    /**
     * Retrieves all the accounts from keyrings instances
     * that are currently in memory.
     *
     * @returns A promise resolving to an array of accounts.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _getAccountsFromKeyrings);
    /**
     * Create a new keyring, ensuring that the first account is
     * also created.
     *
     * @param type - Keyring type to instantiate.
     * @param opts - Optional parameters required to instantiate the keyring.
     * @returns A promise that resolves if the operation is successful.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _createKeyringWithFirstAccount);
    /**
     * Instantiate, initialize and return a new keyring of the given `type`,
     * using the given `opts`. The keyring is built using the keyring builder
     * registered for the given `type`.
     *
     *
     * @param type - The type of keyring to add.
     * @param data - The data to restore a previously serialized keyring.
     * @returns The new keyring.
     * @throws If the keyring includes duplicated accounts.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _newKeyring);
    /**
     * Remove all managed keyrings, destroying all their
     * instances in memory.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _clearKeyrings);
    /**
     * Restore a Keyring from a provided serialized payload.
     * On success, returns the resulting keyring instance.
     *
     * @param serialized - The serialized keyring.
     * @returns The deserialized keyring or undefined if the keyring type is unsupported.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _restoreKeyring);
    /**
     * Destroy Keyring
     *
     * Some keyrings support a method called `destroy`, that destroys the
     * keyring along with removing all its event listeners and, in some cases,
     * clears the keyring bridge iframe from the DOM.
     *
     * @param keyring - The keyring to destroy.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _destroyKeyring);
    /**
     * Remove empty keyrings.
     *
     * Loops through the keyrings and removes the ones with empty accounts
     * (usually after removing the last / only account) from a keyring.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _removeEmptyKeyrings);
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
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _checkForDuplicate);
    /**
     * Set the `isUnlocked` to true and notify listeners
     * through the messenger.
     *
     * @fires KeyringController:unlock
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _setUnlocked);
    /**
     * Execute the given function after acquiring the controller lock
     * and save the keyrings to state after it, or rollback to their
     * previous state in case of error.
     *
     * @param fn - The function to execute.
     * @returns The result of the function.
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _persistOrRollback);
    /**
     * Execute the given function after acquiring the controller lock
     * and rollback keyrings and password states in case of error.
     *
     * @param fn - The function to execute atomically.
     * @returns The result of the function.
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _withRollback);
    /**
     * Assert that the controller mutex is locked.
     *
     * @throws If the controller mutex is not locked.
     */
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _assertControllerMutexIsLocked);
    /**
     * Lock the controller mutex before executing the given function,
     * and release it after the function is resolved or after an
     * error is thrown.
     *
     * This wrapper ensures that each mutable operation that interacts with the
     * controller and that changes its state is executed in a mutually exclusive way,
     * preventing unsafe concurrent access that could lead to unpredictable behavior.
     *
     * @param fn - The function to execute while the controller mutex is locked.
     * @returns The result of the function.
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _withControllerLock);
    /**
     * Lock the vault mutex before executing the given function,
     * and release it after the function is resolved or after an
     * error is thrown.
     *
     * This ensures that each operation that interacts with the vault
     * is executed in a mutually exclusive way.
     *
     * @param fn - The function to execute while the vault mutex is locked.
     * @returns The result of the function.
     */
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _withVaultLock);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _controllerOperationMutex, new (0, _asyncmutex.Mutex)());
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _vaultOperationMutex, new (0, _asyncmutex.Mutex)());
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _keyringBuilders, void 0);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _keyrings, void 0);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _unsupportedKeyrings, void 0);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _password, void 0);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _encryptor, void 0);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _cacheEncryptionKey, void 0);
    _chunkNOCGQCUMjs.__privateAdd.call(void 0, this, _qrKeyringStateListener, void 0);
    _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _keyringBuilders, keyringBuilders ? keyringBuilders.concat(defaultKeyringBuilders) : defaultKeyringBuilders);
    _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _encryptor, encryptor);
    _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _keyrings, []);
    _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _unsupportedKeyrings, []);
    _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _cacheEncryptionKey, Boolean(options.cacheEncryptionKey));
    if (_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _cacheEncryptionKey)) {
      assertIsExportableKeyEncryptor(encryptor);
    }
    _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  /**
   * Adds a new account to the default (first) HD seed phrase keyring.
   *
   * @param accountCount - Number of accounts before adding a new one, used to
   * make the method idempotent.
   * @returns Promise resolving to the added account address.
   */
  async addNewAccount(accountCount) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const primaryKeyring = this.getKeyringsByType("HD Key Tree")[0];
      if (!primaryKeyring) {
        throw new Error("No HD keyring found");
      }
      const oldAccounts = await primaryKeyring.getAccounts();
      if (accountCount && oldAccounts.length !== accountCount) {
        if (accountCount > oldAccounts.length) {
          throw new Error("Account out of sequence");
        }
        const existingAccount = oldAccounts[accountCount];
        if (!existingAccount) {
          throw new Error(`Can't find account at index ${accountCount}`);
        }
        return existingAccount;
      }
      const [addedAccountAddress] = await primaryKeyring.addAccounts(1);
      await this.verifySeedPhrase();
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
  async addNewAccountForKeyring(keyring, accountCount) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const oldAccounts = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getAccountsFromKeyrings, getAccountsFromKeyrings_fn).call(this);
      if (accountCount && oldAccounts.length !== accountCount) {
        if (accountCount > oldAccounts.length) {
          throw new Error("Account out of sequence");
        }
        const existingAccount = oldAccounts[accountCount];
        _utils.assertIsStrictHexString.call(void 0, existingAccount);
        return existingAccount;
      }
      await keyring.addAccounts(1);
      const addedAccountAddress = (await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getAccountsFromKeyrings, getAccountsFromKeyrings_fn).call(this)).find(
        (selectedAddress) => !oldAccounts.includes(selectedAddress)
      );
      _utils.assertIsStrictHexString.call(void 0, addedAccountAddress);
      return addedAccountAddress;
    });
  }
  /**
   * Adds a new account to the default (first) HD seed phrase keyring without updating identities in preferences.
   *
   * @returns Promise resolving to the added account address.
   */
  async addNewAccountWithoutUpdate() {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const primaryKeyring = this.getKeyringsByType("HD Key Tree")[0];
      if (!primaryKeyring) {
        throw new Error("No HD keyring found");
      }
      const [addedAccountAddress] = await primaryKeyring.addAccounts(1);
      await this.verifySeedPhrase();
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
  async createNewVaultAndRestore(password, seed) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      assertIsValidPassword(password);
      await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _createNewVaultWithKeyring, createNewVaultWithKeyring_fn).call(this, password, {
        type: "HD Key Tree" /* hd */,
        opts: {
          mnemonic: seed,
          numberOfAccounts: 1
        }
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
   */
  async createNewVaultAndKeychain(password) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const accounts = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getAccountsFromKeyrings, getAccountsFromKeyrings_fn).call(this);
      if (!accounts.length) {
        await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _createNewVaultWithKeyring, createNewVaultWithKeyring_fn).call(this, password, {
          type: "HD Key Tree" /* hd */
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
   * @returns Promise resolving to the added keyring.
   */
  async addNewKeyring(type, opts) {
    if (type === "QR Hardware Wallet Device" /* qr */) {
      return this.getOrAddQRKeyring();
    }
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _newKeyring, newKeyring_fn).call(this, type, opts));
  }
  /**
   * Method to verify a given password validity. Throws an
   * error if the password is invalid.
   *
   * @param password - Password of the keyring.
   */
  async verifyPassword(password) {
    if (!this.state.vault) {
      throw new Error("KeyringController - Cannot unlock without a previous vault." /* VaultError */);
    }
    await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).decrypt(password, this.state.vault);
  }
  /**
   * Returns the status of the vault.
   *
   * @returns Boolean returning true if the vault is unlocked.
   */
  isUnlocked() {
    return this.state.isUnlocked;
  }
  /**
   * Gets the seed phrase of the HD keyring.
   *
   * @param password - Password of the keyring.
   * @returns Promise resolving to the seed phrase.
   */
  async exportSeedPhrase(password) {
    await this.verifyPassword(password);
    assertHasUint8ArrayMnemonic(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings)[0]);
    return _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings)[0].mnemonic;
  }
  /**
   * Gets the private key from the keyring controlling an address.
   *
   * @param password - Password of the keyring.
   * @param address - Address to export.
   * @returns Promise resolving to the private key for an address.
   */
  async exportAccount(password, address) {
    await this.verifyPassword(password);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.exportAccount) {
      throw new Error("`KeyringController - The keyring for the current address does not support the method exportAccount" /* UnsupportedExportAccount */);
    }
    return await keyring.exportAccount(normalize(address));
  }
  /**
   * Returns the public addresses of all accounts from every keyring.
   *
   * @returns A promise resolving to an array of addresses.
   */
  async getAccounts() {
    return this.state.keyrings.reduce(
      (accounts, keyring) => accounts.concat(keyring.accounts),
      []
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
  async getEncryptionPublicKey(account, opts) {
    const address = _ethsigutil.normalize.call(void 0, account);
    const keyring = await this.getKeyringForAccount(
      account
    );
    if (!keyring.getEncryptionPublicKey) {
      throw new Error("KeyringController - The keyring for the current address does not support the method getEncryptionPublicKey." /* UnsupportedGetEncryptionPublicKey */);
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
  async decryptMessage(messageParams) {
    const address = _ethsigutil.normalize.call(void 0, messageParams.from);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.decryptMessage) {
      throw new Error("KeyringController - The keyring for the current address does not support the method decryptMessage." /* UnsupportedDecryptMessage */);
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
  async getKeyringForAccount(account) {
    const address = normalize(account);
    const candidates = await Promise.all(
      _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings).map(async (keyring) => {
        return Promise.all([keyring, keyring.getAccounts()]);
      })
    );
    const winners = candidates.filter((candidate) => {
      const accounts = candidate[1].map(normalize);
      return accounts.includes(address);
    });
    if (winners.length && winners[0]?.length) {
      return winners[0][0];
    }
    let errorInfo = "";
    if (!candidates.length) {
      errorInfo = "There are no keyrings";
    } else if (!winners.length) {
      errorInfo = "There are keyrings, but none match the address";
    }
    throw new Error(
      `${"KeyringController - No keyring found" /* NoKeyring */}. Error info: ${errorInfo}`
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
  getKeyringsByType(type) {
    return _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings).filter((keyring) => keyring.type === type);
  }
  /**
   * Persist all serialized keyrings in the vault.
   *
   * @deprecated This method is being phased out in favor of `withKeyring`.
   * @returns Promise resolving with `true` value when the
   * operation completes.
   */
  async persistAllKeyrings() {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => true);
  }
  /**
   * Imports an account with the specified import strategy.
   *
   * @param strategy - Import strategy name.
   * @param args - Array of arguments to pass to the underlying stategy.
   * @throws Will throw when passed an unrecognized strategy.
   * @returns Promise resolving to the imported account address.
   */
  async importAccountWithStrategy(strategy, args) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      let privateKey;
      switch (strategy) {
        case "privateKey":
          const [importedKey] = args;
          if (!importedKey) {
            throw new Error("Cannot import an empty key.");
          }
          const prefixed = _utils.add0x.call(void 0, importedKey);
          let bufferedPrivateKey;
          try {
            bufferedPrivateKey = _util.toBuffer.call(void 0, prefixed);
          } catch {
            throw new Error("Cannot import invalid private key.");
          }
          if (!_util.isValidPrivate.call(void 0, bufferedPrivateKey) || // ensures that the key is 64 bytes long
          _util.getBinarySize.call(void 0, prefixed) !== 64 + "0x".length) {
            throw new Error("Cannot import invalid private key.");
          }
          privateKey = _utils.remove0x.call(void 0, prefixed);
          break;
        case "json":
          let wallet;
          const [input, password] = args;
          try {
            wallet = _ethereumjswallet.thirdparty.fromEtherWallet(input, password);
          } catch (e) {
            wallet = wallet || await _ethereumjswallet2.default.fromV3(input, password, true);
          }
          privateKey = _utils.bytesToHex.call(void 0, wallet.getPrivateKey());
          break;
        default:
          throw new Error(`Unexpected import strategy: '${strategy}'`);
      }
      const newKeyring = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _newKeyring, newKeyring_fn).call(this, "Simple Key Pair" /* simple */, [
        privateKey
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
  async removeAccount(address) {
    await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const keyring = await this.getKeyringForAccount(
        address
      );
      if (!keyring.removeAccount) {
        throw new Error("`KeyringController - The keyring for the current address does not support the method removeAccount" /* UnsupportedRemoveAccount */);
      }
      keyring.removeAccount(address);
      const accounts = await keyring.getAccounts();
      if (accounts.length === 0) {
        await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _removeEmptyKeyrings, removeEmptyKeyrings_fn).call(this);
      }
    });
    this.messagingSystem.publish(`${name}:accountRemoved`, address);
  }
  /**
   * Deallocates all secrets and locks the wallet.
   *
   * @returns Promise resolving when the operation completes.
   */
  async setLocked() {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _withRollback, withRollback_fn).call(this, async () => {
      _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _unsubscribeFromQRKeyringsEvents, unsubscribeFromQRKeyringsEvents_fn).call(this);
      _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _password, void 0);
      await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _clearKeyrings, clearKeyrings_fn).call(this);
      this.update((state) => {
        state.isUnlocked = false;
        state.keyrings = [];
        delete state.encryptionKey;
        delete state.encryptionSalt;
      });
      this.messagingSystem.publish(`${name}:lock`);
    });
  }
  /**
   * Signs message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  async signMessage(messageParams) {
    if (!messageParams.data) {
      throw new Error("Can't sign an empty message");
    }
    const address = _ethsigutil.normalize.call(void 0, messageParams.from);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.signMessage) {
      throw new Error("KeyringController - The keyring for the current address does not support the method signMessage." /* UnsupportedSignMessage */);
    }
    return await keyring.signMessage(address, messageParams.data);
  }
  /**
   * Signs personal message by calling down into a specific keyring.
   *
   * @param messageParams - PersonalMessageParams object to sign.
   * @returns Promise resolving to a signed message string.
   */
  async signPersonalMessage(messageParams) {
    const address = _ethsigutil.normalize.call(void 0, messageParams.from);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.signPersonalMessage) {
      throw new Error("KeyringController - The keyring for the current address does not support the method signPersonalMessage." /* UnsupportedSignPersonalMessage */);
    }
    const normalizedData = normalize(messageParams.data);
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
  async signTypedMessage(messageParams, version) {
    try {
      if (![
        "V1" /* V1 */,
        "V3" /* V3 */,
        "V4" /* V4 */
      ].includes(version)) {
        throw new Error(`Unexpected signTypedMessage version: '${version}'`);
      }
      const address = _ethsigutil.normalize.call(void 0, messageParams.from);
      const keyring = await this.getKeyringForAccount(
        address
      );
      if (!keyring.signTypedData) {
        throw new Error("KeyringController - The keyring for the current address does not support the method signTypedMessage." /* UnsupportedSignTypedMessage */);
      }
      return await keyring.signTypedData(
        address,
        version !== "V1" /* V1 */ && typeof messageParams.data === "string" ? JSON.parse(messageParams.data) : messageParams.data,
        { version }
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
  async signTransaction(transaction, from, opts) {
    const address = _ethsigutil.normalize.call(void 0, from);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.signTransaction) {
      throw new Error("KeyringController - The keyring for the current address does not support the method signTransaction." /* UnsupportedSignTransaction */);
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
  async prepareUserOperation(from, transactions, executionContext) {
    const address = _ethsigutil.normalize.call(void 0, from);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.prepareUserOperation) {
      throw new Error("KeyringController - The keyring for the current address does not support the method prepareUserOperation." /* UnsupportedPrepareUserOperation */);
    }
    return await keyring.prepareUserOperation(
      address,
      transactions,
      executionContext
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
  async patchUserOperation(from, userOp, executionContext) {
    const address = _ethsigutil.normalize.call(void 0, from);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.patchUserOperation) {
      throw new Error("KeyringController - The keyring for the current address does not support the method patchUserOperation." /* UnsupportedPatchUserOperation */);
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
  async signUserOperation(from, userOp, executionContext) {
    const address = _ethsigutil.normalize.call(void 0, from);
    const keyring = await this.getKeyringForAccount(
      address
    );
    if (!keyring.signUserOperation) {
      throw new Error("KeyringController - The keyring for the current address does not support the method signUserOperation." /* UnsupportedSignUserOperation */);
    }
    return await keyring.signUserOperation(address, userOp, executionContext);
  }
  /**
   * Changes the password used to encrypt the vault.
   *
   * @param password - The new password.
   * @returns Promise resolving when the operation completes.
   */
  changePassword(password) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      if (!this.state.isUnlocked) {
        throw new Error("KeyringController - Cannot persist vault without password and encryption key" /* MissingCredentials */);
      }
      assertIsValidPassword(password);
      _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _password, password);
      if (_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _cacheEncryptionKey)) {
        this.update((state) => {
          delete state.encryptionKey;
          delete state.encryptionSalt;
        });
      }
    });
  }
  /**
   * Attempts to decrypt the current vault and load its keyrings,
   * using the given encryption key and salt.
   *
   * @param encryptionKey - Key to unlock the keychain.
   * @param encryptionSalt - Salt to unlock the keychain.
   * @returns Promise resolving when the operation completes.
   */
  async submitEncryptionKey(encryptionKey, encryptionSalt) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _withRollback, withRollback_fn).call(this, async () => {
      _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _keyrings, await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _unlockKeyrings, unlockKeyrings_fn).call(this, void 0, encryptionKey, encryptionSalt));
      _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _setUnlocked, setUnlocked_fn).call(this);
    });
  }
  /**
   * Attempts to decrypt the current vault and load its keyrings,
   * using the given password.
   *
   * @param password - Password to unlock the keychain.
   * @returns Promise resolving when the operation completes.
   */
  async submitPassword(password) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _withRollback, withRollback_fn).call(this, async () => {
      _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _keyrings, await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _unlockKeyrings, unlockKeyrings_fn).call(this, password));
      _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _setUnlocked, setUnlocked_fn).call(this);
    });
  }
  /**
   * Verifies the that the seed phrase restores the current keychain's accounts.
   *
   * @returns Promise resolving to the seed phrase as Uint8Array.
   */
  async verifySeedPhrase() {
    const primaryKeyring = this.getKeyringsByType("HD Key Tree" /* hd */)[0];
    if (!primaryKeyring) {
      throw new Error("No HD keyring found.");
    }
    assertHasUint8ArrayMnemonic(primaryKeyring);
    const seedWords = primaryKeyring.mnemonic;
    const accounts = await primaryKeyring.getAccounts();
    if (accounts.length === 0) {
      throw new Error("Cannot verify an empty keyring.");
    }
    const hdKeyringBuilder = _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getKeyringBuilderForType, getKeyringBuilderForType_fn).call(this, "HD Key Tree" /* hd */);
    const hdKeyring = hdKeyringBuilder();
    await hdKeyring.deserialize({
      mnemonic: seedWords,
      numberOfAccounts: accounts.length
    });
    const testAccounts = await hdKeyring.getAccounts();
    if (testAccounts.length !== accounts.length) {
      throw new Error("Seed phrase imported incorrect number of accounts.");
    }
    testAccounts.forEach((account, i) => {
      if (account.toLowerCase() !== accounts[i].toLowerCase()) {
        throw new Error("Seed phrase imported different accounts.");
      }
    });
    return seedWords;
  }
  async withKeyring(selector, operation, options = {
    createIfMissing: false
  }) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      let keyring;
      if ("address" in selector) {
        keyring = await this.getKeyringForAccount(selector.address);
      } else {
        keyring = this.getKeyringsByType(selector.type)[selector.index || 0];
        if (!keyring && options.createIfMissing) {
          keyring = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _newKeyring, newKeyring_fn).call(this, selector.type, options.createWithData);
        }
      }
      if (!keyring) {
        throw new Error("KeyringController - Keyring not found." /* KeyringNotFound */);
      }
      const result = await operation(keyring);
      if (Object.is(result, keyring)) {
        throw new Error("KeyringController - Returning keyring instances is unsafe" /* UnsafeDirectKeyringAccess */);
      }
      return result;
    });
  }
  // QR Hardware related methods
  /**
   * Get QR Hardware keyring.
   *
   * @returns The QR Keyring if defined, otherwise undefined
   * @deprecated Use `withKeyring` instead.
   */
  getQRKeyring() {
    return this.getKeyringsByType("QR Hardware Wallet Device" /* qr */)[0];
  }
  /**
   * Get QR hardware keyring. If it doesn't exist, add it.
   *
   * @returns The added keyring
   * @deprecated Use `addNewKeyring` and `withKeyring` instead.
   */
  async getOrAddQRKeyring() {
    return this.getQRKeyring() || await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _addQRKeyring, addQRKeyring_fn).call(this));
  }
  /**
   * Restore QR keyring from serialized data.
   *
   * @param serialized - Serialized data to restore the keyring from.
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async restoreQRKeyring(serialized) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const keyring = this.getQRKeyring() || await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _addQRKeyring, addQRKeyring_fn).call(this);
      keyring.deserialize(serialized);
    });
  }
  /**
   * Reset QR keyring state.
   *
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  async resetQRKeyringState() {
    (await this.getOrAddQRKeyring()).resetStore();
  }
  /**
   * Get QR keyring state.
   *
   * @returns Promise resolving to the keyring state.
   * @deprecated Use `withKeyring` or subscribe to `"KeyringController:qrKeyringStateChange"`
   * instead.
   */
  async getQRKeyringState() {
    return (await this.getOrAddQRKeyring()).getMemStore();
  }
  /**
   * Submit QR hardware wallet public HDKey.
   *
   * @param cryptoHDKey - The key to submit.
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  async submitQRCryptoHDKey(cryptoHDKey) {
    (await this.getOrAddQRKeyring()).submitCryptoHDKey(cryptoHDKey);
  }
  /**
   * Submit QR hardware wallet account.
   *
   * @param cryptoAccount - The account to submit.
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  async submitQRCryptoAccount(cryptoAccount) {
    (await this.getOrAddQRKeyring()).submitCryptoAccount(cryptoAccount);
  }
  /**
   * Submit QR hardware wallet signature.
   *
   * @param requestId - The request ID.
   * @param ethSignature - The signature to submit.
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  async submitQRSignature(requestId, ethSignature) {
    (await this.getOrAddQRKeyring()).submitSignature(requestId, ethSignature);
  }
  /**
   * Cancel QR sign request.
   *
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  async cancelQRSignRequest() {
    (await this.getOrAddQRKeyring()).cancelSignRequest();
  }
  /**
   * Cancels qr keyring sync.
   *
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  async cancelQRSynchronization() {
    (await this.getOrAddQRKeyring()).cancelSync();
  }
  /**
   * Connect to QR hardware wallet.
   *
   * @param page - The page to connect to.
   * @returns Promise resolving to the connected accounts.
   * @deprecated Use of this method is discouraged as it creates a dangling promise
   * internal to the `QRKeyring`, which can lead to unpredictable deadlocks. Please use
   * `withKeyring` instead.
   */
  async connectQRHardware(page) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      try {
        const keyring = this.getQRKeyring() || await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _addQRKeyring, addQRKeyring_fn).call(this);
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
        return accounts.map((account) => {
          return {
            ...account,
            balance: "0x0"
          };
        });
      } catch (e) {
        throw new Error(`Unspecified error when connect QR Hardware, ${e}`);
      }
    });
  }
  /**
   * Unlock a QR hardware wallet account.
   *
   * @param index - The index of the account to unlock.
   * @returns Promise resolving when the operation completes.
   * @deprecated Use `withKeyring` instead.
   */
  async unlockQRHardwareWalletAccount(index) {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const keyring = this.getQRKeyring() || await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _addQRKeyring, addQRKeyring_fn).call(this);
      keyring.setAccountToUnlock(index);
      await keyring.addAccounts(1);
    });
  }
  async getAccountKeyringType(account) {
    const keyring = await this.getKeyringForAccount(
      account
    );
    return keyring.type;
  }
  /**
   * Forget the QR hardware wallet.
   *
   * @returns Promise resolving to the removed accounts and the remaining accounts.
   * @deprecated Use `withKeyring` instead.
   */
  async forgetQRDevice() {
    return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _persistOrRollback, persistOrRollback_fn).call(this, async () => {
      const keyring = this.getQRKeyring();
      if (!keyring) {
        return { removedAccounts: [], remainingAccounts: [] };
      }
      const allAccounts = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getAccountsFromKeyrings, getAccountsFromKeyrings_fn).call(this);
      keyring.forgetDevice();
      const remainingAccounts = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getAccountsFromKeyrings, getAccountsFromKeyrings_fn).call(this);
      const removedAccounts = allAccounts.filter(
        (address) => !remainingAccounts.includes(address)
      );
      return { removedAccounts, remainingAccounts };
    });
  }
};
_controllerOperationMutex = new WeakMap();
_vaultOperationMutex = new WeakMap();
_keyringBuilders = new WeakMap();
_keyrings = new WeakMap();
_unsupportedKeyrings = new WeakMap();
_password = new WeakMap();
_encryptor = new WeakMap();
_cacheEncryptionKey = new WeakMap();
_qrKeyringStateListener = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    `${name}:signMessage`,
    this.signMessage.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:signPersonalMessage`,
    this.signPersonalMessage.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:signTypedMessage`,
    this.signTypedMessage.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:decryptMessage`,
    this.decryptMessage.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:getEncryptionPublicKey`,
    this.getEncryptionPublicKey.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:getAccounts`,
    this.getAccounts.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:getKeyringsByType`,
    this.getKeyringsByType.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:getKeyringForAccount`,
    this.getKeyringForAccount.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:persistAllKeyrings`,
    this.persistAllKeyrings.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:prepareUserOperation`,
    this.prepareUserOperation.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:patchUserOperation`,
    this.patchUserOperation.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    `${name}:signUserOperation`,
    this.signUserOperation.bind(this)
  );
};
_getKeyringBuilderForType = new WeakSet();
getKeyringBuilderForType_fn = function(type) {
  return _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyringBuilders).find(
    (keyringBuilder) => keyringBuilder.type === type
  );
};
_addQRKeyring = new WeakSet();
addQRKeyring_fn = async function() {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  return await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _newKeyring, newKeyring_fn).call(this, "QR Hardware Wallet Device" /* qr */);
};
_subscribeToQRKeyringEvents = new WeakSet();
subscribeToQRKeyringEvents_fn = function(qrKeyring) {
  _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _qrKeyringStateListener, (state) => {
    this.messagingSystem.publish(`${name}:qrKeyringStateChange`, state);
  });
  qrKeyring.getMemStore().subscribe(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _qrKeyringStateListener));
};
_unsubscribeFromQRKeyringsEvents = new WeakSet();
unsubscribeFromQRKeyringsEvents_fn = function() {
  const qrKeyrings = this.getKeyringsByType(
    "QR Hardware Wallet Device" /* qr */
  );
  qrKeyrings.forEach((qrKeyring) => {
    if (_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _qrKeyringStateListener)) {
      qrKeyring.getMemStore().unsubscribe(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _qrKeyringStateListener));
    }
  });
};
_createNewVaultWithKeyring = new WeakSet();
createNewVaultWithKeyring_fn = async function(password, keyring) {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  if (typeof password !== "string") {
    throw new TypeError("KeyringController - Password must be of type string." /* WrongPasswordType */);
  }
  this.update((state) => {
    delete state.encryptionKey;
    delete state.encryptionSalt;
  });
  _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _password, password);
  await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _clearKeyrings, clearKeyrings_fn).call(this);
  await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _createKeyringWithFirstAccount, createKeyringWithFirstAccount_fn).call(this, keyring.type, keyring.opts);
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _setUnlocked, setUnlocked_fn).call(this);
};
_getUpdatedKeyrings = new WeakSet();
getUpdatedKeyrings_fn = async function() {
  return Promise.all(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings).map(displayForKeyring));
};
_getSerializedKeyrings = new WeakSet();
getSerializedKeyrings_fn = async function({ includeUnsupported } = {
  includeUnsupported: true
}) {
  const serializedKeyrings = await Promise.all(
    _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings).map(async (keyring) => {
      const [type, data] = await Promise.all([
        keyring.type,
        keyring.serialize()
      ]);
      return { type, data };
    })
  );
  if (includeUnsupported) {
    serializedKeyrings.push(..._chunkNOCGQCUMjs.__privateGet.call(void 0, this, _unsupportedKeyrings));
  }
  return serializedKeyrings;
};
_restoreSerializedKeyrings = new WeakSet();
restoreSerializedKeyrings_fn = async function(serializedKeyrings) {
  await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _clearKeyrings, clearKeyrings_fn).call(this);
  for (const serializedKeyring of serializedKeyrings) {
    await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _restoreKeyring, restoreKeyring_fn).call(this, serializedKeyring);
  }
};
_unlockKeyrings = new WeakSet();
unlockKeyrings_fn = async function(password, encryptionKey, encryptionSalt) {
  return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _withVaultLock, withVaultLock_fn).call(this, async ({ releaseLock }) => {
    const encryptedVault = this.state.vault;
    if (!encryptedVault) {
      throw new Error("KeyringController - Cannot unlock without a previous vault." /* VaultError */);
    }
    let vault;
    const updatedState = {};
    if (_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _cacheEncryptionKey)) {
      assertIsExportableKeyEncryptor(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor));
      if (password) {
        const result = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).decryptWithDetail(
          password,
          encryptedVault
        );
        vault = result.vault;
        _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _password, password);
        updatedState.encryptionKey = result.exportedKeyString;
        updatedState.encryptionSalt = result.salt;
      } else {
        const parsedEncryptedVault = JSON.parse(encryptedVault);
        if (encryptionSalt !== parsedEncryptedVault.salt) {
          throw new Error("KeyringController - Encryption key and salt provided are expired" /* ExpiredCredentials */);
        }
        if (typeof encryptionKey !== "string") {
          throw new TypeError("KeyringController - Password must be of type string." /* WrongPasswordType */);
        }
        const key = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).importKey(encryptionKey);
        vault = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).decryptWithKey(
          key,
          parsedEncryptedVault
        );
        updatedState.encryptionKey = encryptionKey;
        updatedState.encryptionSalt = encryptionSalt;
      }
    } else {
      if (typeof password !== "string") {
        throw new TypeError("KeyringController - Password must be of type string." /* WrongPasswordType */);
      }
      vault = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).decrypt(password, encryptedVault);
      _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _password, password);
    }
    if (!isSerializedKeyringsArray(vault)) {
      throw new Error("KeyringController - The decrypted vault has an unexpected shape." /* VaultDataError */);
    }
    await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _restoreSerializedKeyrings, restoreSerializedKeyrings_fn).call(this, vault);
    const updatedKeyrings = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getUpdatedKeyrings, getUpdatedKeyrings_fn).call(this);
    this.update((state) => {
      state.keyrings = updatedKeyrings;
      if (updatedState.encryptionKey || updatedState.encryptionSalt) {
        state.encryptionKey = updatedState.encryptionKey;
        state.encryptionSalt = updatedState.encryptionSalt;
      }
    });
    if (_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _password) && (!_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _cacheEncryptionKey) || !encryptionKey) && _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).isVaultUpdated && !_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).isVaultUpdated(encryptedVault)) {
      releaseLock();
      await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _updateVault, updateVault_fn).call(this);
    }
    return _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings);
  });
};
_updateVault = new WeakSet();
updateVault_fn = function() {
  return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _withVaultLock, withVaultLock_fn).call(this, async () => {
    const { encryptionKey, encryptionSalt } = this.state;
    if (!_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _password) && !encryptionKey) {
      throw new Error("KeyringController - Cannot persist vault without password and encryption key" /* MissingCredentials */);
    }
    const serializedKeyrings = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getSerializedKeyrings, getSerializedKeyrings_fn).call(this);
    if (!serializedKeyrings.some((keyring) => keyring.type === "HD Key Tree" /* hd */)) {
      throw new Error("KeyringController - No HD Keyring found" /* NoHdKeyring */);
    }
    const updatedState = {};
    if (_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _cacheEncryptionKey)) {
      assertIsExportableKeyEncryptor(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor));
      if (encryptionKey) {
        const key = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).importKey(encryptionKey);
        const vaultJSON = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).encryptWithKey(
          key,
          serializedKeyrings
        );
        vaultJSON.salt = encryptionSalt;
        updatedState.vault = JSON.stringify(vaultJSON);
      } else if (_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _password)) {
        const { vault: newVault, exportedKeyString } = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).encryptWithDetail(
          _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _password),
          serializedKeyrings
        );
        updatedState.vault = newVault;
        updatedState.encryptionKey = exportedKeyString;
      }
    } else {
      assertIsValidPassword(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _password));
      updatedState.vault = await _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _encryptor).encrypt(
        _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _password),
        serializedKeyrings
      );
    }
    if (!updatedState.vault) {
      throw new Error("KeyringController - Cannot persist vault without vault information" /* MissingVaultData */);
    }
    const updatedKeyrings = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getUpdatedKeyrings, getUpdatedKeyrings_fn).call(this);
    this.update((state) => {
      state.vault = updatedState.vault;
      state.keyrings = updatedKeyrings;
      if (updatedState.encryptionKey) {
        state.encryptionKey = updatedState.encryptionKey;
        state.encryptionSalt = JSON.parse(updatedState.vault).salt;
      }
    });
    return true;
  });
};
_getAccountsFromKeyrings = new WeakSet();
getAccountsFromKeyrings_fn = async function() {
  const keyrings = _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings);
  const keyringArrays = await Promise.all(
    keyrings.map(async (keyring) => keyring.getAccounts())
  );
  const addresses = keyringArrays.reduce((res, arr) => {
    return res.concat(arr);
  }, []);
  return addresses.map(normalize);
};
_createKeyringWithFirstAccount = new WeakSet();
createKeyringWithFirstAccount_fn = async function(type, opts) {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  const keyring = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _newKeyring, newKeyring_fn).call(this, type, opts);
  const [firstAccount] = await keyring.getAccounts();
  if (!firstAccount) {
    throw new Error("KeyringController - First Account not found." /* NoFirstAccount */);
  }
};
_newKeyring = new WeakSet();
newKeyring_fn = async function(type, data) {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  const keyringBuilder = _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getKeyringBuilderForType, getKeyringBuilderForType_fn).call(this, type);
  if (!keyringBuilder) {
    throw new Error(
      `${"KeyringController - No keyringBuilder found for keyring" /* NoKeyringBuilder */}. Keyring type: ${type}`
    );
  }
  const keyring = keyringBuilder();
  await keyring.deserialize(data);
  if (keyring.init) {
    await keyring.init();
  }
  if (type === "HD Key Tree" /* hd */ && (!_utils.isObject.call(void 0, data) || !data.mnemonic)) {
    if (!keyring.generateRandomMnemonic) {
      throw new Error(
        "KeyringController - The current keyring does not support the method generateRandomMnemonic." /* UnsupportedGenerateRandomMnemonic */
      );
    }
    keyring.generateRandomMnemonic();
    await keyring.addAccounts(1);
  }
  await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _checkForDuplicate, checkForDuplicate_fn).call(this, type, await keyring.getAccounts());
  if (type === "QR Hardware Wallet Device" /* qr */) {
    _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _subscribeToQRKeyringEvents, subscribeToQRKeyringEvents_fn).call(this, keyring);
  }
  _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings).push(keyring);
  return keyring;
};
_clearKeyrings = new WeakSet();
clearKeyrings_fn = async function() {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  for (const keyring of _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings)) {
    await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _destroyKeyring, destroyKeyring_fn).call(this, keyring);
  }
  _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _keyrings, []);
};
_restoreKeyring = new WeakSet();
restoreKeyring_fn = async function(serialized) {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  try {
    const { type, data } = serialized;
    return await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _newKeyring, newKeyring_fn).call(this, type, data);
  } catch (_) {
    _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _unsupportedKeyrings).push(serialized);
    return void 0;
  }
};
_destroyKeyring = new WeakSet();
destroyKeyring_fn = async function(keyring) {
  await keyring.destroy?.();
};
_removeEmptyKeyrings = new WeakSet();
removeEmptyKeyrings_fn = async function() {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  const validKeyrings = [];
  await Promise.all(
    _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _keyrings).map(async (keyring) => {
      const accounts = await keyring.getAccounts();
      if (accounts.length > 0) {
        validKeyrings.push(keyring);
      } else {
        await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _destroyKeyring, destroyKeyring_fn).call(this, keyring);
      }
    })
  );
  _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _keyrings, validKeyrings);
};
_checkForDuplicate = new WeakSet();
checkForDuplicate_fn = async function(type, newAccountArray) {
  const accounts = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getAccountsFromKeyrings, getAccountsFromKeyrings_fn).call(this);
  switch (type) {
    case "Simple Key Pair" /* simple */: {
      const isIncluded = Boolean(
        accounts.find(
          (key) => newAccountArray[0] && (key === newAccountArray[0] || key === _utils.remove0x.call(void 0, newAccountArray[0]))
        )
      );
      if (isIncluded) {
        throw new Error("KeyringController - The account you are trying to import is a duplicate" /* DuplicatedAccount */);
      }
      return newAccountArray;
    }
    default: {
      return newAccountArray;
    }
  }
};
_setUnlocked = new WeakSet();
setUnlocked_fn = function() {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  this.update((state) => {
    state.isUnlocked = true;
  });
  this.messagingSystem.publish(`${name}:unlock`);
};
_persistOrRollback = new WeakSet();
persistOrRollback_fn = async function(fn) {
  return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _withRollback, withRollback_fn).call(this, async ({ releaseLock }) => {
    const callbackResult = await fn({ releaseLock });
    await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _updateVault, updateVault_fn).call(this);
    return callbackResult;
  });
};
_withRollback = new WeakSet();
withRollback_fn = async function(fn) {
  return _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _withControllerLock, withControllerLock_fn).call(this, async ({ releaseLock }) => {
    const currentSerializedKeyrings = await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _getSerializedKeyrings, getSerializedKeyrings_fn).call(this);
    const currentPassword = _chunkNOCGQCUMjs.__privateGet.call(void 0, this, _password);
    try {
      return await fn({ releaseLock });
    } catch (e) {
      await _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _restoreSerializedKeyrings, restoreSerializedKeyrings_fn).call(this, currentSerializedKeyrings);
      _chunkNOCGQCUMjs.__privateSet.call(void 0, this, _password, currentPassword);
      throw e;
    }
  });
};
_assertControllerMutexIsLocked = new WeakSet();
assertControllerMutexIsLocked_fn = function() {
  if (!_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _controllerOperationMutex).isLocked()) {
    throw new Error("KeyringController - attempt to update vault during a non mutually exclusive operation" /* ControllerLockRequired */);
  }
};
_withControllerLock = new WeakSet();
withControllerLock_fn = async function(fn) {
  return withLock(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _controllerOperationMutex), fn);
};
_withVaultLock = new WeakSet();
withVaultLock_fn = async function(fn) {
  _chunkNOCGQCUMjs.__privateMethod.call(void 0, this, _assertControllerMutexIsLocked, assertControllerMutexIsLocked_fn).call(this);
  return withLock(_chunkNOCGQCUMjs.__privateGet.call(void 0, this, _vaultOperationMutex), fn);
};
async function withLock(mutex, fn) {
  const releaseLock = await mutex.acquire();
  try {
    return await fn({ releaseLock });
  } finally {
    releaseLock();
  }
}
var KeyringController_default = KeyringController;










exports.KeyringTypes = KeyringTypes; exports.isCustodyKeyring = isCustodyKeyring; exports.AccountImportStrategy = AccountImportStrategy; exports.SignTypedDataVersion = SignTypedDataVersion; exports.keyringBuilderFactory = keyringBuilderFactory; exports.getDefaultKeyringState = getDefaultKeyringState; exports.KeyringController = KeyringController; exports.KeyringController_default = KeyringController_default;
//# sourceMappingURL=chunk-YL6VJWHK.js.map