import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { scrypt } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, concatBytes, bytesToHex } from '@noble/hashes/utils';

import { getAnyCachedKey, getCachedKeyBySalt, setCachedKey } from './cache';
import { base64ToByteArray, byteArrayToBase64, bytesToUtf8 } from './utils';

export type EncryptedPayload = {
  // version
  v: '1';

  // key derivation function algorithm - scrypt
  t: 'scrypt';

  // data
  d: string;

  // encryption options - scrypt
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

// Nonce/Key Sizes
const ALGORITHM_NONCE_SIZE = 12; // 12 bytes
const ALGORITHM_KEY_SIZE = 16; // 16 bytes

// Scrypt settings
// see: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
const SCRYPT_SALT_SIZE = 16; // 16 bytes
const SCRYPT_N = 2 ** 17; // CPU/memory cost parameter (must be a power of 2, > 1)
// eslint-disable-next-line @typescript-eslint/naming-convention
const SCRYPT_r = 8; // Block size parameter
// eslint-disable-next-line @typescript-eslint/naming-convention
const SCRYPT_p = 1; // Parallelization parameter

class EncryptorDecryptor {
  encryptString(plaintext: string, password: string): string {
    try {
      return this.#encryptStringV1(plaintext, password);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(`Unable to encrypt string - ${errorMessage}`);
    }
  }

  decryptString(encryptedDataStr: string, password: string): string {
    try {
      const encryptedData: EncryptedPayload = JSON.parse(encryptedDataStr);
      if (encryptedData.v === '1') {
        if (encryptedData.t === 'scrypt') {
          return this.#decryptStringV1(encryptedData, password);
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

  #encryptStringV1(plaintext: string, password: string): string {
    const { key, salt } = this.#getOrGenerateScryptKey(password, {
      N: SCRYPT_N,
      r: SCRYPT_r,
      p: SCRYPT_p,
      dkLen: ALGORITHM_KEY_SIZE,
    });

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

  #decryptStringV1(data: EncryptedPayload, password: string): string {
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
    const { key } = this.#getOrGenerateScryptKey(
      password,
      {
        N: o.N,
        r: o.r,
        p: o.p,
        dkLen: o.dkLen,
      },
      salt,
    );

    // Decrypt and return result.
    return bytesToUtf8(this.#decrypt(ciphertextAndNonce, key));
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

  #getOrGenerateScryptKey(
    password: string,
    o: EncryptedPayload['o'],
    salt?: Uint8Array,
  ) {
    const hashedPassword = createSHA256Hash(password);
    const cachedKey = salt
      ? getCachedKeyBySalt(hashedPassword, salt)
      : getAnyCachedKey(hashedPassword);

    if (cachedKey) {
      return {
        key: cachedKey.key,
        salt: cachedKey.salt,
      };
    }

    const newSalt = salt ?? randomBytes(SCRYPT_SALT_SIZE);
    const newKey = scrypt(password, newSalt, {
      N: o.N,
      r: o.r,
      p: o.p,
      dkLen: o.dkLen,
    });
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
 * @param data - input
 * @returns sha256 hash
 */
export function createSHA256Hash(data: string): string {
  const hashedData = sha256(data);
  return bytesToHex(hashedData);
}
