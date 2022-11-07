import {
  array,
  define,
  Infer,
  integer,
  is,
  literal,
  nullable,
  number,
  object,
  omit,
  optional,
  record,
  string,
  Struct,
  union,
  unknown,
} from 'superstruct';
import { AssertionErrorConstructor, assertStruct } from './assert';
import {
  calculateNumberSize,
  calculateStringSize,
  isPlainObject,
  JsonSize,
} from './misc';

export const JsonStruct = define<Json>('Json', (value) => {
  const [isValid] = validateJsonAndGetSize(value, true);
  if (!isValid) {
    return 'Expected a valid JSON-serializable value';
  }
  return true;
});

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
 * Check if the given value is a valid {@link Json} value, i.e., a value that is
 * serializable to JSON.
 *
 * @param value - The value to check.
 * @returns Whether the value is a valid {@link Json} value.
 */
export function isValidJson(value: unknown): value is Json {
  return is(value, JsonStruct);
}

/**
 * The string '2.0'.
 */
export const jsonrpc2 = '2.0' as const;
export const JsonRpcVersionStruct = literal(jsonrpc2);

/**
 * A String specifying the version of the JSON-RPC protocol.
 * MUST be exactly "2.0".
 */
export type JsonRpcVersion2 = typeof jsonrpc2;

export const JsonRpcIdStruct = nullable(union([number(), string()]));

/**
 * An identifier established by the Client that MUST contain a String, Number,
 * or NULL value if included. If it is not included it is assumed to be a
 * notification. The value SHOULD normally not be Null and Numbers SHOULD
 * NOT contain fractional parts.
 */
export type JsonRpcId = Infer<typeof JsonRpcIdStruct>;

export const JsonRpcErrorStruct = object({
  code: integer(),
  message: string(),
  data: optional(JsonStruct),
  stack: optional(string()),
});

/**
 * Mark a certain key of a type as optional.
 */
export type OptionalField<
  Type extends Record<string, unknown>,
  Key extends keyof Type,
> = Omit<Type, Key> & Partial<Pick<Type, Key>>;

/**
 * A JSON-RPC error object.
 *
 * Note that TypeScript infers `unknown | undefined` as `unknown`, meaning that
 * the `data` field is not optional. To make it optional, we use the
 * `OptionalField` helper, to explicitly make it optional.
 */
export type JsonRpcError = OptionalField<
  Infer<typeof JsonRpcErrorStruct>,
  'data'
>;

export const JsonRpcParamsStruct = optional(
  union([record(string(), JsonStruct), array(JsonStruct)]),
);
export type JsonRpcParams = Infer<typeof JsonRpcParamsStruct>;

export const JsonRpcRequestStruct = object({
  id: JsonRpcIdStruct,
  jsonrpc: JsonRpcVersionStruct,
  method: string(),
  params: JsonRpcParamsStruct,
});

export type InferWithParams<
  Type extends Struct<any, unknown>,
  Params extends JsonRpcParams,
> = Omit<Infer<Type>, 'params'> &
  (keyof Params extends undefined
    ? {
        params?: Params;
      }
    : {
        params: Params;
      });

/**
 * A JSON-RPC request object.
 */
export type JsonRpcRequest<Params extends JsonRpcParams> = InferWithParams<
  typeof JsonRpcRequestStruct,
  Params
>;

export const JsonRpcNotificationStruct = omit(JsonRpcRequestStruct, ['id']);

/**
 * A JSON-RPC notification object.
 */
export type JsonRpcNotification<Params extends JsonRpcParams> = InferWithParams<
  typeof JsonRpcNotificationStruct,
  Params
>;

/**
 * Check if the given value is a valid {@link JsonRpcNotification} object.
 *
 * @param value - The value to check.
 * @returns Whether the given value is a valid {@link JsonRpcNotification}
 * object.
 */
