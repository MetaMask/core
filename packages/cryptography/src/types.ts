export type HashFunction = 'SHA-256' | 'SHA-384' | 'SHA-512';

export type KeyPair = {
  privateKey: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
};
