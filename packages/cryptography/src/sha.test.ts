import { stringToBytes, bytesToHex } from '@metamask/utils';

import { sha256, sha384, sha512 } from './sha.js';

describe('SHA-256', () => {
  it('returns a digest for a byte array', async () => {
    const digest = await sha256(stringToBytes('foo bar'));
    expect(bytesToHex(digest)).toBe(
      '0xfbc1a9f858ea9e177916964bd88c3d37b91a1e84412765e29950777f265c4b75',
    );
  });

  it('returns a digest for a larger byte array', async () => {
    const digest = await sha256(new Uint8Array(1024).fill(1));
    expect(bytesToHex(digest)).toBe(
      '0x5a648d8015900d89664e00e125df179636301a2d8fa191c1aa2bd9358ea53a69',
    );
  });
});

describe('SHA-512', () => {
  it('returns a digest for a byte array', async () => {
    const digest = await sha512(stringToBytes('foo bar'));
    expect(bytesToHex(digest)).toBe(
      '0x65019286222ace418f742556366f9b9da5aaf6797527d2f0cba5bfe6b2f8ed24746542a0f2be1da8d63c2477f688b608eb53628993afa624f378b03f10090ce7',
    );
  });

  it('returns a digest for a larger byte array', async () => {
    const digest = await sha512(new Uint8Array(1024).fill(1));
    expect(bytesToHex(digest)).toBe(
      '0x19c6841f3d6e33a4d28e7cb47ff938728479c56bb930f3e8535ec24d9453d9665b7dc1163181b94a1ada9554e953a094ed44fd6faee7a9bbde6615375bab4ae8',
    );
  });
});

describe('SHA-384', () => {
  it('returns a digest for a byte array', async () => {
    const digest = await sha384(stringToBytes('foo bar'));
    expect(bytesToHex(digest)).toBe(
      '0x6839312f3db343477070d3c0b2becd417b357154d48794d01d78cfb4617ed5ab819a77b6832f6542dd18bb738131ef7e',
    );
  });

  it('returns a digest for a larger byte array', async () => {
    const digest = await sha384(new Uint8Array(1024).fill(1));
    expect(bytesToHex(digest)).toBe(
      '0x45730a19acff8481e7e2b99c4100a09a0288a3bc45df56ff7e72dd92ef9e4c92f925c9d6ba1ea96c934a5f1e782a7cc7',
    );
  });
});
