import { sha256 } from '@noble/hashes/sha2';

import { matchExpectedRPID } from './match-expected-rp-id.js';

describe('matchExpectedRPID', () => {
  it('throws when no RP ID matches', async () => {
    const rpIdHash = sha256(new TextEncoder().encode('example.com'));
    await expect(matchExpectedRPID(rpIdHash, ['wrong.com'])).rejects.toThrow(
      'Unexpected RP ID hash',
    );
  });

  it('returns matching RP ID', async () => {
    const rpIdHash = sha256(new TextEncoder().encode('example.com'));
    expect(await matchExpectedRPID(rpIdHash, ['example.com'])).toBe(
      'example.com',
    );
  });

  it('constant-time compare rejects different lengths', async () => {
    // Pass a 16-byte rpIdHash to trigger the areEqual length-mismatch branch
    // (sha256 always produces 32 bytes, so the comparison short-circuits)
    const shortHash = new Uint8Array(16).fill(0xaa);
    await expect(matchExpectedRPID(shortHash, ['example.com'])).rejects.toThrow(
      'Unexpected RP ID hash',
    );
  });

  it('matches second candidate in array', async () => {
    const rpIdHash = sha256(new TextEncoder().encode('example.com'));
    expect(
      await matchExpectedRPID(rpIdHash, ['wrong.com', 'example.com']),
    ).toBe('example.com');
  });
});
