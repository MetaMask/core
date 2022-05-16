import type {
  JsonRpcFailure,
  JsonRpcId,
  JsonRpcResponse,
  JsonRpcSuccess,
} from './JsonRpcEngine';

export const hasProperty = (
  object: Object, // eslint-disable-line @typescript-eslint/ban-types
  name: string | number | symbol,
): boolean => Object.hasOwnProperty.call(object, name);

/**
 * ATTN: Assumes that only one of the `result` and `error` properties is
 * present on the `response`, as guaranteed by e.g. `JsonRpcEngine.handle`.
 *
 * Type guard to narrow a JsonRpcResponse object to a success (or failure).
 *
 * @param response - The response object to check.
 * @returns Whether the response object is a success, i.e. has a `result`
 * property.
 */
export function isJsonRpcSuccess<T>(
  response: JsonRpcResponse<T>,
): response is JsonRpcSuccess<T> {
  return hasProperty(response, 'result');
}

/**
 * ATTN: Assumes that only one of the `result` and `error` properties is
 * present on the `response`, as guaranteed by e.g. `JsonRpcEngine.handle`.
 *
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
 * ATTN: Assumes that only one of the `result` and `error` properties is
 * present on the `response`, as guaranteed by e.g. `JsonRpcEngine.handle`.
 *
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
 * ATTN: Assumes that only one of the `result` and `error` properties is
 * present on the `response`, as guaranteed by e.g. `JsonRpcEngine.handle`.
 *
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

interface JsonRpcValidatorOptions {
  permitEmptyString?: boolean;
  permitFractions?: boolean;
  permitNull?: boolean;
}

const DEFAULT_VALIDATOR_OPTIONS: JsonRpcValidatorOptions = {
  permitEmptyString: true,
  permitFractions: false,
  permitNull: true,
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
    ...DEFAULT_VALIDATOR_OPTIONS,
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
