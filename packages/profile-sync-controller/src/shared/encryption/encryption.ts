import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { scryptAsync } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, concatBytes, bytesToHex } from '@noble/hashes/utils';

import {
  getCachedKeyBySalt,
  getCachedKeyGeneratedWithSharedSalt,
  setCachedKey,
} from './cache';
import {
  ALGORITHM_KEY_SIZE,
  ALGORITHM_NONCE_SIZE,
  SCRYPT_N,
  SCRYPT_p,
  SCRYPT_r,
  SCRYPT_SALT_SIZE,
  SHARED_SALT,
} from './constants';
import {
  base64ToByteArray,
  byteArrayToBase64,
  bytesToUtf8,
  stringToByteArray,
} from './utils';
import type { NativeScrypt } from '../types/encryption';

export type EncryptedPayload = {
  // version
  v: '1';

  // key derivation function algorithm - scrypt
  t: 'scrypt';

  // data
  d: string;

  // encryption options - scrypt
  o: {
    N: number;
    r: number;
    p: number;
    dkLen: number;
  };

  // Salt options
  saltLen: number;
};

class EncryptorDecryptor {
  // Promise cache for ongoing KDF operations to prevent duplicate work
  readonly #kdfPromiseCache = new Map<
    string,
    Promise<{ key: Uint8Array; salt: Uint8Array }>
  >();

  async encryptString(
    plaintext: string,
    password: string,
    nativeScryptCrypto?: NativeScrypt,
  ): Promise<string> {
    try {
      return await this.#encryptStringV1(
        plaintext,
        password,
        nativeScryptCrypto,
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(`Unable to encrypt string - ${errorMessage}`);
    }
  }

  async decryptString(
    encryptedDataStr: string,
    password: string,
    nativeScryptCrypto?: NativeScrypt,
  ): Promise<string> {
    try {
      const encryptedData: EncryptedPayload = JSON.parse(encryptedDataStr);
      if (encryptedData.v === '1') {
        if (encryptedData.t === 'scrypt') {
          return await this.#decryptStringV1(
            encryptedData,
            password,
            nativeScryptCrypto,
          );
        }
      }
      throw new Error(
        `Unsupported encrypted data payload - ${encryptedDataStr}`,
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(`Unable to decrypt string - ${errorMessage}`);
    }
  }

