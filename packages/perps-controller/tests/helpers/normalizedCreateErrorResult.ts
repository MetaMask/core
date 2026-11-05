import { normalizeHyperLiquidError } from '../../src/utils/errorUtils.js';

/**
 * Test double for `createErrorResult` that uses the real Hyperliquid
 * normalization, so provider tests do not put raw venue text back into results.
 *
 * @param error - Failure passed to the provider result helper.
 * @param defaultResponse - Result fields the caller wants preserved.
 * @returns The normalized failure result.
 */
export function normalizedCreateErrorResult(
  error: unknown,
  defaultResponse: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedError = normalizeHyperLiquidError(error);
  return {
    ...defaultResponse,
    success: false,
    error: normalizedError.message,
    errorCode: normalizedError.errorCode,
    ...(normalizedError.errorDetails === undefined
      ? {}
      : { errorDetails: normalizedError.errorDetails }),
  };
}
