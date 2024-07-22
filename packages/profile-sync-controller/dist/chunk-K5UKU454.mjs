import {
  getAnyCachedKey,
  getCachedKeyBySalt,
  setCachedKey
} from "./chunk-H25EBXG5.mjs";
import {
  base64ToByteArray,
  byteArrayToBase64,
  bytesToUtf8
} from "./chunk-76VRE4BI.mjs";
import {
  __privateAdd,
  __privateMethod
} from "./chunk-U5UIDVOO.mjs";

// src/controllers/user-storage/encryption/encryption.ts
import { gcm } from "@noble/ciphers/aes";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { scrypt } from "@noble/hashes/scrypt";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, concatBytes, bytesToHex } from "@noble/hashes/utils";
var ALGORITHM_NONCE_SIZE = 12;
var ALGORITHM_KEY_SIZE = 16;
var SCRYPT_SALT_SIZE = 16;
var SCRYPT_N = 2 ** 17;
var SCRYPT_r = 8;
var SCRYPT_p = 1;
var _encryptStringV1, encryptStringV1_fn, _decryptStringV1, decryptStringV1_fn, _encrypt, encrypt_fn, _decrypt, decrypt_fn, _getOrGenerateScryptKey, getOrGenerateScryptKey_fn;
var EncryptorDecryptor = class {
  constructor() {
    __privateAdd(this, _encryptStringV1);
    __privateAdd(this, _decryptStringV1);
    __privateAdd(this, _encrypt);
    __privateAdd(this, _decrypt);
    __privateAdd(this, _getOrGenerateScryptKey);
  }
  encryptString(plaintext, password) {
    try {
      return __privateMethod(this, _encryptStringV1, encryptStringV1_fn).call(this, plaintext, password);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(`Unable to encrypt string - ${errorMessage}`);
    }
  }
  decryptString(encryptedDataStr, password) {
    try {
      const encryptedData = JSON.parse(encryptedDataStr);
      if (encryptedData.v === "1") {
        if (encryptedData.t === "scrypt") {
          return __privateMethod(this, _decryptStringV1, decryptStringV1_fn).call(this, encryptedData, password);
        }
      }
      throw new Error(
        `Unsupported encrypted data payload - ${encryptedDataStr}`
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(`Unable to decrypt string - ${errorMessage}`);
    }
  }
};
_encryptStringV1 = new WeakSet();
encryptStringV1_fn = function(plaintext, password) {
  const { key, salt } = __privateMethod(this, _getOrGenerateScryptKey, getOrGenerateScryptKey_fn).call(this, password, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    dkLen: ALGORITHM_KEY_SIZE
  });
  const plaintextRaw = utf8ToBytes(plaintext);
  const ciphertextAndNonceAndSalt = concatBytes(
    salt,
    __privateMethod(this, _encrypt, encrypt_fn).call(this, plaintextRaw, key)
  );
  const encryptedData = byteArrayToBase64(ciphertextAndNonceAndSalt);
  const encryptedPayload = {
    v: "1",
    t: "scrypt",
    d: encryptedData,
    o: {
      N: SCRYPT_N,
      r: SCRYPT_r,
      p: SCRYPT_p,
      dkLen: ALGORITHM_KEY_SIZE
    },
    saltLen: SCRYPT_SALT_SIZE
  };
  return JSON.stringify(encryptedPayload);
};
_decryptStringV1 = new WeakSet();
decryptStringV1_fn = function(data, password) {
  const { o, d: base64CiphertextAndNonceAndSalt, saltLen } = data;
  const ciphertextAndNonceAndSalt = base64ToByteArray(
    base64CiphertextAndNonceAndSalt
  );
  const salt = ciphertextAndNonceAndSalt.slice(0, saltLen);
  const ciphertextAndNonce = ciphertextAndNonceAndSalt.slice(
    saltLen,
    ciphertextAndNonceAndSalt.length
  );
  const { key } = __privateMethod(this, _getOrGenerateScryptKey, getOrGenerateScryptKey_fn).call(this, password, {
    N: o.N,
    r: o.r,
    p: o.p,
    dkLen: o.dkLen
  }, salt);
  return bytesToUtf8(__privateMethod(this, _decrypt, decrypt_fn).call(this, ciphertextAndNonce, key));
};
_encrypt = new WeakSet();
encrypt_fn = function(plaintext, key) {
  const nonce = randomBytes(ALGORITHM_NONCE_SIZE);
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return concatBytes(nonce, ciphertext);
};
_decrypt = new WeakSet();
decrypt_fn = function(ciphertextAndNonce, key) {
  const nonce = ciphertextAndNonce.slice(0, ALGORITHM_NONCE_SIZE);
  const ciphertext = ciphertextAndNonce.slice(
    ALGORITHM_NONCE_SIZE,
    ciphertextAndNonce.length
  );
  return gcm(key, nonce).decrypt(ciphertext);
};
_getOrGenerateScryptKey = new WeakSet();
getOrGenerateScryptKey_fn = function(password, o, salt) {
  const hashedPassword = createSHA256Hash(password);
  const cachedKey = salt ? getCachedKeyBySalt(hashedPassword, salt) : getAnyCachedKey(hashedPassword);
  if (cachedKey) {
    return {
      key: cachedKey.key,
      salt: cachedKey.salt
    };
  }
  const newSalt = salt ?? randomBytes(SCRYPT_SALT_SIZE);
  const newKey = scrypt(password, newSalt, {
    N: o.N,
    r: o.r,
    p: o.p,
    dkLen: o.dkLen
  });
  setCachedKey(hashedPassword, newSalt, newKey);
  return {
    key: newKey,
    salt: newSalt
  };
};
var encryption = new EncryptorDecryptor();
var encryption_default = encryption;
function createSHA256Hash(data) {
  const hashedData = sha256(data);
  return bytesToHex(hashedData);
}

export {
  encryption_default,
  createSHA256Hash
};
//# sourceMappingURL=chunk-K5UKU454.mjs.map