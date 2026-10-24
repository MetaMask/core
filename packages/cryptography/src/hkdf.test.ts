import { bytesToHex, hexToBytes, stringToBytes } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { hkdfSha256, hkdfSha384, hkdfSha512 } from './hkdf.js';

const ikm = hexToBytes(
  '0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
);
const salt = hexToBytes(
  '0xf38a650903309967f2073b437852f77c87af7529cd5c85f4d2bdcf470083553c',
);
const info = stringToBytes('bar');

// RFC 5869 Test Case 1: IKM = 22 bytes of 0x0b, salt, info as specified
// https://datatracker.ietf.org/doc/html/rfc5869#appendix-A.1
const rfcIkm = new Uint8Array(22).fill(0x0b);
const rfcSalt = hexToBytes('0x000102030405060708090a0b0c');
const rfcInfo = hexToBytes('0xf0f1f2f3f4f5f6f7f8f9');

// Wycheproof test vectors for SHA-384 and SHA-512
// https://github.com/google/wycheproof/blob/master/testvectors_v1/hkdf_sha384_test.json
// https://github.com/google/wycheproof/blob/master/testvectors_v1/hkdf_sha512_test.json
const wpIkm1 = hexToBytes('0x24aeff2645e3e0f5494a9a102778c43a');
const wpIkm7 = hexToBytes('0xc27718560fae2515acb17a874991d357');
const wpSalt7 = hexToBytes('0x4487f538b65c9058625057b4bbdd93e7');

