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

  it('returns a digest for an array buffer', async () => {
    const digest = await sha256(new ArrayBuffer(1024));
    expect(bytesToHex(digest)).toBe(
      '0x5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef',
    );
  });

  it('returns a digest for a data view', async () => {
    const digest = await sha256(new DataView(new ArrayBuffer(1024), 512));
    expect(bytesToHex(digest)).toBe(
      '0x076a27c79e5ace2a3d47f9dd2e83e4ff6ea8872b3c2218f66c92b89b55f36560',
    );
  });
});

describe('SHA-384', () => {
  it('returns a digest for a byte array', async () => {
    const res = stringToBytes('foo bar');
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

  it('returns a digest for an array buffer', async () => {
    const digest = await sha384(new ArrayBuffer(1024));
    expect(bytesToHex(digest)).toBe(
      '0xccdfa1aec6214bf6db74b4addaca7f87ab5980bcfdbf6f5fcab8d8425bc2169ca3bc9dd6046b26e4b1da6ba33c31dfb0',
    );
  });

  it('returns a digest for a data view', async () => {
    const digest = await sha384(new DataView(new ArrayBuffer(1024), 512));
    expect(bytesToHex(digest)).toBe(
      '0xd83d9a38c238ef3b7bc207bbea3287a8b37b37e731480a8d240d2a6953086c5ecbdf7ee4c72fec3a3e9d4a87f4f9b4fe',
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

  it('returns a digest for an array buffer', async () => {
    const digest = await sha512(new ArrayBuffer(1024));
    expect(bytesToHex(digest)).toBe(
      '0x8efb4f73c5655351c444eb109230c556d39e2c7624e9c11abc9e3fb4b9b9254218cc5085b454a9698d085cfa92198491f07a723be4574adc70617b73eb0b6461',
    );
  });

  it('returns a digest for a data view', async () => {
    const digest = await sha512(new DataView(new ArrayBuffer(1024), 512));
    expect(bytesToHex(digest)).toBe(
      '0xdf40d4a774e0b453a5b87c00d6f0ef5d753143454e88ee5f7b607134598294c7905ccbcf94bbc46e474db6eb44e56a6dbb6d9a1be9d4fb5d1b5f2d0c6ed34bfe',
    );
  });
});
