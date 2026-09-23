import type { MfaErrorCode } from './authentication-jwt-bearer/mfa/types.js';
import { HTTP_STATUS_CODES } from './constants.js';
import { asRecord } from './utils/as-record.js';

type ExtensibleMfaErrorCode = MfaErrorCode | (string & {});

/**
 * Base error for MFA operations.
 *
 * The machine-readable code is an enumerable own property so it survives
 * JSON-RPC error serialization.
 */
export class MfaError extends Error {
  readonly mfaCode: ExtensibleMfaErrorCode;

  readonly status?: number;

  readonly retryAfterMs?: number;

  constructor(
    mfaCode: ExtensibleMfaErrorCode,
    message: string,
    options?: { status?: number; retryAfterMs?: number },
  ) {
    super(`MFA[${mfaCode}]: ${message}`);
    this.name = 'MfaError';
    this.mfaCode = mfaCode;
    this.status = options?.status;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/**
 * The credential cannot be enrolled because an equivalent one already exists:
 * `email_already_enrolled` (this profile already has a verified email),
 * `email_socially_verified` (the email is verified through a social login), or
 * `credential_already_enrolled` (the email or passkey is enrolled on another
 * profile; the profiles must be paired or the credential removed).
 */
export class CredentialAlreadyEnrolledError extends MfaError {
  constructor(
    code:
      | 'credential_already_enrolled'
      | 'email_already_enrolled'
      | 'email_socially_verified',
    message: string,
    status = HTTP_STATUS_CODES.CONFLICT,
  ) {
    super(code, message, { status });
    this.name = 'CredentialAlreadyEnrolledError';
  }
}

/**
 * The profile already has MFA credentials, so enrolling another requires an
 * `aal:2` access token; the client must complete a step-up and retry with the
 * same flow.
 */
export class StepUpRequiredError extends MfaError {
  constructor(message: string, status = HTTP_STATUS_CODES.FORBIDDEN) {
    super('aal2_required', message, { status });
    this.name = 'StepUpRequiredError';
  }
}

export class CredentialNotEnrolledError extends MfaError {
  constructor(message: string, status = HTTP_STATUS_CODES.CONFLICT) {
    super('credential_not_enrolled', message, { status });
    this.name = 'CredentialNotEnrolledError';
  }
}

/**
 * The begin/complete flow is stale or unknown; the client must restart it.
 */
export class MfaFlowExpiredError extends MfaError {
  constructor(
    code: 'flow_expired' | 'invalid_flow',
    message: string,
    status?: number,
  ) {
    super(code, message, { status });
    this.name = 'MfaFlowExpiredError';
  }
}

/**
 * The profile has no identity-provider record yet. Not a stale flow: the
 * user must enroll a first credential before verifying.
 */
export class MfaIdentityMissingError extends MfaError {
  constructor(message: string, status = HTTP_STATUS_CODES.CONFLICT) {
    super('mfa_identity_missing', message, { status });
    this.name = 'MfaIdentityMissingError';
  }
}

export class MfaVerificationFailedError extends MfaError {
  constructor(
    code: 'invalid_code' | 'invalid_attestation' | 'invalid_assertion',
    message: string,
    status?: number,
  ) {
    super(code, message, { status });
    this.name = 'MfaVerificationFailedError';
  }
}

export class TooManyAttemptsError extends MfaError {
  constructor(message: string, status?: number) {
    super('too_many_attempts', message, { status });
    this.name = 'TooManyAttemptsError';
  }
}

export class MaxPasskeysReachedError extends MfaError {
  constructor(
    message: string,
    status = HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY,
  ) {
    super('max_passkeys_reached', message, { status });
    this.name = 'MaxPasskeysReachedError';
  }
}

export class MaxIdentifiersReachedError extends MfaError {
  constructor(message: string, status = HTTP_STATUS_CODES.CONFLICT) {
    super('max_identifiers_reached', message, { status });
    this.name = 'MaxIdentifiersReachedError';
  }
}

export class OtpResendCooldownError extends MfaError {
  constructor(
    message: string,
    retryAfterMs?: number,
    status = HTTP_STATUS_CODES.TOO_MANY_REQUESTS,
  ) {
    super('otp_resend_cooldown', message, { status, retryAfterMs });
    this.name = 'OtpResendCooldownError';
  }
}

/**
 * A 429 without an MFA-specific code: generic throttling, not an OTP resend
 * cooldown.
 */
export class MfaRateLimitedError extends MfaError {
  constructor(
    message: string,
    retryAfterMs?: number,
    status = HTTP_STATUS_CODES.TOO_MANY_REQUESTS,
  ) {
    super('rate_limited', message, { status, retryAfterMs });
    this.name = 'MfaRateLimitedError';
  }
}

/**
 * The identity provider or the network is unreachable. Safe to retry.
 * `status` is only set when the service answered.
 */
export class MfaUnavailableError extends MfaError {
  constructor(message: string, status?: number) {
    super('kratos_unavailable', message, { status });
    this.name = 'MfaUnavailableError';
  }
}

export class ElevatedTokenInvalidError extends MfaError {
  constructor(message: string) {
    super('elevated_token_invalid', message);
    this.name = 'ElevatedTokenInvalidError';
  }
}

/**
 * Gets an MFA code from direct, serialized, or message-only errors.
 *
 * @param error - Value to inspect.
 * @returns The stable code, if present.
 */
export function getMfaErrorCode(
  error: unknown,
): ExtensibleMfaErrorCode | undefined {
  const direct = asRecord(error);
  if (typeof direct?.mfaCode === 'string') {
    return direct.mfaCode;
  }

  const data = asRecord(direct?.data);
  const cause = asRecord(data?.cause);
  if (typeof cause?.mfaCode === 'string') {
    return cause.mfaCode;
  }

  const messages = [direct?.message, cause?.message];
  for (const message of messages) {
    if (typeof message === 'string') {
      const match = /^MFA\[([^\]]+)\]:/u.exec(message);
      if (match?.[1]) {
        return match[1];
      }
    }
  }
  return undefined;
}

/**
 * Checks whether a value carries an MFA error code.
 *
 * @param error - Value to inspect.
 * @param codes - Optional codes to match.
 * @returns Whether the value is an MFA error with a requested code.
 */
export function isMfaError(
  error: unknown,
  ...codes: ExtensibleMfaErrorCode[]
): boolean {
  const code = getMfaErrorCode(error);
  return code !== undefined && (codes.length === 0 || codes.includes(code));
}

/**
 * Gets a retry delay from direct or serialized MFA errors.
 *
 * @param error - Value to inspect.
 * @returns Retry delay in milliseconds, if present.
 */
export function getMfaRetryAfterMs(error: unknown): number | undefined {
  const direct = asRecord(error);
  if (typeof direct?.retryAfterMs === 'number') {
    return direct.retryAfterMs;
  }
  const data = asRecord(direct?.data);
  const cause = asRecord(data?.cause);
  return typeof cause?.retryAfterMs === 'number'
    ? cause.retryAfterMs
    : undefined;
}

export class NonceRetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonceRetrievalError';
  }
}

