"use strict";Object.defineProperty(exports, "__esModule", {value: true});var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/constants.ts
var KeyringControllerError = /* @__PURE__ */ ((KeyringControllerError2) => {
  KeyringControllerError2["NoKeyring"] = "KeyringController - No keyring found";
  KeyringControllerError2["KeyringNotFound"] = "KeyringController - Keyring not found.";
  KeyringControllerError2["UnsafeDirectKeyringAccess"] = "KeyringController - Returning keyring instances is unsafe";
  KeyringControllerError2["WrongPasswordType"] = "KeyringController - Password must be of type string.";
  KeyringControllerError2["InvalidEmptyPassword"] = "KeyringController - Password cannot be empty.";
  KeyringControllerError2["NoFirstAccount"] = "KeyringController - First Account not found.";
  KeyringControllerError2["DuplicatedAccount"] = "KeyringController - The account you are trying to import is a duplicate";
  KeyringControllerError2["VaultError"] = "KeyringController - Cannot unlock without a previous vault.";
  KeyringControllerError2["VaultDataError"] = "KeyringController - The decrypted vault has an unexpected shape.";
  KeyringControllerError2["UnsupportedEncryptionKeyExport"] = "KeyringController - The encryptor does not support encryption key export.";
  KeyringControllerError2["UnsupportedGenerateRandomMnemonic"] = "KeyringController - The current keyring does not support the method generateRandomMnemonic.";
  KeyringControllerError2["UnsupportedExportAccount"] = "`KeyringController - The keyring for the current address does not support the method exportAccount";
  KeyringControllerError2["UnsupportedRemoveAccount"] = "`KeyringController - The keyring for the current address does not support the method removeAccount";
  KeyringControllerError2["UnsupportedSignTransaction"] = "KeyringController - The keyring for the current address does not support the method signTransaction.";
  KeyringControllerError2["UnsupportedSignMessage"] = "KeyringController - The keyring for the current address does not support the method signMessage.";
  KeyringControllerError2["UnsupportedSignPersonalMessage"] = "KeyringController - The keyring for the current address does not support the method signPersonalMessage.";
  KeyringControllerError2["UnsupportedGetEncryptionPublicKey"] = "KeyringController - The keyring for the current address does not support the method getEncryptionPublicKey.";
  KeyringControllerError2["UnsupportedDecryptMessage"] = "KeyringController - The keyring for the current address does not support the method decryptMessage.";
  KeyringControllerError2["UnsupportedSignTypedMessage"] = "KeyringController - The keyring for the current address does not support the method signTypedMessage.";
  KeyringControllerError2["UnsupportedGetAppKeyAddress"] = "KeyringController - The keyring for the current address does not support the method getAppKeyAddress.";
  KeyringControllerError2["UnsupportedExportAppKeyForAddress"] = "KeyringController - The keyring for the current address does not support the method exportAppKeyForAddress.";
  KeyringControllerError2["UnsupportedPrepareUserOperation"] = "KeyringController - The keyring for the current address does not support the method prepareUserOperation.";
  KeyringControllerError2["UnsupportedPatchUserOperation"] = "KeyringController - The keyring for the current address does not support the method patchUserOperation.";
  KeyringControllerError2["UnsupportedSignUserOperation"] = "KeyringController - The keyring for the current address does not support the method signUserOperation.";
  KeyringControllerError2["NoAccountOnKeychain"] = "KeyringController - The keychain doesn't have accounts.";
  KeyringControllerError2["MissingCredentials"] = "KeyringController - Cannot persist vault without password and encryption key";
  KeyringControllerError2["MissingVaultData"] = "KeyringController - Cannot persist vault without vault information";
  KeyringControllerError2["ExpiredCredentials"] = "KeyringController - Encryption key and salt provided are expired";
  KeyringControllerError2["NoKeyringBuilder"] = "KeyringController - No keyringBuilder found for keyring";
  KeyringControllerError2["DataType"] = "KeyringController - Incorrect data type provided";
  KeyringControllerError2["NoHdKeyring"] = "KeyringController - No HD Keyring found";
  KeyringControllerError2["ControllerLockRequired"] = "KeyringController - attempt to update vault during a non mutually exclusive operation";
  return KeyringControllerError2;
})(KeyringControllerError || {});







exports.__privateGet = __privateGet; exports.__privateAdd = __privateAdd; exports.__privateSet = __privateSet; exports.__privateMethod = __privateMethod; exports.KeyringControllerError = KeyringControllerError;
//# sourceMappingURL=chunk-NOCGQCUM.js.map