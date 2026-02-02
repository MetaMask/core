const JSDOMEnvironment = require('jest-environment-jsdom').default;

// Custom test environment copied from https://github.com/jsdom/jsdom/issues/2524
// in order to add TextEncoder to jsdom. TextEncoder is expected by @noble/hashes.

module.exports = class CustomTestEnvironment extends JSDOMEnvironment {
  async setup() {
    await super.setup();
    if (typeof this.global.TextEncoder === 'undefined') {
      // Needed for the JSDOM environment.
      // eslint-disable-next-line no-shadow, n/prefer-global/text-encoder, n/prefer-global/text-decoder
      const { TextEncoder, TextDecoder } = require('util');
      this.global.TextEncoder = TextEncoder;
      this.global.TextDecoder = TextDecoder;
      this.global.ArrayBuffer = ArrayBuffer;
      this.global.Uint8Array = Uint8Array;
    }
  }
};
