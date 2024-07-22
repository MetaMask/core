"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/sdk/encryption.ts
var _aes = require('@noble/ciphers/aes');
var _webcrypto = require('@noble/ciphers/webcrypto');
var _pbkdf2 = require('@noble/hashes/pbkdf2');
var _sha256 = require('@noble/hashes/sha256');
var _utils = require('@noble/hashes/utils');
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
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _encryptStringV1);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _decryptStringV1);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _encrypt);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _decrypt);
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _ALGORITHM_NONCE_SIZE, 12);
    // 12 bytes
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _ALGORITHM_KEY_SIZE, 16);
    // 16 bytes
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _PBKDF2_SALT_SIZE, 16);
    // 16 bytes
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _PBKDF2_ITERATIONS, 9e5);
  }
  encryptString(plaintext, password) {
    try {
      if (plaintext.trim().length === 0) {
        throw new Error("No plain text provided");
      }
      return _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _encryptStringV1, encryptStringV1_fn).call(this, plaintext, password);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(`Unable to encrypt string - ${errorMessage}`);
    }
  }
  decryptString(encryptedDataStr, password) {
    try {
      const encryptedData = JSON.parse(encryptedDataStr);
      if (encryptedData.v === "1") {
        return _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _decryptStringV1, decryptStringV1_fn).call(this, encryptedData, password);
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
  const salt = _webcrypto.randomBytes.call(void 0, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _PBKDF2_SALT_SIZE));
  const key = _pbkdf2.pbkdf2.call(void 0, _sha256.sha256, password, salt, {
    c: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _PBKDF2_ITERATIONS),
    dkLen: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _ALGORITHM_KEY_SIZE)
  });
  const plaintextRaw = _utils.utf8ToBytes.call(void 0, plaintext);
  const ciphertextAndNonceAndSalt = _utils.concatBytes.call(void 0, 
    salt,
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _encrypt, encrypt_fn).call(this, plaintextRaw, key)
  );
  const encryptedData = byteArrayToBase64(ciphertextAndNonceAndSalt);
  const encryptedPayload = {
    v: "1",
    d: encryptedData,
    iterations: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _PBKDF2_ITERATIONS)
  };
  return JSON.stringify(encryptedPayload);
};
_decryptStringV1 = new WeakSet();
decryptStringV1_fn = function(data, password) {
  const { iterations, d: base64CiphertextAndNonceAndSalt } = data;
  const ciphertextAndNonceAndSalt = base64ToByteArray(
    base64CiphertextAndNonceAndSalt
  );
  const salt = ciphertextAndNonceAndSalt.slice(0, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _PBKDF2_SALT_SIZE));
  const ciphertextAndNonce = ciphertextAndNonceAndSalt.slice(
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _PBKDF2_SALT_SIZE),
    ciphertextAndNonceAndSalt.length
  );
  const key = _pbkdf2.pbkdf2.call(void 0, _sha256.sha256, password, salt, {
    c: iterations,
    dkLen: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _ALGORITHM_KEY_SIZE)
  });
  return bytesToUtf8(_chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _decrypt, decrypt_fn).call(this, ciphertextAndNonce, key));
};
_encrypt = new WeakSet();
encrypt_fn = function(plaintext, key) {
  const nonce = _webcrypto.randomBytes.call(void 0, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _ALGORITHM_NONCE_SIZE));
  const ciphertext = _aes.gcm.call(void 0, key, nonce).encrypt(plaintext);
  return _utils.concatBytes.call(void 0, nonce, ciphertext);
};
_decrypt = new WeakSet();
decrypt_fn = function(ciphertextAndNonce, key) {
  const nonce = ciphertextAndNonce.slice(0, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _ALGORITHM_NONCE_SIZE));
  const ciphertext = ciphertextAndNonce.slice(
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _ALGORITHM_NONCE_SIZE),
    ciphertextAndNonce.length
  );
  return _aes.gcm.call(void 0, key, nonce).decrypt(ciphertext);
};
var Encryption = new EncryptorDecryptor();
var encryption_default = Encryption;
function createSHA256Hash(data) {
  const hashedData = _sha256.sha256.call(void 0, data);
  return _utils.bytesToHex.call(void 0, hashedData);
}





exports.Encryption = Encryption; exports.encryption_default = encryption_default; exports.createSHA256Hash = createSHA256Hash;
//# sourceMappingURL=chunk-P4DUDLMY.js.map