const { TestEnvironment } = require('jest-environment-jsdom');

class JsdomEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);

    // The jsdom VM context is available after super() in the constructor.
    // Set globals here so they're available to setupFiles.
    // Fetch API globals — needed by nock v14's @mswjs/interceptors.
    // Also override AbortController/AbortSignal so that signals created in
    // the jsdom context are compatible with the native fetch.
    this.global.fetch = fetch;
    this.global.Response = Response;
    this.global.Request = Request;
    this.global.Headers = Headers;
    this.global.AbortController = AbortController;
    this.global.AbortSignal = AbortSignal;

    // Stream API globals — needed by @mswjs/interceptors
    this.global.TransformStream = TransformStream;
    this.global.ReadableStream = ReadableStream;
    this.global.WritableStream = WritableStream;
    this.global.CompressionStream = CompressionStream;
    this.global.DecompressionStream = DecompressionStream;

    // Encoding globals — needed by @noble/hashes and jose
    const { TextEncoder, TextDecoder } = require('util');
    this.global.TextEncoder = TextEncoder;
    this.global.TextDecoder = TextDecoder;

    // Typed array globals
    this.global.ArrayBuffer = ArrayBuffer;
    this.global.Uint8Array = Uint8Array;

    // Web Crypto API — needed by @noble/hashes and profile-sync
    if (typeof this.global.crypto === 'undefined') {
      this.global.crypto = require('crypto').webcrypto;
    }
  }
}

module.exports = JsdomEnvironment;
