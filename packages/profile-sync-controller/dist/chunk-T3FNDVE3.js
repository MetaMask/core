"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkUAXWZN5Jjs = require('./chunk-UAXWZN5J.js');




var _chunkPCOIRDTOjs = require('./chunk-PCOIRDTO.js');



var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/controllers/user-storage/encryption/encryption.ts
var _aes = require('@noble/ciphers/aes');
var _webcrypto = require('@noble/ciphers/webcrypto');
var _scrypt = require('@noble/hashes/scrypt');
var _sha256 = require('@noble/hashes/sha256');
var _utils = require('@noble/hashes/utils');
var ALGORITHM_NONCE_SIZE = 12;
var ALGORITHM_KEY_SIZE = 16;
var SCRYPT_SALT_SIZE = 16;
var SCRYPT_N = 2 ** 17;
var SCRYPT_r = 8;
var SCRYPT_p = 1;
var _encryptStringV1, encryptStringV1_fn, _decryptStringV1, decryptStringV1_fn, _encrypt, encrypt_fn, _decrypt, decrypt_fn, _getOrGenerateScryptKey, getOrGenerateScryptKey_fn;
var EncryptorDecryptor = class {
  constructor() {
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _encryptStringV1);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _decryptStringV1);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _encrypt);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _decrypt);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getOrGenerateScryptKey);
  }
  encryptString(plaintext, password) {
    try {
      return _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _encryptStringV1, encryptStringV1_fn).call(this, plaintext, password);
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
          return _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _decryptStringV1, decryptStringV1_fn).call(this, encryptedData, password);
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
  const { key, salt } = _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getOrGenerateScryptKey, getOrGenerateScryptKey_fn).call(this, password, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    dkLen: ALGORITHM_KEY_SIZE
  });
  const plaintextRaw = _utils.utf8ToBytes.call(void 0, plaintext);
  const ciphertextAndNonceAndSalt = _utils.concatBytes.call(void 0, 
    salt,
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _encrypt, encrypt_fn).call(this, plaintextRaw, key)
  );
  const encryptedData = _chunkPCOIRDTOjs.byteArrayToBase64.call(void 0, ciphertextAndNonceAndSalt);
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
  const ciphertextAndNonceAndSalt = _chunkPCOIRDTOjs.base64ToByteArray.call(void 0, 
    base64CiphertextAndNonceAndSalt
  );
  const salt = ciphertextAndNonceAndSalt.slice(0, saltLen);
  const ciphertextAndNonce = ciphertextAndNonceAndSalt.slice(
    saltLen,
    ciphertextAndNonceAndSalt.length
  );
  const { key } = _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getOrGenerateScryptKey, getOrGenerateScryptKey_fn).call(this, password, {
    N: o.N,
    r: o.r,
    p: o.p,
    dkLen: o.dkLen
  }, salt);
  return _chunkPCOIRDTOjs.bytesToUtf8.call(void 0, _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _decrypt, decrypt_fn).call(this, ciphertextAndNonce, key));
};
_encrypt = new WeakSet();
encrypt_fn = function(plaintext, key) {
  const nonce = _webcrypto.randomBytes.call(void 0, ALGORITHM_NONCE_SIZE);
  const ciphertext = _aes.gcm.call(void 0, key, nonce).encrypt(plaintext);
  return _utils.concatBytes.call(void 0, nonce, ciphertext);
};
_decrypt = new WeakSet();
decrypt_fn = function(ciphertextAndNonce, key) {
  const nonce = ciphertextAndNonce.slice(0, ALGORITHM_NONCE_SIZE);
  const ciphertext = ciphertextAndNonce.slice(
    ALGORITHM_NONCE_SIZE,
    ciphertextAndNonce.length
  );
  return _aes.gcm.call(void 0, key, nonce).decrypt(ciphertext);
};
_getOrGenerateScryptKey = new WeakSet();
getOrGenerateScryptKey_fn = function(password, o, salt) {
  const hashedPassword = createSHA256Hash(password);
  const cachedKey = salt ? _chunkUAXWZN5Jjs.getCachedKeyBySalt.call(void 0, hashedPassword, salt) : _chunkUAXWZN5Jjs.getAnyCachedKey.call(void 0, hashedPassword);
  if (cachedKey) {
    return {
      key: cachedKey.key,
      salt: cachedKey.salt
    };
  }
  const newSalt = salt ?? _webcrypto.randomBytes.call(void 0, SCRYPT_SALT_SIZE);
  const newKey = _scrypt.scrypt.call(void 0, password, newSalt, {
    N: o.N,
    r: o.r,
    p: o.p,
    dkLen: o.dkLen
  });
  _chunkUAXWZN5Jjs.setCachedKey.call(void 0, hashedPassword, newSalt, newKey);
  return {
    key: newKey,
    salt: newSalt
  };
};
var encryption = new EncryptorDecryptor();
var encryption_default = encryption;
function createSHA256Hash(data) {
  const hashedData = _sha256.sha256.call(void 0, data);
  return _utils.bytesToHex.call(void 0, hashedData);
}




exports.encryption_default = encryption_default; exports.createSHA256Hash = createSHA256Hash;
//# sourceMappingURL=chunk-T3FNDVE3.js.map