  async #encryptStringV1(
    plaintext: string,
    password: string,
    nativeScryptCrypto?: NativeScrypt,
  ): Promise<string> {
    const { key, salt } = await this.#getOrGenerateScryptKey(
      password,
      {
        N: SCRYPT_N,
        r: SCRYPT_r,
        p: SCRYPT_p,
        dkLen: ALGORITHM_KEY_SIZE,
      },
      undefined,
      nativeScryptCrypto,
    );

    // Encrypt and prepend salt.
    const plaintextRaw = utf8ToBytes(plaintext);
    const ciphertextAndNonceAndSalt = concatBytes(
      salt,
      this.#encrypt(plaintextRaw, key),
    );

    // Convert to Base64
    const encryptedData = byteArrayToBase64(ciphertextAndNonceAndSalt);

    const encryptedPayload: EncryptedPayload = {
      v: '1',
      t: 'scrypt',
      d: encryptedData,
      o: {
        N: SCRYPT_N,
        r: SCRYPT_r,
        p: SCRYPT_p,
        dkLen: ALGORITHM_KEY_SIZE,
      },
      saltLen: SCRYPT_SALT_SIZE,
    };

    return JSON.stringify(encryptedPayload);
  }

  async #decryptStringV1(
    data: EncryptedPayload,
    password: string,
    nativeScryptCrypto?: NativeScrypt,
  ): Promise<string> {
    const { o, d: base64CiphertextAndNonceAndSalt, saltLen } = data;

    // Decode the base64.
    const ciphertextAndNonceAndSalt = base64ToByteArray(
      base64CiphertextAndNonceAndSalt,
    );

    // Create buffers of salt and ciphertextAndNonce.
    const salt = ciphertextAndNonceAndSalt.slice(0, saltLen);
    const ciphertextAndNonce = ciphertextAndNonceAndSalt.slice(
      saltLen,
      ciphertextAndNonceAndSalt.length,
    );

    // Derive the key.
    const { key } = await this.#getOrGenerateScryptKey(
      password,
      {
        N: o.N,
        r: o.r,
        p: o.p,
        dkLen: o.dkLen,
      },
      salt,
      nativeScryptCrypto,
    );

    // Decrypt and return result.
    return bytesToUtf8(this.#decrypt(ciphertextAndNonce, key));
  }

  getSalt(encryptedDataStr: string) {
    try {
      const encryptedData: EncryptedPayload = JSON.parse(encryptedDataStr);
      if (encryptedData.v === '1') {
        if (encryptedData.t === 'scrypt') {
          const { d: base64CiphertextAndNonceAndSalt, saltLen } = encryptedData;

          // Decode the base64.
          const ciphertextAndNonceAndSalt = base64ToByteArray(
            base64CiphertextAndNonceAndSalt,
          );

          // Create buffers of salt and ciphertextAndNonce.
          const salt = ciphertextAndNonceAndSalt.slice(0, saltLen);
          return salt;
        }
      }
      throw new Error(
        `Unsupported encrypted data payload - ${encryptedDataStr}`,
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(`Unable to get salt - ${errorMessage}`);
    }
  }

  getIfEntriesHaveDifferentSalts(entries: string[]): boolean {
    const salts = entries
      .map((e) => {
        try {
          return this.getSalt(e);
        } catch {
          return undefined;
        }
      })
      .filter((s): s is Uint8Array => s !== undefined);

    const strSet = new Set(salts.map((arr) => arr.toString()));
    return strSet.size === salts.length;
  }

  #encrypt(plaintext: Uint8Array, key: Uint8Array): Uint8Array {
    const nonce = randomBytes(ALGORITHM_NONCE_SIZE);

    // Encrypt and prepend nonce.
    const ciphertext = gcm(key, nonce).encrypt(plaintext);

    return concatBytes(nonce, ciphertext);
  }

  #decrypt(ciphertextAndNonce: Uint8Array, key: Uint8Array): Uint8Array {
    // Create buffers of nonce and ciphertext.
    const nonce = ciphertextAndNonce.slice(0, ALGORITHM_NONCE_SIZE);
    const ciphertext = ciphertextAndNonce.slice(
      ALGORITHM_NONCE_SIZE,
      ciphertextAndNonce.length,
    );

    // Decrypt and return result.
    return gcm(key, nonce).decrypt(ciphertext);
  }

  async #getOrGenerateScryptKey(
    password: string,
    o: EncryptedPayload['o'],
    salt?: Uint8Array,
    nativeScryptCrypto?: NativeScrypt,
  ) {
    const hashedPassword = createSHA256Hash(password);

    // Check if we already have the key cached
    const cachedKey = salt
      ? getCachedKeyBySalt(hashedPassword, salt)
      : getCachedKeyGeneratedWithSharedSalt(hashedPassword);

    if (cachedKey) {
      return {
        key: cachedKey.key,
        salt: cachedKey.salt,
      };
    }

    // Create a unique cache key for this KDF operation
    const newSalt = salt ?? SHARED_SALT;
    const cacheKey = this.#createKdfCacheKey(
      hashedPassword,
      o,
      newSalt,
      nativeScryptCrypto,
    );

    // Check if there's already an ongoing KDF operation with the same parameters
    const existingPromise = this.#kdfPromiseCache.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    // Create and cache the promise for the KDF operation
    const kdfPromise = this.#performKdfOperation(
      password,
      o,
      newSalt,
      hashedPassword,
      nativeScryptCrypto,
    );

    // Cache the promise and set up cleanup
    this.#kdfPromiseCache.set(cacheKey, kdfPromise);

    // Clean up the cache after completion (both success and failure)
    // eslint-disable-next-line no-void
    void kdfPromise.finally(() => {
      this.#kdfPromiseCache.delete(cacheKey);
    });

    return kdfPromise;
  }

  #createKdfCacheKey(
    hashedPassword: string,
    o: EncryptedPayload['o'],
    salt: Uint8Array,
    nativeScryptCrypto?: NativeScrypt,
  ): string {
    const saltStr = byteArrayToBase64(salt);
    const hasNative = Boolean(nativeScryptCrypto);
    return `${hashedPassword}:${o.N}:${o.r}:${o.p}:${o.dkLen}:${saltStr}:${hasNative}`;
  }

  async #performKdfOperation(
    password: string,
    o: EncryptedPayload['o'],
    salt: Uint8Array,
    hashedPassword: string,
    nativeScryptCrypto?: NativeScrypt,
  ): Promise<{ key: Uint8Array; salt: Uint8Array }> {
    let newKey: Uint8Array;

    if (nativeScryptCrypto) {
      newKey = await nativeScryptCrypto(
        stringToByteArray(password),
        salt,
        o.N,
        o.r,
        o.p,
        o.dkLen,
      );
    } else {
      newKey = await scryptAsync(password, salt, {
        N: o.N,
        r: o.r,
        p: o.p,
        dkLen: o.dkLen,
      });
    }

    setCachedKey(hashedPassword, salt, newKey);

    return {
      key: newKey,
      salt,
    };
  }
}

const encryption = new EncryptorDecryptor();
export default encryption;

/**
 * Receive a SHA256 hash from a given string
 *
 * @param data - input
 * @returns sha256 hash
 */
export function createSHA256Hash(data: string): string {
  const hashedData = sha256(data);
  return bytesToHex(hashedData);
}
