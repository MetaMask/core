import { JsonRpcError, serializeError } from '@metamask/rpc-errors';

import {
  CredentialAlreadyEnrolledError,
  CredentialNotEnrolledError,
  ElevatedTokenInvalidError,
  MaxIdentifiersReachedError,
  MaxPasskeysReachedError,
  MfaError,
  MfaFlowExpiredError,
  MfaIdentityMissingError,
  MfaRateLimitedError,
  MfaUnavailableError,
  MfaVerificationFailedError,
  OtpResendCooldownError,
  TooManyAttemptsError,
  getMfaErrorCode,
  getMfaRetryAfterMs,
  isMfaError,
} from './errors.js';

describe('MFA errors', () => {
  it('exposes a stable enumerable code', () => {
    const error = new CredentialAlreadyEnrolledError(
      'credential_already_enrolled',
      'Credential already exists',
    );

    expect(error).toBeInstanceOf(MfaError);
    expect(error.message).toBe(
      'MFA[credential_already_enrolled]: Credential already exists',
    );
    expect(Object.keys(error)).toContain('mfaCode');
    expect(getMfaErrorCode(error)).toBe('credential_already_enrolled');
    expect(isMfaError(error)).toBe(true);
    expect(isMfaError(error, 'credential_already_enrolled')).toBe(true);
    expect(isMfaError(error, 'invalid_code')).toBe(false);
  });

  it('reads codes and retry delays after JSON-RPC serialization', () => {
    const original = new OtpResendCooldownError(
      'Wait before requesting another code',
      30_000,
    );
    const serialized = serializeError(original);
    const rebuilt = new JsonRpcError(
      serialized.code,
      serialized.message,
      serialized.data,
    );

    expect(getMfaErrorCode(rebuilt)).toBe('otp_resend_cooldown');
    expect(getMfaRetryAfterMs(rebuilt)).toBe(30_000);
  });

  it('falls back to the stable message prefix', () => {
    expect(getMfaErrorCode(new Error('MFA[flow_expired]: Expired flow'))).toBe(
      'flow_expired',
    );
  });

  it('provides specific errors for every actionable condition', () => {
    const errors = [
      new CredentialNotEnrolledError('Not enrolled'),
      new MfaFlowExpiredError('flow_expired', 'Flow expired', 400),
      new MfaIdentityMissingError('No identity'),
      new MfaVerificationFailedError('invalid_code', 'Invalid code', 400),
      new TooManyAttemptsError('Too many attempts', 400),
      new MaxPasskeysReachedError('Maximum passkeys reached'),
      new MaxIdentifiersReachedError('Maximum identifiers reached'),
      new MfaRateLimitedError('Slow down', 5_000),
      new MfaUnavailableError('Identity provider unavailable'),
      new ElevatedTokenInvalidError('Expected AAL2 claims'),
    ];

    expect(errors.map((error) => error.name)).toStrictEqual([
      'CredentialNotEnrolledError',
      'MfaFlowExpiredError',
      'MfaIdentityMissingError',
      'MfaVerificationFailedError',
      'TooManyAttemptsError',
      'MaxPasskeysReachedError',
      'MaxIdentifiersReachedError',
      'MfaRateLimitedError',
      'MfaUnavailableError',
      'ElevatedTokenInvalidError',
    ]);
    expect(errors.map((error) => error.mfaCode)).toStrictEqual([
      'credential_not_enrolled',
      'flow_expired',
      'mfa_identity_missing',
      'invalid_code',
      'too_many_attempts',
      'max_passkeys_reached',
      'max_identifiers_reached',
      'rate_limited',
      'kratos_unavailable',
      'elevated_token_invalid',
    ]);
  });

  it('does not invent an HTTP status for transport failures', () => {
    expect(new MfaUnavailableError('fetch failed').status).toBeUndefined();
    expect(new MfaUnavailableError('Bad gateway', 502).status).toBe(502);
  });

  it('reads direct retry delays and a serialized cause message', () => {
    const direct = new OtpResendCooldownError('Cooldown', 1_000);
    expect(getMfaRetryAfterMs(direct)).toBe(1_000);
    expect(
      getMfaErrorCode({
        data: { cause: { message: 'MFA[invalid_code]: Incorrect code' } },
      }),
    ).toBe('invalid_code');
  });

  it('returns undefined for unrelated values', () => {
    expect(getMfaErrorCode(new Error('unrelated'))).toBeUndefined();
    expect(getMfaRetryAfterMs(null)).toBeUndefined();
    expect(isMfaError('invalid_code')).toBe(false);
  });
});
