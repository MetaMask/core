import { bytesToHex, hexToBytes, stringToBytes } from '@metamask/utils';

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
      'Unsafe input keying material length: IKM must not be zero bytes for HKDF-SHA-256.',
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
      'Unsafe input keying material length: IKM must not be zero bytes for HKDF-SHA-384.',
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
      'Unsafe input keying material length: IKM must not be zero bytes for HKDF-SHA-512.',
    );
  });
});
