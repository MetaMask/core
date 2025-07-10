import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { scryptAsync } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha256';
import {
  utf8ToBytes,
  concatBytes,
  bytesToHex,
  hexToBytes,
} from '@noble/hashes/utils';

import {
  getCachedKeyBySalt,
  getCachedKeyGeneratedWithSharedSalt,
  setCachedKey,
} from './cache';
import { ALGORITHM_NONCE_SIZE, SHARED_SALT } from './constants';
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

export type EncryptedPayloadV2 = {
  // version
  v: '2';

  // algorithm
  t: 'gcm';

  // data
  d: string;
};

class EncryptorDecryptor {
  async encryptString(plaintext: string, password: string): Promise<string> {
    try {
      return await this.#encryptStringV2(plaintext, password);
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
      const encryptedData: EncryptedPayload | EncryptedPayloadV2 =
        JSON.parse(encryptedDataStr);

      if (encryptedData.v === '2') {
        if (encryptedData.t === 'gcm') {
          return await this.#decryptStringV2(encryptedData, password);
        }
      }

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

  async #encryptStringV2(plaintext: string, password: string): Promise<string> {
    const plaintextRaw = utf8ToBytes(plaintext);
    const passwordRaw = hexToBytes(password);
    const cipherTextAndNonce = this.#encrypt(plaintextRaw, passwordRaw);

    const encryptedPayload: EncryptedPayloadV2 = {
      v: '2',
      t: 'gcm',
      d: byteArrayToBase64(cipherTextAndNonce),
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

  async #decryptStringV2(
    data: EncryptedPayloadV2,
    password: string,
  ): Promise<string> {
    const { d: base64CiphertextAndNonce } = data;

    const ciphertextAndNonce = base64ToByteArray(base64CiphertextAndNonce);
    const passwordRaw = hexToBytes(password);

    return bytesToUtf8(this.#decrypt(ciphertextAndNonce, passwordRaw));
  }

  getSalt(encryptedDataStr: string): Uint8Array | null {
    try {
      const encryptedData: EncryptedPayload | EncryptedPayloadV2 =
        JSON.parse(encryptedDataStr);

      if (encryptedData.v === '2') {
        // V2 encryption doesn't use traditional salts, return null to indicate no salt
        return null;
      }

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
      .filter((s): s is Uint8Array | null => s !== undefined);

    // Convert to strings for comparison, using 'null' for null values
    const strSet = new Set(
      salts.map((salt) => (salt ? salt.toString() : 'null')),
    );
    return strSet.size === salts.length;
  }

  #encrypt(plaintext: Uint8Array, key: Uint8Array): Uint8Array {
    const nonce = randomBytes(ALGORITHM_NONCE_SIZE);
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
    const cachedKey = salt
      ? getCachedKeyBySalt(hashedPassword, salt)
      : getCachedKeyGeneratedWithSharedSalt(hashedPassword);

    if (cachedKey) {
      return {
        key: cachedKey.key,
        salt: cachedKey.salt,
      };
    }

    const newSalt = salt ?? SHARED_SALT;

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
 *
 * @param data - input
 * @returns sha256 hash
 */
export function createSHA256Hash(data: string): string {
  const hashedData = sha256(data);
  return bytesToHex(hashedData);
}
