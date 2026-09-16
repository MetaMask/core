import { Env } from '../../../shared/env.js';
import {
  CredentialAlreadyEnrolledError,
  CredentialNotEnrolledError,
  MaxIdentifiersReachedError,
  MaxPasskeysReachedError,
  MfaError,
  MfaFlowExpiredError,
  MfaIdentityMissingError,
  MfaRateLimitedError,
  MfaUnavailableError,
  MfaVerificationFailedError,
  TooManyAttemptsError,
} from '../../errors.js';
import {
  MOCK_MFA_CREDENTIALS_RESPONSE,
  MOCK_MFA_ENROLL_COMPLETE_RESPONSE,
  MOCK_MFA_ENROLL_PASSKEY_RESPONSE,
  MOCK_MFA_VERIFY_COMPLETE_RESPONSE,
  MOCK_MFA_VERIFY_PASSKEY_RESPONSE,
} from '../../mocks/auth.js';
import {
  getMfaCredentials,
  mfaEnroll,
  mfaEnrollComplete,
  mfaVerify,
  mfaVerifyComplete,
  parsePasskeyCreateData,
  parsePasskeyRequestData,
  toEnrolledCredential,
} from './services.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const registration = {
  id: 'credential-id',
  rawId: 'credential-id',
  type: 'public-key',
  response: {
    attestationObject: 'attestation',
    clientDataJSON: 'client-data',
  },
} as const;

const assertion = {
  id: 'credential-id',
  rawId: 'credential-id',
  type: 'public-key',
  response: {
    authenticatorData: 'authenticator-data',
    clientDataJSON: 'client-data',
    signature: 'signature',
  },
} as const;

