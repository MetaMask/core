import { describe, expect, it } from 'vitest';

import * as allExports from './index.js';

describe('index', () => {
  it('includes the expected exports', () => {
    expect(Object.keys(allExports).sort()).toMatchInlineSnapshot(`
      [
        "HEX_REGEX",
        "STRICT_HEX_REGEX",
        "add0x",
        "areUint8ArraysEqual",
        "assertIsBytes",
        "assertIsHexString",
        "assertIsStrictHexString",
        "base64ToBytes",
        "bigIntToBytes",
        "bigIntToHex",
        "bytesToBase64",
        "bytesToBigInt",
        "bytesToHex",
        "bytesToNumber",
        "bytesToSignedBigInt",
        "bytesToString",
        "concatBytes",
        "createDataView",
        "hexToBigInt",
        "hexToBytes",
        "hexToNumber",
        "isBytes",
        "isHexString",
        "isStrictHexString",
        "numberToBytes",
        "numberToHex",
        "remove0x",
        "signedBigIntToBytes",
        "stringToBytes",
        "valueToBytes",
      ]
    `);
  });
});
