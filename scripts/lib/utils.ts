// These functions are copied from `@metamask/utils` to avoid issues with
// non-erasable syntax in that package.
// See: https://github.com/MetaMask/core/pull/10784

import fs from 'fs/promises';
import { dirname } from 'path';
import { ErrorWithCause } from 'pony-cause';

/**
 * Any JSON-compatible value.
 */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [prop: string]: Json };

/**
 * A JavaScript object that is not `null`, a function, or an array.
 */
export type RuntimeObject = Record<PropertyKey, unknown>;

/**
 * A type guard for ensuring an object has a property.
 *
 * @param objectToCheck - The object to check.
 * @param name - The property name to check for.
 * @returns Whether the specified object has an own property with the specified
 * name, regardless of whether it is enumerable or not.
 */
export const hasProperty = <
  // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types -- `Object` is deliberate: it accepts boxed primitives, so callers can pass a string or number. Narrowing to `object` would be a breaking change.
  ObjectToCheck extends Object,
  Property extends PropertyKey,
>(
  objectToCheck: ObjectToCheck,
  name: Property,
): objectToCheck is ObjectToCheck &
  Record<
    Property,
    Property extends keyof ObjectToCheck ? ObjectToCheck[Property] : unknown
  > => Object.hasOwnProperty.call(objectToCheck, name);

/**
 * A type guard for {@link RuntimeObject}.
 *
 * @param value - The value to check.
 * @returns Whether the specified value has a runtime type of `object` and is
 * neither `null` nor an `Array`.
 */
export function isObject(value: unknown): value is RuntimeObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard for "nullishness".
 *
 * @param value - Any value.
 * @returns `true` if the value is null or undefined, `false` otherwise.
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Type guard for determining whether the given value is an instance of Error.
 * For errors generated via `fs.promises`, `error instanceof Error` won't work,
 * so we have to come up with another way of testing.
 *
 * @param error - The object to check.
 * @returns A boolean.
 */
function isError(error: unknown): error is Error {
  return (
    error instanceof Error ||
    (isObject(error) && error.constructor.name === 'Error')
  );
}

/**
 * Type guard for determining whether the given value is an error object with a
 * `code` property such as the type of error that Node throws for filesystem
 * operations, etc.
 *
 * @param error - The object to check.
 * @returns A boolean.
 */
export function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Type guard for determining whether the given value is an error object with a
 * `message` property, such as an instance of Error.
 *
 * @param error - The object to check.
 * @returns A boolean.
 */
export function isErrorWithMessage(
  error: unknown,
): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
}

/**
 * Builds a new error object, linking it to the original error via the `cause`
 * property if it is an Error.
 *
 * This function is useful to reframe error messages in general, but is
 * _critical_ when interacting with any of Node's filesystem functions as
 * provided via `fs.promises`, because these do not produce stack traces in the
 * case of an I/O error (see <https://github.com/nodejs/node/issues/30944>).
 *
 * @param originalError - The error to be wrapped (something throwable).
 * @param message - The desired message of the new error.
 * @returns A new error object.
 */
export function wrapError<Throwable>(
  originalError: Throwable,
  message: string,
): Error & { code?: string } {
  if (isError(originalError)) {
    let error: Error & { code?: string };
    if (Error.length === 2) {
      error = new Error(message, { cause: originalError });
    } else {
      error = new ErrorWithCause(message, { cause: originalError });
    }

    if (isErrorWithCode(originalError)) {
      error.code = originalError.code;
    }

    return error;
  }

  if (message.length > 0) {
    return new Error(`${String(originalError)}: ${message}`);
  }

  return new Error(String(originalError));
}

/**
 * Attempts to obtain the message from a possible error object, defaulting to an
 * empty string if it is impossible to do so.
 *
 * @param error - The possible error to get the message from.
 * @returns The message if `error` is an object with a `message` property;
 * the string version of `error` if it is not `undefined` or `null`; otherwise
 * an empty string.
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error) && typeof error.message === 'string') {
    return error.message;
  }

  if (isNullOrUndefined(error)) {
    return '';
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Stringifying an arbitrary value is the documented fallback here, so `[object Object]` is an accepted result rather than a mistake.
  return String(error);
}

/**
 * Test the given path to determine whether it represents a file.
 *
 * @param filePath - The path to a (supposed) file on the filesystem.
 * @returns A promise for true if the file exists or false otherwise.
 * @throws An error with a stack trace if reading fails in any way.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      return false;
    }

    throw wrapError(error, `Could not determine if file exists '${filePath}'`);
  }
}

/**
 * Read the file at the given path, assuming its content is encoded as UTF-8.
 *
 * @param filePath - The path to the file.
 * @returns The content of the file.
 * @throws An error with a stack trace if reading fails in any way.
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw wrapError(error, `Could not read file '${filePath}'`);
  }
}

/**
 * Read the assumed JSON file at the given path, attempts to parse it, and
 * get the resulting object. Supports a custom parser (in case you want to
 * use the [JSON5](https://www.npmjs.com/package/json5) package instead).
 *
 * @param filePath - The path segments pointing to the JSON file. Will be passed
 * to path.join().
 * @param options - Options to this function.
 * @param options.parser - The parser object to use. Defaults to `JSON`.
 * @param options.parser.parse - A function that parses JSON data.
 * @returns The object corresponding to the parsed JSON file, typed against the
 * struct.
 * @throws An error with a stack trace if reading fails in any way, or if the
 * parsed value is not a plain object.
 */
export async function readJsonFile<Value extends Json>(
  filePath: string,
  {
    parser = JSON,
  }: {
    parser?: {
      parse: (
        text: Parameters<typeof JSON.parse>[0],
      ) => ReturnType<typeof JSON.parse>;
    };
  } = {},
): Promise<Value> {
  try {
    const content = await fs.readFile(filePath, 'utf8');

    // oxlint-disable-next-line typescript/no-unsafe-return
    return parser.parse(content);
  } catch (error) {
    throw wrapError(error, `Could not read JSON file '${filePath}'`);
  }
}

/**
 * Write content to the file at the given path, creating the directory structure
 * for the file automatically if necessary.
 *
 * @param filePath - The path to the file.
 * @param content - The new content of the file.
 * @throws An error with a stack trace if writing fails in any way.
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  try {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  } catch (error) {
    throw wrapError(error, `Could not write file '${filePath}'`);
  }
}
