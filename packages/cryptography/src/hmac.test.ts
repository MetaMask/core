import { stringToBytes, bytesToHex, hexToBytes } from '@metamask/utils';

import { hmacSha256, hmacSha384, hmacSha512 } from './hmac.js';

const key = hexToBytes(
  '0xf38a650903309967f2073b437852f77c87af7529cd5c85f4d2bdcf470083553cf38a650903309967f2073b437852f77c87af7529cd5c85f4d2bdcf470083553c',
);

// RFC 4231 Test Case 1: key = 20 bytes of 0x0b, data = "Hi There"
// https://datatracker.ietf.org/doc/html/rfc4231#section-4.2
const rfcKey = new Uint8Array(20).fill(0x0b);
const rfcData = stringToBytes('Hi There');

describe('hmacSha256', () => {
  it('signs the provided data using the provided key', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha256(key, data);
    expect(bytesToHex(signature)).toBe(
      '0x3f4157aeba208bfca4c6b836b359c01b4b2c8a7b00437b90444c13962a8be031',
    );
  });

  it('accepts an ArrayBuffer key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha256(key.buffer, data.buffer);
    expect(bytesToHex(signature)).toBe(
      '0x3f4157aeba208bfca4c6b836b359c01b4b2c8a7b00437b90444c13962a8be031',
    );
  });

  it('accepts a DataView key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha256(
      new DataView(key.buffer),
      new DataView(data.buffer),
    );
    expect(bytesToHex(signature)).toBe(
      '0x3f4157aeba208bfca4c6b836b359c01b4b2c8a7b00437b90444c13962a8be031',
    );
  });

  it('matches RFC 4231 test case 1', async () => {
    const signature = await hmacSha256(rfcKey, rfcData, {
      unsafeKeyLength: true,
    });
    expect(bytesToHex(signature)).toBe(
      '0xb0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('throws if the key is shorter than 32 bytes', async () => {
    await expect(
      hmacSha256(new Uint8Array(31), new Uint8Array(0)),
    ).rejects.toThrow(
      'Unsafe key length: Key must be at least 32 bytes for HMAC-SHA-256. To bypass this check, set the `unsafeKeyLength` option to `true`.',
    );
  });
});

describe('hmacSha384', () => {
  it('signs the provided data using the provided key', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha384(key, data);
    expect(bytesToHex(signature)).toBe(
      '0x2d2f38676bb8a033fb3c593d38ef9e489ed099fda5f2236d37e34a22771edc7d3433b02532e376972955659b61b4b210',
    );
  });

  it('accepts an ArrayBuffer key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha384(key.buffer, data.buffer);
    expect(bytesToHex(signature)).toBe(
      '0x2d2f38676bb8a033fb3c593d38ef9e489ed099fda5f2236d37e34a22771edc7d3433b02532e376972955659b61b4b210',
    );
  });

  it('accepts a DataView key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha384(
      new DataView(key.buffer),
      new DataView(data.buffer),
    );
    expect(bytesToHex(signature)).toBe(
      '0x2d2f38676bb8a033fb3c593d38ef9e489ed099fda5f2236d37e34a22771edc7d3433b02532e376972955659b61b4b210',
    );
  });

  it('matches RFC 4231 test case 1', async () => {
    const signature = await hmacSha384(rfcKey, rfcData, {
      unsafeKeyLength: true,
    });
    expect(bytesToHex(signature)).toBe(
      '0xafd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6',
    );
  });

  it('throws if the key is shorter than 48 bytes', async () => {
    await expect(
      hmacSha384(new Uint8Array(47), new Uint8Array(0)),
    ).rejects.toThrow(
      'Unsafe key length: Key must be at least 48 bytes for HMAC-SHA-384. To bypass this check, set the `unsafeKeyLength` option to `true`.',
    );
  });
});

describe('hmacSha512', () => {
  it('signs the provided data using the provided key', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha512(key, data);
    expect(bytesToHex(signature)).toBe(
      '0x0ac1aa3960d8b5d8a485062b1794c7fa7dd3c63dac585bc30b6782215c63393c9ca34421030768675141359843d9d1e8012d7e6762b48e16e70df64824c266cf',
    );
  });

  it('accepts an ArrayBuffer key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha512(key.buffer, data.buffer);
    expect(bytesToHex(signature)).toBe(
      '0x0ac1aa3960d8b5d8a485062b1794c7fa7dd3c63dac585bc30b6782215c63393c9ca34421030768675141359843d9d1e8012d7e6762b48e16e70df64824c266cf',
    );
  });

  it('accepts a DataView key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha512(
      new DataView(key.buffer),
      new DataView(data.buffer),
    );
    expect(bytesToHex(signature)).toBe(
      '0x0ac1aa3960d8b5d8a485062b1794c7fa7dd3c63dac585bc30b6782215c63393c9ca34421030768675141359843d9d1e8012d7e6762b48e16e70df64824c266cf',
    );
  });

  it('matches RFC 4231 test case 1', async () => {
    const signature = await hmacSha512(rfcKey, rfcData, {
      unsafeKeyLength: true,
    });
    expect(bytesToHex(signature)).toBe(
      '0x87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
    );
  });

  it('throws if the key is shorter than 64 bytes', async () => {
    await expect(
      hmacSha512(new Uint8Array(63), new Uint8Array(0)),
    ).rejects.toThrow(
      'Unsafe key length: Key must be at least 64 bytes for HMAC-SHA-512. To bypass this check, set the `unsafeKeyLength` option to `true`.',
    );
  });
});
