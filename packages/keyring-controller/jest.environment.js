const NodeEnvironment = require('jest-environment-node').default;

/**
 * KeyringController depends on @noble/hashes, which as of 1.3.2 relies on the
 * Web Crypto API in Node and browsers.
 */
class CustomTestEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    if (typeof this.global.crypto === 'undefined') {
      // Only used for testing.
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      this.global.crypto = require('crypto').webcrypto;
    }
  }
}

module.exports = CustomTestEnvironment;
