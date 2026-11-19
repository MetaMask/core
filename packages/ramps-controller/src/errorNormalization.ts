/**
 * A typed error surface: a stable code plus an optional human message and
 * structured details. Consumers parameterise `Code` with their own error-code
 * union (e.g. headless-buy codes) so the taxonomy stays with the consumer while
 * the pure extraction below is shared.
 */
export type TypedError<Code extends string> = {
  code: Code;
  message?: string;
  details?: Record<string, unknown>;
};

/**
 * Type guard for a non-null object.
 *
 * @param value - The value to test.
 * @returns Whether the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Best-effort human-readable message from an arbitrary thrown/native value.
 *
 * @param error - The caught value.
 * @returns The message, or `undefined` when none can be derived.
 */
export function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return undefined;
}

/**
 * Extracts a caller-recognised typed error from an arbitrary thrown/native
 * value, when the value carries an explicit, valid code on one of the given
 * properties. Pure: performs no side effects and applies no fallback, so
 * callers keep full control over precedence (e.g. domain-specific special
 * cases) and the fallback code.
 *
 * @param error - The caught value.
 * @param options - The options.
 * @param options.isValidCode - Type guard identifying a recognised code.
 * @param options.codeProperties - Property names to read a code from, in
 * precedence order. Defaults to `['code']`.
 * @returns The typed error when an explicit valid code is present, else
 * `undefined`.
 */
export function extractExplicitTypedError<Code extends string>(
  error: unknown,
  {
    isValidCode,
    codeProperties = ['code'],
  }: {
    isValidCode: (value: unknown) => value is Code;
    codeProperties?: string[];
  },
): TypedError<Code> | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  for (const property of codeProperties) {
    const candidate = error[property];
    if (isValidCode(candidate)) {
      return {
        code: candidate,
        message: getErrorMessage(error),
        details: isRecord(error.details) ? error.details : undefined,
      };
    }
  }
  return undefined;
}

/**
 * Normalises an arbitrary thrown/native value into a {@link TypedError}, using
 * the caller's recognised codes and falling back to `fallbackCode` when no
 * explicit valid code is present. Pure.
 *
 * @param error - The caught value.
 * @param options - The options.
 * @param options.isValidCode - Type guard identifying a recognised code.
 * @param options.fallbackCode - Code used when no explicit valid code is found.
 * @param options.codeProperties - Property names to read a code from, in
 * precedence order. Defaults to `['code']`.
 * @returns The typed error.
 */
export function normalizeToTypedError<Code extends string>(
  error: unknown,
  {
    isValidCode,
    fallbackCode,
    codeProperties,
  }: {
    isValidCode: (value: unknown) => value is Code;
    fallbackCode: Code;
    codeProperties?: string[];
  },
): TypedError<Code> {
  return (
    extractExplicitTypedError(error, { isValidCode, codeProperties }) ?? {
      code: fallbackCode,
      message: getErrorMessage(error),
    }
  );
}
