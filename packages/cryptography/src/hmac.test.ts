import { stringToBytes, bytesToHex, hexToBytes } from '@metamask/utils';

import { hmacSha256, hmacSha384, hmacSha512 } from './hmac.js';

const key = hexToBytes(
  '0xf38a650903309967f2073b437852f77c87af7529cd5c85f4d2bdcf470083553c',
);

describe('hmacSha256', () => {
  it('signs the data using the provided', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha256(key, data);
    expect(bytesToHex(signature)).toBe(
      '0xe4efedf8184685465ba3634f69b28bd1b18784fd5c7460495e1bb23cb9fee4cf',
    );
  });
});

describe('hmacSha384', () => {
  it('signs the data using the provided', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha384(key, data);
    expect(bytesToHex(signature)).toBe(
      '0x3387d8401c449d8aa407f15f7718eec9f6a83287b4a939781d3231d02bb439d055d85b4d5b5f25706816f7c3852872db',
    );
  });
});

describe('hmacSha512', () => {
  it('signs the data using the provided', async () => {
    const data = stringToBytes('bar');
    const signature = await hmacSha512(key, data);
    expect(bytesToHex(signature)).toBe(
      '0x02563a12c3c78ac53e120673611dd03161e4fdb890d08097f41479d376ce69ec7dfe467e0fa35fbdf158f159ee76f7b661ee578a2851ae308f29e4332b7c2f37',
    );
  });
});
