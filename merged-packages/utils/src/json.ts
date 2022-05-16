import deepEqual from 'fast-deep-equal';
import { hasProperty } from './misc';

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
 * Type guard for {@link Json}.
 *
 * @param value - The value to check.
 * @returns Whether the value is valid JSON.
 */
export function isValidJson(value: unknown): value is Json {
  try {
    return deepEqual(value, JSON.parse(JSON.stringify(value)));
  } catch (_) {
    return false;
  }
}

/**
 * The string '2.0'.
 */
export const jsonrpc2 = '2.0' as const;

/**
 * A String specifying the version of the JSON-RPC protocol.
 * MUST be exactly "2.0".
 */
export type JsonRpcVersion2 = typeof jsonrpc2;

/**
 * An identifier established by the Client that MUST contain a String, Number,
 * or NULL value if included. If it is not included it is assumed to be a
 * notification. The value SHOULD normally not be Null and Numbers SHOULD
 * NOT contain fractional parts.
 */
export type JsonRpcId = number | string | null;

/**
 * A JSON-RPC error object.
 */
export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
  stack?: string;
};

/**
 * A JSON-RPC request object.
 *
 * @template Params - The type of the params.
 */
export type JsonRpcRequest<Params> = {
  id: JsonRpcId;
  jsonrpc: JsonRpcVersion2;
  method: string;
  params?: Params;
};

/**
 * A JSON-RPC notification object.
 *
 * @template Params - The type of the params.
 */
export type JsonRpcNotification<Params> = {
  jsonrpc: JsonRpcVersion2;
  method: string;
  params?: Params;
};

/**
 * Type guard to narrow a JSON-RPC request or notification object to a
 * notification.
 *
 * @param requestOrNotification - The JSON-RPC request or notification to check.
 * @returns Whether the specified JSON-RPC message is a notification.
 */
export function isJsonRpcNotification<T>(
  requestOrNotification: JsonRpcNotification<T> | JsonRpcRequest<T>,
): requestOrNotification is JsonRpcNotification<T> {
  return !hasProperty(requestOrNotification, 'id');
}

/**
 * Assertion type guard to narrow a JSON-RPC request or notification object to a
 * notification.
 *
 * @param requestOrNotification - The JSON-RPC request or notification to check.
 */
export function assertIsJsonRpcNotification<T>(
  requestOrNotification: JsonRpcNotification<T> | JsonRpcRequest<T>,
): asserts requestOrNotification is JsonRpcNotification<T> {
  if (!isJsonRpcNotification(requestOrNotification)) {
    throw new Error('Not a JSON-RPC notification.');
  }
}

/**
 * Type guard to narrow a JSON-RPC request or notification object to a request.
 *
 * @param requestOrNotification - The JSON-RPC request or notification to check.
 * @returns Whether the specified JSON-RPC message is a request.
 */
export function isJsonRpcRequest<T>(
  requestOrNotification: JsonRpcNotification<T> | JsonRpcRequest<T>,
): requestOrNotification is JsonRpcRequest<T> {
  return hasProperty(requestOrNotification, 'id');
}

/**
 * Assertion type guard to narrow a JSON-RPC request or notification object to a
 * request.
 *
 * @param requestOrNotification - The JSON-RPC request or notification to check.
 */
export function assertIsJsonRpcRequest<T>(
  requestOrNotification: JsonRpcNotification<T> | JsonRpcRequest<T>,
): asserts requestOrNotification is JsonRpcRequest<T> {
  if (!isJsonRpcRequest(requestOrNotification)) {
    throw new Error('Not a JSON-RPC request.');
  }
}

/**
 * A successful JSON-RPC response object.
 *
 * @template Result - The type of the result.
 */
export type JsonRpcSuccess<Result = unknown> = {
  id: JsonRpcId;
  jsonrpc: JsonRpcVersion2;
  result: Result;
};

/**
 * A failed JSON-RPC response object.
 */
