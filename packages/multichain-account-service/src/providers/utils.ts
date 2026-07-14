import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
} from '@metamask/keyring-controller';

/** Timeout error. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Check if an error is a `TimeoutError`.
 *
 * @param error - The error to check.
 * @returns `true` if the error is a `TimeoutError`, otherwise `false`.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Check if an error is a `KeyringControllerLockedError`.
 *
 * @param error - The error to check.
 * @returns `true` if the error is a `KeyringControllerLockedError`, otherwise `false`.
 */
export function isKeyringControllerLockedError(error: unknown): boolean {
  return (
    error instanceof KeyringControllerError &&
    error.message === KeyringControllerErrorMessage.ControllerLocked
  );
}

/**
 * Execute a function with exponential backoff on transient failures.
 *
 * @param fnToExecute - The function to execute.
 * @param options - The options for the retry.
 * @param options.maxAttempts - The maximum number of attempts.
 * @param options.backOffMs - The backoff in milliseconds.
 * @throws An error if the transaction count cannot be retrieved.
 * @returns The result of the function.
 */
export async function withRetry<T>(
  fnToExecute: () => Promise<T>,
  {
    maxAttempts = 3,
    backOffMs = 500,
  }: { maxAttempts?: number; backOffMs?: number } = {},
): Promise<T> {
  let lastError;
  let backOff = backOffMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fnToExecute();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      const delay = backOff;
      await new Promise((resolve) => setTimeout(resolve, delay));
      backOff *= 2;
    }
  }
  throw lastError;
}

/**
 * Execute a promise with a timeout.
 *
 * @param fn - A callback that returns the promise to execute.
 * @param timeoutMs - The timeout in milliseconds.
 * @returns The result of the promise.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 500,
): Promise<T> {
  let timer;
  try {
    return await Promise.race<T>([
      fn(),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new TimeoutError(`Timed out after: ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
