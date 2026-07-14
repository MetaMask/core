const { TestEnvironment } = require('jest-environment-node');

/**
 * Some transitive dependencies rely on the Web Crypto API, which is not
 * exposed as a global by jest-environment-node.
 */
class CustomTestEnvironment extends TestEnvironment {
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
