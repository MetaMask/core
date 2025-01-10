import type { Eip1024EncryptedData, Hex } from '@metamask/utils';
import { base64ToBytes, bytesToBase64, hexToBytes } from '@metamask/utils';
import { randomBytes } from '@noble/ciphers/crypto';
import { hsalsa, secretbox } from '@noble/ciphers/salsa';
import { u8, u32 } from '@noble/ciphers/utils';
import { x25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';

/**
 * A decryption interface for ERC-1024 encrypted payloads.
 */
export type CryptoLayer = {
  /**
   * Gets a public key in hex encoding. This is meant to be used to encrypt keys at rest.
   * Initial implementations provide a x25519 key as that is the only known variant for the ERC1024 implementation.
   * But this interface does not specify the type of public key.
   */
  getPublicKey(): Promise<string>;

  /**
   * Decrypts an EIP-1024 encrypted message using the private key corresponding to `getPublicKey`.
   */
  decryptMessage(message: Eip1024EncryptedData): Promise<string>;
};

/**
 * An interface for a storage layer. This is meant to be used to store encrypted keys.
 */
export type StorageLayer = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

/**
 * A storage layer for keys that should be encrypted at rest.
 */
export type KeyStore = {
  /**
   * Wraps a key and stores it in the key store.
   * @param keyRef - The key ID to use for later fetching.
   * @param key - The key material to be stored.
   * @returns Whether the operation was successful.
   */
  storeKey(keyRef: string, key: Uint8Array): Promise<boolean>;

  /**
   * Loads a key from the key store(if it exists) and unwraps it.
   * @param keyRef - The ID of the key to fetch.
   * @returns The unwrapped key, or null if the key does not exist.
   */
  loadKey(keyRef: string): Promise<Uint8Array | null>;
};

/**
 * A helper class for creating ERC-1024 encrypted payloads.
 */
class ERC1024Helper {
  #publicKeyLength = 32;

  #secretKeyLength = 32;

  #nonceLength = 24;

  #expandedKeyLength = 32;

  // hardcoded value of `u32(new TextEncoder().encode('expand 32-byte k'));`
  #_sigma = new Uint32Array([1634760805, 857760878, 2036477234, 1797285236]);

  #computeSharedKey = (pk: Uint8Array, sk: Uint8Array): Uint8Array => {
    const s = x25519.getSharedSecret(sk, pk);
    const k32 = new Uint32Array(this.#expandedKeyLength / 4);
    hsalsa(this.#_sigma, u32(s), new Uint32Array(4), k32);
    return u8(k32);
  };

  #checkArrayTypes = (publicKey: unknown, secretKey: unknown) => {
    if (!(publicKey instanceof Uint8Array)) {
      throw new TypeError('publicKey must be a Uint8Array');
    }
    if (!(secretKey instanceof Uint8Array)) {
      throw new TypeError('secretKey must be a Uint8Array');
    }
  };

  #checkKeyLengths = (publicKey: Uint8Array, secretKey: Uint8Array) => {
    if (publicKey.length !== this.#publicKeyLength) {
      throw new TypeError(
        `publicKey must be ${this.#publicKeyLength} bytes long`,
      );
    }
    if (secretKey.length !== this.#secretKeyLength) {
      throw new TypeError(
        `secretKey must be ${this.#secretKeyLength} bytes long`,
      );
    }
  };

  #boxSeal = (
    message: Uint8Array,
    nonce: Uint8Array,
    pk: Uint8Array,
    sk: Uint8Array,
  ): Uint8Array => {
    this.#checkArrayTypes(pk, sk);
    this.#checkKeyLengths(pk, sk);
    const k = this.#computeSharedKey(pk, sk);
    return secretbox(k, nonce).seal(message);
  };

  // // Provided for symmetry, but not used.
  //
  // #boxOpen = (
  //   box: Uint8Array,
  //   nonce: Uint8Array,
  //   pk: Uint8Array,
  //   sk: Uint8Array,
  // ): Uint8Array => {
  //   this.#checkArrayTypes(pk, sk);
  //   this.#checkKeyLengths(pk, sk);
  //   const k = this.#computeSharedKey(pk, sk);
  //   return secretbox(k, nonce).open(box);
  // };

  encrypt = (
    receiverPublicKey: Hex | Uint8Array,
    message: string,
    version = 'x25519-xsalsa20-poly1305',
  ): Eip1024EncryptedData => {
    switch (version) {
      case 'x25519-xsalsa20-poly1305': {
        // generate ephemeral keypair
        const ephemeralSecret = randomBytes(this.#secretKeyLength);
        const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);

        let publicKeyBytes;
        // assemble encryption parameters
        if (receiverPublicKey instanceof Uint8Array) {
          publicKeyBytes = receiverPublicKey;
        } else {
          try {
            publicKeyBytes = hexToBytes(receiverPublicKey);
          } catch (error) {
            throw new Error('Bad public key');
          }
        }

        const messageBytes = utf8ToBytes(message);
        const nonce = randomBytes(this.#nonceLength);

        // encrypt
        const encryptedMessage = this.#boxSeal(
          messageBytes,
          nonce,
          publicKeyBytes,
          ephemeralSecret,
        );

        // return encrypted data
        return {
          version: 'x25519-xsalsa20-poly1305',
          nonce: bytesToBase64(nonce),
          ephemPublicKey: bytesToBase64(ephemeralPublic),
          ciphertext: bytesToBase64(encryptedMessage),
        } as Eip1024EncryptedData;
      }
      default:
        throw new Error(`Encryption type/version not supported ${version}`);
    }
  };
}

/**
 * A key store that wraps keys in an ERC-1024 compatible envelope while at rest.
 * @see https://github.com/ethereum/EIPs/pull/1098
 */
export class ERC1024WrappedKeyStore implements KeyStore {
  #config: CryptoLayer & StorageLayer;

  constructor(config: CryptoLayer & StorageLayer) {
    this.#config = config;
  }

  async storeKey(keyRef: string, key: Uint8Array): Promise<boolean> {
    try {
      const publicKeyHex = hexToBytes(await this.#config.getPublicKey());
      const encryptedKey = new ERC1024Helper().encrypt(
        publicKeyHex,
        bytesToBase64(key),
      );
      await this.#config.setItem(keyRef, JSON.stringify(encryptedKey));
      return true;
    } catch {
      return false;
    }
  }

  async loadKey(keyRef: string): Promise<Uint8Array | null> {
    try {
      const wrappedKeySerialized = await this.#config.getItem(keyRef);
      const wrappedKey = JSON.parse(
        wrappedKeySerialized as string,
      ) as Eip1024EncryptedData;
      const contentKeyBase64 = await this.#config.decryptMessage(wrappedKey);
      return base64ToBytes(contentKeyBase64);
    } catch {
      // this is meant to be a silent error, as the key might not exist in the cache
      return null;
    }
  }
}
