import { bytesToHex, hexToBytes, stringToBytes } from '@metamask/utils';

import { generateKeyPair, getPublicKey, sign, verify } from './ed25519.js';
import * as random from './random.js';

const privateKey = hexToBytes(
  '0xf05665c0091fc75a5a558eddb88acd3ce2a789e15c0e10ceb334849357394ac1',
);
const publicKey = hexToBytes(
  '0x2d0eba7e02a698405c3e3ce6b35acd00def24ffb7c10c2127f58393e2c44f935',
);

// RFC 8032 Section 6 Ed25519 test vector 3 (2-byte message)
// https://www.rfc-editor.org/rfc/rfc8032#section-6
const rfcPrivateKey = hexToBytes(
  '0xc5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7',
);
const rfcPublicKey = hexToBytes(
  '0xfc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
);
const rfcMessage = hexToBytes('0xaf82');
const rfcSignature = hexToBytes(
  '0x6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a',
);

describe('generateKeyPair', () => {
  it('uses 32 random bytes as the private key and derives the public key from it', async () => {
    const getRandomBytesSpy = jest
      .spyOn(random, 'getRandomBytes')
      .mockReturnValueOnce(rfcPrivateKey);

    const keyPair = await generateKeyPair();

    expect(getRandomBytesSpy).toHaveBeenCalledTimes(1);
    expect(getRandomBytesSpy).toHaveBeenCalledWith(32);
    expect(bytesToHex(keyPair.privateKey)).toBe(bytesToHex(rfcPrivateKey));
    expect(bytesToHex(keyPair.publicKey)).toBe(bytesToHex(rfcPublicKey));
  });

  it('generates a 32-byte private key and a 32-byte public key', async () => {
    const keyPair = await generateKeyPair();

    expect(keyPair.privateKey).toHaveLength(32);
    expect(keyPair.publicKey).toHaveLength(32);
  });

  it('generates a different key pair each time', async () => {
    const first = await generateKeyPair();
    const second = await generateKeyPair();

    expect(bytesToHex(first.privateKey)).not.toBe(
      bytesToHex(second.privateKey),
    );
    expect(bytesToHex(first.publicKey)).not.toBe(bytesToHex(second.publicKey));
  });

  it('generates a public key that matches the private key', async () => {
    const { privateKey: generatedPrivateKey, publicKey: generatedPublicKey } =
      await generateKeyPair();

    const derivedPublicKey = await getPublicKey(generatedPrivateKey);
    expect(bytesToHex(derivedPublicKey)).toBe(bytesToHex(generatedPublicKey));
  });

  it('generates a key pair that can sign and verify data', async () => {
    const { privateKey: generatedPrivateKey, publicKey: generatedPublicKey } =
      await generateKeyPair();
    const data = stringToBytes('foo');

    const signature = await sign(generatedPrivateKey, data);

    const valid = await verify(generatedPublicKey, signature, data);

    expect(valid).toBe(true);
  });
});

