import { bytesToHex } from '@metamask/utils';

import {
  bytesToSecretHex,
  canonicalize,
  canonicalizeIdentifiers,
  hash,
  secretHexToBytes,
} from './crypto.js';
import type { Identifier } from './types.js';

describe('crypto', () => {
  it('canonicalizes objects with sorted keys and Uint8Array values', () => {
    expect(canonicalize({ b: 1, a: new Uint8Array([1, 2]) })).toBe(
      `{"a":"${bytesToHex(new Uint8Array([1, 2]))}","b":1}`,
    );
  });

  it('hashes independently of key order', async () => {
    expect(await hash({ b: 1, a: 2 })).toBe(await hash({ a: 2, b: 1 }));
  });

  it('round-trips secret hex without a 0x prefix', () => {
    const bytes = new Uint8Array([255, 0, 16]);
    const encoded = bytesToSecretHex(bytes);
    expect(secretHexToBytes(encoded.slice(2))).toStrictEqual(bytes);
  });

  it('sorts identifiers for ownership hashes', () => {
    const first: Identifier = {
      type: 'passkey',
      namespace: 'b.com',
      value: '2',
      verifier: null,
    };
    const second: Identifier = {
      type: 'passkey',
      namespace: 'a.com',
      value: '1',
      verifier: null,
    };
    expect(canonicalize(canonicalizeIdentifiers([first, second]))).toBe(
      canonicalize(canonicalizeIdentifiers([second, first])),
    );
  });
});
