import { bytesToHex, hexToBytes } from '@metamask/utils';

import { decrypt, encrypt } from './aes-gcm.js';

// McGrew & Viega, "The Galois/Counter Mode of Operation (GCM)", Appendix B
// https://csrc.nist.rip/groups/ST/toolkit/BCM/documents/proposedmodes/gcm/gcm-spec.pdf

// Test Case 2
const nistKey2 = hexToBytes('0x00000000000000000000000000000000');
const nistIv2 = hexToBytes('0x000000000000000000000000');
const nistPlaintext2 = hexToBytes('0x00000000000000000000000000000000');
const nistCiphertext2 = hexToBytes(
  '0x0388dace60b6a392f328c2b971b2fe78ab6e47d42cec13bdf53a67b21257bddf',
);

// Test Case 15
const nistKey15 = hexToBytes(
  '0xfeffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
);
const nistIv15 = hexToBytes('0xcafebabefacedbaddecaf888');
const nistPlaintext15 = hexToBytes(
  '0xd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255',
);
const nistCiphertext15 = hexToBytes(
  '0x522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015adb094dac5d93471bdec1a502270e3cc6c',
);

// Test Case 4: 128-bit key with associated data
const nistKey4 = hexToBytes('0xfeffe9928665731c6d6a8f9467308308');
const nistIv4 = hexToBytes('0xcafebabefacedbaddecaf888');
const nistPlaintext4 = hexToBytes(
  '0xd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39',
);
const nistAdditionalData4 = hexToBytes(
  '0xfeedfacedeadbeeffeedfacedeadbeefabaddad2',
);
const nistCiphertext4 = hexToBytes(
  '0x42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e0915bc94fbc3221a5db94fae95ae7121a47',
);

describe('encrypt', () => {
  it('matches test case 2', async () => {
    const result = await encrypt(nistKey2, nistPlaintext2, {
      unsafeIv: nistIv2,
    });
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext2));
    expect(bytesToHex(result.iv)).toBe(bytesToHex(nistIv2));
  });

  it('matches test case 15', async () => {
    const result = await encrypt(nistKey15, nistPlaintext15, {
      unsafeIv: nistIv15,
    });
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext15));
    expect(bytesToHex(result.iv)).toBe(bytesToHex(nistIv15));
  });

  it('generates a random 12-byte IV when none is provided', async () => {
    const spy = jest
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        (array as Uint8Array).set(nistIv15);
        return array;
      });

    const result = await encrypt(nistKey15, nistPlaintext15);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(bytesToHex(result.iv)).toBe(bytesToHex(nistIv15));
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext15));
  });

  it('accepts an ArrayBuffer key, IV and plaintext', async () => {
    const result = await encrypt(nistKey15.buffer, nistPlaintext15.buffer, {
      unsafeIv: nistIv15.buffer,
    });
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext15));
  });

  it('accepts a DataView key, IV, and plaintext', async () => {
    const result = await encrypt(
      new DataView(nistKey15.buffer),
      new DataView(nistPlaintext15.buffer),
      { unsafeIv: new DataView(nistIv15.buffer) },
    );
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext15));
  });

  it('throws if the key is empty', async () => {
    await expect(
      encrypt(new Uint8Array(0), nistPlaintext15, { unsafeIv: nistIv15 }),
    ).rejects.toThrow(
      'Invalid key length: Key must not be zero bytes for AES-GCM.',
    );
  });

  it('throws if the IV is empty', async () => {
    await expect(
      encrypt(nistKey15, nistPlaintext15, { unsafeIv: new Uint8Array(0) }),
    ).rejects.toThrow(
      'Invalid IV length: IV must not be zero bytes for AES-GCM.',
    );
  });

  it('throws if the IV is not 12 bytes', async () => {
    await expect(
      encrypt(nistKey15, nistPlaintext15, { unsafeIv: new Uint8Array(16) }),
    ).rejects.toThrow(
      'Unsafe IV length: IV must be exactly 12 bytes for AES-GCM. To bypass this check, set the `unsafeIvLength` option to `true`.',
    );
  });

  it('matches test case 4 with associated data', async () => {
    const result = await encrypt(nistKey4, nistPlaintext4, {
      unsafeIv: nistIv4,
      additionalData: nistAdditionalData4,
    });
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext4));
  });

  it('accepts an ArrayBuffer of associated data', async () => {
    const result = await encrypt(nistKey4, nistPlaintext4, {
      unsafeIv: nistIv4,
      additionalData: nistAdditionalData4.buffer,
    });
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext4));
  });

  it('accepts a DataView of associated data', async () => {
    const result = await encrypt(nistKey4, nistPlaintext4, {
      unsafeIv: nistIv4,
      additionalData: new DataView(nistAdditionalData4.buffer),
    });
    expect(bytesToHex(result.ciphertext)).toBe(bytesToHex(nistCiphertext4));
  });
});

describe('decrypt', () => {
  it('matches test case 2', async () => {
    const result = await decrypt(nistKey2, nistIv2, nistCiphertext2);
    expect(bytesToHex(result)).toBe(bytesToHex(nistPlaintext2));
  });

  it('matches test case 15', async () => {
    const result = await decrypt(nistKey15, nistIv15, nistCiphertext15);
    expect(bytesToHex(result)).toBe(bytesToHex(nistPlaintext15));
  });

  it('accepts an ArrayBuffer key, IV, and data', async () => {
    const result = await decrypt(
      nistKey15.buffer,
      nistIv15.buffer,
      nistCiphertext15.buffer,
    );
    expect(bytesToHex(result)).toBe(bytesToHex(nistPlaintext15));
  });

  it('accepts a DataView key, IV, and data', async () => {
    const result = await decrypt(
      new DataView(nistKey15.buffer),
      new DataView(nistIv15.buffer),
      new DataView(nistCiphertext15.buffer),
    );
    expect(bytesToHex(result)).toBe(bytesToHex(nistPlaintext15));
  });

  it('throws if the key is empty', async () => {
    await expect(
      decrypt(new Uint8Array(0), nistIv15, nistCiphertext15),
    ).rejects.toThrow(
      'Invalid key length: Key must not be zero bytes for AES-GCM.',
    );
  });

  it('throws if the IV is empty', async () => {
    await expect(
      decrypt(nistKey15, new Uint8Array(0), nistCiphertext15),
    ).rejects.toThrow(
      'Invalid IV length: IV must not be zero bytes for AES-GCM.',
    );
  });

  it('throws if the IV is not 12 bytes', async () => {
    await expect(
      decrypt(nistKey15, new Uint8Array(16), nistCiphertext15),
    ).rejects.toThrow(
      'Unsafe IV length: IV must be exactly 12 bytes for AES-GCM. To bypass this check, set the `unsafeIvLength` option to `true`.',
    );
  });

  it('matches test case 4 with associated data', async () => {
    const result = await decrypt(nistKey4, nistIv4, nistCiphertext4, {
      additionalData: nistAdditionalData4,
    });
    expect(bytesToHex(result)).toBe(bytesToHex(nistPlaintext4));
  });

  it('rejects ciphertext authenticated with different associated data', async () => {
    await expect(
      decrypt(nistKey4, nistIv4, nistCiphertext4, {
        additionalData: new Uint8Array(nistAdditionalData4.length),
      }),
    ).rejects.toThrow(DOMException);
  });
});
