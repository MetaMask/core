import {
  AuthenticationResponseJSONStruct,
  BeginEnrollmentRequestStruct,
  CompleteEnrollmentRequestStruct,
  MfaCredentialsResponseStruct,
  MfaEnrollResponseStruct,
  PasskeyCreateDataStruct,
  PasskeyRequestDataStruct,
  RegistrationResponseJSONStruct,
  assertValidMfaRequest,
  assertValidMfaResponse,
  parseVerificationTokenClaims,
} from './schemas.js';
import { MFA_CREDENTIAL_TYPES } from './types.js';

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

describe('MFA schemas', () => {
  it('exposes the supported credential types', () => {
    expect(MFA_CREDENTIAL_TYPES).toStrictEqual(['passkey', 'email_otp']);
  });

  it('accepts service responses and ignores additional response fields', () => {
    const enrollment = {
      flow_id: 'flow-id',
      expires_at: '2026-09-07T14:30:00Z',
      future_field: true,
    };
    const credentials = {
      credentials: [
        {
          credential_type: 'passkey',
          status: 'active',
          passkey: {
            display_name: 'MetaMask 3f9a1c2b',
            added_at: '2024-01-15T10:30:00Z',
          },
          future_field: true,
        },
        {
          credential_type: 'email_otp',
          status: 'pending',
          email: { address: 'user@example.com', verified: false },
        },
      ],
      future_field: true,
    };

    expect(() =>
      assertValidMfaResponse(enrollment, MfaEnrollResponseStruct),
    ).not.toThrow();
    expect(() =>
      assertValidMfaResponse(credentials, MfaCredentialsResponseStruct),
    ).not.toThrow();
  });

  it('rejects malformed responses with path details', () => {
    expect(() =>
      assertValidMfaResponse({ flow_id: 'flow-id' }, MfaEnrollResponseStruct),
    ).toThrow(/MFA\[invalid_response\].*\[expires_at\]/u);
  });

  it('accepts partial credential details from legacy and pending rows', () => {
    expect(() =>
      assertValidMfaResponse(
        {
          credentials: [
            {
              credential_type: 'email_otp',
              status: 'pending',
              email: {},
            },
          ],
        },
        MfaCredentialsResponseStruct,
      ),
    ).not.toThrow();
  });

  it('validates passkey creation and request options', () => {
    expect(() =>
      assertValidMfaResponse(
        {
          publicKey: {
            rp: { id: 'authentication.api.cx.metamask.io', name: 'MetaMask' },
            user: {
              id: 'user-id',
              name: 'MetaMask 3f9a1c2b',
              displayName: 'MetaMask 3f9a1c2b',
            },
            challenge: 'challenge',
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            excludeCredentials: [],
            attestation: 'none',
          },
        },
        PasskeyCreateDataStruct,
      ),
    ).not.toThrow();

    expect(() =>
      assertValidMfaResponse(
        {
          publicKey: {
            rpId: 'authentication.api.cx.metamask.io',
            challenge: 'challenge',
            allowCredentials: [{ type: 'public-key', id: 'credential-id' }],
          },
        },
        PasskeyRequestDataStruct,
      ),
    ).not.toThrow();
  });

  it('validates platform ceremony results', () => {
    expect(() =>
      assertValidMfaRequest(registration, RegistrationResponseJSONStruct),
    ).not.toThrow();
    expect(() =>
      assertValidMfaRequest(assertion, AuthenticationResponseJSONStruct),
    ).not.toThrow();
  });

  it('requires a valid operation and an email for email enrollment', () => {
    expect(() =>
      assertValidMfaRequest(
        {
          type: 'email_otp',
          reason: { operation: 'settings.addEmail' },
        },
        BeginEnrollmentRequestStruct,
      ),
    ).toThrow(/email is required/u);

    expect(() =>
      assertValidMfaRequest(
        {
          type: 'passkey',
          reason: { operation: 'contains whitespace' },
        },
        BeginEnrollmentRequestStruct,
      ),
    ).toThrow(/MFA\[invalid_request\].*\[reason.operation\]/u);
  });

  it('rejects an email on passkey enrollment', () => {
    expect(() =>
      assertValidMfaRequest(
        {
          type: 'passkey',
          email: 'user@example.com',
          reason: { operation: 'settings.addPasskey' },
        },
        BeginEnrollmentRequestStruct,
      ),
    ).toThrow(/email is not accepted/u);
  });

  it('rejects unknown request fields and malformed proofs', () => {
    expect(() =>
      assertValidMfaRequest(
        {
          flowId: 'flow-id',
          proof: { type: 'email_otp', code: '12345' },
          reason: { operation: 'settings.addEmail' },
        },
        CompleteEnrollmentRequestStruct,
      ),
    ).toThrow(/MFA\[invalid_request\].*\[proof\]/u);

    expect(() =>
      assertValidMfaRequest(
        {
          flowId: 'flow-id',
          proof: { type: 'passkey', attestation: registration },
        },
        CompleteEnrollmentRequestStruct,
      ),
    ).toThrow(/\[reason\]/u);

    expect(() =>
      assertValidMfaRequest(
        {
          type: 'passkey',
          reason: { operation: 'settings.addPasskey' },
          extra: true,
        },
        BeginEnrollmentRequestStruct,
      ),
    ).toThrow(/extra/u);
  });

  it('accepts credential rows with unknown statuses', () => {
    expect(() =>
      assertValidMfaResponse(
        {
          credentials: [{ credential_type: 'passkey', status: 'revoked' }],
        },
        MfaCredentialsResponseStruct,
      ),
    ).not.toThrow();
  });

  it('normalizes verification-token authentication methods', () => {
    expect(
      parseVerificationTokenClaims({
        sub: 'profile-id',
        aal: 2,
        exp: 2_000_000_000,
        amr: 'passkey',
      }),
    ).toStrictEqual({
      sub: 'profile-id',
      exp: 2_000_000_000,
      amr: ['passkey'],
    });

    expect(
      parseVerificationTokenClaims({
        sub: 'profile-id',
        aal: 2,
        exp: 2_000_000_000,
        amr: ['email_otp'],
      }).amr,
    ).toStrictEqual(['email_otp']);
  });

  it('accepts authentication methods this client cannot enroll', () => {
    expect(
      parseVerificationTokenClaims({
        sub: 'profile-id',
        aal: 2,
        exp: 2_000_000_000,
        amr: ['social', 'email_otp'],
      }).amr,
    ).toStrictEqual(['social', 'email_otp']);
  });

  it('reads authentication methods nested under the Hydra ext claim', () => {
    expect(
      parseVerificationTokenClaims({
        sub: 'profile-id',
        exp: 2_000_000_000,
        ext: { aal: 2, amr: ['passkey'] },
      }),
    ).toStrictEqual({
      sub: 'profile-id',
      exp: 2_000_000_000,
      amr: ['passkey'],
    });
  });

  it.each([
    ['AAL1', { aal: 1 }],
    ['AAL2', { aal: 2 }],
    ['no aal claim', {}],
  ])(
    'accepts tokens whatever their assurance level (%s)',
    (_name, levelClaims) => {
      expect(
        parseVerificationTokenClaims({
          sub: 'profile-id',
          exp: 2_000_000_000,
          amr: 'email_otp',
          ...levelClaims,
        }),
      ).toStrictEqual({
        sub: 'profile-id',
        exp: 2_000_000_000,
        amr: ['email_otp'],
      });
    },
  );

  it.each([
    [
      'missing authentication methods',
      { sub: 'profile-id', exp: 2_000_000_000 },
    ],
    ['missing subject', { exp: 2_000_000_000, amr: 'passkey' }],
    ['non-object payload', 'not-a-payload'],
  ])('rejects tokens with invalid claims (%s)', (_name, payload) => {
    expect(() => parseVerificationTokenClaims(payload)).toThrow(
      /MFA\[verification_token_invalid\]/u,
    );
  });
});
