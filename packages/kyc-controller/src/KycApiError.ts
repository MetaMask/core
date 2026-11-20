import { HttpError } from '@metamask/controller-utils';

import { KYC_KALSHI_ERROR_CODES } from './types.js';
import type { KycKalshiErrorCode } from './types.js';

/**
 * A failed kyc-api call. `code` is the error code kyc-api answered with,
 * when it sent one, so a client can tell a wrong email code from a rejected
 * signature without reading the message.
 */
export class KycApiError extends HttpError {
  readonly code?: string;

  /**
   * Constructs a new {@link KycApiError}.
   *
   * @param status - The HTTP response status.
   * @param message - The error message.
   * @param code - The error code from the response body, when it had one.
   */
  constructor(status: number, message: string, code?: string) {
    super(status, message);
    this.name = 'KycApiError';
    this.code = code;
  }
}

/**
 * Finds the Kalshi relay error code on a failed call. Reads the `code` kyc-api
 * sent, and falls back to the message for a failure that was wrapped on the
 * way.
 *
 * @param error - The failure from a controller call.
 * @returns The code, or `undefined` when the failure carries none.
 */
export function getKycKalshiErrorCode(
  error: unknown,
): KycKalshiErrorCode | undefined {
  const { code, message } = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
  };
  const candidates = [code, message].filter(
    (value): value is string => typeof value === 'string',
  );
  return KYC_KALSHI_ERROR_CODES.find((known) =>
    candidates.some((candidate) => candidate.includes(known)),
  );
}
