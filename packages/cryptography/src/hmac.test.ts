import { stringToBytes, bytesToHex, hexToBytes } from '@metamask/utils';

import { hmacSha256, hmacSha384, hmacSha512 } from './hmac.js';

const key = hexToBytes(
  '0xf38a650903309967f2073b437852f77c87af7529cd5c85f4d2bdcf470083553c',
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
      '0xe4efedf8184685465ba3634f69b28bd1b18784fd5c7460495e1bb23cb9fee4cf',
    );
  });

  it('accepts an ArrayBuffer key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha256(key.buffer, data.buffer);
    expect(bytesToHex(signature)).toBe(
      '0xe4efedf8184685465ba3634f69b28bd1b18784fd5c7460495e1bb23cb9fee4cf',
    );
  });

  it('accepts a DataView key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha256(
      new DataView(key.buffer),
      new DataView(data.buffer),
    );
    expect(bytesToHex(signature)).toBe(
      '0xe4efedf8184685465ba3634f69b28bd1b18784fd5c7460495e1bb23cb9fee4cf',
    );
  });

  it('matches RFC 4231 test case 1', async () => {
    const signature = await hmacSha256(rfcKey, rfcData);
    expect(bytesToHex(signature)).toBe(
      '0xb0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });
});

describe('hmacSha384', () => {
  it('signs the provided data using the provided key', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha384(key, data);
    expect(bytesToHex(signature)).toBe(
      '0x3387d8401c449d8aa407f15f7718eec9f6a83287b4a939781d3231d02bb439d055d85b4d5b5f25706816f7c3852872db',
    );
  });

  it('accepts an ArrayBuffer key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha384(key.buffer, data.buffer);
    expect(bytesToHex(signature)).toBe(
      '0x3387d8401c449d8aa407f15f7718eec9f6a83287b4a939781d3231d02bb439d055d85b4d5b5f25706816f7c3852872db',
    );
  });

  it('accepts a DataView key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha384(
      new DataView(key.buffer),
      new DataView(data.buffer),
    );
    expect(bytesToHex(signature)).toBe(
      '0x3387d8401c449d8aa407f15f7718eec9f6a83287b4a939781d3231d02bb439d055d85b4d5b5f25706816f7c3852872db',
    );
  });

  it('matches RFC 4231 test case 1', async () => {
    const signature = await hmacSha384(rfcKey, rfcData);
    expect(bytesToHex(signature)).toBe(
      '0xafd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6',
    );
  });
});

describe('hmacSha512', () => {
  it('signs the provided data using the provided key', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha512(key, data);
    expect(bytesToHex(signature)).toBe(
      '0x02563a12c3c78ac53e120673611dd03161e4fdb890d08097f41479d376ce69ec7dfe467e0fa35fbdf158f159ee76f7b661ee578a2851ae308f29e4332b7c2f37',
    );
  });

  it('accepts an ArrayBuffer key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha512(key.buffer, data.buffer);
    expect(bytesToHex(signature)).toBe(
      '0x02563a12c3c78ac53e120673611dd03161e4fdb890d08097f41479d376ce69ec7dfe467e0fa35fbdf158f159ee76f7b661ee578a2851ae308f29e4332b7c2f37',
    );
  });

  it('accepts a DataView key and data', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha512(
      new DataView(key.buffer),
      new DataView(data.buffer),
    );
    expect(bytesToHex(signature)).toBe(
      '0x02563a12c3c78ac53e120673611dd03161e4fdb890d08097f41479d376ce69ec7dfe467e0fa35fbdf158f159ee76f7b661ee578a2851ae308f29e4332b7c2f37',
    );
  });

  it('matches RFC 4231 test case 1', async () => {
    const signature = await hmacSha512(rfcKey, rfcData);
    expect(bytesToHex(signature)).toBe(
      '0x87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
    );
  });
});
