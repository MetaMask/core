import { HttpError } from '@metamask/controller-utils';
import { FetchError } from 'node-fetch';

import { classifyRetryReason } from '../create-network-client';

describe('classifyRetryReason', () => {
  it('returns "connection_failed" for FetchError connection failures', () => {
    const error = new FetchError(
      'request to https://example.com failed, reason: connect ECONNREFUSED',
      'system',
    );
    expect(classifyRetryReason(error)).toBe('connection_failed');
  });

  it('returns "connection_failed" for TypeError network errors', () => {
    const error = new TypeError('Failed to fetch');
    expect(classifyRetryReason(error)).toBe('connection_failed');
  });

  it('returns "response_not_json" for SyntaxError (invalid JSON)', () => {
    const error = new SyntaxError('Unexpected token < in JSON');
    expect(classifyRetryReason(error)).toBe('response_not_json');
  });

  it('returns "response_not_json" for "invalid json" error messages', () => {
    const error = new Error('invalid json response body');
    expect(classifyRetryReason(error)).toBe('response_not_json');
  });

  it.each([502, 503, 504])(
    'returns "non_successful_http_status" for %i errors',
    (status) => {
      expect(classifyRetryReason(new HttpError(status))).toBe(
        'non_successful_http_status',
      );
    },
  );

  it('returns "timed_out" for ETIMEDOUT errors', () => {
    const error = new Error('timed out');
    Object.assign(error, { code: 'ETIMEDOUT' });
    expect(classifyRetryReason(error)).toBe('timed_out');
  });

  it('returns "connection_reset" for ECONNRESET errors', () => {
    const error = new Error('connection reset');
    Object.assign(error, { code: 'ECONNRESET' });
    expect(classifyRetryReason(error)).toBe('connection_reset');
  });

  it('returns "unknown" for unrecognized Error instances', () => {
    expect(classifyRetryReason(new Error('something else'))).toBe('unknown');
  });

  it('returns "unknown" for non-Error values', () => {
    expect(classifyRetryReason('a string')).toBe('unknown');
    expect(classifyRetryReason(42)).toBe('unknown');
    expect(classifyRetryReason(null)).toBe('unknown');
    expect(classifyRetryReason(undefined)).toBe('unknown');
  });
});
