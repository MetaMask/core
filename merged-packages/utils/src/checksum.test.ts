import { is } from '@metamask/superstruct';

import { ChecksumStruct } from './checksum';

describe('ChecksumStruct', () => {
  it('validates valid checksum', () => {
    expect(
      is('29MYwcRiruhy9BEJpN/TBIhxoD3t0P4OdXztV9rW8tc=', ChecksumStruct),
    ).toBe(true);
  });

  it.each([
    [
      {},
      [],
      true,
      false,
      null,
      undefined,
      'foo',
      -1,
      1.1,
      Infinity,
      -Infinity,
      NaN,
      'TG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQsIGNvbnNlY3RldHVyIGFkaXBpc2NpbmcgZWxpdCwgc2VkIGRvIGVpdXNtb2QgdGVtcG9yIGluY2lkaWR1bnQgdXQgbGFib3JlIGV0IGRvbG9yZSBtYWduYSBhbGlxdWEu',
    ],
  ])("doesn't validate invalid checksums", (value) => {
    expect(is(value, ChecksumStruct)).toBe(false);
  });
});
