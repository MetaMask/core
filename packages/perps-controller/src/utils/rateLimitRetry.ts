import { hasProperty, isObject } from '@metamask/utils';

import { ensureError } from './errorUtils.js';
import { wait } from './wait.js';

// Charts, history and pre-order reads share HyperLiquid's per-IP REST weight
// budget, so a burst elsewhere can rate-limit the reads an order depends on.
// A short, jittered retry lets the order go through once the budget refills
// instead of failing on a transient 429.
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

/**
 * Detect a HyperLiquid rate-limit rejection. The SDK's HttpRequestError
 * carries the response; other layers only keep the "429 ..." message.
 *
 * @param error - The caught error.
 * @returns True when the request was rejected with HTTP 429.
 */
export function isRateLimitError(error: unknown): boolean {
  if (
    isObject(error) &&
    hasProperty(error, 'response') &&
    isObject(error.response) &&
    error.response.status === 429
  ) {
    return true;
  }
  const lower = ensureError(error).message.toLowerCase();
  return /\b429\b/u.test(lower) || lower.includes('too many requests');
}

/**
 * Run a read and retry it with full-jitter exponential backoff while it is
 * rate-limited. Any other error, or a 429 after the last retry, is rethrown.
 *
 * @param read - The request to run.
 * @returns The read's result.
 */
export async function withRateLimitRetry<Result>(
  read: () => Promise<Result>,
): Promise<Result> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRateLimitError(error)) {
        throw error;
      }
      await wait(Math.random() * BASE_DELAY_MS * 2 ** attempt);
    }
  }
}
