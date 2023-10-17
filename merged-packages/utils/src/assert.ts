import type { Struct } from 'superstruct';
import { assert as assertSuperstruct } from 'superstruct';

import { getErrorMessage } from './errors';

export type AssertionErrorConstructor =
  | (new (args: { message: string }) => Error)
  | ((args: { message: string }) => Error);

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
 * Attempts to obtain the message from a possible error object. If it is
 * possible to do so, any trailing period will be removed from the message;
 * otherwise an empty string is returned.
 *
 * @param error - The error object to get the message from.
 * @returns The message without any trailing period if `error` is an object
 * with a `message` property; the string version of `error` without any trailing
 * period if it is not `undefined` or `null`; otherwise an empty string.
 */
function getErrorMessageWithoutTrailingPeriod(error: unknown): string {
  // We'll add our own period.
  return getErrorMessage(error).replace(/\.$/u, '');
}

/**
 * Initialise an {@link AssertionErrorConstructor} error.
 *
 * @param ErrorWrapper - The error class to use.
 * @param message - The error message.
 * @returns The error object.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
export function assertStruct<Type, Schema>(
  value: unknown,
  struct: Struct<Type, Schema>,
  errorPrefix = 'Assertion failed',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ErrorWrapper: AssertionErrorConstructor = AssertionError,
): asserts value is Type {
  try {
    assertSuperstruct(value, struct);
  } catch (error) {
    throw getError(
      ErrorWrapper,
      `${errorPrefix}: ${getErrorMessageWithoutTrailingPeriod(error)}.`,
    );
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