export function isJsonRpcNotification(
  value: unknown,
): value is JsonRpcNotification<JsonRpcParams> {
  return is(value, JsonRpcNotificationStruct);
}

/**
 * Assert that the given value is a valid {@link JsonRpcNotification} object.
 *
 * @param value - The value to check.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the given value is not a valid {@link JsonRpcNotification} object.
 */
export function assertIsJsonRpcNotification(
  value: unknown,
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcNotification<JsonRpcParams> {
  assertStruct(
    value,
    JsonRpcNotificationStruct,
    'Invalid JSON-RPC notification',
    ErrorWrapper,
  );
}

/**
 * Check if the given value is a valid {@link JsonRpcRequest} object.
 *
 * @param value - The value to check.
 * @returns Whether the given value is a valid {@link JsonRpcRequest} object.
 */
export function isJsonRpcRequest(
  value: unknown,
): value is JsonRpcRequest<JsonRpcParams> {
  return is(value, JsonRpcRequestStruct);
}

/**
 * Assert that the given value is a valid {@link JsonRpcRequest} object.
 *
 * @param value - The JSON-RPC request or notification to check.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the given value is not a valid {@link JsonRpcRequest} object.
 */
export function assertIsJsonRpcRequest(
  value: unknown,
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcRequest<JsonRpcParams> {
  assertStruct(
    value,
    JsonRpcRequestStruct,
    'Invalid JSON-RPC request',
    ErrorWrapper,
  );
}

export const PendingJsonRpcResponseStruct = object({
  id: JsonRpcIdStruct,
  jsonrpc: JsonRpcVersionStruct,
  result: optional(unknown()),
  error: optional(JsonRpcErrorStruct),
});

/**
 * A JSON-RPC response object that has not yet been resolved.
 */
export type PendingJsonRpcResponse<Result extends Json> = Omit<
  Infer<typeof PendingJsonRpcResponseStruct>,
  'result'
> & {
  result?: Result;
};

export const JsonRpcSuccessStruct = object({
  id: JsonRpcIdStruct,
  jsonrpc: JsonRpcVersionStruct,
  result: JsonStruct,
});

/**
 * A successful JSON-RPC response object.
 */
export type JsonRpcSuccess<Result extends Json> = Omit<
  Infer<typeof JsonRpcSuccessStruct>,
  'result'
> & {
  result: Result;
};

export const JsonRpcFailureStruct = object({
  id: JsonRpcIdStruct,
  jsonrpc: JsonRpcVersionStruct,
  error: JsonRpcErrorStruct as Struct<JsonRpcError>,
});

/**
 * A failed JSON-RPC response object.
 */
export type JsonRpcFailure = Infer<typeof JsonRpcFailureStruct>;

export const JsonRpcResponseStruct = union([
  JsonRpcSuccessStruct,
  JsonRpcFailureStruct,
]);

/**
 * A JSON-RPC response object. Must be checked to determine whether it's a
 * success or failure.
 *
 * @template Result - The type of the result.
 */
export type JsonRpcResponse<Result extends Json> =
  | JsonRpcSuccess<Result>
  | JsonRpcFailure;

/**
 * Type guard to check whether specified JSON-RPC response is a
 * {@link PendingJsonRpcResponse}.
 *
 * @param response - The JSON-RPC response to check.
 * @returns Whether the specified JSON-RPC response is pending.
 */
export function isPendingJsonRpcResponse(
  response: unknown,
): response is PendingJsonRpcResponse<Json> {
  return is(response, PendingJsonRpcResponseStruct);
}

/**
 * Assert that the given value is a valid {@link PendingJsonRpcResponse} object.
 *
 * @param response - The JSON-RPC response to check.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the given value is not a valid {@link PendingJsonRpcResponse}
 * object.
 */
export function assertIsPendingJsonRpcResponse(
  response: unknown,
  ErrorWrapper?: AssertionErrorConstructor,
): asserts response is PendingJsonRpcResponse<Json> {
  assertStruct(
    response,
    PendingJsonRpcResponseStruct,
    'Invalid pending JSON-RPC response',
    ErrorWrapper,
  );
}

/**
 * Type guard to check if a value is a {@link JsonRpcResponse}.
 *
 * @param response - The object to check.
 * @returns Whether the object is a JsonRpcResponse.
 */
export function isJsonRpcResponse(
  response: unknown,
): response is JsonRpcResponse<Json> {
  return is(response, JsonRpcResponseStruct);
}

/**
 * Assert that the given value is a valid {@link JsonRpcResponse} object.
 *
 * @param value - The value to check.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the given value is not a valid {@link JsonRpcResponse} object.
 */
export function assertIsJsonRpcResponse(
  value: unknown,
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcResponse<Json> {
  assertStruct(
    value,
    JsonRpcResponseStruct,
    'Invalid JSON-RPC response',
    ErrorWrapper,
  );
}

/**
 * Check if the given value is a valid {@link JsonRpcSuccess} object.
 *
 * @param value - The value to check.
 * @returns Whether the given value is a valid {@link JsonRpcSuccess} object.
 */
export function isJsonRpcSuccess(
  value: unknown,
): value is JsonRpcSuccess<Json> {
  return is(value, JsonRpcSuccessStruct);
}

/**
 * Assert that the given value is a valid {@link JsonRpcSuccess} object.
 *
 * @param value - The value to check.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the given value is not a valid {@link JsonRpcSuccess} object.
 */
export function assertIsJsonRpcSuccess(
  value: unknown,
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcSuccess<Json> {
  assertStruct(
    value,
    JsonRpcSuccessStruct,
    'Invalid JSON-RPC success response',
    ErrorWrapper,
  );
}

/**
 * Check if the given value is a valid {@link JsonRpcFailure} object.
 *
 * @param value - The value to check.
 * @returns Whether the given value is a valid {@link JsonRpcFailure} object.
 */
export function isJsonRpcFailure(value: unknown): value is JsonRpcFailure {
  return is(value, JsonRpcFailureStruct);
}

/**
 * Assert that the given value is a valid {@link JsonRpcFailure} object.
 *
 * @param value - The value to check.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the given value is not a valid {@link JsonRpcFailure} object.
 */
export function assertIsJsonRpcFailure(
  value: unknown,
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcFailure {
  assertStruct(
    value,
    JsonRpcFailureStruct,
    'Invalid JSON-RPC failure response',
    ErrorWrapper,
  );
}

/**
 * Check if the given value is a valid {@link JsonRpcError} object.
 *
 * @param value - The value to check.
 * @returns Whether the given value is a valid {@link JsonRpcError} object.
 */
export function isJsonRpcError(value: unknown): value is JsonRpcError {
  return is(value, JsonRpcErrorStruct);
}

/**
 * Assert that the given value is a valid {@link JsonRpcError} object.
 *
 * @param value - The value to check.
 * @param ErrorWrapper - The error class to throw if the assertion fails.
 * Defaults to {@link AssertionError}.
 * @throws If the given value is not a valid {@link JsonRpcError} object.
 */
export function assertIsJsonRpcError(
  value: unknown,
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcError {
  assertStruct(
    value,
    JsonRpcErrorStruct,
    'Invalid JSON-RPC error',
    ErrorWrapper,
  );
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

/**
 * Checks whether a value is JSON serializable and counts the total number
 * of bytes needed to store the serialized version of the value.
 *
 * @param jsObject - Potential JSON serializable object.
 * @param skipSizingProcess - Skip JSON size calculation (default: false).
 * @returns Tuple [isValid, plainTextSizeInBytes] containing a boolean that signals whether
 * the value was serializable and a number of bytes that it will use when serialized to JSON.
 */
export function validateJsonAndGetSize(
  jsObject: unknown,
  skipSizingProcess = false,
): [isValid: boolean, plainTextSizeInBytes: number] {
  const seenObjects = new Set();
  /**
   * Checks whether a value is JSON serializable and counts the total number
   * of bytes needed to store the serialized version of the value.
   *
   * This function assumes the encoding of the JSON is done in UTF-8.
   *
   * @param value - Potential JSON serializable value.
   * @param skipSizing - Skip JSON size calculation (default: false).
   * @returns Tuple [isValid, plainTextSizeInBytes] containing a boolean that signals whether
   * the value was serializable and a number of bytes that it will use when serialized to JSON.
   */
  function getJsonSerializableInfo(
    value: unknown,
    skipSizing: boolean,
  ): [isValid: boolean, plainTextSizeInBytes: number] {
    if (value === undefined) {
      return [false, 0];
    } else if (value === null) {
      // Return already specified constant size for null (special object)
      return [true, skipSizing ? 0 : JsonSize.Null];
    }

    // Check and calculate sizes for basic (and some special) types
    const typeOfValue = typeof value;
    try {
      if (typeOfValue === 'function') {
        return [false, 0];
      } else if (typeOfValue === 'string' || value instanceof String) {
        return [
          true,
          skipSizing
            ? 0
            : calculateStringSize(value as string) + JsonSize.Quote * 2,
        ];
      } else if (typeOfValue === 'boolean' || value instanceof Boolean) {
        if (skipSizing) {
          return [true, 0];
        }
        // eslint-disable-next-line eqeqeq
        return [true, value == true ? JsonSize.True : JsonSize.False];
      } else if (typeOfValue === 'number' || value instanceof Number) {
        if (skipSizing) {
          return [true, 0];
        }
        return [true, calculateNumberSize(value as number)];
      } else if (value instanceof Date) {
        if (skipSizing) {
          return [true, 0];
        }
        return [
          true,
          // Note: Invalid dates will serialize to null
          isNaN(value.getDate())
            ? JsonSize.Null
            : JsonSize.Date + JsonSize.Quote * 2,
        ];
      }
    } catch (_) {
      return [false, 0];
    }

    // If object is not plain and cannot be serialized properly,
    // stop here and return false for serialization
    if (!isPlainObject(value) && !Array.isArray(value)) {
      return [false, 0];
    }

    // Circular object detection (handling)
    // Check if the same object already exists
    if (seenObjects.has(value)) {
      return [false, 0];
    }
    // Add new object to the seen objects set
    // Only the plain objects should be added (Primitive types are skipped)
    seenObjects.add(value);

    // Continue object decomposition
    try {
      return [
        true,
        Object.entries(value).reduce(
          (sum, [key, nestedValue], idx, arr) => {
            // Recursively process next nested object or primitive type
            // eslint-disable-next-line prefer-const
            let [valid, size] = getJsonSerializableInfo(
              nestedValue,
              skipSizing,
            );
            if (!valid) {
              throw new Error(
                'JSON validation did not pass. Validation process stopped.',
              );
            }

            // Circular object detection
            // Once a child node is visited and processed remove it from the set.
            // This will prevent false positives with the same adjacent objects.
            seenObjects.delete(value);

            if (skipSizing) {
              return 0;
            }

            // Objects will have be serialized with "key": value,
            // therefore we include the key in the calculation here
            const keySize = Array.isArray(value)
              ? 0
              : key.length + JsonSize.Comma + JsonSize.Colon * 2;

            const separator = idx < arr.length - 1 ? JsonSize.Comma : 0;

            return sum + keySize + size + separator;
          },
          // Starts at 2 because the serialized JSON string data (plain text)
          // will minimally contain {}/[]
          skipSizing ? 0 : JsonSize.Wrapper * 2,
        ),
      ];
    } catch (_) {
      return [false, 0];
    }
  }

  return getJsonSerializableInfo(jsObject, skipSizingProcess);
}