describe('hkdfSha256', () => {
  it('derives key material from the provided inputs', async () => {
    const key = await hkdfSha256(ikm, salt, info, 32);
    expect(bytesToHex(key)).toBe(
      '0x2872d515f663bb1af02160d3d1e8477a65fb485f6dc781f890068e4e34e5f292',
    );
  });

  it('accepts an ArrayBuffer ikm, salt, and info', async () => {
    const key = await hkdfSha256(ikm.buffer, salt.buffer, info.buffer, 32);
    expect(bytesToHex(key)).toBe(
      '0x2872d515f663bb1af02160d3d1e8477a65fb485f6dc781f890068e4e34e5f292',
    );
  });

  it('accepts a DataView ikm, salt, and info', async () => {
    const key = await hkdfSha256(
      new DataView(ikm.buffer),
      new DataView(salt.buffer),
      new DataView(info.buffer),
      32,
    );
    expect(bytesToHex(key)).toBe(
      '0x2872d515f663bb1af02160d3d1e8477a65fb485f6dc781f890068e4e34e5f292',
    );
  });

  it('matches RFC 5869 test case 1', async () => {
    const key = await hkdfSha256(rfcIkm, rfcSalt, rfcInfo, 42, {
      unsafeInputKeyingMaterial: true,
    });
    expect(bytesToHex(key)).toBe(
      '0x3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('throws if the IKM is shorter than 32 bytes', async () => {
    await expect(
      hkdfSha256(new Uint8Array(31), salt, info, 32),
    ).rejects.toThrow(
      'Unsafe input keying material length: IKM must be at least 32 bytes for HKDF-SHA-256. To bypass this check, set the `unsafeInputKeyingMaterial` option to `true`.',
    );
  });

  it('throws if the IKM is empty', async () => {
    await expect(hkdfSha256(new Uint8Array(0), salt, info, 32)).rejects.toThrow(
      'Unsafe input keying material length: IKM must not be zero bytes for HKDF-SHA-256. To bypass this check, set the `unsafeInputKeyingMaterial` option to `true`.',
    );
  });

  it('derives key material from an empty IKM when the length check is skipped', async () => {
    // HKDF-SHA-256, 32-byte salt of 0x01, empty IKM and info, 64-byte output.
    // Matches Node crypto.hkdfSync and the Noise Split input shape.
    const key = await hkdfSha256(
      new Uint8Array(0),
      new Uint8Array(32).fill(1),
      new Uint8Array(0),
      64,
      { unsafeInputKeyingMaterial: true },
    );
    expect(bytesToHex(key)).toBe(
      '0xb5a5789af1d00c74773ef327dc63f0f11c7041252d4916c43a252b92e3358ad272d7e204fba7b0ac19964ebcba5e88e3609cb8c3cafa4b940945df49da83680f',
    );
  });
});

describe('hkdfSha384', () => {
  it('derives key material from the provided inputs', async () => {
    const key = await hkdfSha384(ikm, salt, info, 48);
    expect(bytesToHex(key)).toBe(
      '0x38db57222c4a230eba80e5604dd4eeb49352084e316894750b72983bde95619fcd3a90a0e80f4f6405c6417137ead566',
    );
  });

  it('accepts an ArrayBuffer ikm, salt, and info', async () => {
    const key = await hkdfSha384(ikm.buffer, salt.buffer, info.buffer, 48);
    expect(bytesToHex(key)).toBe(
      '0x38db57222c4a230eba80e5604dd4eeb49352084e316894750b72983bde95619fcd3a90a0e80f4f6405c6417137ead566',
    );
  });

  it('accepts a DataView ikm, salt, and info', async () => {
    const key = await hkdfSha384(
      new DataView(ikm.buffer),
      new DataView(salt.buffer),
      new DataView(info.buffer),
      48,
    );
    expect(bytesToHex(key)).toBe(
      '0x38db57222c4a230eba80e5604dd4eeb49352084e316894750b72983bde95619fcd3a90a0e80f4f6405c6417137ead566',
    );
  });

  it('matches Wycheproof test case 1 (empty salt and info)', async () => {
    const key = await hkdfSha384(
      wpIkm1,
      new Uint8Array(0),
      new Uint8Array(0),
      20,
      { unsafeInputKeyingMaterial: true },
    );
    expect(bytesToHex(key)).toBe('0x4b7045423d9156424b0b85d95a7d602fba3924b1');
  });

  it('matches Wycheproof test case 7 (with salt, empty info)', async () => {
    const key = await hkdfSha384(wpIkm7, wpSalt7, new Uint8Array(0), 20, {
      unsafeInputKeyingMaterial: true,
    });
    expect(bytesToHex(key)).toBe('0x836712c8a9a1c2402ca222d450c20c4101a89d80');
  });

  it('throws if the IKM is shorter than 32 bytes', async () => {
    await expect(
      hkdfSha384(new Uint8Array(31), salt, info, 48),
    ).rejects.toThrow(
      'Unsafe input keying material length: IKM must be at least 32 bytes for HKDF-SHA-384. To bypass this check, set the `unsafeInputKeyingMaterial` option to `true`.',
    );
  });

  it('throws if the IKM is empty', async () => {
    await expect(hkdfSha384(new Uint8Array(0), salt, info, 48)).rejects.toThrow(
      'Unsafe input keying material length: IKM must not be zero bytes for HKDF-SHA-384. To bypass this check, set the `unsafeInputKeyingMaterial` option to `true`.',
    );
  });
});

describe('hkdfSha512', () => {
  it('derives key material from the provided inputs', async () => {
    const key = await hkdfSha512(ikm, salt, info, 64);
    expect(bytesToHex(key)).toBe(
      '0x249b1ab53eef3d5723ad64df6a7eb535f5037946061bab47641187305d4c355b93d2d9b81f733174d82677eead2851d6d63c745a71c6381de8d216705e1857b2',
    );
  });

  it('accepts an ArrayBuffer ikm, salt, and info', async () => {
    const key = await hkdfSha512(ikm.buffer, salt.buffer, info.buffer, 64);
    expect(bytesToHex(key)).toBe(
      '0x249b1ab53eef3d5723ad64df6a7eb535f5037946061bab47641187305d4c355b93d2d9b81f733174d82677eead2851d6d63c745a71c6381de8d216705e1857b2',
    );
  });

  it('accepts a DataView ikm, salt, and info', async () => {
    const key = await hkdfSha512(
      new DataView(ikm.buffer),
      new DataView(salt.buffer),
      new DataView(info.buffer),
      64,
    );
    expect(bytesToHex(key)).toBe(
      '0x249b1ab53eef3d5723ad64df6a7eb535f5037946061bab47641187305d4c355b93d2d9b81f733174d82677eead2851d6d63c745a71c6381de8d216705e1857b2',
    );
  });

  it('matches Wycheproof test case 1 (empty salt and info)', async () => {
    const key = await hkdfSha512(
      wpIkm1,
      new Uint8Array(0),
      new Uint8Array(0),
      20,
      { unsafeInputKeyingMaterial: true },
    );
    expect(bytesToHex(key)).toBe('0xdd2599840b09699c6200b5cba79002b3aa75c61b');
  });

  it('matches Wycheproof test case 7 (with salt, empty info)', async () => {
    const key = await hkdfSha512(wpIkm7, wpSalt7, new Uint8Array(0), 20, {
      unsafeInputKeyingMaterial: true,
    });
    expect(bytesToHex(key)).toBe('0x35f274d31948fc03ce2c06501aaefe1b033655e8');
  });

  it('throws if the IKM is shorter than 32 bytes', async () => {
    await expect(
      hkdfSha512(new Uint8Array(31), salt, info, 64),
    ).rejects.toThrow(
      'Unsafe input keying material length: IKM must be at least 32 bytes for HKDF-SHA-512. To bypass this check, set the `unsafeInputKeyingMaterial` option to `true`.',
    );
  });

  it('throws if the IKM is empty', async () => {
    await expect(hkdfSha512(new Uint8Array(0), salt, info, 64)).rejects.toThrow(
      'Unsafe input keying material length: IKM must not be zero bytes for HKDF-SHA-512. To bypass this check, set the `unsafeInputKeyingMaterial` option to `true`.',
    );
  });
});

describe('HKDF with an empty IKM', () => {
  const emptyIkm = new Uint8Array(0);
  const emptyInfo = new Uint8Array(0);
  const options = { unsafeInputKeyingMaterial: true };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not import the empty IKM as a WebCrypto HKDF key', async () => {
    // react-native-quick-crypto rejects an empty HKDF key.
    const importKey = jest.spyOn(globalThis.crypto.subtle, 'importKey');

    const key = await hkdfSha256(
      emptyIkm,
      new Uint8Array(32).fill(1),
      emptyInfo,
      64,
      options,
    );

    expect(bytesToHex(key)).toBe(
      '0xb5a5789af1d00c74773ef327dc63f0f11c7041252d4916c43a252b92e3358ad272d7e204fba7b0ac19964ebcba5e88e3609cb8c3cafa4b940945df49da83680f',
    );
    expect(importKey).not.toHaveBeenCalledWith(
      'raw',
      expect.anything(),
      { name: 'HKDF' },
      expect.anything(),
      expect.anything(),
    );
  });

  it('uses a zero salt of hash length when the salt is empty', async () => {
    const key = await hkdfSha256(
      emptyIkm,
      new Uint8Array(0),
      emptyInfo,
      32,
      options,
    );

    expect(bytesToHex(key)).toBe(
      '0xeb70f01dede9afafa449eee1b1286504e1f62388b3f7dd4f956697b0e828fe18',
    );
  });

  it('includes info and derives more than one block', async () => {
    const key = await hkdfSha256(
      emptyIkm,
      new Uint8Array(32).fill(1),
      info,
      80,
      options,
    );

    expect(bytesToHex(key)).toBe(
      '0x12f2e1ee5e6ed702856aba724415af4fea6343248bfe221db0dce4ef4f5c2cc7c20a0acdcc06638d2ae58b55240230541813e6acca9936141786fa0bf8b658ca7585a3793a37bfedb9779e1f007f117b',
    );
  });

  it('derives key material with HKDF-SHA-384', async () => {
    const key = await hkdfSha384(
      emptyIkm,
      new Uint8Array(48).fill(2),
      emptyInfo,
      48,
      options,
    );

    expect(bytesToHex(key)).toBe(
      '0xa64c6c8eba82ddf729d3fcc16b9ef6057a82b4eb594b7c7def352047bcd5135c1d72ad30840f31488454b4b56383ee6a',
    );
  });

  it('derives key material with HKDF-SHA-512', async () => {
    const key = await hkdfSha512(
      emptyIkm,
      new Uint8Array(64).fill(3),
      emptyInfo,
      100,
      options,
    );

    expect(bytesToHex(key)).toBe(
      '0xeb78d46b71b65b758e187684283d5c1ee6f7c2cfe8149025a74ce46ff3410dfb3364c250215fa6ad98177b5d24e797375bb3426711e00030660c974227774d11e7f85e493893f0666e7feaad813f54206e7407502cdd1f639076c7d30abba283fe45b7de',
    );
  });

  it('throws if the key length is longer than HKDF allows', async () => {
    await expect(
      hkdfSha256(emptyIkm, salt, emptyInfo, 255 * 32 + 1, options),
    ).rejects.toThrow(
      'Invalid key length: HKDF-SHA-256 can derive at most 8160 bytes.',
    );
  });
});
