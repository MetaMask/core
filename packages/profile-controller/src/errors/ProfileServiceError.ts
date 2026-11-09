import { HttpError } from '@metamask/controller-utils';

import type {
  ProfileServiceApiError,
  ProfileServiceErrorCodeInfo,
  ProfileServiceErrorDetail,
} from './types.js';

/**
 * An `HttpError` that also carries the Profile API error envelope, so clients
 * can branch on the stable `code` (or `code_info`) instead of the
 * human-readable message.
 */
export class ProfileServiceError extends HttpError {
  /** The stable `SCREAMING_SNAKE_CASE` error code, when the API sent one. */
  readonly code?: string;

  /** The additive classification for {@link code}, when the API sent one. */
  readonly code_info?: ProfileServiceErrorCodeInfo;

  /** Per-field validation details, when the API sent them. */
  readonly details?: ProfileServiceErrorDetail[];

  /** Whether retrying the request may succeed. */
  readonly retryable?: boolean;

  /** The request identifier echoed by the API, for support and tracing. */
  readonly requestId?: string;

  /** The trace identifier echoed by the API, when present. */
  readonly traceId?: string;

  constructor(
    httpStatus: number,
    message: string,
    apiError?: ProfileServiceApiError,
  ) {
    super(httpStatus, message);
    this.name = 'ProfileServiceError';
    this.code = apiError?.code;
    this.code_info = apiError?.code_info;
    this.details = apiError?.details;
    this.retryable = apiError?.retryable ?? apiError?.code_info?.retryable;
    this.requestId = apiError?.requestId;
    this.traceId = apiError?.traceId;
  }
}

/**
 * Finds the Profile API error on `error` or one of its causes.
 *
 * Clients commonly wrap the service error (for example, an OAuth error wraps
 * the backend error), so the stable code can sit below the surface error. The
 * walk is cycle-safe.
 */
export const findProfileServiceError = (
  error: unknown,
): ProfileServiceError | undefined => {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current instanceof Error && !seen.has(current)) {
    if (current instanceof ProfileServiceError) {
      return current;
    }
    seen.add(current);
    current = current.cause;
  }

  return undefined;
};
