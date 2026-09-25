import { stringToBytes, bytesToHex, hexToBytes } from '@metamask/utils';

import { hkdfSha256, hkdfSha384, hkdfSha512 } from './hkdf.js';

const ikm = stringToBytes('foo');
const salt = hexToBytes(
  '0xf38a650903309967f2073b437852f77c87af7529cd5c85f4d2bdcf470083553c',
);
const info = stringToBytes('bar');

// RFC 5869 Test Case 1: IKM = 22 bytes of 0x0b, salt, info as specified
// https://datatracker.ietf.org/doc/html/rfc5869#appendix-A.1
const rfcIkm = new Uint8Array(22).fill(0x0b);
const rfcSalt = hexToBytes('0x000102030405060708090a0b0c');
const rfcInfo = hexToBytes('0xf0f1f2f3f4f5f6f7f8f9');

describe('hkdfSha256', () => {
  it('derives key material from the provided inputs', async () => {
    const okm = await hkdfSha256(ikm, salt, info, 32);
    expect(bytesToHex(okm)).toBe(
      '0xe911c8ed6a4ce19e60f17fbf8de935da8404bd58f1dc7f213fd207f42b392905',
    );
  });

  it('accepts an ArrayBuffer ikm, salt, and info', async () => {
    const okm = await hkdfSha256(ikm.buffer, salt.buffer, info.buffer, 32);
    expect(bytesToHex(okm)).toBe(
      '0xe911c8ed6a4ce19e60f17fbf8de935da8404bd58f1dc7f213fd207f42b392905',
    );
  });

  it('accepts a DataView ikm, salt, and info', async () => {
    const okm = await hkdfSha256(
      new DataView(ikm.buffer),
      new DataView(salt.buffer),
      new DataView(info.buffer),
      32,
    );
    expect(bytesToHex(okm)).toBe(
      '0xe911c8ed6a4ce19e60f17fbf8de935da8404bd58f1dc7f213fd207f42b392905',
    );
  });

  it('matches RFC 5869 test case 1', async () => {
    const okm = await hkdfSha256(rfcIkm, rfcSalt, rfcInfo, 42);
    expect(bytesToHex(okm)).toBe(
      '0x3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });
});

describe('hkdfSha384', () => {
  it('derives key material from the provided inputs', async () => {
    const okm = await hkdfSha384(ikm, salt, info, 48);
    expect(bytesToHex(okm)).toBe(
      '0x8305785481a19c6b3f509b4af99adca8e7fc96ee3bc9f27b5da220664e99d6fa52304280272d2ca1002ba8097888b169',
    );
  });

  it('accepts an ArrayBuffer ikm, salt, and info', async () => {
    const okm = await hkdfSha384(ikm.buffer, salt.buffer, info.buffer, 48);
    expect(bytesToHex(okm)).toBe(
      '0x8305785481a19c6b3f509b4af99adca8e7fc96ee3bc9f27b5da220664e99d6fa52304280272d2ca1002ba8097888b169',
    );
  });

  it('accepts a DataView ikm, salt, and info', async () => {
    const okm = await hkdfSha384(
      new DataView(ikm.buffer),
      new DataView(salt.buffer),
      new DataView(info.buffer),
      48,
    );
    expect(bytesToHex(okm)).toBe(
      '0x8305785481a19c6b3f509b4af99adca8e7fc96ee3bc9f27b5da220664e99d6fa52304280272d2ca1002ba8097888b169',
    );
  });
});

describe('hkdfSha512', () => {
  it('derives key material from the provided inputs', async () => {
    const okm = await hkdfSha512(ikm, salt, info, 64);
    expect(bytesToHex(okm)).toBe(
      '0xc6e4f1f8b5e8fed6c45c4f900bc417e56b9a770833cbb0a039aea2b0ff40913b09e3030cae886c8391501c59d08345b0d39c0b0d3a29021ffeb1c6278bd6c528',
    );
  });

  it('accepts an ArrayBuffer ikm, salt, and info', async () => {
    const okm = await hkdfSha512(ikm.buffer, salt.buffer, info.buffer, 64);
    expect(bytesToHex(okm)).toBe(
      '0xc6e4f1f8b5e8fed6c45c4f900bc417e56b9a770833cbb0a039aea2b0ff40913b09e3030cae886c8391501c59d08345b0d39c0b0d3a29021ffeb1c6278bd6c528',
    );
  });

  it('accepts a DataView ikm, salt, and info', async () => {
    const okm = await hkdfSha512(
      new DataView(ikm.buffer),
      new DataView(salt.buffer),
      new DataView(info.buffer),
      64,
    );
    expect(bytesToHex(okm)).toBe(
      '0xc6e4f1f8b5e8fed6c45c4f900bc417e56b9a770833cbb0a039aea2b0ff40913b09e3030cae886c8391501c59d08345b0d39c0b0d3a29021ffeb1c6278bd6c528',
    );
  });
});
