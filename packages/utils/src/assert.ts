import { getErrorMessage } from '@metamask/error-utils';
import type { Struct } from '@metamask/superstruct';
import { assert as assertSuperstruct } from '@metamask/superstruct';
import type { AssertionErrorConstructor } from '@metamask/type-utils';
import { AssertionError, getAssertionError } from '@metamask/type-utils';

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
  ErrorWrapper: AssertionErrorConstructor = AssertionError,
): asserts value is Type {
  try {
    assertSuperstruct(value, struct);
  } catch (error) {
    throw getAssertionError(
      ErrorWrapper,
      `${errorPrefix}: ${getErrorMessageWithoutTrailingPeriod(error)}.`,
    );
  }
}