export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}

export class PairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PairError';
  }
}

/**
 * Thrown when `POST /api/v2/profile/pair/identifier` returns 409 Conflict:
 * the social identifier already belongs to another canonical profile.
 * Retrying the same request cannot succeed.
 */
export class PairConflictError extends PairError {
  readonly status = HTTP_STATUS_CODES.CONFLICT;

  constructor(message: string) {
    super(message);
    this.name = 'PairConflictError';
  }
}

/**
 * Thrown when `POST /api/v2/oidc/token` returns 422: this profile has no
 * verified email on record. Consumers should send the user through email
 * OTP (or Google pair) and retry.
 */
export class EmailRequiredError extends Error {
  readonly status = HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY;

  constructor(message: string) {
    super(message);
    this.name = 'EmailRequiredError';
  }
}

export class UserStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserStorageError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnsupportedAuthTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedAuthTypeError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitedError extends Error {
  readonly status = HTTP_STATUS_CODES.TOO_MANY_REQUESTS;

  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }

  /**
   * Check if an unknown error is a rate limit error (429 status).
   *
   * @param e - The error to check
   * @returns True if the error is a rate limit error
   */
  static isRateLimitError(e: unknown): e is RateLimitedError {
    return (
      e instanceof RateLimitedError ||
      (typeof e === 'object' &&
        e !== null &&
        'status' in e &&
        e.status === HTTP_STATUS_CODES.TOO_MANY_REQUESTS)
    );
  }
}
