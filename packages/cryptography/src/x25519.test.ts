import { bytesToHex, hexToBytes } from '@metamask/utils';

import { getPublicKey, getSharedSecret } from './x25519.js';

const privateKey = hexToBytes(
  '0x4a78ac42b72f1232d99257d03675b6268906361f902e85ef9f407270b376b271',
);
const publicKey = hexToBytes(
  '0x3131ecda5b9fb0afed66c842197b7eaf063a2e1ceebf60d206c5c11c89916d6d',
);
const publicKey2 = hexToBytes(
  '0x7580f1903245d94336767cafcb781a06507b6a8f889c471c2aa348e01bc4f94b',
);
const sharedSecret = hexToBytes(
  '0xdccc8b748350104639ac6bf67a1b6e7698dcd007de5cc7c6e010b0185ceade52',
);

// RFC 7748 Section 6.1 test vectors
// https://datatracker.ietf.org/doc/html/rfc7748#section-6.1
const rfcAlicePrivateKey = hexToBytes(
  '0x77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
);
const rfcAlicePublicKey = hexToBytes(
  '0x8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
);
const rfcBobPrivateKey = hexToBytes(
  '0x5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
);
const rfcBobPublicKey = hexToBytes(
  '0xde9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
);
const rfcSharedSecret =
  '0x4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';

describe('getPublicKey', () => {
  it('derives a public key', async () => {
    const pubKey = await getPublicKey(privateKey);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(publicKey));
  });

  it('derives Alice public key from her private key', async () => {
    const pubKey = await getPublicKey(rfcAlicePrivateKey);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(rfcAlicePublicKey));
  });

  it('derives Bob public key from his private key', async () => {
    const pubKey = await getPublicKey(rfcBobPrivateKey);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(rfcBobPublicKey));
  });

  it('accepts an ArrayBuffer private key', async () => {
    const pubKey = await getPublicKey(rfcAlicePrivateKey.buffer);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(rfcAlicePublicKey));
  });

  it('accepts a DataView private key', async () => {
    const pubKey = await getPublicKey(new DataView(rfcAlicePrivateKey.buffer));
    expect(bytesToHex(pubKey)).toBe(bytesToHex(rfcAlicePublicKey));
  });

  it('throws if the private key is too short', async () => {
    await expect(getPublicKey(new Uint8Array(31))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for X25519.',
    );
  });

  it('throws if the private key is too long', async () => {
    await expect(getPublicKey(new Uint8Array(33))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for X25519.',
    );
  });
});

describe('getSharedSecret', () => {
  it('computes a shared secret', async () => {
    const shared = await getSharedSecret(privateKey, publicKey2);
    expect(bytesToHex(shared)).toBe(bytesToHex(sharedSecret));
  });

  it('computes the shared secret from Alice private key and Bob public key', async () => {
    const shared = await getSharedSecret(rfcAlicePrivateKey, rfcBobPublicKey);
    expect(bytesToHex(shared)).toBe(rfcSharedSecret);
  });

  it('computes the shared secret from Bob private key and Alice public key', async () => {
    const shared = await getSharedSecret(rfcBobPrivateKey, rfcAlicePublicKey);
    expect(bytesToHex(shared)).toBe(rfcSharedSecret);
  });

  it('accepts an ArrayBuffer private and public key', async () => {
    const shared = await getSharedSecret(
      rfcAlicePrivateKey.buffer,
      rfcBobPublicKey.buffer,
    );
    expect(bytesToHex(shared)).toBe(rfcSharedSecret);
  });

  it('accepts a DataView private and public key', async () => {
    const shared = await getSharedSecret(
      new DataView(rfcAlicePrivateKey.buffer),
      new DataView(rfcBobPublicKey.buffer),
    );
    expect(bytesToHex(shared)).toBe(rfcSharedSecret);
  });

  it('throws if the private key is too short', async () => {
    await expect(
      getSharedSecret(new Uint8Array(31), rfcBobPublicKey),
    ).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for X25519.',
    );
  });

  it('throws if the private key is too long', async () => {
    await expect(
      getSharedSecret(new Uint8Array(33), rfcBobPublicKey),
    ).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for X25519.',
    );
  });

  it('throws if the public key is too short', async () => {
    await expect(
      getSharedSecret(rfcAlicePrivateKey, new Uint8Array(31)),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 32 bytes for X25519.',
    );
  });

  it('throws if the public key is too long', async () => {
    await expect(
      getSharedSecret(rfcAlicePrivateKey, new Uint8Array(33)),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 32 bytes for X25519.',
    );
  });
});