function response(
  body: unknown,
  options?: { status?: number; headers?: Record<string, string> },
): Response {
  return new globalThis.Response(JSON.stringify(body), {
    status: options?.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

describe('MFA services', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('begins passkey enrollment and parses creation options', async () => {
    mockFetch.mockResolvedValue(response(MOCK_MFA_ENROLL_PASSKEY_RESPONSE));

    const result = await mfaEnroll(Env.PRD, 'access-token', {
      credential_type: 'passkey',
    });

    expect(result).toStrictEqual({
      flowId: 'enroll-passkey-flow-id',
      expiresAt: Date.parse('2099-09-07T14:30:00Z'),
      publicKey: expect.objectContaining({
        challenge: 'Y3JlYXRlLWNoYWxsZW5nZQ',
      }),
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/mfa/enroll'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('completes passkey and email enrollment', async () => {
    mockFetch
      .mockResolvedValueOnce(response(MOCK_MFA_ENROLL_COMPLETE_RESPONSE))
      .mockResolvedValueOnce(response(MOCK_MFA_ENROLL_COMPLETE_RESPONSE));

    await mfaEnrollComplete(Env.PRD, 'access-token', {
      credential_type: 'passkey',
      flow_id: 'flow-id',
      passkey_attestation: registration,
    });
    await mfaEnrollComplete(Env.PRD, 'access-token', {
      credential_type: 'email_otp',
      flow_id: 'flow-id',
      otp_code: '123456',
    });

    const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(firstBody.passkey_attestation).toBe(JSON.stringify(registration));
    expect(secondBody.otp_code).toBe('123456');
  });

  it('begins and completes passkey verification', async () => {
    mockFetch
      .mockResolvedValueOnce(response(MOCK_MFA_VERIFY_PASSKEY_RESPONSE))
      .mockResolvedValueOnce(response(MOCK_MFA_VERIFY_COMPLETE_RESPONSE));

    const challenge = await mfaVerify(Env.PRD, 'access-token', {
      credential_type: 'passkey',
    });
    const completion = await mfaVerifyComplete(Env.PRD, 'access-token', {
      credential_type: 'passkey',
      flow_id: 'flow-id',
      passkey_assertion: assertion,
    });

    expect(challenge.publicKey).toStrictEqual(
      expect.objectContaining({
        challenge: 'dmVyaWZ5LWNoYWxsZW5nZQ',
      }),
    );
    expect(completion).toStrictEqual({
      token: MOCK_MFA_VERIFY_COMPLETE_RESPONSE.token,
      expiresIn: 900,
    });
    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.passkey_assertion).toBe(JSON.stringify(assertion));
  });

  it('gets and maps supported credentials', async () => {
    mockFetch.mockResolvedValue(response(MOCK_MFA_CREDENTIALS_RESPONSE));

    expect(await getMfaCredentials(Env.PRD, 'access-token')).toStrictEqual([
      {
        type: 'passkey',
        status: 'active',
        enrolledAt: Date.parse('2026-09-15T10:00:00Z'),
        displayName: 'MetaMask 3f9a1c2b',
      },
      {
        type: 'email_otp',
        status: 'pending',
        enrolledAt: Date.parse('2026-09-15T10:05:00Z'),
        email: 'user@example.com',
        verified: false,
      },
    ]);
  });

  it('keeps supported credentials when a row has an unparsable enrollment date', async () => {
    mockFetch.mockResolvedValue(
      response({
        credentials: [
          {
            credential_type: 'passkey',
            status: 'active',
            enrolled_at: 'not-a-date',
            passkey: { display_name: 'MetaMask 3f9a1c2b' },
          },
          {
            credential_type: 'future_factor',
            status: 'active',
            enrolled_at: 'also-not-a-date',
          },
          {
            credential_type: 'email_otp',
            status: 'active',
            enrolled_at: '2026-09-15T10:05:00Z',
            email: { address: 'user@example.com', verified: true },
          },
        ],
      }),
    );

    expect(await getMfaCredentials(Env.PRD, 'access-token')).toStrictEqual([
      {
        type: 'passkey',
        status: 'active',
        displayName: 'MetaMask 3f9a1c2b',
      },
      {
        type: 'email_otp',
        status: 'active',
        enrolledAt: Date.parse('2026-09-15T10:05:00Z'),
        email: 'user@example.com',
        verified: true,
      },
    ]);
  });

  it('maps sparse credentials and ignores unsupported ones', () => {
    expect(
      toEnrolledCredential({
        credential_type: 'passkey',
        status: 'pending',
      }),
    ).toStrictEqual({ type: 'passkey', status: 'pending' });
    expect(
      toEnrolledCredential({
        credential_type: 'totp',
        status: 'active',
      }),
    ).toBeNull();
    expect(
      toEnrolledCredential({
        credential_type: 'passkey',
        status: 'revoked',
      }),
    ).toBeNull();
    expect(
      toEnrolledCredential({
        credential_type: 'email_otp',
        status: 'pending',
      }),
    ).toBeNull();
  });

  it('derives email verification from status when the server omits it', () => {
    expect(
      toEnrolledCredential({
        credential_type: 'email_otp',
        status: 'active',
        email: { address: 'user@example.com' },
      }),
    ).toStrictEqual({
      type: 'email_otp',
      status: 'active',
      email: 'user@example.com',
      verified: true,
    });
    expect(
      toEnrolledCredential({
        credential_type: 'email_otp',
        status: 'pending',
        email: { address: 'user@example.com' },
      }),
    ).toMatchObject({ verified: false });
  });

  it.each([
    ['credential_already_enrolled', CredentialAlreadyEnrolledError, 409],
    ['email_already_enrolled', CredentialAlreadyEnrolledError, 409],
    ['credential_not_enrolled', CredentialNotEnrolledError, 409],
    ['flow_expired', MfaFlowExpiredError, 400],
    ['invalid_flow', MfaFlowExpiredError, 400],
    ['mfa_identity_missing', MfaIdentityMissingError, 409],
    ['invalid_code', MfaVerificationFailedError, 400],
    ['invalid_attestation', MfaVerificationFailedError, 400],
    ['invalid_assertion', MfaVerificationFailedError, 400],
    ['too_many_attempts', TooManyAttemptsError, 400],
    ['max_passkeys_reached', MaxPasskeysReachedError, 422],
    ['max_identifiers_reached', MaxIdentifiersReachedError, 409],
    ['kratos_unavailable', MfaUnavailableError, 502],
  ] as const)('maps %s to a domain error', async (code, ErrorClass, status) => {
    mockFetch.mockResolvedValue(
      response({ code, message: 'Server message' }, { status }),
    );

    await expect(
      mfaEnroll(Env.PRD, 'access-token', {
        credential_type: 'passkey',
      }),
    ).rejects.toBeInstanceOf(ErrorClass);
  });

  it('maps resend cooldown and parses a Retry-After delay or date', async () => {
    const retryAt = new Date(Date.now() + 30_000);
    mockFetch
      .mockResolvedValueOnce(
        response(
          { code: 'otp_resend_cooldown', message: 'Wait before retrying' },
          { status: 429, headers: { 'Retry-After': '12' } },
        ),
      )
      .mockResolvedValueOnce(
        response(
          { code: 'otp_resend_cooldown', message: 'Wait before retrying' },
          { status: 429, headers: { 'Retry-After': retryAt.toUTCString() } },
        ),
      )
      .mockResolvedValueOnce(
        response(
          { code: 'otp_resend_cooldown', message: 'Wait before retrying' },
          { status: 429 },
        ),
      );

    const verifyEmail = async (): Promise<unknown> =>
      await mfaVerify(Env.PRD, 'access-token', { credential_type: 'email_otp' });

    await expect(verifyEmail()).rejects.toMatchObject({
      mfaCode: 'otp_resend_cooldown',
      retryAfterMs: 12_000,
    });
    const dated = await verifyEmail().catch((error) => error);
    expect(dated.retryAfterMs).toBeGreaterThan(0);
    expect(dated.retryAfterMs).toBeLessThanOrEqual(30_000);
    // The human-readable message is never parsed for a delay.
    await expect(verifyEmail()).rejects.toMatchObject({
      mfaCode: 'otp_resend_cooldown',
      retryAfterMs: undefined,
    });
  });

  it('maps code-less 429 and 502 responses by status', async () => {
    mockFetch
      .mockResolvedValueOnce(
        response(
          { message: 'Slow down' },
          { status: 429, headers: { 'Retry-After': '8' } },
        ),
      )
      .mockResolvedValueOnce(
        response({ message: 'Unavailable' }, { status: 502 }),
      );

    const rateLimited = await mfaVerify(Env.PRD, 'access-token', {
      credential_type: 'email_otp',
    }).catch((error) => error);
    expect(rateLimited).toBeInstanceOf(MfaRateLimitedError);
    expect(rateLimited).toMatchObject({
      mfaCode: 'rate_limited',
      retryAfterMs: 8_000,
    });
    await expect(
      mfaVerify(Env.PRD, 'access-token', {
        credential_type: 'email_otp',
      }),
    ).rejects.toBeInstanceOf(MfaUnavailableError);
  });

  it('distinguishes authentication and unknown server errors from malformed responses', async () => {
    mockFetch
      .mockResolvedValueOnce(
        response({ message: 'Access token expired' }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        response(
          { code: 'new_server_code', message: 'New condition' },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        response({ message: 'Unclassified failure' }, { status: 400 }),
      );

    await expect(
      getMfaCredentials(Env.PRD, 'access-token'),
    ).rejects.toMatchObject({ mfaCode: 'authentication_required' });
    await expect(
      getMfaCredentials(Env.PRD, 'access-token'),
    ).rejects.toMatchObject({ mfaCode: 'new_server_code' });
    await expect(
      getMfaCredentials(Env.PRD, 'access-token'),
    ).rejects.toMatchObject({ mfaCode: 'server_error' });
  });

  it('recognises a rejected token even without a JSON error body', async () => {
    mockFetch.mockResolvedValue(
      new globalThis.Response('', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(
      getMfaCredentials(Env.PRD, 'access-token'),
    ).rejects.toMatchObject({
      mfaCode: 'authentication_required',
      status: 401,
    });
  });

  it('rejects malformed success and error responses', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ flow_id: 'missing-expiration' }))
      .mockResolvedValueOnce(
        new globalThis.Response('not-json', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new globalThis.Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

    await expect(
      mfaEnroll(Env.PRD, 'access-token', {
        credential_type: 'passkey',
      }),
    ).rejects.toMatchObject({ mfaCode: 'invalid_response' });
    await expect(
      mfaEnroll(Env.PRD, 'access-token', {
        credential_type: 'passkey',
      }),
    ).rejects.toMatchObject({ mfaCode: 'invalid_response', status: 500 });
    await expect(
      mfaEnroll(Env.PRD, 'access-token', {
        credential_type: 'passkey',
      }),
    ).rejects.toMatchObject({ mfaCode: 'invalid_response', status: 200 });
  });

  it('rejects malformed embedded JSON and expiration dates', async () => {
    expect(() => parsePasskeyCreateData('{')).toThrow(
      /MFA\[invalid_response\]/u,
    );
    expect(() =>
      parsePasskeyCreateData('{"publicKey":{"challenge":"only"}}'),
    ).toThrow(/MFA\[invalid_response\].*\[publicKey\.rp\]/u);
    expect(() =>
      parsePasskeyRequestData('{"publicKey":{"challenge":1}}'),
    ).toThrow(/MFA\[invalid_response\]/u);

    mockFetch.mockResolvedValue(
      response({
        ...MOCK_MFA_ENROLL_PASSKEY_RESPONSE,
        expires_at: 'not-a-date',
      }),
    );
    await expect(
      mfaEnroll(Env.PRD, 'access-token', {
        credential_type: 'passkey',
      }),
    ).rejects.toBeInstanceOf(MfaError);
  });

  it('maps network failures to an unavailable error without a status', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const error = await getMfaCredentials(Env.PRD, 'access-token').catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(MfaUnavailableError);
    expect(error.status).toBeUndefined();
  });
});
