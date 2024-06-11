/* eslint-disable */
const JSDOMEnvironment = require('jest-environment-jsdom');

/**
 * ProfileSync SDK & Controllers depends on @noble/hashes, which as of 1.3.2 relies on the
 * Web Crypto API in Node and browsers.
 *
 * There are also EIP6963 utils that utilize window
 */
class CustomTestEnvironment extends JSDOMEnvironment {
  async setup() {
    await super.setup();

    const { TextEncoder, TextDecoder } = require('util');
    this.global.TextEncoder = TextEncoder;
    this.global.TextDecoder = TextDecoder;
    this.global.ArrayBuffer = ArrayBuffer;
    this.global.Uint8Array = Uint8Array;

    if (typeof this.global.crypto === 'undefined') {
      this.global.crypto = require('crypto').webcrypto;
    }
  }
}

module.exports = CustomTestEnvironment;
