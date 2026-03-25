import { logErrorAs } from './logger';
import { isTimeoutError } from './providers/utils';
import { createSentryError } from './utils';

/**
 * Reports an error by logging it and optionally capturing it in Sentry.
 *
 * Timeout errors are treated as warnings (not reported to Sentry). All other
 * errors are logged as errors and captured via `captureException`.
 *
 * @param messenger - Object with an optional `captureException` method.
 * @param messenger.captureException - Optional method to capture exceptions in Sentry.
 * @param message - The static message describing what failed.
 * @param error - The caught error.
 * @param context - Optional context to attach to the Sentry error.
 */
export function reportError(
  messenger: { captureException?: (error: Error) => void },
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (isTimeoutError(error)) {
    logErrorAs('warn', message, error);
    console.warn(message, error);
  } else {
    logErrorAs('error', message, error);
    console.error(message, error);

    const sentryError = createSentryError(message, error as Error, context);
    messenger.captureException?.(sentryError);
  }
}
