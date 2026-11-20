import { HttpError } from '@metamask/controller-utils';
import { describe, expect, it } from 'vitest';

import { getKycKalshiErrorCode, KycApiError } from './KycApiError.js';
import { KYC_KALSHI_ERROR_CODES } from './types.js';

describe('KycApiError', () => {
  it('is an HttpError that carries the status and the code', () => {
    const error = new KycApiError(
      400,
      'Kalshi refused the signature',
      'kalshi_signed_request_rejected',
    );

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchInlineSnapshot(
      `[KycApiError: Kalshi refused the signature]`,
    );
    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('kalshi_signed_request_rejected');
  });

  it('has no code when kyc-api sent none', () => {
    expect(new KycApiError(500, 'boom').code).toBeUndefined();
  });
});

describe('getKycKalshiErrorCode', () => {
  it.each(KYC_KALSHI_ERROR_CODES)('reads %s from the code', (code) => {
    expect(getKycKalshiErrorCode(new KycApiError(400, 'failed', code))).toBe(
      code,
    );
  });

  it('reads the code from the message of a wrapped failure', () => {
    expect(
      getKycKalshiErrorCode(
        new Error(
          "Fetching 'x' failed with status '412': session_not_in_email_verification",
        ),
      ),
    ).toBe('session_not_in_email_verification');
  });

  it.each([
    ['an unknown code', new KycApiError(400, 'failed', 'something_else')],
    ['a plain error', new Error('network down')],
    ['a string', 'nope'],
    ['nothing', undefined],
    ['null', null],
  ])('finds no code on %s', (_name, error) => {
    expect(getKycKalshiErrorCode(error)).toBeUndefined();
  });
});
