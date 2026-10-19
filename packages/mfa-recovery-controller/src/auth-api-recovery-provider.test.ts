import { AuthApiRecoveryAuthProvider } from './auth-api-recovery-provider.js';

describe('AuthApiRecoveryAuthProvider', () => {
  const getAccessToken = jest.fn<Promise<string>, [boolean]>();
  const options = {
    baseUrl: 'https://auth.example/',
    profileId: 'profile-1',
    getAccessToken,
  };

  beforeEach(() => {
    getAccessToken.mockResolvedValue('hydra-token');
  });

  it.each([false, true])(
    'returns the approval directly (requireTwoFactor: %s)',
    async (requireTwoFactor) => {
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ approval: 'signed-approval' })),
        );
      const provider = new AuthApiRecoveryAuthProvider({
        ...options,
        ...(requireTwoFactor
          ? { fetch: globalThis.fetch.bind(globalThis) }
          : {}),
      });
      expect(await provider.getAuthenticatedProfileId()).toBe('profile-1');
      expect(
        await provider.authorizeRecoveryRequest({
          requestHash: '0xrequest',
          audiences: ['cubist-audience'],
          ...(requireTwoFactor ? { requireTwoFactor } : {}),
        }),
      ).toBe('signed-approval');
      expect(getAccessToken).toHaveBeenCalledWith(requireTwoFactor);
      expect(fetchMock.mock.contexts[0] === globalThis).toBe(true);
      expect(fetchMock.mock.calls).toStrictEqual([
        [
          'https://auth.example/api/v2/recovery/approvals',
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

  it('surfaces an Auth API failure', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 403 }));
    await expect(
      new AuthApiRecoveryAuthProvider(options).authorizeRecoveryRequest({
        requestHash: '0xrequest',
        audiences: ['cubist-audience'],
      }),
    ).rejects.toThrow('Authentication API returned 403');
  });

  it.each([null, {}, { approval: 1 }, { approval: '' }])(
    'rejects a malformed approval response: %j',
    async (response) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(response)));
      await expect(
        new AuthApiRecoveryAuthProvider(options).authorizeRecoveryRequest({
          requestHash: '0xrequest',
          audiences: ['cubist-audience'],
        }),
      ).rejects.toThrow('Invalid Auth approval');
    },
  );
});
