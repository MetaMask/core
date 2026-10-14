import {
  HangSwitch,
  StubEscrowProvider,
  StubIdentifierAuthProvider,
} from '../tests/stubs.js';
import { MfaRecoveryError } from './errors.js';
import {
  authorizeEscrowsWithToken,
  requestKeyBoundIdentifierToken,
} from './identifier-auth.js';
import type { Identifier, KeyBoundCredential } from './types.js';

const PASSKEY: Identifier = {
  type: 'passkey',
  namespace: 'example.com',
  value: 'cred-1',
  verifier: { publicKey: 'pk' },
};

describe('authorizeEscrowsWithToken', () => {
  it('rejects with operation_aborted when the signal aborts during the challenge fan-out', async () => {
    const escrowA = new StubEscrowProvider('escrow-a');
    const escrowB = new StubEscrowProvider('escrow-b');
    const challengeHang = new HangSwitch();
    challengeHang.enabled = true;
    const generateChallenge = escrowA.generateChallenge.bind(escrowA);
    const challengeSpy = jest
      .spyOn(escrowA, 'generateChallenge')
      .mockImplementation(async (options) => {
        await challengeHang.wait(options?.signal);
        return await generateChallenge(options);
      });
    const parent = new AbortController();

    const authorization = authorizeEscrowsWithToken({
      escrows: [escrowA, escrowB],
      credential: await getCredential(),
      signal: parent.signal,
      timeoutMs: 10_000,
    });
    parent.abort();

    await expect(authorization).rejects.toMatchObject({
      code: 'operation_aborted',
    });
    expect(challengeSpy.mock.calls[0][0]?.signal?.aborted).toBe(true);
  });

  it('propagates operation_aborted reported by an escrow challenge', async () => {
    const escrowA = new StubEscrowProvider('escrow-a');
    const escrowB = new StubEscrowProvider('escrow-b');
    const aborted = new MfaRecoveryError(
      'Operation aborted',
      'operation_aborted',
    );
    jest.spyOn(escrowA, 'generateChallenge').mockRejectedValue(aborted);

    await expect(
      authorizeEscrowsWithToken({
        escrows: [escrowA, escrowB],
        credential: await getCredential(),
        timeoutMs: 1_000,
      }),
    ).rejects.toBe(aborted);
  });

  it('omits escrows whose challenge fails for another reason', async () => {
    const escrowA = new StubEscrowProvider('escrow-a');
    const escrowB = new StubEscrowProvider('escrow-b');
    jest
      .spyOn(escrowA, 'generateChallenge')
      .mockRejectedValue(
        new MfaRecoveryError('Escrow request failed', 'escrow_request_failed'),
      );

    const authorized = await authorizeEscrowsWithToken({
      escrows: [escrowA, escrowB],
      credential: await getCredential(),
      timeoutMs: 1_000,
    });

    expect(authorized.map(({ escrow }) => escrow.id)).toStrictEqual([
      'escrow-b',
    ]);
  });
});

/**
 * @returns A key-bound credential for {@link PASSKEY}.
 */
async function getCredential(): Promise<KeyBoundCredential> {
  return await requestKeyBoundIdentifierToken({
    identifier: PASSKEY,
    requestHash: '0xrequest',
    identifierAuthProvider: new StubIdentifierAuthProvider(),
    timeoutMs: 1_000,
  });
}
