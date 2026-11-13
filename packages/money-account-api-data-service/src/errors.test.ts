import { HttpError } from '@metamask/controller-utils';
import { describe, it, expect } from 'vitest';

import {
  MAX_RESPONSE_BODY_LENGTH,
  MoneyAccountApiHttpError,
  REDACTED_ADDRESS,
} from './errors.js';

const MOCK_ADDRESS = '0x1111111111111111111111111111111111111111';
const MOCK_CHECKSUM_ADDRESS = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';

describe('MoneyAccountApiHttpError', () => {
  it('is an HttpError carrying the status, body, and headers', () => {
    const error = new MoneyAccountApiHttpError({
      status: 500,
      message: 'failed',
      responseBody: 'body',
      responseHeaders: { 'content-type': 'text/plain' },
    });

    expect(error).toBeInstanceOf(HttpError);
    expect(error.name).toBe('MoneyAccountApiHttpError');
    expect(error.message).toBe('failed');
    expect(error.httpStatus).toBe(500);
    expect(error.responseBody).toBe('body');
    expect(error.responseHeaders).toStrictEqual({
      'content-type': 'text/plain',
    });
  });

  it('defaults to no body and no headers', () => {
    const error = new MoneyAccountApiHttpError({ status: 502 });

    expect(error.responseBody).toBeNull();
    expect(error.responseHeaders).toStrictEqual({});
  });

  describe('fromResponse', () => {
    it('redacts every hex address in the body', async () => {
      const response = new Response(
        JSON.stringify({
          message: `Cannot GET /v1/positions/${MOCK_ADDRESS}/interest?vault_address=${MOCK_CHECKSUM_ADDRESS}`,
          error: 'Not Found',
          statusCode: 404,
        }),
        { status: 404 },
      );

      const error = await MoneyAccountApiHttpError.fromResponse(
        response,
        'failed',
      );

      expect(error.httpStatus).toBe(404);
      expect(error.responseBody).toBe(
        JSON.stringify({
          message: `Cannot GET /v1/positions/${REDACTED_ADDRESS}/interest?vault_address=${REDACTED_ADDRESS}`,
          error: 'Not Found',
          statusCode: 404,
        }),
      );
    });

    it('truncates long bodies', async () => {
      const response = new Response('a'.repeat(MAX_RESPONSE_BODY_LENGTH + 1), {
        status: 502,
      });

      const error = await MoneyAccountApiHttpError.fromResponse(
        response,
        'failed',
      );

      expect(error.responseBody).toBe(
        `${'a'.repeat(MAX_RESPONSE_BODY_LENGTH)}…`,
      );
    });

    it('keeps only allowlisted diagnostic headers', async () => {
      const response = new Response('', {
        status: 503,
        headers: {
          'Content-Type': 'text/html',
          'X-Amzn-Trace-Id': 'Root=1-abc',
          'Retry-After': '30',
          'Set-Cookie': 'session=secret',
          'X-Forwarded-For': '203.0.113.1',
        },
      });

      const error = await MoneyAccountApiHttpError.fromResponse(
        response,
        'failed',
      );

      expect(error.responseHeaders).toStrictEqual({
        'content-type': 'text/html',
        'retry-after': '30',
        'x-amzn-trace-id': 'Root=1-abc',
      });
    });

    it('returns a null body when the body cannot be read', async () => {
      const response = new Response('body', { status: 500 });
      await response.text();

      const error = await MoneyAccountApiHttpError.fromResponse(
        response,
        'failed',
      );

      expect(error.responseBody).toBeNull();
      expect(error.httpStatus).toBe(500);
    });
  });
});
