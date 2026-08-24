const { TestEnvironment } = require('jest-environment-node');

/**
 * The `wallet-factory` e2e test constructs a real `KeyringController`, whose
 * default `@metamask/browser-passworder` encryptor uses the Web Crypto API —
 * both `crypto` (for `getRandomValues`/`subtle`) and the `CryptoKey` constructor
 * (for an `instanceof` check). Under `--experimental-vm-modules` the test realm
 * has neither global on Node < 21, so polyfill them from `node:crypto` when
 * absent — the same two globals `@metamask/wallet`'s own `Wallet.test.ts` sets.
 */
class CustomTestEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    const { webcrypto } = require('crypto');
    if (typeof this.global.crypto === 'undefined') {
      this.global.crypto = webcrypto;
    }
    if (typeof this.global.CryptoKey === 'undefined') {
      this.global.CryptoKey = webcrypto.CryptoKey;
    }
  }
}

module.exports = CustomTestEnvironment;
