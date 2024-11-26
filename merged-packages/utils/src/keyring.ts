import type { TypedTransaction, TxData } from '@ethereumjs/tx';

import type { Eip1024EncryptedData } from './encryption-types';
import type { Hex } from './hex';
import type { Json } from './json';

/**
 * A Keyring class.
 *
 * This type is used to validate the constructor signature and the `type`
 * static property on Keyring classes. See the {@link Keyring} type for more
 * information.
 */
export type KeyringClass<State extends Json> = {
  /**
   * The Keyring constructor. Takes a single parameter, an "options" object.
   * See the documentation for the specific keyring for more information about
   * what these options are.
   *
   * @param options - The constructor options. Differs between keyring
   * implementations.
   */
  new (options?: Record<string, unknown>): Keyring<State>;

  /**
   * The name of this type of keyring. This must uniquely identify the
   * keyring type.
   */
  type: string;
};

/**
 * A keyring is something that can sign messages. Keyrings are used to add new
 * signing strategies; each strategy is a new keyring.
 *
 * Each keyring manages a collection of key pairs, which we call "accounts".
 * Each account is referred to by its "address", which is a unique identifier
 * derived from the public key. The address is always a "0x"-prefixed
 * hexidecimal string.
 *
 * The keyring might store the private key for each account as well, but it's
 * not guaranteed. Some keyrings delegate signing, so they don't need the
 * private key directly. The keyring (and in particular the keyring state)
 * should be treated with care though, just in case it does contain sensitive
 * material such as a private key.
 */
