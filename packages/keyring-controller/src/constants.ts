export enum KeyringControllerError {
  NoKeyring = 'KeyringController - No keyring found',
  WrongPasswordType = 'KeyringController - Password must be of type string.',
  NoFirstAccount = 'KeyringController - First Account not found.',
  DuplicatedAccount = 'KeyringController - The account you are trying to import is a duplicate',
  VaultError = 'KeyringController - Cannot unlock without a previous vault.',
  VaultDataError = 'KeyringController - The decrypted vault has an unexpected shape.',
  UnsupportedEncryptionKeyExport = 'KeyringController - The encryptor does not support encryption key export.',
  UnsupportedGenerateRandomMnemonic = 'KeyringController - The current keyring does not support the method generateRandomMnemonic.',
  UnsupportedExportAccount = '`KeyringController - The keyring for the current address does not support the method exportAccount',
  UnsupportedRemoveAccount = '`KeyringController - The keyring for the current address does not support the method removeAccount',
  UnsupportedSignTransaction = 'KeyringController - The keyring for the current address does not support the method signTransaction.',
  UnsupportedSignMessage = 'KeyringController - The keyring for the current address does not support the method signMessage.',
  UnsupportedSignPersonalMessage = 'KeyringController - The keyring for the current address does not support the method signPersonalMessage.',
  UnsupportedGetEncryptionPublicKey = 'KeyringController - The keyring for the current address does not support the method getEncryptionPublicKey.',
  UnsupportedDecryptMessage = 'KeyringController - The keyring for the current address does not support the method decryptMessage.',
  UnsupportedSignTypedMessage = 'KeyringController - The keyring for the current address does not support the method signTypedMessage.',
  UnsupportedGetAppKeyAddress = 'KeyringController - The keyring for the current address does not support the method getAppKeyAddress.',
  UnsupportedExportAppKeyForAddress = 'KeyringController - The keyring for the current address does not support the method exportAppKeyForAddress.',
  UnsupportedPrepareUserOperation = 'KeyringController - The keyring for the current address does not support the method prepareUserOperation.',
  UnsupportedPatchUserOperation = 'KeyringController - The keyring for the current address does not support the method patchUserOperation.',
  UnsupportedSignUserOperation = 'KeyringController - The keyring for the current address does not support the method signUserOperation.',
  NoAccountOnKeychain = "KeyringController - The keychain doesn't have accounts.",
  MissingCredentials = 'KeyringController - Cannot persist vault without password and encryption key',
  MissingVaultData = 'KeyringController - Cannot persist vault without vault information',
  ExpiredCredentials = 'KeyringController - Encryption key and salt provided are expired',
  NoKeyringBuilder = 'KeyringController - No keyringBuilder found for keyring',
  DataType = 'KeyringController - Incorrect data type provided',
}
