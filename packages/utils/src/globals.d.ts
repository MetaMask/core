/* oxlint-disable typescript/consistent-type-definitions*/

declare global {
  // These functions are added in ES2026. We can't exclusively use them yet, but
  // this will allow us to use them with a fallback to plain JS.
  interface Uint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {
    toBase64(): string;
    toHex(): string;
  }

  interface Uint8ArrayConstructor {
    fromBase64(
      value: string,
      options?: {
        alphabet?: 'base64' | 'base64url';
        lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial';
      },
    ): Uint8Array<ArrayBuffer>;
    fromHex(value: string): Uint8Array<ArrayBuffer>;
  }
}

export {};
