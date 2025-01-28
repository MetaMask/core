import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { scryptAsync } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, concatBytes, bytesToHex } from '@noble/hashes/utils';

import type { NativeScrypt } from '../types/encryption';
import { getCachedKeyBySalt, setCachedKey } from './cache';
import {
  ALGORITHM_KEY_SIZE,
  ALGORITHM_NONCE_SIZE,
  SCRYPT_N,
  SCRYPT_p,
  SCRYPT_r,
  SCRYPT_SALT_SIZE,
  SHARED_SALT,
} from './constants';
import type { KeyStore } from './key-storage';
import {
  base64ToByteArray,
  byteArrayToBase64,
  bytesToUtf8,
  stringToByteArray,
} from './utils';

/**
 * Describes the structure of an encrypted payload for user storage.
 *
 * The data is encrypted using AES-GCM, and the key is derived from the profile storage_key using scrypt.
 */
export type EncryptedPayload = {
  // version
  v: '1';

  // key derivation function algorithm - scrypt
  t: 'scrypt';

  // data
  d: string;

  // derivation options - scrypt
  o: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    N: number;
    r: number;
    p: number;
    dkLen: number;
  };

  // Salt options
  saltLen: number;
};

class EncryptorDecryptor {
  async encryptString(
    plaintext: string,
    password: string,
    nativeScryptCrypto?: NativeScrypt,
    keyStore?: KeyStore,
  ): Promise<string> {
    try {
      return await this.#encryptStringV1(
        plaintext,
        password,
        nativeScryptCrypto,
        keyStore,
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
    keyStore?: KeyStore,
  ): Promise<string> {
    try {
      const encryptedData: EncryptedPayload = JSON.parse(encryptedDataStr);
      if (encryptedData.v === '1') {
        if (encryptedData.t === 'scrypt') {
          return await this.#decryptStringV1(
            encryptedData,
            password,
            nativeScryptCrypto,
            keyStore,
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
    keyStore?: KeyStore,
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
      keyStore,
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
    keyStore?: KeyStore,
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
      keyStore,
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
    keyStore?: KeyStore,
  ) {
    const hashedPassword = createSHA256Hash(password);

    const cachedKey = salt
      ? getCachedKeyBySalt(hashedPassword, salt)
      : getCachedKeyBySalt(hashedPassword, SHARED_SALT);

    if (cachedKey) {
      return {
        key: cachedKey.key,
        salt: cachedKey.salt,
      };
    }

    const newSalt = salt ?? SHARED_SALT;
    const keyRef = `${hashedPassword}${bytesToHex(newSalt)}`;
    if (keyStore) {
      try {
        const storedKey = await keyStore.loadKey(keyRef);
        if (storedKey) {
          setCachedKey(hashedPassword, newSalt, storedKey);
          return {
            key: storedKey,
            salt: newSalt,
          };
        }
      } catch (e) {
        // nop. couldn't decrypt key, proceed to deriving it
      }
    }

    let newKey: Uint8Array;
    if (nativeScryptCrypto) {
      newKey = await nativeScryptCrypto(
        stringToByteArray(password),
        newSalt,
        o.N,
        o.r,
        o.p,
        o.dkLen,
      );
    } else {
      newKey = await scryptAsync(password, newSalt, {
        N: o.N,
        r: o.r,
        p: o.p,
        dkLen: o.dkLen,
      });
    }

    setCachedKey(hashedPassword, newSalt, newKey);
    if (keyStore) {
      try {
        await keyStore.storeKey(keyRef, newKey);
      } catch (e) {
        // nop. couldn't store key, proceed to just returning it
      }
    }

    return {
      key: newKey,
      salt: newSalt,
    };
  }
}

const encryption = new EncryptorDecryptor();
export default encryption;

/**
 * Receive a SHA256 hash from a given string
 * @param data - input
 * @returns sha256 hash
 */
export function createSHA256Hash(data: string): string {
  const hashedData = sha256(data);
  return bytesToHex(hashedData);
}
