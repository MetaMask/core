/* eslint-disable n/prefer-global/text-encoder */
/* eslint-disable n/prefer-global/text-decoder */
const { TestEnvironment } = require('jest-environment-jsdom');

/**
 * ProfileSync SDK & Controllers depends on @noble/hashes, which as of 1.3.2 relies on the
 * Web Crypto API in Node and browsers.
 *
 * There are also EIP6963 utils that utilize window
 */
class CustomTestEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();

    // eslint-disable-next-line no-shadow
    const { TextEncoder, TextDecoder } = require('util');
    this.global.TextEncoder = TextEncoder;
    this.global.TextDecoder = TextDecoder;
    this.global.ArrayBuffer = ArrayBuffer;
    this.global.Uint8Array = Uint8Array;

    // jsdom does not implement Web Crypto (its `crypto` global is a
    // getter-only accessor returning an empty object), but the SIP-6
    // derivation in `message-signing` relies on `crypto.subtle` (via
    // `@metamask/key-tree`) being fully available.
    if (!this.global.crypto?.subtle) {
      Object.defineProperty(this.global, 'crypto', {
        configurable: true,
        value: require('node:crypto').webcrypto,
      });
    }
  }
}

module.exports = CustomTestEnvironment;
