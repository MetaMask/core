import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthApiRecoveryAuthProvider } from './auth-api-recovery-provider.js';

describe('AuthApiRecoveryAuthProvider', () => {
  const getAccessToken =
    vi.fn<(requireTwoFactor: boolean) => Promise<string>>();
  const options = {
    baseUrl: 'https://auth.example/',
    profileId: 'profile-1',
    getAccessToken,
  };
  const approval = {
    approval: 'signed-approval',
    identifiers: [
      {
        type: 'social',
        namespace: 'https://accounts.google.com',
        value: 'hash',
      },
      {
        type: 'passkey',
        namespace: 'metamask.io',
        value: 'AQID',
        verifier: {
          publicKey: { cose: 'AQID' },
          rpId: 'metamask.io',
          origins: ['https://metamask.io'],
        },
      },
    ],
  };

  beforeEach(() => {
    getAccessToken.mockResolvedValue('hydra-token');
  });

  it.each([
    [undefined, false],
    [true, true],
  ])(
    'returns the approval and identifiers (requireTwoFactor: %s)',
    async (requireTwoFactor, expectedTwoFactor) => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(approval)));
      const provider = new AuthApiRecoveryAuthProvider(options);
      expect(await provider.getAuthenticatedProfileId()).toBe('profile-1');
      expect(
        await provider.authorizeRecoveryRequest({
          requestHash: '0xrequest',
          audiences: ['cubist-audience'],
          requireTwoFactor,
        }),
      ).toStrictEqual(approval);
      expect(getAccessToken).toHaveBeenCalledWith(expectedTwoFactor);
      expect(fetchMock.mock.contexts[0] === globalThis).toBe(true);
      expect(fetchMock.mock.calls).toStrictEqual([
        [
          'https://auth.example/api/v2/mfa/approvals',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer hydra-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              request_hash: '0xrequest',
              audiences: ['cubist-audience'],
            }),
          },
        ],
      ]);
    },
  );

  it.each([
    [403, 'authentication_required'],
    [500, 'auth_api_error'],
  ])('surfaces an Auth API %i as %s', async (status, code) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    await expect(
      new AuthApiRecoveryAuthProvider({
        ...options,
        fetch: fetchMock,
      }).authorizeRecoveryRequest({
        requestHash: '0xrequest',
        audiences: ['cubist-audience'],
      }),
    ).rejects.toMatchObject({
      message: `Authentication API returned ${status}`,
      code,
    });
  });

  it.each([
    null,
    {},
    { ...approval, approval: 1 },
    { ...approval, approval: '' },
    { ...approval, identifiers: null },
    { ...approval, identifiers: [{}] },
  ])('rejects a malformed approval response: %j', async (response) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response)),
    );
    await expect(
      new AuthApiRecoveryAuthProvider(options).authorizeRecoveryRequest({
        requestHash: '0xrequest',
        audiences: ['cubist-audience'],
      }),
    ).rejects.toThrow('Invalid Auth approval');
  });
});