export type Keyring<State extends Json> = {
  /**
   * The name of this type of keyring. This must match the `type` property of
   * the keyring class.
   */
  type: string;

  /**
   * Get the addresses for all accounts in this keyring.
   *
   * @returns A list of the account addresses for this keyring
   */
  getAccounts(): Promise<Hex[]>;

  /**
   * Add an account to the keyring.
   *
   * @param number - The number of accounts to add. Usually defaults to 1.
   * @returns A list of the newly added account addresses.
   */
  addAccounts(number: number): Promise<Hex[]>;

  /**
   * Serialize the keyring state as a JSON-serializable object.
   *
   * @returns A JSON-serializable representation of the keyring state.
   */
  serialize(): Promise<State>;

  /**
   * Deserialize the given keyring state, overwriting any existing state with
   * the serialized state provided.
   *
   * @param state - A JSON-serializable representation of the keyring state.
   */
  deserialize(state: State): Promise<void>;

  /**
   * Method to include asynchronous configuration.
   */
  init?(): Promise<void>;

  /**
   * Remove an account from the keyring.
   *
   * @param address - The address of the account to remove.
   */
  removeAccount?(address: Hex): void;

  /**
   * Export the private key for one of the keyring accounts.
   *
   * Some keyrings accept an "options" parameter as well. See the documentation
   * for the specific keyring for more information about what these options
   * are. For some keyrings, the options parameter is used to allow exporting a
   * private key that is derived from the given account, rather than exporting
   * that account's private key directly.
   *
   * @param address - The address of the account to export.
   * @param options - Export options; differs between keyrings.
   * @returns The non-prefixed, hex-encoded private key that was requested.
   */
  exportAccount?(
    address: Hex,
    options?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Get the "app key" address for the given account and origin. An app key is
   * an application-specific key pair. See {@link https://eips.ethereum.org/EIPS/eip-1775|EIP-1775}
   * for more information. The {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin|origin}
   * is used as the unique identifier for the application, and it's used as
   * part of the key derivation process.
   *
   * @param address - The address of the account the app key is derived from.
   * @param origin - The origin of the application.
   * @returns The address of the app key for the given account and origin.
   */
  getAppKeyAddress?(address: Hex, origin: string): Promise<Hex>;

  /**
   * Sign a transaction. This is equivalent to the `eth_signTransaction`
   * Ethereum JSON-RPC method. See the Ethereum JSON-RPC API documentation for
   * more details.
   *
   * Some keyrings accept an "options" parameter as well. See the documentation
   * for the specific keyring for more information about what these options
   * are. For some keyrings, the options parameter can even change which key is
   * used for signing (e.g. signing with app keys).
   *
   * @param address - The address of the account to use for signing.
   * @param transaction - The transaction to sign.
   * @param options - Signing options; differs between keyrings.
   * @returns The signed transaction.
   */
  signTransaction?(
    address: Hex,
    transaction: TypedTransaction,
    options?: Record<string, unknown>,
  ): Promise<TxData>;

  /**
   * Sign a message. This is equivalent to an older version of the the
   * `eth_sign` Ethereum JSON-RPC method. The message is signed using ECDSA,
   * using the curve secp256k1 the Keccak-256 hash function.
   *
   * For more information about this method and why we still support it, see
   * the {@link https://docs.metamask.io/guide/signing-data.html|MetaMask Docs}.
   *
   * Some keyrings accept an "options" parameter as well. See the documentation
   * for the specific keyring for more information about what these options
   * are. For some keyrings, the options parameter can even change which key is
   * used for signing (e.g. signing with app keys).
   *
   * @param address - The address of the account to use for signing.
   * @param message - The message to sign.
   * @param options - Signing options; differs between keyrings.
   * @returns The signed message.
   */
  signMessage?(
    address: Hex,
    message: string,
    options?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Sign a message. This is equivalent to the `eth_sign` Ethereum JSON-RPC
   * method, which is exposed by MetaMask as the method `personal_sign`. See
   * the Ethereum JSON-RPC API documentation for more details.
   *
   * For more information about this method and why we call it `personal_sign`,
   * see the {@link https://docs.metamask.io/guide/signing-data.html|MetaMask Docs}.
   *
   * Some keyrings accept an "options" parameter as well. See the documentation
   * for the specific keyring for more information about what these options
   * are. For some keyrings, the options parameter can even change which key is
   * used for signing (e.g. signing with app keys).
   *
   * @param address - The address of the account to use for signing.
   * @param message - The message to sign.
   * @param options - Signing options; differs between keyrings.
   * @returns The signed message.
   */
  signPersonalMessage?(
    address: Hex,
    message: Hex,
    options?: { version?: string } & Record<string, unknown>,
  ): Promise<string>;

  /**
   * Sign a message. This is equivalent to the `eth_signTypedData` Ethereum
   * JSON-RPC method. See {@link https://github.com/ethereum/EIPs/blob/master/EIPS/eip-712.md|EIP-712}
   * for more details.
   *
   * The "version" option dictates which version of `eth_signTypedData` is
   * used. The latest version reflects the specification most closely, whereas
   * earlier versions reflect earlier drafts of the specification that are
   * still supported for backwards-compatibility reasons. For more information
   * about why we support multiple versions, see the {@link https://docs.metamask.io/guide/signing-data.html|MetaMask Docs}.
   *
   * Some keyrings accept additional options as well. See the documentation for
   * the specific keyring for more information about what these options are.
   * For some keyrings, the options parameter can even change which key is used
   * for signing (e.g. signing with app keys).
   *
   * @param address - The address of the account to use for signing.
   * @param typedData - The data to sign.
   * @param options - Signing options; differs between keyrings.
   * @returns The signed message.
   */
  signTypedData?(
    address: Hex,
    typedData: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Get a public key to use for encryption. This is equivalent to the
   * ` eth_getEncryptionPublicKey` JSON-RPC method. See the {@link https://docs.metamask.io/guide/rpc-api.html#eth-getencryptionpublickey|MetaMask Docs}
   * for more information.
   *
   * Some keyrings accept an "options" parameter as well. See the documentation
   * for the specific keyring for more information about what these options
   * are. For some keyrings, the options parameter can even change which key is
   * used (e.g. encrypting with app keys).
   *
   * @param account - The address of the account you want the encryption key for.
   * @param options - Options; differs between keyrings.
   */
  getEncryptionPublicKey?(
    account: Hex,
    options?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Decrypt an encrypted message. This is equivalent to the `  eth_decrypt`
   * JSON-RPC method. See the {@link https://docs.metamask.io/guide/rpc-api.html#eth-decrypt|MetaMask Docs}
   * for more information.
   *
   * @param account - The address of the account you want to use to decrypt
   * the message.
   * @param encryptedData - The encrypted data that you want to decrypt.
   * @returns The decrypted data.
   */
  decryptMessage?(
    account: Hex,
    encryptedData: Eip1024EncryptedData,
  ): Promise<string>;

  /**
   * Generates the properties for the keyring based on the given
   * BIP39-compliant mnemonic.
   *
   * @returns A promise resolving when the keyring has generated the properties.
   */
  generateRandomMnemonic?(): Promise<void>;

  /**
   * Destroy the keyring.
   */
  destroy?(): Promise<void>;
};
