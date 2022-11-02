import { assert as assertSuperstruct, Struct } from 'superstruct';

export type AssertionErrorConstructor =
  | (new (args: { message: string }) => Error)
  | ((args: { message: string }) => Error);

/**
 * Type guard for determining whether the given value is an error object with a
 * `message` property, such as an instance of Error.
 *
 * @param error - The object to check.
 * @returns True or false, depending on the result.
 */
function isErrorWithMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
}

/**
 * Check if a value is a constructor, i.e., a function that can be called with
 * the `new` keyword.
 *
 * @param fn - The value to check.
 * @returns `true` if the value is a constructor, or `false` otherwise.
 */
function isConstructable(
  fn: AssertionErrorConstructor,
): fn is new (args: { message: string }) => Error {
  /* istanbul ignore next */
  return Boolean(typeof fn?.prototype?.constructor?.name === 'string');
}

/**
 * Get the error message from an unknown error object. If the error object has
 * a `message` property, that property is returned. Otherwise, the stringified
 * error object is returned.
 *
 * @param error - The error object to get the message from.
 * @returns The error message.
 */
function getErrorMessage(error: unknown): string {
  const message = isErrorWithMessage(error) ? error.message : String(error);

  // If the error ends with a period, remove it, as we'll add our own period.
  if (message.endsWith('.')) {
    return message.slice(0, -1);
  }

  return message;
}

/**
 * Initialise an {@link AssertionErrorConstructor} error.
 *
 * @param ErrorWrapper - The error class to use.
 * @param message - The error message.
 * @returns The error object.
 */
function getError(ErrorWrapper: AssertionErrorConstructor, message: string) {
  if (isConstructable(ErrorWrapper)) {
    return new ErrorWrapper({
      message,
    });
  }
  return ErrorWrapper({
    message,
  });
}

/**
 * The default error class that is thrown if an assertion fails.
 */
export class AssertionError extends Error {
  readonly code = 'ERR_ASSERTION';

  constructor(options: { message: string }) {
    super(options.message);
  }
}

/**
 * Same as Node.js assert.
 * If the value is falsy, throws an error, does nothing otherwise.
 *
 * @throws {@link AssertionError} If value is falsy.
 * @param value - The test that should be truthy to pass.
 * @param message - Message to be passed to {@link AssertionError} or an
 * {@link Error} instance to throw.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}. If a custom error class is provided for
 * the `message` argument, this argument is ignored.
 */
export function assert(
  value: any,
  message: string | Error = 'Assertion failed.',
  ErrorWrapper: AssertionErrorConstructor = AssertionError,
): asserts value {
  if (!value) {
    if (message instanceof Error) {
      throw message;
    }

    throw getError(ErrorWrapper, message);
  }
}

/**
 * Assert a value against a Superstruct struct.
 *
 * @param value - The value to validate.
 * @param struct - The struct to validate against.
 * @param errorPrefix - A prefix to add to the error message. Defaults to
 * "Assertion failed".
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the value is not valid.
 */
export function assertStruct<T, S>(
  value: unknown,
  struct: Struct<T, S>,
  errorPrefix = 'Assertion failed',
  ErrorWrapper: AssertionErrorConstructor = AssertionError,
): asserts value is T {
  try {
    assertSuperstruct(value, struct);
  } catch (error) {
    throw getError(ErrorWrapper, `${errorPrefix}: ${getErrorMessage(error)}.`);
  }
}

/**
 * Use in the default case of a switch that you want to be fully exhaustive.
 * Using this function forces the compiler to enforce exhaustivity during
 * compile-time.
 *
 * @example
 * ```
 * const number = 1;
 * switch (number) {
 *   case 0:
 *     ...
 *   case 1:
 *     ...
 *   default:
 *     assertExhaustive(snapPrefix);
 * }
 * ```
 * @param _object - The object on which the switch is being operated.
 */
export function assertExhaustive(_object: never): never {
  throw new Error(
    'Invalid branch reached. Should be detected during compilation.',
  );
}
