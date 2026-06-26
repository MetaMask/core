import { HTTP_STATUS_CODES } from './constants';

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
