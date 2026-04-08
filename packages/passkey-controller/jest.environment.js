const NodeEnvironment = require('jest-environment-node');

/**
 * Passkey orchestration uses the Web Crypto API (`crypto.getRandomValues`) in Node tests.
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
