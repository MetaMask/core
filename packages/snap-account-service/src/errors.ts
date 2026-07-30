import { isKeyringControllerError } from '@metamask/keyring-controller';

/**
 * Thrown by {@link safe} when the wrapped callback fails with an error
 * whose message is not safe to forward to Sentry (e.g., a superstruct
 * `StructError` that may embed account addresses, or an unknown third-party
 * error). The message on a `SafeError` is always authored by us and contains
 * no user data.
 *
 * `SafeError` instances pass through nested {@link safe} calls unchanged;
 * the innermost step description is preserved rather than re-wrapped.
 */
export class SafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeError';
  }
}

/**
 * Returns `true` if the error is a `SafeError`.
 *
 * Uses duck-typing on `error.name` rather than `instanceof` so that the check
 * remains correct when multiple versions of this package coexist in the
 * dependency tree (different versions produce different classes, so
 * `instanceof` would return `false` for errors from another version).
 *
 * @param error - The value to check.
 * @returns Whether the error is a `SafeError`.
 */
export function isSafeError(error: unknown): error is SafeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'SafeError'
  );
}

/**
 * Duck-typed shape of `@metamask/superstruct`'s `StructError`.
 *
 * We avoid a direct `instanceof` check because `@metamask/superstruct` is not
 * a declared dependency of this package; it reaches us transitively. Checking
 * `name` plus the presence of `path` and `type` is sufficient to identify it
 * without coupling to the transitive dep.
 */
type StructErrorLike = Error & {
  name: 'StructError';
  path: unknown[];
  type: string;
  refinement?: string;
};

/**
 * Returns `true` if the error is a `StructError`-like object.
 *
 * @param error - The value to check.
 * @returns Whether the error is a `StructError`-like object.
 */
function isStructError(error: unknown): error is StructErrorLike {
  const isError = error instanceof Error && error.name === 'StructError';
  if (!isError) {
    return false;
  }

  const structError = error as {
    path?: string[];
    type?: string;
  };
  return (
    Array.isArray(structError.path) && typeof structError.type === 'string'
  );
}

/**
 * Produces a safe, human-readable summary of a superstruct validation failure.
 * Reports only the field path and expected type, never the actual failing
 * value, which may contain account addresses or other user data.
 *
 * @param error - The StructError-like object.
 * @returns A safe description string.
 */
function describeStructFailure(error: StructErrorLike): string {
  const path =
    error.path.length > 0 ? `"${error.path.map(String).join('.')}"` : '<root>';
  return `Validation failed at ${path} (expected: ${error.refinement ?? error.type})`;
}

/**
 * Executes `fn` and, if it throws, sanitizes the error before re-throwing to
 * guarantee the caller always gets an error whose message is safe to forward
 * to Sentry.
 *
 * Sanitization rules applied to whatever `fn` throws:
 * - {@link SafeError}: re-thrown as-is (innermost step description preserved,
 *   no re-wrapping on nested calls).
 * - {@link KeyringControllerError}: re-thrown as-is (uses static, enum-based
 *   messages; no user data).
 * - `StructError` (from `@metamask/superstruct`): wrapped in a
 *   {@link SafeError} containing only the failing field path and expected type,
 *   never the actual value.
 * - Anything else: wrapped in a {@link SafeError} with a generic fallback
 *   message; the original error is discarded to prevent accidental leakage.
 *
 * @param step - Human-readable label for this execution step, prepended to the
 *   `SafeError` message when the error is not already safe.
 * @param fn - The async callback to execute.
 * @returns The result of `fn`.
 */
export async function safe<ReturnType>(
  step: string,
  fn: () => Promise<ReturnType>,
): Promise<ReturnType> {
  try {
    return await fn();
  } catch (error) {
    if (isSafeError(error) || isKeyringControllerError(error)) {
      throw error;
    }
    if (isStructError(error)) {
      throw new SafeError(`${step}: ${describeStructFailure(error)}`);
    }
    throw new SafeError(`${step}: An unexpected error occurred`);
  }
}

/**
 * Augmented `Error` shape produced by {@link createSentryError}. The runtime
 * value carries a `cause` and (optionally) a structured `context` payload
 * that downstream Sentry tooling can read.
 *
 * The `TContext` type parameter narrows the shape of `context` for callers
 * that know what they put in — most useful in tests when asserting on a
 * captured error.
 */
export type SentryError<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> = Error & {
  cause: Error;
  context?: TContext;
};

/**
 * Creates a Sentry error from an error message, an inner error and a context.
 *
 * NOTE: Sentry defaults to a depth of 3 when extracting non-native attributes.
 * As such, the context depth shouldn't be too deep.
 *
 * @param message - The error message to create a Sentry error from.
 * @param innerError - The inner error to create a Sentry error from.
 * @param context - The context to add to the Sentry error.
 * @returns A Sentry error.
 */
export const createSentryError = <
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(
  message: string,
  innerError: Error,
  context?: TContext,
): SentryError<TContext> => {
  const error = new Error(message) as SentryError<TContext>;
  error.cause = innerError;
  if (context) {
    error.context = context;
  }
  return error;
};

/**
 * Reports an error by logging it to the console and optionally capturing it
 * in Sentry via the messenger's `captureException` method.
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
  console.error(message, error);

  const sentryError = createSentryError(message, error as Error, context);
  messenger.captureException?.(sentryError);
}
