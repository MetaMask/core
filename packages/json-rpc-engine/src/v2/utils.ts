import {
  hasProperty,
  type JsonRpcNotification,
  type JsonRpcParams,
  type JsonRpcRequest,
} from '@metamask/utils';

export type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcNotification,
} from '@metamask/utils';

export type JsonRpcCall<Params extends JsonRpcParams = JsonRpcParams> =
  | JsonRpcNotification<Params>
  | JsonRpcRequest<Params>;

export const isRequest = <Params extends JsonRpcParams>(
  msg: JsonRpcCall<Params> | Readonly<JsonRpcCall<Params>>,
): msg is JsonRpcRequest<Params> => hasProperty(msg, 'id');

export const isNotification = <Params extends JsonRpcParams>(
  msg: JsonRpcCall<Params>,
): msg is JsonRpcNotification<Params> => !isRequest(msg);

/**
 * An unholy incantation that converts a union of object types into an
 * intersection of object types.
 *
 * @example
 * type A = { a: string } | { b: number };
 * type B = UnionToIntersection<A>; // { a: string } & { b: number }
 */
export type UnionToIntersection<U> = (
  U extends never ? never : (k: U) => void
) extends (k: infer I) => void
  ? I
  : never;

/**
 * JSON-stringifies a value.
 *
 * @param value - The value to stringify.
 * @returns The stringified value.
 */
export function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const JsonRpcEngineErrorSymbol = Symbol.for('JsonRpcEngineError');

export class JsonRpcEngineError extends Error {
  private readonly [JsonRpcEngineErrorSymbol] = true;

  constructor(message: string) {
    super(message);
    this.name = 'JsonRpcEngineError';
  }

  /**
   * Check if a value is a {@link JsonRpcEngineError} instance.
   * Works across different package versions in the same realm.
   *
   * @param value - The value to check.
   * @returns Whether the value is a {@link JsonRpcEngineError} instance.
   */
  static isInstance<Value extends Error>(
    value: Value,
  ): value is Value & JsonRpcEngineError {
    return (
      hasProperty(value, JsonRpcEngineErrorSymbol) &&
      value[JsonRpcEngineErrorSymbol] === true
    );
  }
}
