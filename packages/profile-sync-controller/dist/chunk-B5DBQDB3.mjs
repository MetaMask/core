import {
  __privateAdd,
  __privateGet,
  __privateMethod
} from "./chunk-U5UIDVOO.mjs";

// src/sdk/encryption.ts
import { gcm } from "@noble/ciphers/aes";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, concatBytes, bytesToHex } from "@noble/hashes/utils";
function byteArrayToBase64(byteArray) {
  return Buffer.from(byteArray).toString("base64");
}
function base64ToByteArray(base64) {
  return new Uint8Array(Buffer.from(base64, "base64"));
}
function bytesToUtf8(byteArray) {
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(byteArray);
}
var _ALGORITHM_NONCE_SIZE, _ALGORITHM_KEY_SIZE, _PBKDF2_SALT_SIZE, _PBKDF2_ITERATIONS, _encryptStringV1, encryptStringV1_fn, _decryptStringV1, decryptStringV1_fn, _encrypt, encrypt_fn, _decrypt, decrypt_fn;
var EncryptorDecryptor = class {
  constructor() {
    __privateAdd(this, _encryptStringV1);
    __privateAdd(this, _decryptStringV1);
    __privateAdd(this, _encrypt);
    __privateAdd(this, _decrypt);
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __privateAdd(this, _ALGORITHM_NONCE_SIZE, 12);
    // 12 bytes
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __privateAdd(this, _ALGORITHM_KEY_SIZE, 16);
    // 16 bytes
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __privateAdd(this, _PBKDF2_SALT_SIZE, 16);
    // 16 bytes
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __privateAdd(this, _PBKDF2_ITERATIONS, 9e5);
  }
  encryptString(plaintext, password) {
    try {
      if (plaintext.trim().length === 0) {
        throw new Error("No plain text provided");
      }
      return __privateMethod(this, _encryptStringV1, encryptStringV1_fn).call(this, plaintext, password);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(`Unable to encrypt string - ${errorMessage}`);
    }
  }
  decryptString(encryptedDataStr, password) {
    try {
      const encryptedData = JSON.parse(encryptedDataStr);
      if (encryptedData.v === "1") {
        return __privateMethod(this, _decryptStringV1, decryptStringV1_fn).call(this, encryptedData, password);
      }
      throw new Error(
        `Unsupported encrypted data payload - ${JSON.stringify(encryptedData)}`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(`Unable to decrypt string - ${errorMessage}`);
    }
  }
};
_ALGORITHM_NONCE_SIZE = new WeakMap();
_ALGORITHM_KEY_SIZE = new WeakMap();
_PBKDF2_SALT_SIZE = new WeakMap();
_PBKDF2_ITERATIONS = new WeakMap();
_encryptStringV1 = new WeakSet();
encryptStringV1_fn = function(plaintext, password) {
  const salt = randomBytes(__privateGet(this, _PBKDF2_SALT_SIZE));
  const key = pbkdf2(sha256, password, salt, {
    c: __privateGet(this, _PBKDF2_ITERATIONS),
    dkLen: __privateGet(this, _ALGORITHM_KEY_SIZE)
  });
  const plaintextRaw = utf8ToBytes(plaintext);
  const ciphertextAndNonceAndSalt = concatBytes(
    salt,
    __privateMethod(this, _encrypt, encrypt_fn).call(this, plaintextRaw, key)
  );
  const encryptedData = byteArrayToBase64(ciphertextAndNonceAndSalt);
  const encryptedPayload = {
    v: "1",
    d: encryptedData,
    iterations: __privateGet(this, _PBKDF2_ITERATIONS)
  };
  return JSON.stringify(encryptedPayload);
};
_decryptStringV1 = new WeakSet();
decryptStringV1_fn = function(data, password) {
  const { iterations, d: base64CiphertextAndNonceAndSalt } = data;
  const ciphertextAndNonceAndSalt = base64ToByteArray(
    base64CiphertextAndNonceAndSalt
  );
  const salt = ciphertextAndNonceAndSalt.slice(0, __privateGet(this, _PBKDF2_SALT_SIZE));
  const ciphertextAndNonce = ciphertextAndNonceAndSalt.slice(
    __privateGet(this, _PBKDF2_SALT_SIZE),
    ciphertextAndNonceAndSalt.length
  );
  const key = pbkdf2(sha256, password, salt, {
    c: iterations,
    dkLen: __privateGet(this, _ALGORITHM_KEY_SIZE)
  });
  return bytesToUtf8(__privateMethod(this, _decrypt, decrypt_fn).call(this, ciphertextAndNonce, key));
};
_encrypt = new WeakSet();
encrypt_fn = function(plaintext, key) {
  const nonce = randomBytes(__privateGet(this, _ALGORITHM_NONCE_SIZE));
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return concatBytes(nonce, ciphertext);
};
_decrypt = new WeakSet();
decrypt_fn = function(ciphertextAndNonce, key) {
  const nonce = ciphertextAndNonce.slice(0, __privateGet(this, _ALGORITHM_NONCE_SIZE));
  const ciphertext = ciphertextAndNonce.slice(
    __privateGet(this, _ALGORITHM_NONCE_SIZE),
    ciphertextAndNonce.length
  );
  return gcm(key, nonce).decrypt(ciphertext);
};
var Encryption = new EncryptorDecryptor();
var encryption_default = Encryption;
function createSHA256Hash(data) {
  const hashedData = sha256(data);
  return bytesToHex(hashedData);
}

export {
  Encryption,
  encryption_default,
  createSHA256Hash
};
//# sourceMappingURL=chunk-B5DBQDB3.mjs.map