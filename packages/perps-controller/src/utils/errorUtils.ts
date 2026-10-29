/**
 * Utility functions for error handling across Perps controller code.
 * Includes generic error helpers and Perps error classification helpers.
 */
import { hasProperty } from '@metamask/utils';

import { PerpsControllerError } from '../errors.js';
import type { HyperLiquidErrorDetails } from '../errors.js';
import { isPerpsErrorCode, PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import { hasErrorInCauseChain } from '../services/causeChain.js';

const HYPERLIQUID_ERROR_MAPPINGS: readonly {
  pattern: RegExp;
  code: HyperLiquidErrorDetails['code'];
}[] = [
  {
    pattern:
      /isolated position does not have sufficient margin available to decrease leverage|cannot reduce.*leverage|leverage reduction/iu,
    code: PERPS_ERROR_CODES.ORDER_LEVERAGE_REDUCTION_FAILED,
  },
  {
    pattern: /multi-sig required|multisig required/iu,
    code: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
  },
  {
    pattern: /must deposit before performing actions/iu,
    code: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
  },
  {
    pattern: /invalid nonce/iu,
    code: PERPS_ERROR_CODES.EXCHANGE_INVALID_NONCE,
  },
  {
    pattern:
      /order(?: \d+)?: order must have minimum value|order must have minimum value/iu,
    code: PERPS_ERROR_CODES.ORDER_SIZE_MIN,
  },
  {
    pattern: /timeout|timed out/iu,
    code: PERPS_ERROR_CODES.CONNECTION_TIMEOUT,
  },
  {
    pattern: /service unavailable|503|temporarily unavailable/iu,
    code: PERPS_ERROR_CODES.SERVICE_UNAVAILABLE,
  },
  {
    pattern: /network error|fetch failed|connection failed/iu,
    code: PERPS_ERROR_CODES.NETWORK_ERROR,
  },
  {
    pattern: /rate limit|too many requests|throttl/iu,
    code: PERPS_ERROR_CODES.RATE_LIMIT_EXCEEDED,
  },
  {
    pattern: /margin available|not enough margin|insufficient margin/iu,
    code: PERPS_ERROR_CODES.INSUFFICIENT_MARGIN,
  },
  {
    pattern: /insufficient balance|not enough balance/iu,
    code: PERPS_ERROR_CODES.INSUFFICIENT_BALANCE,
  },
  {
    pattern: /reduce only|reduce-only|reduceOnly/iu,
    code: PERPS_ERROR_CODES.REDUCE_ONLY_VIOLATION,
  },
  {
    pattern: /position would flip|would flip position/iu,
    code: PERPS_ERROR_CODES.POSITION_WOULD_FLIP,
  },
  {
    pattern: /no position found/iu,
    code: PERPS_ERROR_CODES.POSITION_NOT_FOUND,
  },
  {
    pattern: /slippage|price moved too much/iu,
    code: PERPS_ERROR_CODES.SLIPPAGE_EXCEEDED,
  },
  {
    pattern:
      /could not immediately match|insufficient liquidity|no liquidity|IOC.*cancel/iu,
    code: PERPS_ERROR_CODES.IOC_CANCEL,
  },
  {
    pattern: /order rejected|rejected order/iu,
    code: PERPS_ERROR_CODES.ORDER_REJECTED,
  },
];

/**
 * Detects expected cancellation/abort errors that should not be reported to Sentry.
 * These occur during normal navigation or view teardown when in-flight fetch requests
 * are cancelled via AbortController.
 *
 * @param error - The error to check.
 * @returns True if the error is an expected abort/cancellation.
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.includes('signal is aborted') ||
      error.message.includes('The operation was aborted')
    );
  }
  return false;
}

/**
 * Detects keyring-locked errors, including SDK-wrapped errors that preserve the
 * original error in `cause`.
 *
 * @param error - The error to check.
 * @returns True if any error in the cause chain is KEYRING_LOCKED.
 */
export function isKeyringLockedError(error: unknown): boolean {
  return hasErrorInCauseChain(
    error,
    (current) => current.message === PERPS_ERROR_CODES.KEYRING_LOCKED,
  );
}

/**
 * Ensures we have a proper Error object for logging.
 * Converts unknown/string errors to proper Error instances.
 * Handles undefined/null specially for better Sentry context.
 *
 * @param error - The caught error (could be Error, string, or unknown)
 * @param context - Optional context string to help identify the source of the error
 * @returns A proper Error instance
 */
export function ensureError(error: unknown, context?: string): Error {
  if (error instanceof Error) {
    return error;
  }
  // Handle undefined/null specifically for better error context
  // e.g. Hyperliquid SDK may reject with undefined when AbortSignal.reason is not set
  if (error === undefined || error === null) {
    const baseMessage = 'Unknown error (no details provided)';
    return new Error(context ? `${baseMessage} [${context}]` : baseMessage);
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error(
    typeof error === 'object' && error !== null && hasProperty(error, 'message')
      ? String(error.message)
      : 'Unknown error',
  );
}

/**
 * Hyperliquid rejects user-scoped exchange writes (`agentSetAbstraction`,
 * `setReferrer`, ...) with this exact message when the
 * wallet has never funded a Hyperliquid account. It is a benign pre-account
 * state, not an error we should forward to Sentry.
 *
 * @param error - The caught error.
 * @returns True if the error matches the Hyperliquid "user not on chain yet" rejection.
 */
export function isHyperLiquidUserNotFoundError(error: unknown): boolean {
  const lower = ensureError(error).message.toLowerCase();
  return (
    lower.includes('user or api wallet') && lower.includes('does not exist')
  );
}

/**
 * Hyperliquid rejects every single-signer exchange write for an account that
 * has been converted to multi-sig (`ApiRequestError: Multi-sig required`).
 * MetaMask signs Perps actions with a single agent/user wallet, so this is a
 * permanent account-shape condition rather than a failure we should retry or
 * forward to Sentry. Only the hyphenated spelling has been observed from the
 * venue; the unhyphenated variant is matched defensively.
 *
 * @param error - The caught error.
 * @returns True if the error indicates multi-sig signing is required.
 */
export function isHyperLiquidMultiSigRequiredError(error: unknown): boolean {
  const lower = ensureError(error).message.toLowerCase();
  return (
    lower.includes('multi-sig required') || lower.includes('multisig required')
  );
}

/**
 * Normalize a Hyperliquid failure into the stable error contract exposed to
 * clients.
 *
 * Known venue messages receive actionable codes. Unknown messages are replaced
 * by `UNKNOWN_ERROR`, while every newly normalized error keeps the original
 * failure in `cause` for telemetry and debugging.
 *
 * @param error - Failure thrown by Hyperliquid or its SDK.
 * @returns A structured error safe to expose through provider results.
 */
export function normalizeHyperLiquidError(
  error: unknown,
): PerpsControllerError {
  if (error instanceof PerpsControllerError) {
    return error;
  }

  const cause = ensureError(error, 'normalizeHyperLiquidError');
  let errorCode: HyperLiquidErrorDetails['code'] | undefined;

  if (isHyperLiquidUserNotFoundError(cause)) {
    errorCode = PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND;
  } else if (
    isPerpsErrorCode(cause.message) &&
    cause.message !== PERPS_ERROR_CODES.PRICE_MOVED
  ) {
    errorCode = cause.message;
  } else {
    errorCode = HYPERLIQUID_ERROR_MAPPINGS.find(({ pattern }) =>
      pattern.test(cause.message),
    )?.code;
  }

  const normalizedCode = errorCode ?? PERPS_ERROR_CODES.UNKNOWN_ERROR;
  return new PerpsControllerError(
    normalizedCode,
    normalizedCode,
    {
      code: normalizedCode,
      provider: 'hyperliquid',
    },
    { cause },
  );
}
