import { HttpError } from '@metamask/controller-utils';
import { describe, expect, it } from 'vitest';

import {
  ProfileServiceError,
  findProfileServiceError,
} from './ProfileServiceError.js';

const createError = (): ProfileServiceError =>
  new ProfileServiceError(403, 'ProfileService: failed to update profile: 403', {
    code: 'PROFILE_LINKED_ADDRESSES_COOLDOWN',
    code_info: {
      id: 'PROFILE_LINKED_ADDRESSES_COOLDOWN',
      http_status: 403,
      category: 'profile',
      retryable: true,
    },
    details: [
      {
        code: 'RETRY_AFTER',
        message: 'Try later',
        meta: { retry_after_seconds: 60 },
      },
    ],
    requestId: 'req_123',
    traceId: 'trace_123',
  });

describe('ProfileServiceError', () => {
  it('is an HttpError with the API envelope attached', () => {
    const error = createError();

    expect(error).toBeInstanceOf(HttpError);
    expect(error.httpStatus).toBe(403);
    expect(error.code).toBe('PROFILE_LINKED_ADDRESSES_COOLDOWN');
    expect(error.code_info).toStrictEqual({
      id: 'PROFILE_LINKED_ADDRESSES_COOLDOWN',
      http_status: 403,
      category: 'profile',
      retryable: true,
    });
    expect(error.details).toStrictEqual([
      {
        code: 'RETRY_AFTER',
        message: 'Try later',
        meta: { retry_after_seconds: 60 },
      },
    ]);
    expect(error.retryable).toBe(true);
    expect(error.requestId).toBe('req_123');
    expect(error.traceId).toBe('trace_123');
  });

  it('falls back to code_info.retryable when the top-level field is absent', () => {
    const error = new ProfileServiceError(503, 'unavailable', {
      code_info: {
        id: 'SERVICE_UNAVAILABLE',
        http_status: 503,
        category: 'upstream',
        retryable: true,
      },
    });

    expect(error.retryable).toBe(true);
  });
});

describe('findProfileServiceError', () => {
  it('returns the error when it carries the envelope directly', () => {
    const error = createError();

    expect(findProfileServiceError(error)).toBe(error);
  });

  it('follows the cause chain to the service error', () => {
    const serviceError = createError();
    const wrapper = new Error('Failed to connect X account', {
      cause: serviceError,
    });

    expect(findProfileServiceError(wrapper)).toBe(serviceError);
  });

  it('returns undefined for an error without the envelope', () => {
    expect(findProfileServiceError(new Error('network'))).toBeUndefined();
    expect(findProfileServiceError(undefined)).toBeUndefined();
    expect(findProfileServiceError('403')).toBeUndefined();
  });

  it('stops walking a cyclic cause chain', () => {
    const first = new Error('first');
    const second = new Error('second');
    (first as Error & { cause?: unknown }).cause = second;
    (second as Error & { cause?: unknown }).cause = first;

    expect(findProfileServiceError(first)).toBeUndefined();
  });
});
