import { bytesToHex, hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import {
  bytesToNumberLE,
  compressPublicKey,
  decompressPublicKey,
  isValidPrivateKey,
  multiplyWithBase,
} from './ed25519Bip32.js';
import { ed25519Bip32 } from './index.js';

describe('getPublicKey', () => {
  fixtures.cip3.forEach((fixture) => {
    Object.values(fixture.nodes).forEach((node) => {
      it('returns correct public key from private key', () => {
        const publicKey = ed25519Bip32.getPublicKey(
          hexToBytes(node.privateKey),
        );

        expect(bytesToHex(publicKey)).toBe(node.publicKey);
      });
    });
  });
});

describe('publicAdd', () => {
  it('returns correct public key from private key', async () => {
    const publicKey = hexToBytes(fixtures.cip3[0].nodes.bip39Node.publicKey);
    const tweak = hexToBytes(fixtures.cip3[0].nodes.purposeNode.publicKey);
    const added = ed25519Bip32.publicAdd(publicKey, tweak);

    expect(bytesToHex(added)).toBe(
      '0xf78d2a445afe9c961ac196fbac282b499d9ab6bbe8801354ee06fc22d46503e2',
    );
  });
});

describe('isValidPrivateKey', () => {
  it('returns true for a valid private key', () => {
    const { privateKey } = fixtures.cip3[0].nodes.bip39Node;
    expect(isValidPrivateKey(hexToBytes(privateKey))).toBe(true);
  });

  it.each([
    '0x07000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    '0x00000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000',
    '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
  ])('returns false for an invalid private key', (privateKey) => {
    expect(isValidPrivateKey(hexToBytes(privateKey))).toBe(false);
  });
});

describe('compressPublicKey', () => {
  it('returns the same Uint8Array that was input', () => {
    const publicKey = Uint8Array.from(
      Buffer.from(fixtures.cip3[0].nodes.bip39Node.publicKey, 'hex'),
    );
    expect(compressPublicKey(publicKey)).toStrictEqual(publicKey);
  });
});

describe('decompressPublicKey', () => {
  it('returns the same Uint8Array that was input', () => {
    const publicKey = Uint8Array.from(
      Buffer.from(fixtures.cip3[0].nodes.bip39Node.publicKey, 'hex'),
    );
    expect(decompressPublicKey(publicKey)).toStrictEqual(publicKey);
  });
});

describe('bytesToNumberLE', () => {
  it('converts bytes to little endian bignumber', () => {
    const bytes = Uint8Array.from([
      240, 230, 228, 13, 229, 184, 174, 13, 156, 72, 248, 206, 127, 130, 146,
      49, 175, 244, 32, 215, 146, 255, 153, 93, 197, 96, 64, 249, 123, 140, 119,
      72,
    ]);
    expect(bytesToNumberLE(bytes)).toBe(
      32777749485515042639882960539696351427945957558989008047469858024981459691248n,
    );
  });
});

describe('multiplyWithBase', () => {
  it('multiplies bytes with the curve base', () => {
    const bytes = Uint8Array.from([
      240, 230, 228, 13, 229, 184, 174, 13, 156, 72, 248, 206, 127, 130, 146,
      49, 175, 244, 32, 215, 146, 255, 153, 93, 197, 96, 64, 249, 123, 140, 119,
      72,
    ]);
    const expectedResult = Uint8Array.from([
      64, 197, 223, 88, 143, 127, 45, 60, 205, 81, 148, 125, 195, 249, 173, 214,
      27, 176, 227, 21, 216, 243, 146, 168, 189, 206, 85, 135, 89, 11, 210, 27,
    ]);
    expect(multiplyWithBase(bytes)).toStrictEqual(expectedResult);
  });
});
