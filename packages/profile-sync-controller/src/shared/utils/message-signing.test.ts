import { bytesToHex } from '@metamask/utils';
import { hmac as nobleHmac } from '@noble/hashes/hmac';

import {
  deriveMessageSigningPrivateKey,
  deriveSip6PrivateKey,
  getMessageSigningPublicKey,
  MESSAGE_SIGNING_SNAP_ID,
  signMessageWithMessageSigningKey,
} from './message-signing.js';

jest.mock('@noble/hashes/hmac', () => {
  const actual = jest.requireActual('@noble/hashes/hmac');
  return {
    hmac: jest.fn(actual.hmac),
  };
});

const actualNobleHmac =
  jest.requireActual<typeof import('@noble/hashes/hmac')>(
    '@noble/hashes/hmac',
  ).hmac;

/**
 * Makes any call to noble's `hmac` throw, proving that SIP-6 derivation goes
 * through Web Crypto instead of noble (including `@metamask/key-tree`'s
 * internal noble fallback).
 *
 * @returns void.
 */
const forbidNobleHmac = (): void =>
  jest.mocked(nobleHmac).mockImplementation(() => {
    throw new Error('noble HMAC must not be used');
  });

/**
 * Restores the real noble `hmac` for paths that legitimately use it.
 *
 * @returns void.
 */
const allowNobleHmac = (): void =>
  jest.mocked(nobleHmac).mockImplementation(actualNobleHmac);

// Same seed as `@metamask/snaps-utils` TEST_SECRET_RECOVERY_PHRASE_SEED_BYTES
// (`test test test test test test test test test test test ball`).
const TEST_SEED = new Uint8Array([
  44, 232, 45, 62, 149, 146, 73, 117, 90, 217, 78, 33, 68, 145, 185, 177, 102,
  61, 41, 58, 21, 196, 248, 21, 155, 72, 140, 191, 191, 66, 144, 46, 47, 188,
  165, 16, 149, 48, 252, 179, 255, 31, 120, 228, 174, 203, 27, 194, 102, 9, 173,
  1, 47, 174, 216, 184, 227, 85, 112, 105, 241, 209, 73, 65,
]);

// From `@metamask/snaps-rpc-methods` SIP-6 ENTROPY_VECTORS.
const SIP6_VECTORS = [
  {
    snapId: 'foo',
    entropy:
      '0x8bbb59ec55a4a8dd5429268e367ebbbe54eee7467c0090ca835c64d45c33a155',
  },
  {
    snapId: 'bar',
    entropy:
      '0xbdae5c0790d9189d8ae27fd4860b3b57bab420b6594c420ae9ae3a9f87c1ea14',
  },
  {
    snapId: 'foo',
    salt: 'bar',
    entropy:
      '0x59cbec1fa877ecb38d88c3a2326b23bff374954b39ad9482c9b082306ac4b3ad',
  },
  {
    snapId: 'bar',
    salt: 'baz',
    entropy:
      '0x814c1f121eb4067d1e1d177246461e8a1cc6a1b1152756737aba7fa9c2161ba2',
  },
] as const;

describe('message-signing SIP-6 helpers', () => {
  beforeEach(() => {
    forbidNobleHmac();
  });

  it('exports the message-signing snap ID used as SIP-6 input', () => {
    expect(MESSAGE_SIGNING_SNAP_ID).toBe('npm:@metamask/message-signing-snap');
  });

  it.each(SIP6_VECTORS)(
    'matches SIP-6 entropy vector for snapId=$snapId salt=$salt',
    async ({ snapId, salt, entropy }) => {
      const privateKey = await deriveSip6PrivateKey({
        seed: TEST_SEED,
        input: snapId,
        salt,
      });
      expect(bytesToHex(privateKey)).toBe(entropy);
    },
  );

  it('derives a stable public key for the message-signing snap id', async () => {
    const publicKey = await getMessageSigningPublicKey(TEST_SEED);
    expect(publicKey).toMatch(/^0x[0-9a-f]{66}$/u);

    const again = await getMessageSigningPublicKey(TEST_SEED);
    expect(again).toBe(publicKey);
  });

  it('signs metamask messages with a compact secp256k1 signature', async () => {
    // `secp256k1.sign` computes RFC-6979 nonces with noble's `hmac`
    // internally; secp256k1 signing stays on noble, so the poison is lifted
    // for this test.
    allowNobleHmac();
    const signature = await signMessageWithMessageSigningKey(
      'metamask:test',
      TEST_SEED,
    );
    expect(signature).toMatch(/^0x[0-9a-f]{128}$/u);

    const again = await signMessageWithMessageSigningKey(
      'metamask:test',
      TEST_SEED,
    );
    expect(again).toBe(signature);
  });

  it('uses empty salt by default (internal metamask origin parity)', async () => {
    const withDefaultSalt = await deriveMessageSigningPrivateKey(TEST_SEED);
    const withExplicitEmptySalt = await deriveMessageSigningPrivateKey(
      TEST_SEED,
      '',
    );
    expect(bytesToHex(withDefaultSalt)).toBe(bytesToHex(withExplicitEmptySalt));
  });

  it('derives SIP-6 entropy without noble HMAC', async () => {
    const privateKey = await deriveSip6PrivateKey({
      seed: TEST_SEED,
      input: 'foo',
    });
    expect(bytesToHex(privateKey)).toBe(SIP6_VECTORS[0].entropy);
  });
});
