import {
  any,
  array,
  coerce,
  create,
  define,
  integer,
  is,
  literal,
  nullable,
  number,
  object as superstructObject,
  optional,
  record,
  string,
  union,
  unknown,
  Struct,
  refine,
} from '@metamask/superstruct';
import type {
  Context,
  Infer,
  ObjectSchema,
  Simplify,
  Optionalize,
} from '@metamask/superstruct';

import type { AssertionErrorConstructor } from './assert';
import { assertStruct } from './assert';
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
 * A helper type to make properties with `undefined` in their type optional, but
 * not `undefined` itself.
 *
 * @example
 * ```ts
 * type Foo = ObjectOptional<{ foo: string | undefined }>;
 * // Foo is equivalent to { foo?: string }
 * ```
 */
export type ObjectOptional<Schema extends Record<string, unknown>> = {
  [Key in keyof Schema as Schema[Key] extends ExactOptionalGuard
    ? Key
    : never]?: Schema[Key] extends ExactOptionalGuard & infer Original
    ? Original
    : never;
} & {
  [Key in keyof Schema as Schema[Key] extends ExactOptionalGuard
    ? never
    : Key]: Schema[Key];
};

/**
 * An object type with support for exact optionals. This is used by the `object`
 * struct. This uses the {@link ObjectOptional} helper to make properties with
 * `undefined` in their type optional, but not `undefined` itself.
 */
export type ObjectType<Schema extends ObjectSchema> = Simplify<
  ObjectOptional<
    Optionalize<{
      [Key in keyof Schema]: Infer<Schema[Key]>;
    }>
  >
>;

/**
 * A struct to check if the given value is a valid object, with support for
 * {@link exactOptional} types.
 *
 * @param schema - The schema of the object.
 * @returns A struct to check if the given value is an object.
 */
export const object = <Schema extends ObjectSchema>(
  schema: Schema,
): Struct<ObjectType<Schema>> =>
  // The type is slightly different from a regular object struct, because we
  // want to make properties with `undefined` in their type optional, but not
  // `undefined` itself. This means that we need a type cast.
  superstructObject(schema) as unknown as Struct<ObjectType<Schema>>;

declare const exactOptionalSymbol: unique symbol;
type ExactOptionalGuard = {
  _exactOptionalGuard?: typeof exactOptionalSymbol;
};

/**
 * Check the last field of a path is present.
 *
 * @param context - The context to check.
 * @param context.path - The path to check.
 * @param context.branch - The branch to check.
 * @returns Whether the last field of a path is present.
 */
function hasOptional({ path, branch }: Context): boolean {
  const field = path[path.length - 1];
  return hasProperty(branch[branch.length - 2], field);
}

/**
 * A struct which allows the property of an object to be absent, or to be present
 * as long as it's valid and not set to `undefined`.
 *
 * This struct should be used in conjunction with the {@link object} from this
 * library, to get proper type inference.
 *
 * @param struct - The struct to check the value against, if present.
 * @returns A struct to check if the given value is valid, or not present.
 * @example
 * ```ts
 * const struct = object({
 *   foo: exactOptional(string()),
 *   bar: exactOptional(number()),
 *   baz: optional(boolean()),
 *   qux: unknown(),
 * });
 *
 * type Type = Infer<typeof struct>;
 * // Type is equivalent to:
 * // {
 * //   foo?: string;
 * //   bar?: number;
 * //   baz?: boolean | undefined;
 * //   qux: unknown;
 * // }
 * ```
 */
export function exactOptional<Type, Schema>(
  struct: Struct<Type, Schema>,
): Struct<Type & ExactOptionalGuard, Schema> {
  return new Struct<Type & ExactOptionalGuard, Schema>({
    ...struct,

    type: `optional ${struct.type}`,
    validator: (value, context) =>
      !hasOptional(context) || struct.validator(value, context),

    refiner: (value, context) =>
      !hasOptional(context) || struct.refiner(value as Type, context),
  });
}

/**
 * Validate an unknown input to be valid JSON.
 *
 * Useful for constructing JSON structs.
 *
 * @param json - An unknown value.
 * @returns True if the value is valid JSON, otherwise false.
 */
