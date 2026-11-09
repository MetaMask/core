export type HashFunction = 'SHA-256' | 'SHA-384' | 'SHA-512';

export type KeyPair = {
  privateKey: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
};

/**
 * The result of a key encapsulation (e.g., ML-KEM).
 */
export type Encapsulation = {
  /**
   * The ciphertext to send to the holder of the private key.
   */
  ciphertext: Uint8Array<ArrayBuffer>;

  /**
   * The 32-byte shared secret, to be used as input to a KDF.
   */
  sharedSecret: Uint8Array<ArrayBuffer>;
};
