import { bytesToHex } from '@metamask/byte-utils';
import { describe, expect, it, vi } from 'vitest';

import { keccak256, ripemd160 } from './cryptography.js';
import * as utils from './utils.js';

describe('keccak256', () => {
  it('returns the keccak-256 hash of the data', () => {
    const data = new Uint8Array(32).fill(1);
    const hash = keccak256(data);

    expect(bytesToHex(hash)).toBe(
      '0xcebc8882fecbec7fb80d2cf4b312bec018884c2d66667c67a90508214bd8bafc',
    );
  });
});

describe('ripemd160', () => {
  it('returns the RIPEMD-160 hash of the data', () => {
    const data = new Uint8Array(32).fill(1);
    const hash = ripemd160(data);

    expect(bytesToHex(hash)).toBe('0x422d0010f16ae8539c53eb57a912890244a9eb5a');
  });
});