export type JsonRpcFailure = {
  id: JsonRpcId;
  jsonrpc: JsonRpcVersion2;
  error: JsonRpcError;
};

/**
 * A JSON-RPC response object. Must be checked to determine whether it's a
 * success or failure.
 *
 * @template Result - The type of the result.
 */
export type JsonRpcResponse<Result = unknown> =
  | JsonRpcSuccess<Result>
  | JsonRpcFailure;

/**
 * Type guard to narrow a JsonRpcResponse object to a success (or failure).
 *
 * @param response - The response object to check.
 * @returns Whether the response object is a success, i.e. has a `result`
 * property.
 */
export function isJsonRpcSuccess<Result>(
  response: JsonRpcResponse<Result>,
): response is JsonRpcSuccess<Result> {
  return hasProperty(response, 'result');
}

/**
 * Type assertion to narrow a JsonRpcResponse object to a success (or failure).
 *
 * @param response - The response object to check.
 */
export function assertIsJsonRpcSuccess<T>(
  response: JsonRpcResponse<T>,
): asserts response is JsonRpcSuccess<T> {
  if (!isJsonRpcSuccess(response)) {
    throw new Error('Not a successful JSON-RPC response.');
  }
}

/**
 * Type guard to narrow a JsonRpcResponse object to a failure (or success).
 *
 * @param response - The response object to check.
 * @returns Whether the response object is a failure, i.e. has an `error`
 * property.
 */
export function isJsonRpcFailure(
  response: JsonRpcResponse<unknown>,
): response is JsonRpcFailure {
  return hasProperty(response, 'error');
}

/**
 * Type assertion to narrow a JsonRpcResponse object to a failure (or success).
 *
 * @param response - The response object to check.
 */
export function assertIsJsonRpcFailure(
  response: JsonRpcResponse<unknown>,
): asserts response is JsonRpcFailure {
  if (!isJsonRpcFailure(response)) {
    throw new Error('Not a failed JSON-RPC response.');
  }
}

type JsonRpcValidatorOptions = {
  permitEmptyString?: boolean;
  permitFractions?: boolean;
  permitNull?: boolean;
};

/**
 * Gets a function for validating JSON-RPC request / response `id` values.
 *
 * By manipulating the options of this factory, you can control the behavior
 * of the resulting validator for some edge cases. This is useful because e.g.
 * `null` should sometimes but not always be permitted.
 *
 * Note that the empty string (`''`) is always permitted by the JSON-RPC
 * specification, but that kind of sucks and you may want to forbid it in some
 * instances anyway.
 *
 * For more details, see the
 * [JSON-RPC Specification](https://www.jsonrpc.org/specification).
 *
 * @param options - An options object.
 * @param options.permitEmptyString - Whether the empty string (i.e. `''`)
 * should be treated as a valid ID. Default: `true`
 * @param options.permitFractions - Whether fractional numbers (e.g. `1.2`)
 * should be treated as valid IDs. Default: `false`
 * @param options.permitNull - Whether `null` should be treated as a valid ID.
 * Default: `true`
 * @returns The JSON-RPC ID validator function.
 */
export function getJsonRpcIdValidator(options?: JsonRpcValidatorOptions) {
  const { permitEmptyString, permitFractions, permitNull } = {
    permitEmptyString: true,
    permitFractions: false,
    permitNull: true,
    ...options,
  };

  /**
   * Type guard for {@link JsonRpcId}.
   *
   * @param id - The JSON-RPC ID value to check.
   * @returns Whether the given ID is valid per the options given to the
   * factory.
   */
  const isValidJsonRpcId = (id: unknown): id is JsonRpcId => {
    return Boolean(
      (typeof id === 'number' && (permitFractions || Number.isInteger(id))) ||
        (typeof id === 'string' && (permitEmptyString || id.length > 0)) ||
        (permitNull && id === null),
    );
  };
  return isValidJsonRpcId;
}