describe('getPublicKey', () => {
  it('derives the public key from a provided private key', async () => {
    const pubKey = await getPublicKey(privateKey);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(publicKey));
  });

  it('derives the public key from RFC 8032 test vector 3', async () => {
    const pubKey = await getPublicKey(rfcPrivateKey);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(rfcPublicKey));
  });

  it('accepts an ArrayBuffer private key', async () => {
    const pubKey = await getPublicKey(rfcPrivateKey.buffer);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(rfcPublicKey));
  });

  it('accepts a DataView private key', async () => {
    const pubKey = await getPublicKey(new DataView(rfcPrivateKey.buffer));
    expect(bytesToHex(pubKey)).toBe(bytesToHex(rfcPublicKey));
  });

  it('throws if the private key is too short', async () => {
    await expect(getPublicKey(new Uint8Array(31))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('throws if the private key is too long', async () => {
    await expect(getPublicKey(new Uint8Array(33))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for Ed25519.',
    );
  });
});

describe('sign', () => {
  it('signs the provided data with the private key', async () => {
    const signature = await sign(
      privateKey,
      stringToBytes('foo'),
    );
    expect(bytesToHex(signature)).toBe(
      '0x0062c22e7ff3c86a9af932d2641b5c532e6b8d7c05c489467cc875c3b27bebd2463010fc816e65b520e60f40ef192ee79e85a9cea918bd2a41d566ee6aeba50b',
    );
  });

  it('matches RFC 8032 test vector 3', async () => {
    const signature = await sign(rfcPrivateKey, rfcMessage);
    expect(bytesToHex(signature)).toBe(bytesToHex(rfcSignature));
  });

  it('accepts an ArrayBuffer private key and data', async () => {
    const signature = await sign(rfcPrivateKey.buffer, rfcMessage.buffer);
    expect(bytesToHex(signature)).toBe(bytesToHex(rfcSignature));
  });

  it('accepts a DataView private key and data', async () => {
    const signature = await sign(
      new DataView(rfcPrivateKey.buffer),
      new DataView(rfcMessage.buffer),
    );
    expect(bytesToHex(signature)).toBe(bytesToHex(rfcSignature));
  });

  it('throws if the private key is too short', async () => {
    await expect(sign(new Uint8Array(31), new Uint8Array(0))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('throws if the private key is too long', async () => {
    await expect(sign(new Uint8Array(33), new Uint8Array(0))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for Ed25519.',
    );
  });
});

describe('verify', () => {
  it('verifies the provided data, public key and signature', async () => {
    const signature = hexToBytes(
      '0x0062c22e7ff3c86a9af932d2641b5c532e6b8d7c05c489467cc875c3b27bebd2463010fc816e65b520e60f40ef192ee79e85a9cea918bd2a41d566ee6aeba50b',
    );
    const verified = await verify(
      publicKey,
      signature,
      stringToBytes('foo'),
    );
    expect(verified).toBe(true);
  });

  it('verifies the RFC 8032 test vector 3 signature', async () => {
    const valid = await verify(rfcPublicKey, rfcSignature, rfcMessage);
    expect(valid).toBe(true);
  });

  it('returns false when signature does not match data', async () => {
    const valid = await verify(rfcPublicKey, rfcSignature, new Uint8Array(0));
    expect(valid).toBe(false);
  });

  it('returns false when signature does not match public key', async () => {
    const valid = await verify(new Uint8Array(32), rfcSignature, rfcMessage);
    expect(valid).toBe(false);
  });

  it('accepts an ArrayBuffer public key, signature, and data', async () => {
    const valid = await verify(
      rfcPublicKey.buffer,
      rfcSignature.buffer,
      rfcMessage.buffer,
    );
    expect(valid).toBe(true);
  });

  it('accepts a DataView public key, signature, and data', async () => {
    const valid = await verify(
      new DataView(rfcPublicKey.buffer),
      new DataView(rfcSignature.buffer),
      new DataView(rfcMessage.buffer),
    );
    expect(valid).toBe(true);
  });

  it('throws if the public key is too short', async () => {
    await expect(
      verify(new Uint8Array(31), rfcSignature, rfcMessage),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('throws if the public key is too long', async () => {
    await expect(
      verify(new Uint8Array(33), rfcSignature, rfcMessage),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('throws if the signature is too short', async () => {
    await expect(
      verify(rfcPublicKey, new Uint8Array(63), rfcMessage),
    ).rejects.toThrow(
      'Invalid signature length: Signature must be exactly 64 bytes for Ed25519.',
    );
  });

  it('throws if the signature is too long', async () => {
    await expect(
      verify(rfcPublicKey, new Uint8Array(65), rfcMessage),
    ).rejects.toThrow(
      'Invalid signature length: Signature must be exactly 64 bytes for Ed25519.',
    );
  });
});
