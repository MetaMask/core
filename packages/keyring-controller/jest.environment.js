const NodeEnvironment = require('jest-environment-node').TestEnvironment;

/**
 * KeyringController depends on @noble/hashes, which as of 1.3.2 relies on the
 * Web Crypto API in Node and browsers.
 */
class CustomTestEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    if (typeof this.global.crypto === 'undefined') {
      this.global.crypto = require('crypto').webcrypto;
    }
  }
}

module.exports = CustomTestEnvironment;
