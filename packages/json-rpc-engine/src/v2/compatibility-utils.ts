import { getMessageFromCode, JsonRpcError } from '@metamask/rpc-errors';
import type { Json } from '@metamask/utils';
import { hasProperty, isObject } from '@metamask/utils';
// ATTN: We must NOT use 'klona/full' here because it freezes properties on the clone.
import { klona } from 'klona';

import { MiddlewareContext } from './MiddlewareContext';
import { stringify, type JsonRpcRequest } from './utils';

// Legacy engine compatibility utils

/**
 * Create a deep clone of a value as follows:
 * - Assumes acyclical objects
 * - Does not copy property descriptors (i.e. uses mutable defaults)
 * - Ignores non-enumerable properties
 * - Ignores getters and setters
 *
 * @throws If the value is an object with a circular reference.
 * @param value - The value to clone.
 * @returns The cloned value.
 */
export const deepClone = <T>(value: T): DeepCloned<T> =>
  klona(value) as DeepCloned<T>;

// Matching the default implementation of klona, this type:
// - Removes readonly modifiers
// - Excludes non-enumerable / symbol properties
type DeepCloned<T> = T extends readonly (infer U)[]
  ? DeepCloned<U>[]
  : T extends object
    ? { -readonly [K in keyof T & (string | number)]: DeepCloned<T[K]> }
    : T;

/**
 * Standard JSON-RPC request properties.
 */
export const requestProps = ['jsonrpc', 'method', 'params', 'id'];

/**
 * Make a JSON-RPC request from a legacy request. Clones the params to avoid
 * freezing them, which could cause errors in an involved legacy engine.
 *
 * @param req - The legacy request to make a request from.
 * @returns The JSON-RPC request.
 */
export function fromLegacyRequest<Request extends JsonRpcRequest>(
  req: Request,
): Request {
  const request = {
    jsonrpc: '2.0' as const,
    method: req.method,
  } as Partial<Request>;
  request.id = req.id;
  if (hasProperty(req, 'params') && req.params !== undefined) {
    request.params = deepClone(req.params);
  }
  return request as Request;
}

/**
 * Make a middleware context from a legacy request by copying over all non-JSON-RPC
 * properties from the request to the context object.
 *
 * @param req - The legacy request to make a context from.
 * @returns The middleware context.
 */
export function makeContext<Request extends Record<string | symbol, unknown>>(
  req: Request,
): MiddlewareContext {
  const context = new MiddlewareContext();
  propagateToContext(req, context);
  return context;
}

/**
 * Copies non-JSON-RPC string properties from the request to the context.
 *
 * For compatibility with our problematic practice of appending non-standard
 * fields to requests for inter-middleware communication in the legacy engine.
 *
 * **ATTN:** Only string properties that do not already exist in the context
 * are copied.
 *
 * @param req - The request to propagate the context from.
 * @param context - The context to propagate to.
 */
export function propagateToContext(
  req: Record<string, unknown>,
  context: MiddlewareContext<Record<string, unknown>>,
) {
  Object.keys(req)
    .filter(
      (key) =>
        typeof key === 'string' &&
        !requestProps.includes(key) &&
        !context.has(key),
    )
    .forEach((key) => {
      context.set(key, req[key]);
    });
}

/**
 * Copies non-JSON-RPC string properties from the context to the request.
 *
 * For compatibility with our problematic practice of appending non-standard
 * fields to requests for inter-middleware communication in the legacy engine.
 *
 * **ATTN:** Only string properties are copied.
 *
 * @param req - The request to propagate the context to.
 * @param context - The context to propagate from.
 */
export function propagateToRequest(
  req: Record<string, unknown>,
  context: MiddlewareContext,
) {
  Array.from(context.keys())
    .filter(
      ((key) => typeof key === 'string' && !requestProps.includes(key)) as (
        value: unknown,
      ) => value is string,
    )
    .forEach((key) => {
      req[key] = context.get(key);
    });
}

/**
 * Unserialize an error from a thrown value. Creates a {@link JsonRpcError} if
 * the thrown value is an object with a `code` property. Otherwise, creates a
 * plain {@link Error}.
 *
 * @param thrown - The thrown value to unserialize.
 * @returns The unserialized error.
 */
export function deserializeError(thrown: unknown): Error | JsonRpcError<Json> {
  // @ts-expect-error - New, but preferred if available.
  // See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError
  if (typeof Error.isError === 'function' && Error.isError(thrown)) {
    return thrown as Error;
  }
  // Unlike Error.isError, instanceof does not work for Errors from other realms.
  if (thrown instanceof Error) {
    return thrown;
  }
  if (typeof thrown === 'string') {
    return new Error(thrown);
  }
  if (!isObject(thrown)) {
    return new Error(`Unknown error: ${stringify(thrown)}`);
  }

  const code =
    typeof thrown.code === 'number' && Number.isInteger(thrown.code)
      ? thrown.code
      : undefined;

  let message = 'Unknown error';
  if (typeof thrown.message === 'string') {
    message = thrown.message;
  } else if (typeof code === 'number') {
    message = getMessageFromCode(code, message);
  }

  const { stack, cause, data } = thrown;

  const error =
    code === undefined
      ? // Jest complains if we use the `@ts-expect-error` directive here.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Our error type is outdated.
        new Error(message, { cause })
      : new JsonRpcError(code, message, {
          ...(isObject(data) ? data : undefined),
          cause,
        });

  if (typeof stack === 'string') {
    error.stack = stack;
  }

  return error;
}