function validateJson(json: unknown): boolean {
  if (json === null || typeof json === 'boolean' || typeof json === 'string') {
    return true;
  }

  if (typeof json === 'number' && Number.isFinite(json)) {
    return true;
  }

  if (typeof json === 'object') {
    let every = true;
    if (Array.isArray(json)) {
      // Ignoring linting error since for-of is significantly slower than a normal for-loop
      // and performance is important in this specific function.
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < json.length; i++) {
        if (!validateJson(json[i])) {
          every = false;
          break;
        }
      }
      return every;
    }

    const entries = Object.entries(json);
    // Ignoring linting errors since for-of is significantly slower than a normal for-loop
    // and performance is important in this specific function.
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < entries.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (typeof entries[i]![0] !== 'string' || !validateJson(entries[i]![1])) {
        every = false;
        break;
      }
    }
    return every;
  }

  return false;
}

/**
 * A struct to check if the given value is a valid JSON-serializable value.
 *
 * Note that this struct is unsafe. For safe validation, use {@link JsonStruct}.
 */
export const UnsafeJsonStruct: Struct<Json> = define('JSON', (json) =>
  validateJson(json),
);

/**
 * A struct to check if the given value is a valid JSON-serializable value.
 *
 * This struct sanitizes the value before validating it, so that it is safe to
 * use with untrusted input.
 */
export const JsonStruct = coerce(
  UnsafeJsonStruct,
  refine(any(), 'JSON', (value) => is(value, UnsafeJsonStruct)),
  (value) =>
    JSON.parse(
      JSON.stringify(value, (propKey, propValue) => {
        // Strip __proto__ and constructor properties to prevent prototype pollution.
        if (propKey === '__proto__' || propKey === 'constructor') {
          return undefined;
        }
        return propValue;
      }),
    ),
);

/**
 * Check if the given value is a valid {@link Json} value, i.e., a value that is
 * serializable to JSON.
 *
 * @param value - The value to check.
 * @returns Whether the value is a valid {@link Json} value.
 */
export function isValidJson(value: unknown): value is Json {
  try {
    getSafeJson(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and return sanitized JSON.
 *
 * Note:
 * This function uses sanitized JsonStruct for validation
 * that applies stringify and then parse of a value provided
 * to ensure that there are no getters which can have side effects
 * that can cause security issues.
 *
 * @param value - JSON structure to be processed.
 * @returns Sanitized JSON structure.
 */
export function getSafeJson<Type extends Json = Json>(value: unknown): Type {
  return create(value, JsonStruct) as Type;
}

/**
 * Get the size of a JSON value in bytes. This also validates the value.
 *
 * @param value - The JSON value to get the size of.
 * @returns The size of the JSON value in bytes.
 */
export function getJsonSize(value: unknown): number {
  assertStruct(value, JsonStruct, 'Invalid JSON value');

  const json = JSON.stringify(value);
  return new TextEncoder().encode(json).byteLength;
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
  data: exactOptional(JsonStruct),
  stack: exactOptional(string()),
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

export const JsonRpcParamsStruct: Struct<Json[] | Record<string, Json>, null> =
  union([record(string(), JsonStruct), array(JsonStruct)]);

export type JsonRpcParams = Json[] | Record<string, Json>;

export const JsonRpcRequestStruct = object({
  id: JsonRpcIdStruct,
  jsonrpc: JsonRpcVersionStruct,
  method: string(),
  params: exactOptional(JsonRpcParamsStruct),
});

export type InferWithParams<
  Type extends Struct<any>,
  Params extends JsonRpcParams,
> = Infer<Type> & {
  params?: Params;
};

/**
 * A JSON-RPC request object.
 */
export type JsonRpcRequest<Params extends JsonRpcParams = JsonRpcParams> =
  InferWithParams<typeof JsonRpcRequestStruct, Params>;

export const JsonRpcNotificationStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  method: string(),
  params: exactOptional(JsonRpcParamsStruct),
});

/**
 * A JSON-RPC notification object.
 */
export type JsonRpcNotification<Params extends JsonRpcParams = JsonRpcParams> =
  InferWithParams<typeof JsonRpcNotificationStruct, Params>;

/**
 * Check if the given value is a valid {@link JsonRpcNotification} object.
 *
 * @param value - The value to check.
 * @returns Whether the given value is a valid {@link JsonRpcNotification}
 * object.
 */
export function isJsonRpcNotification(
  value: unknown,
): value is JsonRpcNotification {
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcNotification {
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
export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ErrorWrapper?: AssertionErrorConstructor,
): asserts value is JsonRpcRequest {
  assertStruct(
    value,
    JsonRpcRequestStruct,
    'Invalid JSON-RPC request',
    ErrorWrapper,
  );
}

export const PendingJsonRpcResponseStruct = superstructObject({
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
