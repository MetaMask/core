import { bytesToHex, stringToBytes } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  getEscrowPasskeyChallenge,
  isEscrowPasskeyChallenge,
} from './identifier-auth.js';

describe('getEscrowPasskeyChallenge', () => {
  it('matches the escrow: prefix followed by the login nonce', async () => {
    const challenge = await getEscrowPasskeyChallenge({
      identifier: { type: 'passkey', namespace: 'metamask.io', value: 'id' },
      proofPublicKey: new Uint8Array(32).fill(1),
      requestHash: '0xabc',
      notAfter: 1700000000,
    });

    expect(bytesToHex(challenge)).toBe(
      `${bytesToHex(stringToBytes('MetaMask escrow login:'))}5188cc359f6fc96af29d856fa82cf01c34a40565ca60386564742df8276110d8`,
    );
  });
});

describe('isEscrowPasskeyChallenge', () => {
  it('detects the escrow prefix in a base64url challenge', () => {
    const challenge = Buffer.concat([
      Buffer.from('MetaMask escrow login:'),
      Buffer.alloc(32, 0xff),
    ]);

    expect(isEscrowPasskeyChallenge(challenge.toString('base64url'))).toBe(
      true,
    );
    expect(
      isEscrowPasskeyChallenge(challenge.subarray(1).toString('base64url')),
    ).toBe(false);
  });
});
