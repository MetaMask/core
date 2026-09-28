import { bytesToHex, hexToBytes } from '@metamask/utils';

import { ed25519Sign, ed25519Verify } from './ed25519.js';

// RFC 8032 Section 6 Ed25519 test vector 3 (2-byte message)
// https://www.rfc-editor.org/rfc/rfc8032#section-6
const rfcPrivateKey = hexToBytes(
  '0xc5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
);
const rfcPublicKey = hexToBytes(
  '0xfc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
);
const rfcMessage = hexToBytes('0xaf82');
const rfcSignature =
  '0x6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a';

describe('ed25519Sign', () => {
  it('matches RFC 8032 test vector 3', async () => {
    const signature = await ed25519Sign(rfcPrivateKey, rfcMessage);
    expect(bytesToHex(signature)).toBe(rfcSignature);
  });

  it('accepts an ArrayBuffer private key and data', async () => {
    const signature = await ed25519Sign(
      rfcPrivateKey.buffer,
      rfcMessage.buffer,
    );
    expect(bytesToHex(signature)).toBe(rfcSignature);
  });

  it('accepts a DataView private key and data', async () => {
    const signature = await ed25519Sign(
      new DataView(rfcPrivateKey.buffer),
      new DataView(rfcMessage.buffer),
    );
    expect(bytesToHex(signature)).toBe(rfcSignature);
  });

  it('throws if the private key is too short', async () => {
    await expect(
      ed25519Sign(new Uint8Array(31), new Uint8Array(0)),
    ).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('throws if the private key is too long', async () => {
    await expect(
      ed25519Sign(new Uint8Array(33), new Uint8Array(0)),
    ).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for Ed25519.',
    );
  });
});

describe('ed25519Verify', () => {
  it('verifies a valid signature', async () => {
    const valid = await ed25519Verify(
      rfcPublicKey,
      hexToBytes(rfcSignature),
      rfcMessage,
    );
    expect(valid).toBe(true);
  });

  it('returns false when signature does not match data', async () => {
    const valid = await ed25519Verify(
      rfcPublicKey,
      hexToBytes(rfcSignature),
      new Uint8Array(0),
    );
    expect(valid).toBe(false);
  });

  it('returns false when signature does not match public key', async () => {
    const valid = await ed25519Verify(
      new Uint8Array(32),
      hexToBytes(rfcSignature),
      rfcMessage,
    );
    expect(valid).toBe(false);
  });

  it('accepts an ArrayBuffer public key, signature, and data', async () => {
    const valid = await ed25519Verify(
      rfcPublicKey.buffer,
      hexToBytes(rfcSignature).buffer,
      rfcMessage.buffer,
    );
    expect(valid).toBe(true);
  });

  it('accepts a DataView public key, signature, and data', async () => {
    const valid = await ed25519Verify(
      new DataView(rfcPublicKey.buffer),
      new DataView(hexToBytes(rfcSignature).buffer),
      new DataView(rfcMessage.buffer),
    );
    expect(valid).toBe(true);
  });

  it('throws if the public key is too short', async () => {
    await expect(
      ed25519Verify(new Uint8Array(31), hexToBytes(rfcSignature), rfcMessage),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('throws if the public key is too long', async () => {
    await expect(
      ed25519Verify(new Uint8Array(33), hexToBytes(rfcSignature), rfcMessage),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('throws if the signature is too short', async () => {
    await expect(
      ed25519Verify(rfcPublicKey, new Uint8Array(63), rfcMessage),
    ).rejects.toThrow(
      'Invalid signature length: Signature must be exactly 64 bytes for Ed25519.',
    );
  });

  it('throws if the signature is too long', async () => {
    await expect(
      ed25519Verify(rfcPublicKey, new Uint8Array(65), rfcMessage),
    ).rejects.toThrow(
      'Invalid signature length: Signature must be exactly 64 bytes for Ed25519.',
    );
  });
});
