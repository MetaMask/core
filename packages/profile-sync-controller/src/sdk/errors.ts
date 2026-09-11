import { HTTP_STATUS_CODES } from './constants.js';

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
