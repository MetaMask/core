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
  // oxlint-disable-next-line typescript/no-unsafe-member-access
  return Boolean(typeof fn?.prototype?.constructor?.name === 'string');
}

/**
 * Initialise an {@link AssertionErrorConstructor} error.
 *
 * @param ErrorWrapper - The error class to use.
 * @param message - The error message.
 * @returns The error object.
 * @internal
 */
export function getAssertionError(
  ErrorWrapper: AssertionErrorConstructor,
  message: string,
): Error {
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
  value: unknown,
  message: string | Error = 'Assertion failed.',
  ErrorWrapper: AssertionErrorConstructor = AssertionError,
): asserts value {
  if (!value) {
    if (message instanceof Error) {
      throw message;
    }

    throw getAssertionError(ErrorWrapper, message);
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
