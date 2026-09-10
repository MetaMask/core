const { TestEnvironment } = require('jest-environment-node');

/**
 * Subscription delegation salt generation uses the Web Crypto API
 * (`crypto.getRandomValues`), which is not exposed as a global by
 * jest-environment-node.
 */
class CustomTestEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    if (typeof this.global.crypto === 'undefined') {
      const { webcrypto } = require('crypto');
      this.global.crypto = webcrypto;
    }
  }
}

module.exports = CustomTestEnvironment;
