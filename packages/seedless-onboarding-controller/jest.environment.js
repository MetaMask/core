const NodeEnvironment = require('jest-environment-node').default;

/**
 * SeedlessOnboardingController depends on @noble/hashes, which as of 1.7.1 relies on the
 * Web Crypto API in Node and browsers.
 */
class CustomTestEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    if (typeof this.global.crypto === 'undefined') {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- this is a test environment
      this.global.crypto = require('crypto').webcrypto;
    }
  }
}

module.exports = CustomTestEnvironment;
